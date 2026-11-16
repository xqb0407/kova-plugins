/**
 * 手机控制 MCP server（stdio，NDJSON JSON-RPC 2.0）。
 *
 * 由本插件的 .mcp.json 声明，sidecar 用应用内置 JS/TS 运行时启动
 * （`${BUN}` + BUN_BE_BUN=1：开发态是 bun，打包态是 pi-agent 二进制本身，
 * 用户机器无需预装 node/bun；adb 由用户自装，插件不打包二进制）。
 *
 * 只实现 MCP 的 tools 面：initialize / notifications.initialized / ping /
 * tools/list / tools/call。stdout 只写协议行，日志一律走 stderr。
 * 工作区根经环境变量 KOVA_WORKSPACE 传入（.mcp.json 里 `${WORKSPACE}` 展开）。
 *
 * 安全边界（DESIGN.md §6）：不提供 shell 工具；不装 APK、不 root、
 * 不绕锁屏、不读隐私数据；支付/删除/发消息等敏感操作由技能层强制先经用户确认。
 */
import { createInterface } from "node:readline";
import { AdbError } from "./lib/adb";
import { TOOL_DEFS, type ToolCtx } from "./tools";

const SERVER_NAME = "phone";
const SERVER_VERSION = "0.2.0";
const FALLBACK_PROTOCOL = "2025-06-18";
const KNOWN_PROTOCOLS = new Set(["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]);

const workspace = process.env.KOVA_WORKSPACE?.trim() || process.cwd();
const ctx: ToolCtx = { workspace };

const log = (text: string): void => {
  process.stderr.write(`[phone-mcp] ${text}\n`);
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

/** AdbError 的 hint 是排查指引，拼进错误文本一起给模型 */
function errorText(err: unknown): string {
  if (err instanceof AdbError) return err.hint ? `${err.message}\n建议：${err.hint}` : err.message;
  return err instanceof Error ? err.message : String(err);
}

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
          "Android 手机控制（ADB）。首次操作一台设备先 phone__doctor 就绪自检；核心回路：phone__screenshot 看界面 → " +
          "phone__ui 拿控件与坐标 → phone__tap / swipe / text / key 操作 → 验证，循环。\n" +
          "省回合技巧：已知下一步时连续执行不带 observe；要验证时给动作带 observe:\"tree\"（或 screenshot/both），" +
          "一次拿回动作结果+新界面；列表深处找元素用 phone__scroll_find，不要手写「滑一下再看」循环；" +
          "输入文本后可用 observe:\"tree\" 回读焦点框（verified 字段）。\n" +
          "定位优先选择器（text/desc/id），坐标只来自 phone__ui 的 center 或用户指定；选择器命中多个会报候选，带 matchIndex（0 起）重选；" +
          "命中 0 个先看 phone__ui，不要换着选择器盲试。\n" +
          "硬规则：动作结果报 verified=false / uncertain 时动作可能已生效，禁止重放输入、发送或支付，先观察真实状态；" +
          "支付/转账/删除、给他人发消息、修改账号设置等敏感操作，必须先向用户复述目标元素并得到明确同意；" +
          "焦点框是密码框或设备锁屏时请用户亲手完成，不代填、不猜密码；不装未知 APK。\n" +
          "中文输入依赖 ADBKeyboard（缺装时 phone__text 会给安装指引）。\n" +
          "adb 未安装时所有工具都会报安装指引：macOS `brew install android-platform-tools`。",
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
        // screenshot 返回 { mcpContent }：text/image 内容块原样透传
        // （image 块经 sidecar 摘图与 2MiB/白名单闸门上屏，其余工具仍是 JSON 文本）
        if (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          Array.isArray((payload as { mcpContent?: unknown }).mcpContent)
        ) {
          reply(id, { content: (payload as { mcpContent: unknown[] }).mcpContent });
          return;
        }
        reply(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] });
      } catch (err) {
        reply(id, { content: [{ type: "text", text: `错误：${errorText(err)}` }], isError: true });
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
