/**
 * REA 逆向分析 MCP server（stdio，NDJSON JSON-RPC 2.0）。
 *
 * 由本插件的 .mcp.json 声明，sidecar 用应用内置 JS/TS 运行时启动
 * （`${BUN}` + BUN_BE_BUN=1：开发态是 bun，打包态是 pi-agent 二进制本身，
 * 用户机器无需预装 node/bun）。
 *
 * 只实现 MCP 的 tools 面：initialize / notifications.initialized / ping /
 * tools/list / tools/call。stdout 只写协议行，日志一律走 stderr。
 * 工作区根经环境变量 KOVA_WORKSPACE 传入（.mcp.json 里 `${WORKSPACE}` 展开）。
 *
 * 安全边界：工具全部只读——不执行样本、不写文件、不发起网络请求。
 */
import { createInterface } from "node:readline";
import { TOOL_DEFS, type ToolCtx } from "./tools";

const SERVER_NAME = "rea";
const SERVER_VERSION = "0.1.0";
const FALLBACK_PROTOCOL = "2025-06-18";
const KNOWN_PROTOCOLS = new Set(["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]);

const workspace = process.env.KOVA_WORKSPACE?.trim() || process.cwd();
const ctx: ToolCtx = { workspace };

const log = (text: string): void => {
  process.stderr.write(`[rea-mcp] ${text}\n`);
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
          "REA 逆向分析（只读静态分析，不执行样本）。\n" +
          "推荐顺序：rea_analyze 建档（格式/哈希/入口/段表/加壳线索）→ rea_strings 找 URL/路径/命令/IOC → " +
          "rea_imports 看能力面（可疑 API 已按功能分类）→ rea_sections / rea_entropy 定位代码范围与高熵区 → " +
          "rea_disasm 验证关键路径（symbol 或 VA 范围）。\n" +
          "地址一律是虚拟地址（VA），不是文件偏移；Mach-O 符号通常带前导下划线（_main）。\n" +
          "结论写进 <样本名>.rea.json（结构化）与 <样本名>-report.md（人读），每条结论都要能指回工具输出里的偏移/地址/符号。\n" +
          "只做静态分析：不提供破解授权、绕过保护或免杀方面的指导。",
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
