/**
 * MCP server 协议单测：spawn 真实 server.ts（bun 子进程），走
 * initialize → tools/list → tools/call 全链路，验证 NDJSON 帧与错误形态。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SERVER = path.resolve(import.meta.dir, "..", "server.ts");
let ws = "";

beforeAll(() => {
  ws = mkdtempSync(path.join(tmpdir(), "canvas-mcp-server-"));
});

afterAll(() => {
  rmSync(ws, { recursive: true, force: true });
});

/** 一次起一个 server 实例，收齐 id=1..4 的回包后关闭 */
async function session(calls: Array<{ id: number; method: string; params?: Record<string, unknown> }>): Promise<Map<number, any>> {
  const proc = spawn("bun", ["run", SERVER], {
    env: { ...process.env, KOVA_WORKSPACE: ws },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const replies = new Map<number, any>();
  let buf = "";
  proc.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    for (const line of buf.split("\n")) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) replies.set(msg.id, msg);
      } catch {
        /* 半行 */
      }
    }
  });
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => {
    stderr += d.toString();
  });

  proc.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } })}\n`,
  );
  proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  for (const c of calls) {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: c.id, method: c.method, params: c.params ?? {} })}\n`);
  }

  // 等回包齐（initialize/list + 全部 calls），最多 10s
  const want = 2 + calls.length;
  const deadline = Date.now() + 10_000;
  while (replies.size < want && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  if (replies.size < want) throw new Error(`server 回包不全（${replies.size}/${want}）\nstderr: ${stderr}`);
  return replies;
}

describe("server 协议面", () => {
  test("initialize 回协议版本与 serverInfo；tools/list 回六个工具", async () => {
    const replies = await session([]);
    const init = replies.get(1)!;
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.serverInfo.name).toBe("canvas");
    const list = replies.get(2)!;
    expect(list.result.tools.map((t: any) => t.name)).toEqual([
      "list_docs",
      "read_doc",
      "create_doc",
      "patch_canvas",
      "write_doc",
      "watch_doc",
    ]);
  });

  test("tools/call 全链路：create → patch → read；未知工具给 isError", async () => {
    const replies = await session([
      { id: 10, method: "tools/call", params: { name: "create_doc", arguments: { name: "协议样例" } } },
      {
        id: 11,
        method: "tools/call",
        params: { name: "patch_canvas", arguments: { path: "协议样例.canvas.json", ops: [{ op: "add", el: { kind: "text", x: 0, y: 0, w: 100, h: 30, runs: ["你好"] } }] } },
      },
      { id: 12, method: "tools/call", params: { name: "read_doc", arguments: { path: "协议样例.canvas.json" } } },
      { id: 13, method: "tools/call", params: { name: "no_such_tool", arguments: {} } },
      {
        id: 14,
        method: "tools/call",
        params: { name: "patch_canvas", arguments: { path: "协议样例.canvas.json", ops: [{ op: "update", id: "ghost", patch: { x: 1 } }] } },
      },
    ]);
    const created = replies.get(10)!;
    expect(created.result.isError).toBeUndefined();
    const payload = JSON.parse(created.result.content[0].text);
    expect(payload.path).toBe("协议样例.canvas.json");

    const patched = JSON.parse(replies.get(11)!.result.content[0].text);
    expect(patched.addedIds).toHaveLength(1);

    const read = JSON.parse(replies.get(12)!.result.content[0].text);
    expect(read.total).toBe(1);

    // 未知工具是协议级错误帧（error 无 result），与工具级 isError:true 内容帧不同
    const unknown = replies.get(13)!;
    expect(unknown.result).toBeUndefined();
    expect(unknown.error.code).toBe(-32602);
    expect(unknown.error.message).toContain("未知工具");

    const ghost = replies.get(14)!;
    expect(ghost.result.isError).toBe(true);
    expect(ghost.result.content[0].text).toContain("不存在");
  });
});
