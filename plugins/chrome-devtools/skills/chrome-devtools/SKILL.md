---
name: chrome-devtools
description: "用 Google 官方 Chrome DevTools MCP 调试网页：导航、快照、截图、控制台、网络请求、性能 trace 与 Lighthouse。用户提到 Chrome DevTools、性能分析、Lighthouse、网络面板、控制台报错、Core Web Vitals 时使用。只读排查优先，禁止随意执行页面脚本或修改数据。"
---

# Chrome DevTools MCP

本技能随 Kova 的 `chrome-devtools` 插件分发。插件通过 stdio 启动 Google 官方 Chrome DevTools MCP。

## 前置检查

1. 需要 Chrome stable（或 Chrome for Testing）。
2. 当前配置为 `--headless=true --isolated=true`；首次工具调用才启动浏览器。
3. 需要连接已开启调试端口的 Chrome 时，改用 `--browser-url=http://127.0.0.1:9222`。
4. 需要限制工具面时加 `--slim`，只保留导航、脚本与截图。
5. 如需关闭使用统计，设置 `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1`。

## 可用工具

| 工具 | 用途 |
|---|---|
| `navigate_page` | 打开或跳转页面 |
| `take_snapshot` | 获取页面结构与可交互元素 |
| `take_screenshot` | 截图 |
| `click` / `fill_form` | 点击与填表 |
| `list_network_requests` / `get_network_request` | 查看网络请求 |
| `list_console_messages` | 查看控制台日志与错误 |
| `evaluate_script` | 执行脚本（高风险） |
| `performance_start_trace` / `performance_stop_trace` | 采集性能 trace |
| `performance_analyze_insight` | 分析性能洞察 |
| `lighthouse_audit` | 运行 Lighthouse 审计 |

## 使用顺序

1. `navigate_page` 打开目标页，必要时加 `timeout` 和 `waitUntil`。
2. 先 `list_console_messages` 与 `list_network_requests` 做只读排查。
3. 性能问题：start trace → 操作页面 → stop trace → analyze insight。
4. 需要整体评分时运行 `lighthouse_audit`。
5. 修改代码后重新采集，对比前后指标。

## 安全约定

- MCP 会把浏览器内容暴露给客户端；不要在已登录的敏感站点上随意运行。
- `evaluate_script` 可执行页面脚本，默认只用于只读查询；写操作前必须确认。
- 性能 trace 的 URL 可能发送到 CrUX；内网地址先关闭相关选项。
- 不输出 cookie、Authorization 头或页面中的个人信息；必要时使用 `--redact-network-headers`。
- 使用统计默认开启；介意时用环境变量关闭。

## 参考

- 仓库：https://github.com/ChromeDevTools/chrome-devtools-mcp
- 配置：https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md
- 工具：https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
