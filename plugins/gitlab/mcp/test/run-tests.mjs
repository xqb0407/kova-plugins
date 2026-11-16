/**
 * gitlab 插件端到端测试：真实 stdio 子进程（bun 或 kova-worker，与生产一致）
 * + 进程内假 GitLab API（本地 HTTP fixture，捕获每个请求）。
 *
 * 覆盖：评论两段确认全链路（prepare → confirm → 发送）、令牌复用/篡改/过期拒绝、
 * 发送前零写入、@me 解析、分页头解析、job trace 控制字符清理、401/403/404/429 错误文案。
 *
 * 用法：node plugins/gitlab/mcp/test/run-tests.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(TEST_DIR, "..", "server.ts");

/* ------------------------------------------------------------------ */
/* 断言                                                                 */
/* ------------------------------------------------------------------ */

let pass = 0;
const failures = [];
function ok(cond, label) {
  if (cond) {
    pass++;
    process.stdout.write(`  ok  ${label}\n`);
  } else {
    failures.push(label);
    process.stdout.write(`FAIL  ${label}\n`);
  }
}

/* ------------------------------------------------------------------ */
/* 假 GitLab API                                                        */
/* ------------------------------------------------------------------ */

const captured = []; // { method, path, query, body }
const postedIssueNotes = [];
const postedMrNotes = [];

function json(res, status, obj, extraHeaders = {}) {
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(obj));
}

function handleApi(method, rawPath, query, body, res) {
  const issue = { iid: 17, title: "登录报错", state: "opened", web_url: "https://gitlab.example/group/demo/-/issues/17", description: "x" };
  const mr = { iid: 42, title: "修复登录", state: "opened", web_url: "https://gitlab.example/group/demo/-/merge_requests/42", source_branch: "fix", target_branch: "main" };

  if (method === "GET" && rawPath === "/api/v4/user") {
    return json(res, 200, { id: 1, username: "herther", name: "Herther", state: "active" });
  }
  if (method === "GET" && rawPath === "/api/v4/projects/group%2Fdemo/issues" ) {
    return json(res, 200, [issue], { "x-total": "7", "x-next-page": "2" });
  }
  if (method === "GET" && rawPath === "/api/v4/projects/group%2Fdemo/issues/17") {
    return json(res, 200, issue);
  }
  if (method === "POST" && rawPath === "/api/v4/projects/group%2Fdemo/issues/17/notes") {
    postedIssueNotes.push(body?.body ?? "");
    return json(res, 201, { id: 9001, body: body?.body ?? "", author: { username: "herther" }, created_at: "2026-11-06T00:00:00Z", web_url: "https://gitlab.example/group/demo/-/issues/17#note_9001" });
  }
  if (method === "GET" && rawPath === "/api/v4/projects/group%2Fdemo/merge_requests/42") {
    return json(res, 200, mr);
  }
  if (method === "POST" && rawPath === "/api/v4/projects/group%2Fdemo/merge_requests/42/notes") {
    postedMrNotes.push(body?.body ?? "");
    return json(res, 201, { id: 9002, body: body?.body ?? "", author: { username: "herther" }, created_at: "2026-11-06T00:00:00Z", web_url: "https://gitlab.example/group/demo/-/merge_requests/42#note_9002" });
  }
  if (method === "GET" && rawPath === "/api/v4/jobs/987/trace") {
    const lines = [];
    for (let i = 0; i < 60; i++) lines.push(`log line ${i + 1}`);
    const trace =
      `\x01[0Ksection_start:1730000000:build\r\x1b[32mRunning build\x1b[0m\n` +
      `${lines.join("\n")}\n` +
      `\x02[0Ksection_end:1730000000:build\r\x01[0Ksection_start:1730000001:test\rrunning tests...\n`;
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(trace);
    return;
  }
  if (method === "GET" && rawPath === "/api/v4/jobs/4290/trace") {
    return json(res, 429, { message: "429 Too Many Requests" }, { "retry-after": "7" });
  }
  if (rawPath.startsWith("/api/v4/projects/expired%2Fproj")) {
    return json(res, 401, { message: "401 Unauthorized" });
  }
  if (rawPath.startsWith("/api/v4/projects/group%2Fdenied")) {
    return json(res, 403, { message: "403 Forbidden" });
  }
  if (rawPath.startsWith("/api/v4/projects/ghost%2Fproj")) {
    return json(res, 404, { message: "Issue Not Found" });
  }
  return json(res, 404, { message: `fixture 未实现: ${method} ${rawPath}` });
}

