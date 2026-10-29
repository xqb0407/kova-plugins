/**
 * GitLab 工具实现层：13 个只读为主 + 2 个评论写入的工具，全部围绕 REST API v4。
 *
 * 设计取舍：
 * - 每次调用重新读配置：改 ~/.kova/gitlab.json 后不用重启 MCP 进程；
 * - 项目参数既接受数字 id 也接受 `group/sub/project`（自动 URL 编码）；
 * - `@me` 在作者/评审人过滤里解析成当前 token 用户；
 * - 所有列表都有 limit 与分页提示；diff / 日志按行截断，避免撑爆上下文。
 */
import { GitlabApiError, GitlabClient } from "./lib/client";
import { loadConfig, SETUP_HINT } from "./lib/config";
import { fmtCommit, fmtIssue, fmtJob, fmtMR, fmtNote, fmtPipeline, fmtProject } from "./lib/format";

export type ToolCtx = { workspace: string };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (args: Record<string, any>, ctx: ToolCtx) => Promise<unknown>;
};

const PROJECT_SCHEMA = {
  type: "string",
  description:
    "项目 id 或完整路径（group/subgroup/project）；缺省用配置里的 defaultProject（用户级或工作区 .kova/gitlab.json）",
} as const;

const LIMIT_SCHEMA = {
  type: "number",
  description: "返回条数，缺省 20，上限 100",
} as const;

const PAGE_SCHEMA = {
  type: "number",
  description: "页码，缺省 1（返回里带 nextPage 时说明还有更多）",
} as const;

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function needStr(args: Record<string, unknown>, key: string, label = key): string {
  const v = str(args, key);
  if (!v) throw new Error(`缺少 ${label}（${key}）`);
  return v;
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function needInt(v: unknown, label: string, min = 1): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || Math.trunc(n) < min) throw new Error(`缺少或非法的 ${label}（需要 ≥ ${min} 的整数）`);
  return Math.trunc(n);
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 每次调用取一份新配置（改 token/url 后无需重启 MCP 进程） */
function connect(): { cfg: ReturnType<typeof loadConfig>; api: GitlabClient } {
  const cfg = loadConfig();
  return { cfg, api: new GitlabClient(cfg) };
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const opStatus: ToolDef["run"] = async () => {
  const { cfg, api } = connect();
  const base = {
    url: cfg.url,
    configPath: cfg.configPath,
    tokenSource: cfg.tokenSource,
    defaultProject: cfg.defaultProject,
    timeoutMs: cfg.timeoutMs,
    warnings: cfg.warnings,
  };
  if (!cfg.token) {
    return { configured: false, ...base, hint: SETUP_HINT };
  }
  try {
    const me = await api.meInfo();
    return {
      configured: true,
      ...base,
      user: { username: me.username, name: me.name, state: me.state },
    };
  } catch (err) {
    return { configured: true, ...base, error: msg(err) };
  }
};

const opProjects: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const limit = clampInt(args.limit, 20, 1, 100);
  const page = clampInt(args.page, 1, 1, 100_000);
  const r = await api.get<any[]>("/projects", {
    search: str(args, "search"),
    membership: args.membership === false ? undefined : true,
    owned: args.owned === true ? true : undefined,
    archived: typeof args.archived === "boolean" ? args.archived : undefined,
    order_by: str(args, "orderBy") ?? "last_activity_at",
    sort: str(args, "sort") ?? "desc",
    per_page: limit,
    page,
  });
  return {
    count: r.data.length,
    ...(r.total !== undefined ? { total: r.total } : {}),
    ...(r.nextPage ? { nextPage: r.nextPage } : {}),
    projects: r.data.map(fmtProject),
  };
};

const opProject: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const id = api.projectId(str(args, "project"));
  const r = await api.get<any>(`/projects/${id}`);
  return fmtProject(r.data);
};

