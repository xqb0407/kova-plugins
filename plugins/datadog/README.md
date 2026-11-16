# Datadog 插件

用官方 Datadog CLI 查询 monitor、日志、指标、trace、incident、SLO、合成测试与 CI 流水线。插件同时提供技能与官方 MCP 配置：CLI 负责日志、指标、trace 与流水线查询，MCP 提供面向 agent 的监控与日志工具；不内置 HTTP 客户端，也不保存凭据。

## 安装

```bash
brew tap datadog-labs/pack
brew install datadog-labs/pack/pup
# 或 npm i -g @datadog/pup
pup --version
```

## 授权

```bash
pup auth login
pup auth status
```

CI 使用 `DD_ACCESS_TOKEN`，或 `DD_API_KEY` + `DD_APP_KEY`。

## 常用命令

```bash
pup logs search --query="status:error" --from="1h"
pup metrics query --query="avg:system.cpu.user{*}" --from="1h"
pup monitors list --tags="team:api-platform"
pup incidents list
```

## MCP 服务器

插件附带 Datadog 官方远程 MCP：`https://mcp.datadoghq.com/v1/mcp`（OAuth）

- 站点按账号区域选择（如 datadoghq.com / datadoghq.eu），OAuth 授权后沿用同一账号权限。
- monitor、日志与指标查询优先用 MCP；incident 处理、SLO 与合成测试批量操作走 `pup`。
- 默认只读排查；静音、修改 monitor 等写操作前必须确认。

## 内置技能

`datadog` —— monitor、日志、指标、trace、SLO 与 incident

## 安全约定

- 探索阶段使用 `--read-only`。
- 不要设置 `DD_AUTO_APPROVE=1`。
- 更新或删除对象前确认 ID 与变更内容。
- 不输出 access token 或 API/APP key。

## 来源与许可

- 上游：https://docs.datadoghq.com/cli/
- 许可：Apache-2.0
