# Google Workspace 插件

通过 Google 官方产品级 MCP 连接 Gmail、Drive、Docs、Sheets、Calendar 与跨产品搜索。插件包含官方 MCP 配置与技能，技能负责授权、连接检查、工具选择与安全约定。

## 安装

无需本地安装。插件自带 `.mcp.json`，在 Kova 插件页连接即可。需要 Workspace Developer Preview 与 Google Cloud OAuth 客户端。

## 授权

按产品完成 OAuth。OAuth 客户端需勾选“用于 AI 智能体的客户端”，并开启 offline access。

## 常用场景

```text
Gmail：搜索未读邮件并起草回复
Drive：搜索季度报告并读取内容
Sheets：读取 A1:C20 并汇总
Calendar：查看本周日程
```

## 内置技能

`google-workspace` —— Gmail、Drive、Docs、Sheets、Calendar 与 Universal Search

## 安全约定

- 发送邮件、共享文件、改文档/表格、创建日程前必须确认。
- 不输出 OAuth secret、refresh token 或邮件正文。
- MCP 为 Developer Preview，工具名可能变化。

## 来源与许可

- 上游：https://developers.google.com/workspace/guides/configure-mcp-servers
- 许可：Google Workspace 官方服务条款
