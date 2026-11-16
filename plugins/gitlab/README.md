# GitLab 插件

用 GitLab REST API v4 做日常开发工作：找项目、查/评论 issue、列出并评审 MR、
读 diff 与审批状态、排查 CI 流水线、看最近提交。支持 gitlab.com 与自建实例。

- 只读为主：13 个工具里只有 2 个写操作（issue/MR 评论）。
- 零依赖：直接用运行时自带的 `fetch`，不要求安装 `glab`。
- Token 不落插件：只从用户级配置或 macOS 钥匙串读取。

## 配置

MCP 子进程只拿到宿主白名单环境（HOME/PATH/SHELL/TERM 等），shell 里 export 的
`GITLAB_TOKEN` 不会传进去。任选一种：

**A. 用户级配置文件（推荐）**

```bash
mkdir -p ~/.kova
cat > ~/.kova/gitlab.json <<'EOF'
{
  "url": "https://gitlab.example.com",
  "token": "glpat-xxxxxxxx",
  "defaultProject": "group/subgroup/project"
}
EOF
chmod 600 ~/.kova/gitlab.json
```

**B. macOS 钥匙串（token 与文件分离）**

```bash
security add-generic-password -s kova-gitlab -a gitlab -w 'glpat-xxxxxxxx' -U
```

配置文件里只留 `url`（缺省 `https://gitlab.com`）和可选的 `defaultProject`。

**可选字段**：`timeoutMs`（默认 20000）、`caFile`（自建实例内部 CA）、
`insecureTls`（自签证书，明确知道风险再用）。

**工作区默认项目**：可以在仓库里放 `.kova/gitlab.json` 只写
`{ "defaultProject": "group/project" }`。**工作区的 url/token 会被忽略**——仓库文件
跟着别人的提交走，允许它改 URL 就等于允许把 token 发到任意服务器。

Token scope：读用 `read_api`；评论需要 `api`。

## 在 Kova 里怎么调用

MCP 工具不直接注册进工具表，统一经 `mcp` 网关，全名 `gitlab__<tool>`：

```text
mcp({ action: "status" })                                  # 确认已配置/已连接
mcp({ action: "call", tool: "gitlab__status", args: "{}" })
mcp({ action: "call", tool: "gitlab__mrs",
      args: "{\"project\": \"group/app\", \"reviewer\": \"@me\"}" })
```

首次 `call` 才建立连接，刚装完时 `mcp search` 可能搜不到，直接按全名调用即可。

## 工具

| 工具（全名 `gitlab__*`） | 作用 | 关键参数 |
| --- | --- | --- |
| `status` | 配置来源、当前用户、默认项目、配置警告 | — |
| `projects` | 搜索/列出项目（默认只看自己加入的） | `search`, `membership`, `limit`, `page` |
| `project` | 单项目详情 | `project` |
| `issues` | issue 列表（默认 opened） | `state`, `labels`, `assignee`（`@me`）, `search`, `limit` |
| `issue` | issue 详情 + 评论 | `iid`, `includeNotes`, `notesLimit` |
| `issue_comment` | 发 issue 评论（写，两段确认） | `iid`, `body`, `confirmToken?` |
| `mrs` | MR 列表（默认 opened） | `state`, `author`/`reviewer`（`@me`）, `labels`, `search` |
| `mr` | MR 详情 + 审批 + head pipeline | `iid`, `includeApprovals` |
| `mr_diff` | 变更文件与 diff | `iid`, `file`, `includeDiff`, `maxFiles`, `maxLinesPerFile` |
| `mr_comment` | 发 MR 总评论（写，两段确认） | `iid`, `body`, `confirmToken?` |
| `pipelines` | 流水线列表 / 指定流水线详情 + 作业 | `ref`, `status`, `pipelineId`, `jobLimit` |
| `job_log` | 作业日志尾部 | `jobId`, `tailLines` |
| `commits` | 最近提交 | `ref`, `since`, `until`, `path`, `limit` |

所有带 `project` 的工具都可以省略它，改用配置里的 `defaultProject`。
列表返回 `total` / `nextPage`；有 `nextPage` 说明还有更多。

## 设计取舍

- **URL/token 只认用户级来源**：工作区配置只能设 `defaultProject`。这是防 token
  外发的硬约束，不是可配置项。
- **评论写入两段确认**（0.2.0，借鉴 email-workbench 的闸门链）：第一次调用只校验目标并返回
  预览 + confirmToken（5 分钟有效，存 MCP 进程内存），用户看过预览同意后带同一令牌与
  逐字相同参数再调一次才真正 POST。内容/目标变过、令牌过期或复用都会拒绝——把「发送前
  给用户确认」从纪律变成机制。发送结果带新评论 `webUrl`，方便发后核对。
- **错误可操作**：401/403/404/429 分别给出下一步（检查 token、scope、项目路径、
  Retry-After），并保留 GitLab 原始 `message`。
- **结果有上限**：列表默认 20 条；diff 每个文件默认 200 行、最多 20 个文件；
  作业日志默认最后 200 行。需要更多就显式调参或缩小过滤。
- **`@me` 解析**：作者/评审人过滤里写 `@me`，服务端先查 `/user` 再替换成用户名。
- **每次调用重读配置**：改 token/url 不用重启 MCP 进程。
- **diff 兼容**：优先 `/diffs`（新版本，分页），404 时回退 `/changes`（老版本）。
- **job trace 清理**：日志里的 section 标记（`\x01/\x02[0K`）与 ANSI 色码在返回前剥掉。

## 限制

- 只支持单实例（一套配置）；多 GitLab 实例需要起多份配置。
- 行内（某一行 diff 上的）评论暂不支持，只有 issue/MR 总评论。
- 不支持创建/合并 MR、改 issue 状态、触发流水线——这些仍去网页或 `glab` 做。
- `job_log` 取的是日志尾部；超大日志建议先用 `tailLines` 定位报错行。

## 本地调试

```bash
# 端到端（假 GitLab API，本地 HTTP fixture；覆盖评论两段确认全链路、令牌过期/
# 篡改/复用拒绝、@me 解析、分页头、trace 清理、4 类错误文案等 24 项断言）
node plugins/gitlab/mcp/test/run-tests.mjs

# 直接调工具（绕过 JSON-RPC）
bun -e 'import { TOOL_DEFS } from "./mcp/tools.ts";
const t = TOOL_DEFS.find((x) => x.name === "status");
console.log(await t.run({}, { workspace: process.cwd() }));'

# 起 MCP server（stdout 是协议行，别打日志）
KOVA_WORKSPACE="$PWD" bun run mcp/server.ts

# 仓库自检
node ../../scripts/check.mjs
```

改了 `~/.kova/gitlab.json` 不需要重启；改了 `mcp/` 代码在链接安装下重开会话或重载 MCP。
