---
name: sentry
description: "用官方 sentry CLI 处理 Sentry 工作流：按查询检索 issue、查看 issue 详情与事件/跨度、生成根因解释和修复计划、处理 feedback、检索与下载 replay、列出 DSN、建议发布版本。用户提到 Sentry、错误追踪、issue、异常、replay、feedback、DSN、source map 时使用。删除项目和任意写 API 前必须确认。"
---

# Sentry CLI 工作流

本技能随 Kova 的 `sentry` 插件分发，封装 Sentry 官方新 CLI `sentry`（cli.sentry.dev），不是旧的 `sentry-cli`。插件不内置 HTTP 客户端，不保存 token。

## MCP 与 CLI 的分工

本插件同时提供 Sentry 官方远程 MCP（OAuth）：`https://mcp.sentry.dev/mcp`。

- issue 检索、事件/跨度详情与根因分析优先用 MCP 工具；
- replay 下载、DSN 列表与发布版本建议继续用 `sentry` CLI；
- 写操作前先只读确认组织、项目与 issue 编号。

## 前置检查

1. 检查版本：`sentry --version`
2. 未安装时：

```bash
curl https://cli.sentry.dev/install -fsS | bash
# 或
brew install getsentry/tools/sentry
npm i -g sentry
```

3. 登录：`sentry auth`（OAuth 设备码）；CI 使用 `SENTRY_AUTH_TOKEN`。
4. 检查：`sentry auth status`。
5. 旧 `sentry-cli` 只用于 release / source map / debug files；本技能优先使用新 `sentry`。

## 常用命令

```bash
# issue
sentry issue list --query "is:unresolved level:error" -n 20
sentry issue view @latest --spans all
sentry issue events <issue-id> --full
sentry issue explain @most_frequent
sentry issue plan <issue-id>

# feedback 与 replay
sentry feedback list --status unresolved -t 7d
sentry feedback resolve <id>
sentry replay list -q "environment:production"
sentry replay download <id> -o replay.json

# 项目与发布
sentry dsn list --json --fields name,dsn
sentry release propose-version
sentry docs "source maps Next.js"
sentry status
```

## 输出与脚本

- 列表和详情优先用 `--json` 与 `--fields`。
- `@latest`、`@most_frequent` 等选择器可减少手工复制 ID。
- 需要 release 级 source map 上传时改用 `sentry-cli`。
- 判断成功以退出码为准。

## 安全约定

- `project delete` 等标记为 Destructive 的命令默认交互确认；`-y/--yes` 或 `-f/--force` 只能在用户明确同意后使用。
- `sentry api` 可执行任意 API 写操作，视为最高风险，先展示 method、path 与请求体。
- 不输出 `SENTRY_AUTH_TOKEN` 或 DSN 的 secret 部分。
- 修复建议先解释证据，再给最小改动，不要直接改线上配置。

## 参考

- 文档：https://cli.sentry.dev
- 旧发布工具：https://docs.sentry.io/cli/
- 许可：FSL-1.1-Apache-2.0
