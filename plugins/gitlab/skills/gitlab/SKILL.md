---
name: gitlab
description: 通过 GitLab API 做日常开发工作——检索项目、查询与评论 issue、列出并评审合并请求（MR）、读 diff 与审批状态、排查 CI 流水线与作业日志、查看最近提交。支持 gitlab.com 与自建实例。当用户提到 GitLab、MR/合并请求、code review、issue、pipeline/流水线、CI 失败、某个 group/project 的进展时使用。
---

# GitLab 工作流

一个 MCP 工具面（13 个工具，只读为主 + 评论写入）+ 固定的项目/MR/CI 工作流。
目标是**可复核**的结论：每条判断都能指回具体的 MR 序号、文件、行或作业 id。

## 凭据与边界（先读）

- **绝不要让用户把 token 贴进对话**，也不要把它写进工作区文件或提交到仓库。
- token 只从用户级来源读取：
  1. `~/.kova/gitlab.json`（推荐，`chmod 600`）
  2. macOS 钥匙串：`security add-generic-password -s kova-gitlab -a gitlab -w '<token>' -U`
  3. `~/.gitlab-token`（简单文件，兜底）
- 工作区的 `.kova/gitlab.json` **只读 `defaultProject`**：URL 与 token 一律不认工作区来源
  （防止仓库把 token 导向别的服务器）。
- 读操作需要 `read_api`；评论等写操作需要 `api`。权限不足会报 403。
- 不要为了“试试”而评论、关闭或合并任何东西；写操作都要用户确认。

## 控制面：`mcp` 网关

本插件的工具不直接出现在工具表里——Kova 用常驻的 `mcp` 网关代理所有 MCP 工具：

```text
mcp({ action: "search", query: "gitlab" })                        # 拿全名 gitlab__status 等
mcp({ action: "describe", tool: "gitlab__mr_diff" })              # 看参数 schema
mcp({ action: "call", tool: "gitlab__mr_diff",
      args: "{\"iid\": 42, \"file\": \"src/\"}" })                 # args 是 JSON 字符串
mcp({ action: "status" })                                          # 各服务器连接状态
```

- 全名约定 `gitlab__<tool>`；
- 连接是懒的：第一次 `call` 才建立连接，刚装完时 `search` 可能还搜不到——直接按全名 call；
- 下文写的是 server 内的原始工具名（`mr_diff` 等），实际调用加 `gitlab__` 前缀。

## 第一次使用

先跑 `gitlab__status`：

- `configured: false` → 把返回里的配置指引原样告诉用户（不要替他猜 token），然后停下等配置；
- `configured: true` 且返回 `user` → 可以直接工作；
- 返回 `error` → 通常是 401（token 过期）或网络/TLS 问题，按错误文本处理。

## 工作流

### 1. 定位项目

```text
gitlab__projects({ search: "payments" })
gitlab__project({ project: "group/subgroup/payments" })
```

用户只说项目名时先搜；搜索返回多条时让用户确认完整路径。拿到后优先用完整路径
（比数字 id 可读）。

### 2. Issue

```text
gitlab__issues({ project, state: "opened", labels: "bug", assignee: "@me" })
gitlab__issue({ project, iid: 17 })          # 详情 + 评论
gitlab__issue_comment({ project, iid: 17, body: "…" })
```

评论前先把正文给用户确认（工具本身就是两段的：先拿 preview，用户同意再带 confirmToken 发）。
引用 issue 时带 `#17` 和网页链接。

### 3. MR 评审（核心场景）

```text
gitlab__mrs({ project, reviewer: "@me" })                    # 等我评审的
gitlab__mr({ project, iid: 42 })                             # 状态/冲突/审批/head pipeline
gitlab__mr_diff({ project, iid: 42 })                        # 文件清单 + diff（按行截断）
gitlab__mr_diff({ project, iid: 42, file: "src/auth" })      # 只看某个文件
gitlab__pipelines({ project, pipelineId: 123456 })           # 失败时看作业
```

评审顺序：

1. 读 MR 描述与目标分支，判断意图；
2. 先看 diff 的文件清单（`includeDiff: false`），再逐个看关键文件；
3. 有 CI 时看 `mr.pipeline.status`，失败再进 `pipelines` / `job_log`；
4. 用 `commits` 或 diff 上下文确认改动范围，别只看标题。

