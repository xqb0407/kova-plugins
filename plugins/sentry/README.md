# Sentry 插件

用官方 Sentry CLI 检索与解释 issue、查看事件和跨度、处理 feedback、下载 replay、列出 DSN 与发布版本。插件同时提供技能与官方 MCP 配置：CLI 负责 issue 检索、根因解释、replay 与发布信息，MCP 提供面向 agent 的问题排查工具；不内置 HTTP 客户端，也不保存凭据。

## 安装

```bash
curl https://cli.sentry.dev/install -fsS | bash
# 或 brew install getsentry/tools/sentry
sentry --version
```

## 授权

```bash
sentry auth
sentry auth status
```

CI 使用 `SENTRY_AUTH_TOKEN`。

## 常用命令

```bash
sentry issue list --query "is:unresolved level:error" -n 20
sentry issue view @latest --spans all
sentry issue explain @most_frequent
sentry replay list -q "environment:production"
```

## MCP 服务器

插件附带 Sentry 官方远程 MCP：`https://mcp.sentry.dev/mcp`（OAuth）

- 连接时按提示完成 OAuth，并选择组织与项目范围。
- issue 检索、事件详情与根因分析优先用 MCP；replay 下载、DSN 列表与发布建议走 CLI。
- 修改 issue 状态、创建项目等写操作前必须确认组织与项目。

## 内置技能

`sentry` —— issue、事件、feedback、replay、DSN 与发布

## 安全约定

- 删除项目和任意写 API 前必须确认。
- `--yes` / `--force` 仅在用户明确同意后使用。
- 不输出 AUTH_TOKEN 或 DSN 的 secret 部分。

## 来源与许可

- 上游：https://cli.sentry.dev
- 许可：FSL-1.1-Apache-2.0
