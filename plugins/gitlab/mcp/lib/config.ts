/**
 * GitLab 连接配置发现。
 *
 * 安全约束（重要）：
 * - MCP 子进程只拿到宿主白名单环境（HOME/PATH/SHELL/TERM 等），用户在 shell 里
 *   export 的 GITLAB_TOKEN 不会传进来——所以正式配置放在 ~/.kova/gitlab.json，
 *   或 macOS 钥匙串（service `kova-gitlab`，account `gitlab`）。
 * - **URL 与 token 只从用户级来源读取**。工作区里的 `.kova/gitlab.json` 只认
 *   `defaultProject`：仓库文件可以跟着别人的提交走，若能改 URL，恶意仓库就能把
 *   token POST 到自己的服务器。
 * - token 值只在进程内存里用，不写日志、不回显；status 工具只报告来源。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type TokenSource = "env" | "config" | "keychain" | "token-file" | "none";

export type GitlabConfig = {
  url: string;
  token?: string;
  tokenSource: TokenSource;
  /** 缺省项目（group/subgroup/project），来自用户配置或工作区配置 */
  defaultProject?: string;
  caFile?: string;
  insecureTls: boolean;
  timeoutMs: number;
  configPath: string;
  /** 配置/环境里发现的问题（不含 token） */
  warnings: string[];
};

const DEFAULT_URL = "https://gitlab.com";
const KEYCHAIN_SERVICE = "kova-gitlab";
const KEYCHAIN_ACCOUNT = "gitlab";
const DEFAULT_TIMEOUT_MS = 20_000;

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function readJson(path: string, warnings: string[], label: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const doc = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      warnings.push(`${label} 顶层必须是对象：${path}`);
      return undefined;
    }
    return doc as Record<string, unknown>;
  } catch (err) {
    warnings.push(`${label} 解析失败（${err instanceof Error ? err.message : String(err)}）：${path}`);
    return undefined;
  }
}

function sanitizeUrl(raw: string): string | undefined {
  const s = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(s) ? s : undefined;
}

/** 钥匙串里取 token；非 macOS 或没建条目时静默返回 undefined */
function keychainToken(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  const r = spawnSync(
    "security",
    ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
    { encoding: "utf8", timeout: 3000 },
  );
  if (r.status !== 0) return undefined;
  const token = (r.stdout ?? "").trim();
  return token || undefined;
}

function fileMode(path: string): string | undefined {
  try {
    return (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
  } catch {
    return undefined;
  }
}

/** 工作区路径只有在真正展开后才可信（占位符未展开时是字面量 "${WORKSPACE}"） */
function workspaceDir(): string | undefined {
  const raw = process.env.KOVA_WORKSPACE?.trim();
  if (!raw || raw.includes("${")) return undefined;
  return resolve(raw);
}

export function loadConfig(): GitlabConfig {
  const warnings: string[] = [];
  const configPath = resolve(
    process.env.GITLAB_CONFIG?.trim() || join(homedir(), ".kova", "gitlab.json"),
  );
  const doc = readJson(configPath, warnings, "gitlab 配置") ?? {};

  // ---- URL：只认用户级配置与环境变量 ----
  const rawUrl = asString(process.env.GITLAB_URL) ?? asString(doc.url);
  let url = DEFAULT_URL;
  if (rawUrl) {
    const clean = sanitizeUrl(rawUrl);
    if (clean) url = clean;
    else warnings.push(`配置里的 url 不是 http(s) 地址（"${rawUrl}"），已回退到 ${DEFAULT_URL}`);
  }

  // ---- token：env → 用户配置 → 钥匙串 → 简单 token 文件 ----
  const configToken = asString(doc.token);
  const mode = fileMode(configPath);
  if (configToken && mode && (Number.parseInt(mode, 8) & 0o077) !== 0) {
    warnings.push(`配置文件权限过宽（${mode}），建议 chmod 600 ${configPath}`);
  }

  let token = asString(process.env.GITLAB_TOKEN);
  let tokenSource: TokenSource = token ? "env" : "none";
  if (!token && configToken) {
    token = configToken;
    tokenSource = "config";
  }
  if (!token) {
    token = keychainToken();
    if (token) tokenSource = "keychain";
  }
  if (!token) {
    const tokenFile = join(homedir(), ".gitlab-token");
    if (existsSync(tokenFile)) {
      const first = readFileSync(tokenFile, "utf8").split("\n")[0].trim();
      if (first) {
        token = first;
        tokenSource = "token-file";
      }
    }
  }

  // ---- 默认项目：工作区配置可覆盖（只认 defaultProject） ----
  let defaultProject = asString(doc.defaultProject);
  const ws = workspaceDir();
  if (ws) {
    const wsPath = join(ws, ".kova", "gitlab.json");
    const wsDoc = readJson(wsPath, warnings, "工作区 gitlab 配置");
    if (wsDoc) {
      const fromWs = asString(wsDoc.defaultProject);
      if (fromWs) defaultProject = fromWs;
      if (wsDoc.url !== undefined || wsDoc.token !== undefined) {
        warnings.push(
          "工作区 .kova/gitlab.json 里的 url/token 被忽略（防止仓库把 token 导向别的服务器）；URL 与 token 只认用户级配置",
        );
      }
    }
  }

  // ---- TLS / 超时 ----
  let caFile: string | undefined;
  const rawCa = asString(doc.caFile);
  if (rawCa) {
    caFile = isAbsolute(rawCa) ? rawCa : resolve(dirname(configPath), rawCa);
    if (!existsSync(caFile)) {
      warnings.push(`caFile 不存在：${caFile}（已忽略）`);
      caFile = undefined;
    }
  }
  const rawTimeout = Number(doc.timeoutMs);
  const timeoutMs = Number.isFinite(rawTimeout)
    ? Math.min(120_000, Math.max(1_000, Math.trunc(rawTimeout)))
    : DEFAULT_TIMEOUT_MS;

  return {
    url,
    ...(token ? { token } : {}),
    tokenSource,
    ...(defaultProject ? { defaultProject } : {}),
    ...(caFile ? { caFile } : {}),
    insecureTls: doc.insecureTls === true,
    timeoutMs,
    configPath,
    warnings,
  };
}

export const SETUP_HINT =
  "还没有配置 GitLab token。任选一种：\n" +
  '1) 用户级配置（推荐）：mkdir -p ~/.kova && cat > ~/.kova/gitlab.json <<\'EOF\'\n' +
  '{ "url": "https://gitlab.com", "token": "glpat-...", "defaultProject": "group/project" }\n' +
  "EOF\nchmod 600 ~/.kova/gitlab.json\n" +
  "2) macOS 钥匙串（token 与配置文件分离）：\n" +
  "security add-generic-password -s kova-gitlab -a gitlab -w 'glpat-...' -U\n" +
  "（url 仍写在 ~/.kova/gitlab.json，缺省 gitlab.com）\n" +
  "不要把 token 贴进对话或提交到仓库。";
