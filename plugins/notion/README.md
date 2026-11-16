# Notion 插件

用官方 Notion CLI 读写页面、查询数据源、调用 Notion API 与管理 Workers。插件同时提供技能与官方 MCP 配置：CLI 负责页面读写、数据源查询与 Workers，MCP 提供面向 agent 的页面检索与编辑工具；不内置 HTTP 客户端，也不保存凭据。

## 安装

```bash
curl -fsSL https://ntn.dev | bash
# 或 npm i -g ntn（Node 22+）
ntn --version
```

## 授权

```bash
ntn login
ntn api v1/users/me
```

CI 使用 `NOTION_API_TOKEN=ntn_...`，优先于钥匙串。

## 常用命令

```bash
ntn api v1/search query=roadmap
ntn pages get <page-id> --json
ntn datasources query <data-source-id> --limit 25
ntn pages create --parent page:<id> --content "# 标题"
```

## MCP 服务器

插件附带 Notion 官方远程 MCP：`https://mcp.notion.com/mcp`（OAuth）

- 连接时按提示在浏览器完成授权，并选择要开放的页面。
- 页面搜索、内容读取与块级编辑优先用 MCP；批量脚本、Workers 与任意 API 调用走 `ntn`。
- 删除页面、覆盖内容与批量改块前必须确认目标页面。

## 内置技能

`notion` —— 页面、数据源、原生 API 与 Workers

## 安全约定

- 删除页面、覆盖内容、DELETE/PATCH 请求前必须确认。
- 不输出 NOTION_API_TOKEN。
- 优先归档而非永久删除。

## 来源与许可

- 上游：https://developers.notion.com/cli/get-started/overview
- 许可：MIT
