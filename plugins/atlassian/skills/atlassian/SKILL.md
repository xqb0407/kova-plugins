---
name: atlassian
description: "用 Atlassian 官方 Rovo MCP 检索 Jira issue、Confluence 页面与跨产品内容。用户提到 Confluence、Jira、Atlassian、知识库、页面、JQL 时使用。创建、更新或删除 Jira 与 Confluence 内容前必须确认；仅支持 Atlassian Cloud。"
---

# Atlassian Rovo MCP

本技能随 Kova 的 `atlassian` 插件分发，覆盖 Jira 与 Confluence 的云端 MCP。需要本地脚本自动化时，继续使用 `jira` 插件的 `acli`。

## 连接与授权

- 端点：`https://mcp.atlassian.com/v2/mcp`
- 授权：OAuth 2.1；首次连接时在 Kova 中完成。
- 仅支持 Atlassian Cloud；Data Center 不支持。
- 管理员按 permission group 控制可见工具；部分写工具默认关闭。
- 工具采用动态发现，先调用 `discover` 或读取 `tools/list`。

## 可用工具

| 工具 | 用途 |
|---|---|
| `atlassianUserInfo` | 当前用户信息 |
| `getAccessibleAtlassianResources` | 可访问的站点与资源 |
| `discover` | 动态发现当前可用工具 |
| `executeRead` / `executeWrite` / `executeDestructive` | 通用执行入口 |
| `getJiraIssue` | 读取 Jira issue |
| `searchJiraIssuesUsingJql` | 用 JQL 检索 issue |
| `createJiraIssue` / `editJiraIssue` | 创建或编辑 issue |
| `getConfluenceContent` | 读取页面或空间内容 |
| `createConfluenceContent` / `updateConfluenceContent` | 创建或更新页面 |

## 使用顺序

1. 先 `getAccessibleAtlassianResources` 确认站点，再 `discover` 看可用工具。
2. Jira：先用 JQL 检索，确认 key 后再读详情。
3. Confluence：先按标题/空间搜索，读取当前页面后再提出更新。
4. 写入前展示空间、页面/issue key、正文差异和目标状态。
5. 写入后重新读取一次确认。

## 安全约定

- 创建、编辑、删除 Jira/Confluence 内容前必须获得用户明确同意。
- `executeDestructive` 与删除类工具默认不要调用；确需使用时单独确认。
- 不在 Confluence 页面中写入 token、密钥或内部凭据。
- 部分工具消耗 Rovo credits；批量操作前说明范围。
- 仅支持 Cloud；遇到 Server/Data Center 时改用 REST API 或网页端。

## 参考

- 概览：https://developer.atlassian.com/cloud/rovo-mcp/
- 支持工具：https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/