评审输出模板（先给用户看，**不要直接发**）：

```markdown
## <project>!42 评审结论

- 结论：可以合并 / 需要修改 / 有阻塞问题
- 已核对：diff N 个文件；CI <status>；审批 <x>/<y>
- 阻塞项：
  - `src/auth/token.ts:88` 过期判断用了 `<`，边界上会多放行一秒
- 建议（非阻塞）：
  - `src/auth/` 下三处重复的解析逻辑可以抽公共函数
- 未验证：本地没跑测试；建议合入前跑 `make test`
```

规则：

- 位置写 `文件:行`（从 diff 的 hunk 头读行号），**不要编造行号**；
- 区分「阻塞项」与「建议」；不确定的写「未验证」；
- 行内评论暂不支持，只能发 MR 总评论；两段确认流程同 issue 评论（先拿 preview，用户同意再带 confirmToken 发）。

### 4. CI 排障

```text
gitlab__pipelines({ project, ref: "main", status: "failed", limit: 5 })
gitlab__pipelines({ project, pipelineId: 123456 })
gitlab__job_log({ jobId: 987654, tailLines: 200 })
```

先定位失败的作业，再取日志尾部；日志很大，别一次拉全量。把**具体报错行**贴进
结论里，不要只说“CI 挂了”。

### 5. 变更概览

```text
gitlab__commits({ project, ref: "main", since: "2026-10-01T00:00:00Z" })
gitlab__commits({ project, path: "src/billing/" })
```

## 写操作规则

- 只有 `issue_comment` / `mr_comment` 两个写工具；它们需要 `api` scope，且都是**两段确认**：
  1. 第一次调用（不带 `confirmToken`）**不会发送**——返回 `preview`（目标 issue/MR 的标题、网页链接、评论全文）和 `confirmToken`（5 分钟有效）；
  2. 把 preview 原样给用户看；用户同意后，带**同一个 confirmToken** 和**逐字相同**的参数再调一次，才真正发送；
  3. 内容或目标相对预览被改过、令牌过期、令牌复用，工具都会拒绝并要求重新准备——不要试图绕过，改了内容就重新走第一段。
- 发送成功的结果里有 `webUrl`，回答里带上让用户能直接点开核对（发后验证）。
- 评论用 Markdown，引用代码用行内代码或代码块，别贴整份 diff。
- 失败（403/404/429）时把错误原样告诉用户，不要重试写操作。

## 结果与引用

- 列表类结果带 `total` / `nextPage`：有 `nextPage` 就说明“还有更多”，必要时翻页或缩小过滤。
- 每个对象都有 `webUrl`，回答里带上能让用户直接点开。
- 时间统一用 GitLab 返回的 ISO8601，不换算时区（除非用户要求）。
- 长描述与 diff 已被截断并标注原长度；需要完整内容时缩小范围（文件过滤、翻页）。

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `configured: false` | 没有 token | 按 `gitlab__status` 的指引让用户配置；不要把 token 贴进对话 |
| 401 | token 无效/过期 | 重新生成 PAT，更新 `~/.kova/gitlab.json` 或钥匙串 |
| 403 | scope 不足，或项目不允许该操作 | 读用 `read_api`，评论用 `api`；确认项目权限 |
| 404 | 项目路径/序号错，或无权访问 | 先用 `projects` 搜完整路径；确认 `iid` 是项目内序号 |
| 429 | 触发限流 | 等待 Retry-After 秒数再试，减少翻页 |
| TLS 证书错误（自建实例） | 内部 CA / 自签证书 | 配置里加 `"caFile": "/path/ca.pem"`；明确知道风险时才用 `"insecureTls": true` |
| 工具表里没有 `gitlab_*` | MCP 工具经 `mcp` 网关调用 | 用全名 `gitlab__status`；先 `mcp({action:"status"})` 确认已连接 |
| `search` 搜不到工具 | 首次连接前无索引 | 直接按全名 call（调用时建立连接） |
| 「确认令牌无效或已过期」 | 令牌 5 分钟有效、单次使用 | 重新调用（不带 confirmToken）拿新预览，用户再确认一次 |
| 「确认令牌与本次参数不一致」 | 发送时的参数相对预览被改过 | 改了内容就必须重新走第一段，别复用旧令牌 |
