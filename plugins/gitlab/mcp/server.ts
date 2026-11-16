/**
 * GitLab MCP server（stdio，NDJSON JSON-RPC 2.0）。
 *
 * 由本插件的 .mcp.json 声明，sidecar 用应用内置运行时启动；stdout 只写协议行，
 * 日志一律走 stderr。工具全部通过 REST API v4 调用，token 来自用户级配置或
 * macOS 钥匙串（见 mcp/lib/config.ts 的安全约束）。
 */
import { createInterface } from "node:readline";
import { TOOL_DEFS, type ToolCtx } from "./tools";

const SERVER_NAME = "gitlab";
const SERVER_VERSION = "0.2.0";
const FALLBACK_PROTOCOL = "2025-06-18";
const KNOWN_PROTOCOLS = new Set(["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]);

const workspace = process.env.KOVA_WORKSPACE?.trim() || process.cwd();
const ctx: ToolCtx = { workspace };

const log = (text: string): void => {
  process.stderr.write(`[gitlab-mcp] ${text}\n`);
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
    const text = err instanceof Error ? err.message : String(err);
    log(`处理失败：${err instanceof Error ? (err.stack ?? text) : text}`);
  });
}

async function handleAsync(message: Record<string, unknown>): Promise<void> {
  const { id, method, params } = message;
  if (id === undefined || id === null) return; // 通知静默

  switch (method) {
    case "initialize": {
      const p = (params ?? {}) as Record<string, unknown>;
      const requested = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      reply(id, {
        protocolVersion: KNOWN_PROTOCOLS.has(requested) ? requested : FALLBACK_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "GitLab API v4 工具面（只读为主，评论是写操作）。\n" +
          "第一次使用先跑 status：它会报告配置来源、当前用户与默认项目；没有配置时按它给的指引让用户自己写\n" +
          "~/.kova/gitlab.json（chmod 600）或存进 macOS 钥匙串——绝不要让用户把 token 贴进对话。\n" +
          "常用路径：projects 找项目 → issues / mrs 列表 → issue / mr 看详情 → mr_diff 看变更 → pipelines / job_log 查 CI。\n" +
          "写操作（issue_comment / mr_comment）是两段确认：第一次调用只返回预览 + confirmToken，把预览给用户；\n" +
          "用户同意后带同一 confirmToken 与逐字相同参数再调一次才真正发送；令牌 5 分钟有效且绑定内容。行内 diff 评论暂不支持。\n" +
          "列表返回 nextPage 说明还有更多；diff 与日志都按行截断，不要一次拉全量。",
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
        const payload = await tool.run(args, ctx);
        reply(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] });
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        reply(id, { content: [{ type: "text", text: `错误：${text}` }], isError: true });
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