function startGitlabFake() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://fixture");
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      captured.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body });
      handleApi(req.method, u.pathname, u.searchParams, body, res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

/* ------------------------------------------------------------------ */
/* MCP server 子进程                                                     */
/* ------------------------------------------------------------------ */

function findRuntime() {
  if (process.env.TEST_RUNTIME) return process.env.TEST_RUNTIME;
  const v = spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (v.status === 0) return "bun";
  const kova = "/Applications/Kova.app/Contents/Resources/binaries/kova-worker";
  if (existsSync(kova)) return kova;
  throw new Error("没有可用的 TS 运行时：需要 bun 或 Kova.app 的 kova-worker");
}

function startServer(extraEnv = {}) {
  const runtime = findRuntime();
  const proc = spawn(runtime, ["run", SERVER], {
    env: { ...process.env, BUN_BE_BUN: "1", ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"],
  });
  proc.stderr.on("data", () => {});
  let nextId = 1;
  const pending = new Map();
  const rl = createInterface({ input: proc.stdout, terminal: false });
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg && msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  function req(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`超时：${method}`)), 60_000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async function call(name, args = {}) {
    const msg = await req("tools/call", { name, arguments: args });
    if (msg.error) throw new Error(`${name}: ${msg.error.message}`);
    const result = msg.result ?? {};
    if (result.isError) return { isError: true, text: result.content?.[0]?.text ?? "" };
    return { isError: false, data: JSON.parse(result.content[0].text) };
  }

  return { req, call, stop: () => { proc.stdin.end(); proc.kill("SIGTERM"); setTimeout(() => proc.kill("SIGKILL"), 2_000).unref(); } };
}

async function withServer(extraEnv, fn) {
  const s = startServer(extraEnv);
  try {
    await fn(s);
  } finally {
    s.stop();
  }
}

/* ------------------------------------------------------------------ */
/* 场景 A：读工具 + 两段确认全链路                                        */
/* ------------------------------------------------------------------ */

const PORT = await startGitlabFake();
const BASE_ENV = { GITLAB_URL: `http://127.0.0.1:${PORT}`, GITLAB_TOKEN: "glpat-fixture-token" };
const TOOL_NAMES = ["status", "projects", "project", "issues", "issue", "issue_comment", "mrs", "mr", "mr_diff", "mr_comment", "pipelines", "job_log", "commits"];

await withServer(BASE_ENV, async (s) => {
  const init = await s.req("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "gitlab-e2e", version: "0" },
  });
  ok(init.result?.serverInfo?.name === "gitlab" && init.result.serverInfo.version === "0.2.0", "initialize 返回 serverInfo gitlab 0.2.0");

  const list = await s.req("tools/list", {});
  const names = (list.result?.tools ?? []).map((t) => t.name);
  ok(names.length === TOOL_NAMES.length && TOOL_NAMES.every((n) => names.includes(n)), "tools/list 恰好 13 个工具且名字齐全");

  const st = await s.call("status", {});
  ok(!st.isError && st.data?.configured === true && st.data?.user?.username === "herther", "status 连接正常并识别当前用户");

  const il = await s.call("issues", { project: "group/demo", assignee: "@me" });
  ok(!il.isError && il.data?.total === 7 && il.data?.nextPage === 2, "issues 列表解析分页头 total/nextPage");
  const q = captured.find((r) => r.method === "GET" && r.path === "/api/v4/projects/group%2Fdemo/issues");
  ok(q?.query?.assignee_username === "herther", "@me 解析成当前用户名传给 API");

  const prep = await s.call("issue_comment", { project: "group/demo", iid: 17, body: "已复现，周内修复" });
  ok(!prep.isError && prep.data?.requiresConfirmation === true && /^[0-9a-f]{32}$/.test(prep.data?.confirmToken ?? ""), "第一次调用只返回预览 + 32 位确认令牌");
  ok(prep.data?.preview?.target === "#17 登录报错" && prep.data.preview.webUrl.includes("/issues/17"), "预览带目标标题与网页链接");
  ok(prep.data.preview.body === "已复现，周内修复", "预览含评论全文");
  ok(postedIssueNotes.length === 0, "prepare 阶段零写入");

  const tamper = await s.call("issue_comment", { project: "group/demo", iid: 17, body: "改过的内容", confirmToken: prep.data.confirmToken });
  ok(tamper.isError && tamper.text.includes("不一致"), "内容被篡改时拒绝发送");
  ok(postedIssueNotes.length === 0, "篡改尝试后仍是零写入");

  const prep2 = await s.call("issue_comment", { project: "group/demo", iid: 17, body: "已复现，周内修复" });
  const sent = await s.call("issue_comment", { project: "group/demo", iid: 17, body: "已复现，周内修复", confirmToken: prep2.data.confirmToken });
  ok(!sent.isError && sent.data?.ok === true && postedIssueNotes.length === 1, "用户确认后真正发送");
  ok(postedIssueNotes[0] === "已复现，周内修复", "发送的正文与预览逐字一致");
  ok(typeof sent.data?.webUrl === "string" && sent.data.webUrl.includes("#note_9001"), "发送结果带新评论 webUrl 供核对");

  const reuse = await s.call("issue_comment", { project: "group/demo", iid: 17, body: "已复现，周内修复", confirmToken: prep2.data.confirmToken });
  ok(reuse.isError && reuse.text.includes("无效或已过期"), "令牌复用被拒绝（单次有效）");

  const mrPrep = await s.call("mr_comment", { project: "group/demo", iid: 42, body: "LGTM，有一个非阻塞建议" });
  const mrSent = await s.call("mr_comment", { project: "group/demo", iid: 42, body: "LGTM，有一个非阻塞建议", confirmToken: mrPrep.data.confirmToken });
  ok(!mrSent.isError && mrSent.data?.sentTo === "#42 修复登录" && postedMrNotes.length === 1, "MR 评论两段确认全链路");

  const jl = await s.call("job_log", { jobId: 987, tailLines: 10 });
  ok(!jl.isError && jl.data?.truncated === true && jl.data.returnedLines === 10, "job_log 按行截断");
  const log = jl.data?.log ?? "";
  ok(!log.includes("\x01") && !log.includes("\x1b"), "trace 的 section 标记与 ANSI 色码已剥掉");
  ok(log.includes("running tests...") && log.includes("section_end:1730000000:build"), "清理后正文可读（尾部内容与 section 名）");

  const rate = await s.call("job_log", { jobId: 4290 });
  ok(rate.isError && rate.text.includes("限流") && rate.text.includes("7 秒"), "429 报限流并带 Retry-After 秒数");

  const e401 = await s.call("issue_comment", { project: "expired/proj", iid: 1, body: "x" });
  ok(e401.isError && e401.text.includes("认证失败"), "401 给认证失败指引");
  const e403 = await s.call("issue_comment", { project: "group/denied", iid: 1, body: "x" });
  ok(e403.isError && e403.text.includes("拒绝访问"), "403 给 scope/权限指引");
  const e404 = await s.call("issue_comment", { project: "ghost/proj", iid: 1, body: "x" });
  ok(e404.isError && e404.text.includes("未找到"), "404 给项目/序号检查指引");
});

/* ------------------------------------------------------------------ */
/* 场景 B：令牌过期（TTL 缩到 300ms）                                    */
/* ------------------------------------------------------------------ */

await withServer({ ...BASE_ENV, GITLAB_CONFIRM_TTL_MS: "300" }, async (s) => {
  const prep = await s.call("issue_comment", { project: "group/demo", iid: 17, body: "过期测试" });
  await new Promise((resolve) => setTimeout(resolve, 450));
  const expired = await s.call("issue_comment", { project: "group/demo", iid: 17, body: "过期测试", confirmToken: prep.data.confirmToken });
  ok(expired.isError && expired.text.includes("无效或已过期"), "令牌过期后拒绝发送");
  ok(postedIssueNotes.length === 1, "过期令牌也没有产生写入");
});

/* ------------------------------------------------------------------ */
/* 汇总                                                                 */
/* ------------------------------------------------------------------ */

process.stdout.write(`\n${pass} 通过，${failures.length} 失败\n`);
if (failures.length) {
  process.stdout.write(`${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
// fixture server / 迟退出的子进程会吊住事件循环，显式收尾保证脚本必然退出
process.exit(0);
