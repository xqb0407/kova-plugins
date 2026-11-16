---
name: vercel
description: "用官方 vercel CLI 处理 Vercel 工作流：链接项目、部署预览或生产、查看部署列表与构建日志、拉取和新增环境变量、提升部署。用户提到 Vercel、vercel CLI、部署、preview、production、环境变量、构建日志时使用。生产部署、改环境变量和提升部署前必须确认。"
---

# Vercel CLI 工作流

本技能随 Kova 的 `vercel` 插件分发，封装官方 `vercel` CLI。插件不内置 HTTP 客户端，不保存 token。

## MCP 与 CLI 的分工

本插件同时提供 Vercel 官方远程 MCP（OAuth，Beta）：`https://mcp.vercel.com`。

- 项目、部署与构建结果查询优先用 MCP 工具；
- 部署、日志跟踪、环境变量与提升部署继续用 `vercel` CLI；
- 生产写操作前先只读确认团队与项目。

## 前置检查

1. 检查版本：`vercel --version`
2. 未安装时：

```bash
npm i -g vercel
```

3. 登录：`vercel login`；CI 使用 `VERCEL_TOKEN` 或 `--token`。
4. 项目定位：`vercel link`；CI 可设置 `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`。
5. 确认当前项目：查看项目根目录的 `.vercel/project.json`。

## 常用命令

```bash
# 链接与部署
vercel link
vercel deploy
vercel deploy --prod
vercel deploy --prebuilt --archive=tgz
vercel deploy --env K=V --build-env K=V

# 列表与检查
vercel list
vercel inspect <url> --logs

# 日志
vercel logs --environment production --query 'level:error' --since 1h --json

# 环境变量
vercel env pull .env.local
vercel env add NAME production
vercel env run -- npm test

# 提升
vercel promote <url>
```

## 输出与脚本

- `vercel deploy --json` 与 `vercel logs --json` 输出 JSON / JSON Lines。
- `--non-interactive` 适合 CI，并隐含 JSON 输出。
- 判断成功以退出码为准；构建失败时保留关键 stderr。

## 安全约定

- `vercel deploy --prod`、`vercel promote`、`vercel env add/rm` 影响线上，执行前必须展示项目、环境与变量名并获得明确同意。
- `--yes` 会跳过确认；非用户明确要求不要使用。
- 不输出 `VERCEL_TOKEN`，不把环境变量值回显到终端。
- 部署前确认目标项目与分支，避免把测试分支推到生产。

## 参考

- CLI：https://vercel.com/docs/cli
- 子命令以 `vercel <command> --help` 为准。
