/**
 * GitLab REST API v4 客户端（零依赖，用运行时自带的 fetch）。
 *
 * - 认证：PRIVATE-TOKEN 头；token 只在请求时使用，不落日志。
 * - 错误：按状态码给出可操作的说明（401/403/404/429/5xx），保留 GitLab 的 message。
 * - 分页：返回 X-Next-Page / X-Total，工具层据此提示“还有更多”。
 * - 自建实例：支持 caFile（内部 CA）与 insecureTls（明确告知风险后才用）。
 */
import { readFileSync } from "node:fs";
import type { GitlabConfig } from "./config";

export class GitlabApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitlabApiError";
    this.status = status;
  }
}

export type Page<T> = { data: T; nextPage?: number; total?: number };

export type CurrentUser = { id: number; username: string; name: string; state?: string };

const USER_AGENT = "kova-gitlab-plugin/0.1.0";

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") params.set(key, value ? "true" : "false");
    else if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
    } else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export class GitlabClient {
  readonly config: GitlabConfig;
  private readonly apiBase: string;
  private readonly token?: string;
  private me?: CurrentUser;

  constructor(config: GitlabConfig) {
    this.config = config;
    this.token = config.token;
    const base = config.url.replace(/\/+$/, "");
    this.apiBase = /\/api\/v4$/i.test(base) ? base : `${base}/api/v4`;
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  /** 项目参数：数字 id 原样，路径做 URL 编码（group/sub/project → group%2Fsub%2Fproject） */
  projectId(project?: string): string {
    const raw = (project ?? this.config.defaultProject ?? "").trim();
    if (!raw) {
      throw new GitlabApiError(
        "缺少 project 参数，也没有配置 defaultProject。传 group/subgroup/project，或把它写进 ~/.kova/gitlab.json（也可写进工作区 .kova/gitlab.json 的 defaultProject）。",
        0,
      );
    }
    const cleaned = raw.replace(/^\/+|\/+$/g, "");
    if (/^\d+$/.test(cleaned)) return cleaned;
    return encodeURIComponent(cleaned);
  }

  /** 当前 token 的用户；`@me` 作者/评审人过滤靠它解析 */
  async meInfo(): Promise<CurrentUser> {
    if (!this.me) {
      const page = await this.get<CurrentUser>("/user");
      this.me = page.data;
    }
    return this.me;
  }

  /** 用户名参数：支持 `@me` / `me` */
  async resolveUsername(value?: string): Promise<string | undefined> {
    const raw = value?.trim();
    if (!raw) return undefined;
    if (raw === "@me" || raw.toLowerCase() === "me") return (await this.meInfo()).username;
    return raw.replace(/^@/, "");
  }

  async get<T>(pathname: string, query?: Record<string, unknown>): Promise<Page<T>> {
    const res = await this.request("GET", pathname, query);
    const data = (await res.json()) as T;
    return this.withPagination(data, res);
  }

  async post<T>(pathname: string, body: unknown): Promise<T> {
    const res = await this.request("POST", pathname, undefined, body);
    return (await res.json()) as T;
  }

  /** 纯文本响应（job trace 等） */
  async getText(pathname: string, query?: Record<string, unknown>): Promise<string> {
    const res = await this.request("GET", pathname, query);
    return await res.text();
  }

  private withPagination<T>(data: T, res: Response): Page<T> {
    const next = Number(res.headers.get("x-next-page") ?? "");
    const total = Number(res.headers.get("x-total") ?? "");
    return {
      data,
      ...(Number.isFinite(next) && next > 0 ? { nextPage: next } : {}),
      ...(Number.isFinite(total) && total >= 0 ? { total } : {}),
    };
  }

  private tlsOptions(): Record<string, unknown> | undefined {
    const out: Record<string, unknown> = {};
    if (this.config.insecureTls) out.rejectUnauthorized = false;
    if (this.config.caFile) {
      try {
        out.ca = readFileSync(this.config.caFile);
      } catch {
        /* 配置层已报过 caFile 不可读 */
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private async request(
    method: string,
    pathname: string,
    query?: Record<string, unknown>,
    body?: unknown,
  ): Promise<Response> {
    if (!this.token) {
      throw new GitlabApiError("还没有配置 GitLab token（无法发起请求）。先运行 gitlab__status 看配置指引。", 0);
    }
    const url = `${this.apiBase}${pathname}${buildQuery(query)}`;
    const tls = this.tlsOptions();
    const init = {
      method,
      headers: {
        "PRIVATE-TOKEN": this.token,
        "User-Agent": USER_AGENT,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(this.config.timeoutMs),
      // Bun 扩展：内部 CA / 自签证书。Node 下该字段被忽略（此时用 NODE_EXTRA_CA_CERTS）
      ...(tls ? { tls } : {}),
    } as RequestInit;

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/timeout|aborted|timed out/i.test(message)) {
        throw new GitlabApiError(`请求 GitLab 超时（${this.config.timeoutMs}ms）：${method} ${pathname}`, 0);
      }
      throw new GitlabApiError(`连接 GitLab 失败（${method} ${pathname}）：${message}`, 0);
    }
    if (!res.ok) throw new GitlabApiError(await this.describeError(res), res.status);
    return res;
  }

  private async describeError(res: Response): Promise<string> {
    let detail = "";
    try {
      const text = await res.text();
      try {
        const doc = JSON.parse(text) as Record<string, unknown>;
        detail =
          typeof doc.message === "string"
            ? doc.message
            : typeof doc.error === "string"
              ? doc.error
              : text.slice(0, 300);
      } catch {
        detail = text.slice(0, 300);
      }
    } catch {
      /* 读不到响应体就算了 */
    }
    const suffix = detail ? `：${detail}` : "";
    switch (res.status) {
      case 401:
        return `GitLab 认证失败（401）${suffix}。token 无效或过期：检查 ~/.kova/gitlab.json，或钥匙串（service kova-gitlab / account gitlab）。`;
      case 403:
        return `GitLab 拒绝访问（403）${suffix}。token 权限不足（读用 read_api，评论等写操作需要 api），或该项目/资源不允许此操作。`;
      case 404:
        return `GitLab 未找到资源（404）${suffix}。检查项目路径 / issue / MR 序号，或 token 是否有权访问该项目。`;
      case 429: {
        const retry = res.headers.get("retry-after");
        return `GitLab 限流（429）${suffix}${retry ? `，${retry} 秒后重试` : "，稍后重试"}`;
      }
      default:
        return `GitLab API ${res.status}${suffix}`;
    }
  }
}
