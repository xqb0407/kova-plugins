# Cloudflare 插件

用官方 Wrangler CLI 开发、部署和管理 Workers、Pages、D1、R2、KV 与密钥。插件同时提供技能与官方 MCP 配置：CLI 负责开发、部署与资源管理，MCP 提供面向 agent 的账户与资源查询工具；不内置 HTTP 客户端，也不保存凭据。

## 安装

```bash
npm i -D wrangler@latest
npx wrangler --version
```

## 授权

```bash
npx wrangler login
npx wrangler whoami
```

CI 使用 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`。

## 常用命令

```bash
npx wrangler dev
npx wrangler deploy --env production
npx wrangler tail <worker-name> --format json
npx wrangler d1 migrations apply <DB> --remote
```

## MCP 服务器

插件附带 Cloudflare 官方远程 MCP：`https://mcp.cloudflare.com/mcp`（OAuth 或 API Token）

- 优先 OAuth；脚本环境可用限定权限的 API Token。
- 账户、Zone、Workers、D1、R2 等资源查询优先用 MCP；部署、日志跟踪与迁移走 `wrangler`。
- 部署、改 secret、回滚与数据库迁移前必须确认账户与环境。

## 内置技能

`cloudflare` —— Workers、Pages、D1、R2、KV 与 secret

## 安全约定

- 部署、改密钥、回滚、数据库迁移前确认环境与目标。
- 不输出 API token。
- 删除对象或键前先备份。

## 来源与许可

- 上游：https://developers.cloudflare.com/workers/wrangler/
- 许可：MIT OR Apache-2.0
