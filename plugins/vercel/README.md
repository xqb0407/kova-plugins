# Vercel 插件

用官方 Vercel CLI 部署预览与生产、查看日志、管理环境变量与提升部署。插件同时提供技能与官方 MCP 配置：CLI 负责部署、日志与环境变量，MCP 提供面向 agent 的项目与部署查询工具；不内置 HTTP 客户端，也不保存凭据。

## 安装

```bash
npm i -g vercel
vercel --version
```

## 授权

```bash
vercel login
vercel link
```

CI 使用 `VERCEL_TOKEN`，项目定位用 `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`。

## 常用命令

```bash
vercel deploy
vercel deploy --prod
vercel logs --environment production --json
vercel env pull .env.local
```

## MCP 服务器

插件附带 Vercel 官方远程 MCP：`https://mcp.vercel.com`（OAuth，Beta）

- 连接时按提示完成 OAuth，并选择团队范围。
- 项目、部署状态与构建结果查询优先用 MCP；部署、环境变量变更与提升部署走 `vercel` CLI。
- 生产部署、改环境变量与提升部署前必须确认团队与项目。

## 内置技能

`vercel` —— 部署、日志、环境变量与部署提升

## 安全约定

- 生产部署、提升部署、改环境变量前确认项目与环境。
- `--yes` 跳过确认，不要默认使用。
- 不输出 VERCEL_TOKEN 或环境变量值。

## 来源与许可

- 上游：https://vercel.com/docs/cli
- 许可：Apache-2.0
