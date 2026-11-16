---
name: datadog
description: "用官方 Datadog CLI pup 处理可观测性工作流：查询 monitor 状态、搜索日志、查询指标、检索 trace 与 RUM、查看 incident 和 SLO、列出合成测试与 CI 流水线。用户提到 Datadog、pup、日志、指标、监控、告警、APM、SLO、incident 时使用。探索阶段默认只读，更新与删除操作前必须确认。"
---

# Datadog（pup）工作流

本技能随 Kova 的 `datadog` 插件分发，封装 Datadog 官方 CLI `pup`。插件不内置 HTTP 客户端，不保存 token。

## MCP 与 CLI 的分工

本插件同时提供 Datadog 官方远程 MCP（OAuth）：`https://mcp.datadoghq.com/v1/mcp`。

- monitor 状态、日志搜索与指标查询优先用 MCP 工具；
- incident、SLO、合成测试与 CI 流水线继续用 `pup`；
- 探索阶段默认只读，写操作前先确认目标与影响范围。

## 前置检查

1. 检查版本：`pup --version`
2. 未安装时：

```bash
brew tap datadog-labs/pack
brew install datadog-labs/pack/pup
# 或
npm i -g @datadog/pup
```

3. 登录：`pup auth login`（OAuth2 + PKCE）。
4. 检查：`pup auth status`。
5. CI 使用 `DD_ACCESS_TOKEN`，或 `DD_API_KEY` + `DD_APP_KEY`；站点用 `DD_SITE`。

## 常用命令

```bash
pup monitors list --tags="team:api-platform"
pup logs search --query="status:error" --from="1h"
pup metrics query --query="avg:system.cpu.user{*}" --from="1h"
pup traces search --query="service:api"
pup rum sessions
pup incidents list
pup dashboards get <dashboard-id>
pup slos status
pup synthetics tests
pup error-tracking issues search
pup cicd pipelines list
pup skills install
```

## 输出与脚本

- 默认输出 JSON；需要表格或 YAML 时用 `-o table` / `-o yaml`。
- 需要 agent 优化结构时加 `--agent`。
- 时间范围用 `--from="1h"`、`--from="24h"` 等相对值，或明确时间戳。
- 判断成功以退出码为准。

## 安全约定

- 探索和排障默认只读：使用 `--read-only` 禁用写操作。
- 不要设置 `DD_AUTO_APPROVE=1`；`--yes` 会跳过确认，仅在用户明确同意后使用。
- 更新 monitor、删除 dashboard、修改 SLO 等操作前，先展示对象 ID、当前值和期望值。
- 不输出 `DD_ACCESS_TOKEN`、`DD_API_KEY`、`DD_APP_KEY`。

## 参考

- CLI：https://docs.datadoghq.com/cli/
- 子命令以 `pup <command> --help` 或 `pup agent schema` 为准。
