/**
 * 把 GitLab 的原始 JSON 收窄成 agent 友好的紧凑形状：
 * 只保留定位、时间、状态、链接与必要正文，长文本统一截断并注明原长。
 */

export function truncate(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.length > max ? `${value.slice(0, max)}…（截断，共 ${value.length} 字符）` : value;
}

function shortSha(sha: unknown): string | undefined {
  return typeof sha === "string" && sha ? sha.slice(0, 8) : undefined;
}

function usernames(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      const rec = item as Record<string, unknown> | undefined;
      const user = (rec?.username ?? rec?.name) as unknown;
      return typeof user === "string" ? user : undefined;
    })
    .filter((v): v is string => Boolean(v));
}

export function fmtProject(raw: any) {
  if (!raw || typeof raw !== "object") return raw;
  return {
    id: raw.id,
    path: raw.path_with_namespace,
    name: raw.name,
    defaultBranch: raw.default_branch,
    visibility: raw.visibility,
    archived: raw.archived,
    createdAt: raw.created_at,
    lastActivityAt: raw.last_activity_at,
    openIssues: raw.open_issues_count,
    stars: raw.star_count,
    fork: raw.forked_from_project?.path_with_namespace,
    description: truncate(raw.description, 300),
    webUrl: raw.web_url,
  };
}

export function fmtIssue(raw: any, opts: { descriptionLimit?: number } = {}) {
  if (!raw || typeof raw !== "object") return raw;
  const author = raw.author?.username as string | undefined;
  return {
    iid: raw.iid,
    title: raw.title,
    state: raw.state,
    labels: Array.isArray(raw.labels) ? raw.labels : [],
    author,
    assignees: usernames(raw.assignees),
    milestone: raw.milestone?.title,
    confidential: raw.confidential === true,
    dueDate: raw.due_date,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    notes: raw.user_notes_count,
    webUrl: raw.web_url,
    ...(opts.descriptionLimit !== undefined
      ? { description: truncate(raw.description, opts.descriptionLimit) }
      : {}),
  };
}

export function fmtNote(raw: any) {
  if (!raw || typeof raw !== "object") return raw;
  return {
    id: raw.id,
    author: raw.author?.username,
    createdAt: raw.created_at,
    system: raw.system === true,
    ...(raw.resolvable === true ? { resolved: raw.resolved === true } : {}),
    body: truncate(raw.body, 2000),
  };
}

export function fmtMR(raw: any, opts: { descriptionLimit?: number } = {}) {
  if (!raw || typeof raw !== "object") return raw;
  return {
    iid: raw.iid,
    title: raw.title,
    state: raw.state,
    draft: raw.draft === true,
    sourceBranch: raw.source_branch,
    targetBranch: raw.target_branch,
    author: raw.author?.username,
    reviewers: usernames(raw.reviewers),
    assignees: usernames(raw.assignees),
    labels: Array.isArray(raw.labels) ? raw.labels : [],
    milestone: raw.milestone?.title,
    mergeStatus: raw.detailed_merge_status ?? raw.merge_status,
    hasConflicts: raw.has_conflicts,
    blockingDiscussionsResolved: raw.blocking_discussions_resolved,
    notes: raw.user_notes_count,
    changesCount: raw.changes_count,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    mergedAt: raw.merged_at,
    closedAt: raw.closed_at,
    webUrl: raw.web_url,
    ...(raw.head_pipeline
      ? {
          pipeline: {
            id: raw.head_pipeline.id,
            status: raw.head_pipeline.status,
            ref: raw.head_pipeline.ref,
            sha: shortSha(raw.head_pipeline.sha),
            webUrl: raw.head_pipeline.web_url,
          },
        }
      : {}),
    ...(opts.descriptionLimit !== undefined
      ? { description: truncate(raw.description, opts.descriptionLimit) }
      : {}),
  };
}

export function fmtPipeline(raw: any) {
  if (!raw || typeof raw !== "object") return raw;
  return {
    id: raw.id,
    iid: raw.iid,
    status: raw.status,
    ref: raw.ref,
    sha: shortSha(raw.sha),
    source: raw.source,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    duration: raw.duration,
    user: raw.user?.username,
    webUrl: raw.web_url,
  };
}

export function fmtJob(raw: any) {
  if (!raw || typeof raw !== "object") return raw;
  return {
    id: raw.id,
    name: raw.name,
    stage: raw.stage,
    status: raw.status,
    duration: raw.duration,
    failureReason: raw.failure_reason,
    allowFailure: raw.allow_failure,
    ref: raw.ref,
    webUrl: raw.web_url,
  };
}

export function fmtCommit(raw: any) {
  if (!raw || typeof raw !== "object") return raw;
  return {
    shortId: raw.short_id,
    title: raw.title,
    author: raw.author_name,
    authoredDate: raw.authored_date,
    committedDate: raw.committed_date,
    webUrl: raw.web_url,
    message: truncate(raw.message, 500),
  };
}