const opIssues: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  const limit = clampInt(args.limit, 20, 1, 100);
  const assignee = await api.resolveUsername(str(args, "assignee"));
  const author = await api.resolveUsername(str(args, "author"));
  const r = await api.get<any[]>(`/projects/${project}/issues`, {
    state: str(args, "state") ?? "opened",
    labels: str(args, "labels"),
    assignee_username: assignee,
    author_username: author,
    search: str(args, "search"),
    milestone: str(args, "milestone"),
    order_by: str(args, "orderBy") ?? "updated_at",
    sort: str(args, "sort") ?? "desc",
    per_page: limit,
    page: clampInt(args.page, 1, 1, 100_000),
  });
  return {
    project: decodeURIComponent(project),
    count: r.data.length,
    ...(r.total !== undefined ? { total: r.total } : {}),
    ...(r.nextPage ? { nextPage: r.nextPage } : {}),
    issues: r.data.map((i) => fmtIssue(i)),
  };
};

const opIssue: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  const iid = needInt(args.iid, "issue iid");
  const r = await api.get<any>(`/projects/${project}/issues/${iid}`);
  const out: Record<string, unknown> = fmtIssue(r.data, { descriptionLimit: 6000 });
  if (args.includeNotes !== false) {
    const notesLimit = clampInt(args.notesLimit, 30, 1, 100);
    const nr = await api.get<any[]>(`/projects/${project}/issues/${iid}/notes`, {
      sort: "desc",
      order_by: "created_at",
      per_page: notesLimit,
    });
    out.notes = nr.data.slice().reverse().map(fmtNote);
    if (nr.total !== undefined) out.notesTotal = nr.total;
    if (nr.nextPage) out.notesNextPage = nr.nextPage;
  }
  return out;
};

const opIssueComment: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  const iid = needInt(args.iid, "issue iid");
  const body = needStr(args, "body", "评论内容");
  const r = await api.post<any>(`/projects/${project}/issues/${iid}/notes`, { body });
  return { ok: true, note: fmtNote(r) };
};

const opMrs: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  const limit = clampInt(args.limit, 20, 1, 100);
  const author = await api.resolveUsername(str(args, "author"));
  const reviewer = await api.resolveUsername(str(args, "reviewer"));
  const r = await api.get<any[]>(`/projects/${project}/merge_requests`, {
    state: str(args, "state") ?? "opened",
    author_username: author,
    reviewer_username: reviewer,
    labels: str(args, "labels"),
    search: str(args, "search"),
    source_branch: str(args, "sourceBranch"),
    target_branch: str(args, "targetBranch"),
    order_by: str(args, "orderBy") ?? "updated_at",
    sort: str(args, "sort") ?? "desc",
    per_page: limit,
    page: clampInt(args.page, 1, 1, 100_000),
  });
  return {
    project: decodeURIComponent(project),
    count: r.data.length,
    ...(r.total !== undefined ? { total: r.total } : {}),
    ...(r.nextPage ? { nextPage: r.nextPage } : {}),
    mergeRequests: r.data.map((m) => fmtMR(m)),
  };
};

const opMr: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  const iid = needInt(args.iid, "MR iid");
  const r = await api.get<any>(`/projects/${project}/merge_requests/${iid}`);
  const out: Record<string, unknown> = fmtMR(r.data, { descriptionLimit: 6000 });
  if (args.includeApprovals !== false) {
    try {
      const a = await api.get<any>(`/projects/${project}/merge_requests/${iid}/approvals`);
      const approvedBy = Array.isArray(a.data?.approved_by)
        ? a.data.approved_by.map((x: any) => x?.user?.username).filter(Boolean)
        : [];
      out.approvals = {
        approvedBy,
        required: a.data?.approvals_required,
        left: a.data?.approvals_left,
      };
    } catch (err) {
      if (!(err instanceof GitlabApiError) || (err.status !== 403 && err.status !== 404)) throw err;
      out.approvals = { unavailable: msg(err) };
    }
  }
  return out;
};

