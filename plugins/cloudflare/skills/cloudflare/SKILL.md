---
name: cloudflare
description: "用官方 wrangler CLI 处理 Cloudflare Workers 工作流：本地开发、部署、查看实时日志、管理 secret 与版本回滚、执行 D1 查询与迁移、读写 R2 和 KV。用户提到 Cloudflare、wrangler、Workers、Pages、D1、R2、KV 时使用。部署、改密钥、回滚和数据库迁移前必须确认环境。"
---

# Cloudflare（wrangler）工作流

本技能随 Kova 的 `cloudflare` 插件分发，封装官方 `wrangler` CLI。插件不内置 HTTP 客户端，不保存 token。

## MCP 与 CLI 的分工

本插件同时提供 Cloudflare 官方远程 MCP（OAuth 或 API Token）：`https://mcp.cloudflare.com/mcp`。

- 账户、Zone 与资源查询优先用 MCP 工具；
- 本地开发、部署、实时日志与迁移继续用 `wrangler`；
- 写操作前先只读确认账户、环境与资源名。

## 前置检查

1. 检查版本：`npx wrangler --version`
2. 优先作为项目依赖安装，避免全局版本漂移：

```bash
npm i -D wrangler@latest
npx wrangler --version
```

3. 登录：`npx wrangler login`；无回调环境用 `npx wrangler login --device`。
4. 确认账号：`npx wrangler whoami`。
5. CI 使用 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`，不要写入仓库。

## 常用命令

```bash
# 开发与部署
npx wrangler dev
npx wrangler deploy
npx wrangler deploy --env production
npx wrangler deploy --dry-run --outdir dist

# 日志与版本
npx wrangler tail <worker-name> --format json
npx wrangler rollback <version-id>

# 密钥
npx wrangler secret put API_KEY
npx wrangler versions secret put API_KEY

# D1
npx wrangler d1 list
npx wrangler d1 execute <DB> --remote --command "select 1" --json
npx wrangler d1 migrations apply <DB> --remote

# R2 / KV
npx wrangler r2 object put <bucket>/<key> --file ./file
npx wrangler kv key get --namespace-id <id> "key"
```

## 输出与脚本

- D1 命令加 `--json` 便于脚本判断。
- `wrangler tail` 输出 JSON Lines，按行解析。
- 部署前先用 `--dry-run --outdir dist` 检查打包结果。
- 判断成功以退出码为准。

## 安全约定

- 部署、`secret put/delete`、`rollback`、`d1 migrations apply` 会直接影响线上，执行前必须展示环境名、Worker/数据库名并获得明确同意。
- 改密钥前确认目标环境；不要回显密钥值。
- 不输出 `CLOUDFLARE_API_TOKEN` 或 `CLOUDFLARE_ACCOUNT_ID` 之外的账号敏感信息。
- 删除 R2 对象、KV 键、D1 表前先确认并优先备份。

## 参考

- Wrangler：https://developers.cloudflare.com/workers/wrangler/
- 子命令以 `npx wrangler <command> --help` 为准。
