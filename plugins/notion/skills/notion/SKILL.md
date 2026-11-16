---
name: notion
description: "用官方 Notion CLI 操作 Notion：搜索页面、读取与创建页面、编辑内容、查询数据源、调用任意 Notion API、管理 Workers。用户提到 Notion、ntn、页面、数据库、wiki、知识库、Workers 时使用。删除页面、覆盖内容与 DELETE/PATCH 请求前必须确认。"
---

# Notion CLI 工作流

本技能随 Kova 的 `notion` 插件分发，封装官方 `ntn` CLI。插件不内置 HTTP 客户端，不保存 token。

## MCP 与 CLI 的分工

本插件同时提供 Notion 官方远程 MCP（OAuth）：`https://mcp.notion.com/mcp`。

- 页面搜索、读取与块级编辑优先用 MCP 工具；
- 数据源批量查询、Workers 与任意 API 调用继续用 `ntn`；
- 删除、覆盖与批量写入前先读取目标页面并确认。

## 前置检查

1. 检查版本：`ntn --version`
2. 未安装时：

```bash
curl -fsSL https://ntn.dev | bash
# 或
npm i -g ntn
```

npm 方式需要 Node 22+。

3. 登录：`ntn login`（浏览器，凭据存系统钥匙串）。
4. 检查：`ntn api v1/users/me`。
5. 无浏览器 / CI：设置 `NOTION_API_TOKEN`（`ntn_...`）。该变量优先级高于钥匙串。不要打印 token。

## 常用命令

```bash
# 原生 API
ntn api v1/users/me
ntn api v1/search query=roadmap
ntn api ls --json
ntn api v1/pages --data '{"parent":{"page_id":"..."},"properties":{}}'

# 页面
ntn pages get <page-id> --json
ntn pages create --parent page:<id> --content "# 标题"
ntn pages edit <page-id> --content "..."

# 数据源
ntn datasources resolve <database-id>
ntn datasources query <data-source-id> --limit 25 --filter '{"property":"Status"}'

# Workers
ntn workers list
ntn workers runs logs <run-id>
```

## 输出与脚本

- `ntn api` 返回 Notion 原生 JSON。
- 页面与 Workers 子命令支持 `--json`；需要 TSV 时用 `--plain`。
- 写请求用 `-X PATCH` / `-X POST`，请求体用 `--data` 传 JSON。

## 安全约定

- `ntn pages trash <id> --yes`、`ntn pages edit --allow-deleting-content`、`ntn api -X DELETE`、`ntn api -X PATCH` 属于高风险操作，必须先展示目标页面和改动并获得明确同意。
- Workers 的数据库 attach/detach 可能改动目标库数据，执行前确认环境。
- 不输出 `NOTION_API_TOKEN`。
- 删除优先改为归档或移入回收站，并告知用户可在 Notion 中恢复。

## 参考

- 总览：https://developers.notion.com/cli/get-started/overview
- 命令参考：https://developers.notion.com/cli/reference/commands
- 授权：https://developers.notion.com/cli/get-started/authentication