const opMrDiff: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  const iid = needInt(args.iid, "MR iid");
  const maxFiles = clampInt(args.maxFiles, 20, 1, 100);
  const maxLines = clampInt(args.maxLinesPerFile, 200, 20, 5000);
  const filter = str(args, "file")?.toLowerCase();
  const includeDiff = args.includeDiff !== false;

  let files: any[] = [];
  const notes: string[] = [];
  try {
    const r = await api.get<any[]>(`/projects/${project}/merge_requests/${iid}/diffs`, { per_page: 100 });
    files = Array.isArray(r.data) ? r.data : [];
    if (r.nextPage) notes.push(`diff 超过 100 个文件，只取了第一页；用 file 过滤或去网页查看完整变更`);
  } catch (err) {
    if (!(err instanceof GitlabApiError) || err.status !== 404) throw err;
    // 老版本 GitLab 只有 /changes
    const r = await api.get<any>(`/projects/${project}/merge_requests/${iid}/changes`);
    files = Array.isArray(r.data?.changes) ? r.data.changes : [];
  }

  const filtered = filter
    ? files.filter((f) => `${f?.old_path ?? ""}\n${f?.new_path ?? ""}`.toLowerCase().includes(filter))
    : files;
  const shown = filtered.slice(0, maxFiles);

  const mapped = shown.map((f) => {
    const diff = typeof f?.diff === "string" ? f.diff : "";
    const lines = diff.split("\n");
    const truncated = includeDiff && lines.length > maxLines;
    return {
      oldPath: f?.old_path,
      newPath: f?.new_path,
      newFile: f?.new_file === true,
      renamedFile: f?.renamed_file === true,
      deletedFile: f?.deleted_file === true,
      ...(includeDiff
        ? {
            diff: truncated ? lines.slice(0, maxLines).join("\n") : diff,
            ...(truncated ? { truncated: true, diffLines: lines.length } : {}),
          }
        : {}),
    };
  });

  if (filtered.length > shown.length) {
    notes.push(`${filtered.length} 个文件匹配，只展示前 ${shown.length} 个；用 file 过滤或调大 maxFiles`);
  }
  if (!includeDiff) notes.push("includeDiff=false：只返回文件清单与增删标记，没有 diff 正文");

  return {
    project: decodeURIComponent(project),
    mrIid: iid,
    totalFiles: filtered.length,
    shownFiles: shown.length,
    ...(notes.length ? { notes } : {}),
    files: mapped,
  };
};

const opMrComment: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  const iid = needInt(args.iid, "MR iid");
  const body = needStr(args, "body", "评论内容");
  const r = await api.post<any>(`/projects/${project}/merge_requests/${iid}/notes`, { body });
  return { ok: true, note: fmtNote(r) };
};

const opPipelines: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  if (args.pipelineId !== undefined) {
    const id = needInt(args.pipelineId, "pipelineId");
    const p = await api.get<any>(`/projects/${project}/pipelines/${id}`);
    const jobs = await api.get<any[]>(`/projects/${project}/pipelines/${id}/jobs`, {
      per_page: clampInt(args.jobLimit, 50, 1, 100),
    });
    return {
      project: decodeURIComponent(project),
      pipeline: fmtPipeline(p.data),
      jobs: jobs.data.map(fmtJob),
    };
  }
  const r = await api.get<any[]>(`/projects/${project}/pipelines`, {
    ref: str(args, "ref"),
    status: str(args, "status"),
    source: str(args, "source"),
    order_by: "updated_at",
    sort: "desc",
    per_page: clampInt(args.limit, 20, 1, 100),
    page: clampInt(args.page, 1, 1, 100_000),
  });
  return {
    project: decodeURIComponent(project),
    count: r.data.length,
    ...(r.total !== undefined ? { total: r.total } : {}),
    ...(r.nextPage ? { nextPage: r.nextPage } : {}),
    pipelines: r.data.map(fmtPipeline),
  };
};

const opJobLog: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const id = needInt(args.jobId, "jobId");
  const tailLines = clampInt(args.tailLines, 200, 1, 2000);
  const text = await api.getText(`/jobs/${id}/trace`);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const slice = lines.slice(-tailLines);
  return {
    jobId: id,
    totalLines: lines.length,
    returnedLines: slice.length,
    truncated: lines.length > tailLines,
    log: slice.join("\n"),
  };
};

