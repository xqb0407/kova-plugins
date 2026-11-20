/**
 * 无限画布 MCP server（stdio，NDJSON JSON-RPC 2.0）。
 *
 * 由本插件的 .mcp.json 声明，sidecar 用应用内置 JS/TS 运行时启动
 * （`${BUN}` + `BUN_BE_BUN=1`：开发态是 bun，打包态是 pi-agent 二进制本身，
 * 用户机器无需预装 node/bun；见 sidecar src/mcp/mcp-config.ts 的插件层展开）。
 *
 * 只实现 MCP 的 tools 面：initialize / notifications.initialized / ping /
 * tools/list / tools/call。stdout 只写协议行，日志一律走 stderr。
 * 工作区根经环境变量 KOVA_WORKSPACE 传入（.mcp.json 里 `${WORKSPACE}` 展开）。
 */
import { createInterface } from "node:readline";
import { TOOL_DEFS, type ToolCtx } from "./tools";

const SERVER_NAME = "canvas";
const SERVER_VERSION = "0.1.0";
const FALLBACK_PROTOCOL = "2025-06-18";
const KNOWN_PROTOCOLS = new Set([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
  "2024-10-07",
]);

const workspace = process.env.KOVA_WORKSPACE?.trim() || process.cwd();
const ctx: ToolCtx = { workspace };

const log = (text: string): void => {
  process.stderr.write(`[canvas-mcp] ${text}\n`);
};

const send = (msg: unknown): void => {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
};

const reply = (id: unknown, result: unknown): void => {
  send({ jsonrpc: "2.0", id, result });
};

const replyError = (id: unknown, code: number, message: string): void => {
  send({ jsonrpc: "2.0", id, error: { code, message } });
};

function handle(message: Record<string, unknown>): void {
  void handleAsync(message).catch((err) => {
    const message2 = err instanceof Error ? err.message : String(err);
    log(`处理失败：${err instanceof Error ? err.stack ?? message2 : message2}`);
  });
}

async function handleAsync(message: Record<string, unknown>): Promise<void> {
  const { id, method, params } = message;
  // 通知（无 id）：initialized / cancelled 等一律静默
  if (id === undefined || id === null) return;
  switch (method) {
    case "initialize": {
      const p = (params ?? {}) as Record<string, unknown>;
      const requested = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      reply(id, {
        protocolVersion: KNOWN_PROTOCOLS.has(requested) ? requested : FALLBACK_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "无限画布（*.canvas.json）控制面：先 list_docs / read_doc 了解现状拿 id，" +
          "再用 patch_canvas 结构化修改（add/update/delete/z/move，校验失败整体拒绝）或 write_doc 整档重写。" +
          "改动直接落盘，打开的面板约半秒内自动刷新（宿主 600ms 轮询推送）。\n" +
          "编辑前永远先 read_doc——面板会把用户的手动编辑防抖写回同一文件，你上次写的内容可能已被改动。" +
          "分段落盘（一批一次 patch）可以让用户边生成边看到画布长出来；新内容落在视口外时面板会自动跟随。\n" +
          "watch_doc 长轮询等面板侧的用户编辑（350ms 采样），返回 changed:false + timedOut 时再次调用继续等。" +
          "需要给 agent 回看的画面时，让用户用面板「导出」出 SVG，或直接读档元素规格。",
      });
      return;
    }
    case "ping":
      reply(id, {});
      return;
    case "tools/list":
      reply(id, {
        tools: TOOL_DEFS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
      return;
    case "tools/call": {
      const p = (params ?? {}) as Record<string, unknown>;
      const name = typeof p.name === "string" ? p.name : "";
      const tool = TOOL_DEFS.find((t) => t.name === name);
      if (!tool) {
        replyError(id, -32602, `未知工具 "${name}"；可用：${TOOL_DEFS.map((t) => t.name).join(", ")}`);
        return;
      }
      const args =
        p.arguments && typeof p.arguments === "object" && !Array.isArray(p.arguments)
          ? (p.arguments as Record<string, unknown>)
          : {};
      try {
        // run 可返回 Promise（watch_doc 要长轮询），必须 await 后再判形态
        const payload = await tool.run(args, ctx);
        reply(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply(id, { content: [{ type: "text", text: `错误：${message}` }], isError: true });
      }
      return;
    }
    default:
      replyError(id, -32601, `Method not found: ${String(method)}`);
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const text = line.trim();
  if (!text) return;
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    log("忽略无法解析的输入行");
    return;
  }
  if (!message || typeof message !== "object") return;
  handle(message as Record<string, unknown>);
});
rl.on("close", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
