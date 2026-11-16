---
name: google-workspace
description: "用 Google Workspace 官方 MCP 读取 Gmail、Drive、Docs、Sheets、Calendar 并做跨产品搜索。用户提到 Gmail、Google Drive、Docs、Sheets、Google 日历、Workspace 搜索时使用。发送邮件、改文档或表格、共享文件、创建日程前必须确认。"
---

# Google Workspace 官方 MCP

本技能随 Kova 的 `google-workspace` 插件分发。插件通过 `.mcp.json` 连接 Google 官方产品级 MCP；技能负责前置条件、授权、工具选择与安全约定。

## 前置条件

Google Workspace MCP 仍是 Developer Preview，启用门槛较高：

1. 加入 Google Workspace Developer Preview Program。
2. 在 Google Cloud 创建项目，启用 Gmail、Drive、Docs、Sheets、Calendar 对应 API，以及各产品的 `*mcp.googleapis.com` 服务。
3. 创建 OAuth 客户端，类型选择“用于 AI 智能体的客户端”，并配置 offline access，避免每小时重新授权。
4. 在 Kova 中完成各产品的 OAuth 授权；每个产品是独立授权上下文。

如果 Kova 的插件连接页没有 OAuth 客户端配置入口，先不要反复重试，改为在 Gemini CLI 或 Antigravity 中配置同一组官方端点。

## 已声明的服务器

- `google-workspace-gmail`：`https://gmailmcp.googleapis.com/mcp/v1`
- `google-workspace-drive`：`https://drivemcp.googleapis.com/mcp/v1`
- `google-workspace-docs`：`https://docsmcp.googleapis.com/mcp/v1`
- `google-workspace-sheets`：`https://sheetsmcp.googleapis.com/mcp/v1`
- `google-workspace-calendar`：`https://calendarmcp.googleapis.com/mcp/v1`
- `google-workspace-search`：`https://workspacemcp.googleapis.com/mcp/v1`

Slides、Chat、People 也有独立端点，需要时在 Kova 的 MCP 设置中手动追加。

## 可用工具

| 产品 | 常用工具 |
|---|---|
| Gmail | `gmail.search_threads`、`gmail.create_draft` |
| Drive | `drive.search_files`、`drive.read_file_content` |
| Docs | `docs.read_doc`、`docs.update_doc` |
| Sheets | `sheets.get_values`、`sheets.update_values` |
| Calendar | `calendar.list_events`、`calendar.create_event` |
| Universal Search | `search_corpus` |
| People | `people.get_user_profile`、`people.search_contacts` |

## 使用顺序

1. 先用搜索类工具定位邮件、文件、文档或事件，确认 ID 与标题。
2. 读操作直接执行；写入前把目标、范围和改动内容展示给用户。
3. 发送邮件、共享文件、更新文档/表格、创建带参会人的日程，必须获得明确同意。
4. 写入后重新读取一次，确认结果符合预期。

## 安全约定

- 不把 OAuth client secret、refresh token 或邮件内容写进仓库。
- 发送邮件前确认收件人、主题、正文和附件；群发必须单独确认。
- 共享 Drive 文件前确认对象、权限级别和是否对外公开。
- 更新 Docs/Sheets 前先读取当前内容，避免覆盖他人修改。
- MCP 处于 preview，工具名和行为可能变化；以运行时 `tools/list` 为准。

## 参考

- 配置：https://developers.google.com/workspace/guides/configure-mcp-servers
- Universal Search：https://developers.google.com/workspace/guides/universal-search-mcp