const opCommits: ToolDef["run"] = async (args) => {
  const { api } = connect();
  const project = api.projectId(str(args, "project"));
  const r = await api.get<any[]>(`/projects/${project}/repository/commits`, {
    ref_name: str(args, "ref"),
    since: str(args, "since"),
    until: str(args, "until"),
    path: str(args, "path"),
    per_page: clampInt(args.limit, 20, 1, 100),
    page: clampInt(args.page, 1, 1, 100_000),
  });
  return {
    project: decodeURIComponent(project),
    count: r.data.length,
    ...(r.nextPage ? { nextPage: r.nextPage } : {}),
    commits: r.data.map(fmtCommit),
  };
};

/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "status",
    description:
      "检查 GitLab 连接：配置来源（用户级配置文件 / macOS 钥匙串）、当前用户、默认项目、配置警告。" +
      "第一次使用或报 401 时先跑它；没有配置时返回完整的配置指引（不要把 token 贴进对话）。",
    inputSchema: { type: "object", properties: {} },
    run: opStatus,
  },
  {
    name: "projects",
    description:
      "搜索/列出项目（默认只看自己加入的项目），返回 id、完整路径、默认分支、最近活动、开放 issue 数。" +
      "不确定项目完整路径时先用它搜。",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "按项目名/路径搜索" },
        membership: { type: "boolean", description: "只看自己加入的项目，缺省 true" },
        owned: { type: "boolean", description: "只看自己拥有的项目" },
        archived: { type: "boolean", description: "true=只看归档，false=排除归档" },
        orderBy: { type: "string", description: "缺省 last_activity_at" },
        sort: { type: "string", enum: ["asc", "desc"], description: "缺省 desc" },
        limit: LIMIT_SCHEMA,
        page: PAGE_SCHEMA,
      },
    },
    run: opProjects,
  },
  {
    name: "project",
    description: "单个项目详情：默认分支、可见性、开放 issue 数、star 数、描述、web 链接。",
    inputSchema: { type: "object", properties: { project: PROJECT_SCHEMA } },
    run: opProject,
  },
  {
    name: "issues",
    description:
      "列出项目的 issue（默认 opened）。支持按标签、负责人（assignee 可写 @me）、作者、关键词、里程碑过滤，按更新时间倒序。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        state: { type: "string", description: "opened（缺省）/ closed / all" },
        labels: { type: "string", description: "逗号分隔的标签，如 bug,priority::1" },
        assignee: { type: "string", description: "负责人用户名，或 @me" },
        author: { type: "string", description: "作者用户名，或 @me" },
        search: { type: "string", description: "标题/描述关键词" },
        milestone: { type: "string", description: "里程碑标题" },
        orderBy: { type: "string", description: "缺省 updated_at" },
        sort: { type: "string", enum: ["asc", "desc"], description: "缺省 desc" },
        limit: LIMIT_SCHEMA,
        page: PAGE_SCHEMA,
      },
    },
    run: opIssues,
  },
  {
    name: "issue",
    description:
      "单个 issue 详情 + 评论（默认包含，按时间正序）。长描述截断到 6000 字符；评论里 system=true 的是系统事件。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        iid: { type: "number", description: "issue 序号（项目内 iid，不是全局 id）" },
        includeNotes: { type: "boolean", description: "是否附带评论，缺省 true" },
        notesLimit: { type: "number", description: "评论条数，缺省 30，上限 100" },
      },
      required: ["iid"],
    },
    run: opIssue,
  },
  {
    name: "issue_comment",
    description:
      "在 issue 下发评论（写操作，需要 api scope）。发送前先把内容给用户确认；成功后返回评论元数据。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        iid: { type: "number", description: "issue 序号" },
        body: { type: "string", description: "评论正文（Markdown）" },
      },
      required: ["iid", "body"],
    },
    run: opIssueComment,
  },
  {
    name: "mrs",
    description:
      "列出项目的合并请求（默认 opened）。reviewer 写 @me 就是「等我评审的 MR」；支持标签、搜索、源/目标分支过滤。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        state: { type: "string", description: "opened（缺省）/ merged / closed / all" },
        author: { type: "string", description: "作者用户名，或 @me" },
        reviewer: { type: "string", description: "评审人用户名，或 @me" },
        labels: { type: "string", description: "逗号分隔的标签" },
        search: { type: "string", description: "标题/描述关键词" },
        sourceBranch: { type: "string", description: "源分支" },
        targetBranch: { type: "string", description: "目标分支" },
        orderBy: { type: "string", description: "缺省 updated_at" },
        sort: { type: "string", enum: ["asc", "desc"], description: "缺省 desc" },
        limit: LIMIT_SCHEMA,
        page: PAGE_SCHEMA,
      },
    },
    run: opMrs,
  },
  {
    name: "mr",
    description:
      "单个 MR 详情：状态、草稿、冲突、源/目标分支、作者与评审人、head pipeline、变更文件数、审批状态（默认附带）。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        iid: { type: "number", description: "MR 序号（项目内 iid）" },
        includeApprovals: { type: "boolean", description: "是否读审批状态，缺省 true" },
      },
      required: ["iid"],
    },
    run: opMr,
  },
  {
    name: "mr_diff",
    description:
      "MR 变更文件与 diff。先看文件清单与状态，再用 file 过滤看具体文件；每个文件的 diff 默认截到 200 行（maxLinesPerFile 可调）。" +
      "新版本走 /diffs，老版本 GitLab 自动回退 /changes。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        iid: { type: "number", description: "MR 序号" },
        file: { type: "string", description: "只保留路径包含该子串的文件（大小写不敏感）" },
        includeDiff: { type: "boolean", description: "false=只要文件清单，不要 diff 正文，缺省 true" },
        maxFiles: { type: "number", description: "最多返回多少个文件，缺省 20，上限 100" },
        maxLinesPerFile: { type: "number", description: "每个文件最多多少行 diff，缺省 200，上限 5000" },
      },
      required: ["iid"],
    },
    run: opMrDiff,
  },
  {
    name: "mr_comment",
    description: "在 MR 下发评论（写操作，需要 api scope）。发送前先把内容给用户确认；行内评论暂不支持。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        iid: { type: "number", description: "MR 序号" },
        body: { type: "string", description: "评论正文（Markdown）" },
      },
      required: ["iid", "body"],
    },
    run: opMrComment,
  },
  {
    name: "pipelines",
    description:
      "CI 流水线：不带 pipelineId 时列出最近流水线（可按 ref/status/source 过滤）；带 pipelineId 时返回该流水线详情与作业列表。" +
      "排障顺序：列表（status=failed）→ 详情看 jobs → job_log 看失败日志。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        pipelineId: { type: "number", description: "给定时返回该流水线详情 + 作业列表" },
        ref: { type: "string", description: "分支/标签" },
        status: { type: "string", description: "created / pending / running / success / failed / canceled / skipped / manual" },
        source: { type: "string", description: "push / merge_request_event / schedule / web / api 等" },
        jobLimit: { type: "number", description: "pipelineId 模式下作业条数，缺省 50，上限 100" },
        limit: LIMIT_SCHEMA,
        page: PAGE_SCHEMA,
      },
    },
    run: opPipelines,
  },
  {
    name: "job_log",
    description:
      "作业日志尾部：按 tailLines 取最后 N 行（缺省 200）。先用 pipelines(pipelineId) 拿失败作业的 id。日志很大，别一次拉全量。",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "number", description: "作业 id" },
        tailLines: { type: "number", description: "取最后多少行，缺省 200，上限 2000" },
      },
      required: ["jobId"],
    },
    run: opJobLog,
  },
  {
    name: "commits",
    description: "项目最近提交（可按分支、时间范围、文件路径过滤）。看「这周改了什么」或某文件的历史时用。",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_SCHEMA,
        ref: { type: "string", description: "分支/标签，缺省默认分支" },
        since: { type: "string", description: "ISO8601 起始时间，如 2026-10-01T00:00:00Z" },
        until: { type: "string", description: "ISO8601 结束时间" },
        path: { type: "string", description: "只看该文件/目录的提交" },
        limit: LIMIT_SCHEMA,
        page: PAGE_SCHEMA,
      },
    },
    run: opCommits,
  },
];
