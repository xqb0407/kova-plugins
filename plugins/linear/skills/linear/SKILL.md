---
name: linear
description: "用 Linear 官方 MCP 检索和更新 issue、项目、团队、评论与 cycle。用户提到 Linear、issue、项目、roadmap、cycle、团队待办时使用。创建或更新 issue、评论、改状态前必须确认；探索阶段优先只读端点。"
---

# Linear 官方 MCP

本技能随 Kova 的 `linear` 插件分发。插件连接 Linear 官方远程 MCP，技能负责授权与工具选择。

## 连接与授权

- 端点：`https://mcp.linear.app/mcp`
- 只读端点：`https://mcp.linear.app/mcp/readonly`，探索阶段优先使用。
- 授权：OAuth 2.1 + 动态客户端注册；首次连接时在 Kova 中完成授权。
- 每个 workspace 有独立认证上下文；切换 workspace 后重新确认连接。

## 可用工具

| 工具 | 用途 |
|---|---|
| `list_issues` | 按团队、状态、负责人、标签检索 issue |
| `get_issue` | 读取单个 issue 的详情、描述与评论 |
| `save_issue` | 创建或更新 issue（写操作） |
| `list_projects` / `get_project` | 查看项目与进度 |
| `list_teams` | 列出团队，确认 team key |
| `list_comments` / `create_comment` | 读取或新增评论 |
| `list_cycles` | 查看当前与历史 cycle |

工具名可能随服务端版本变化，以运行时 `tools/list` 为准。

## 使用顺序

1. 先用 `list_teams` 确认团队，再用 `list_issues` 检索。
2. 读取 issue 时先看描述与最近评论，避免重复创建。
3. 创建或更新前展示标题、团队、状态、负责人、优先级和正文。
4. 写入后重新读取一次确认结果。

## 安全约定

- `save_issue`、`create_comment` 以及任何状态流转都是写操作，必须获得用户明确同意。
- 探索阶段使用只读端点，或只调用 list/get 工具。
- 不输出 OAuth token 或 workspace 内部链接中的敏感参数。
- 批量更新前先列出命中 issue 数量，避免误改整个团队。

## 参考

- 文档：https://linear.app/docs/mcp
