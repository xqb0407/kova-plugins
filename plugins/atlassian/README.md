# Atlassian 插件

通过 Atlassian 官方 Rovo MCP 检索 Jira issue、Confluence 页面与跨产品内容。插件包含官方 MCP 配置与技能，技能负责授权、连接检查、工具选择与安全约定。

## 安装

无需本地安装。插件自带 `.mcp.json`，在 Kova 插件页连接并完成 OAuth。

## 授权

OAuth 2.1；仅支持 Atlassian Cloud，管理员可限制工具组。

## 常用场景

```text
用 JQL 检索项目中的未完成 issue
读取某个 Jira issue 的详情
搜索 Confluence 中的架构文档
更新一页 Confluence 内容
```

## 内置技能

`atlassian` —— Jira issue、Confluence 页面与跨产品搜索

## 安全约定

- 创建/编辑/删除前必须确认。
- 默认不调用 `executeDestructive`。
- 仅支持 Atlassian Cloud。

## 来源与许可

- 上游：https://developer.atlassian.com/cloud/rovo-mcp/
- 许可：Atlassian 官方服务条款
