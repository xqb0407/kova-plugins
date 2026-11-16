---
name: playwright
description: "用 Microsoft 官方 Playwright MCP 操作真实浏览器：导航、快照、点击、填表、截图、读取控制台与网络请求。用户提到浏览器自动化、打开网页、点击、填表、截图、E2E、验证前端时使用。提交表单、删除数据、登录等有副作用操作前必须确认。"
---

# Playwright MCP

本技能随 Kova 的 `playwright` 插件分发。插件通过 stdio 启动 Microsoft 官方 Playwright MCP。

## 前置检查

1. Kova 使用内置 Bun 启动，首次运行会联网拉取 `@playwright/mcp` npm 包。
2. 当前配置为 `--headless --isolated --browser chrome`：无头、内存 profile、每次会话隔离，使用本机已安装的 Google Chrome。
3. 本机没有 Chrome 时连接会失败；可去掉 `--browser chrome` 改用 Playwright 自带浏览器（需先安装对应浏览器），或安装 Chrome 后重试。
4. 需要复用登录态时，改用 `--user-data-dir` 或 `--storage-state`，并说明持久化风险。
5. 需要可视化时去掉 `--headless`，或改走本地有头调试。

## 可用工具

| 工具 | 用途 |
|---|---|
| `browser_navigate` | 打开 URL |
| `browser_snapshot` | 获取无障碍树，优先用它理解页面 |
| `browser_click` | 点击元素 |
| `browser_type` / `browser_fill_form` | 输入文本或填表 |
| `browser_take_screenshot` | 截图 |
| `browser_evaluate` | 在页面执行只读表达式 |
| `browser_network_requests` | 查看网络请求 |
| `browser_console_messages` | 查看控制台消息 |
| `browser_tabs` | 管理标签页 |

`browser_run_code_unsafe` 等价于执行任意代码，默认不要使用。

## 使用顺序

1. `browser_navigate` 打开目标页。
2. `browser_snapshot` 获取无障碍树，根据 `ref` 定位元素。
3. 执行点击/填表，再用 `browser_snapshot` 或截图验证状态变化。
4. 有异常时读取 `browser_console_messages` 和 `browser_network_requests`。
5. 操作结束后关闭标签页或让会话自然结束。

## 安全约定

- 官方明确 Playwright MCP 不是安全边界；不要用它访问不可信页面后继续使用同一登录态。
- 提交表单、发送消息、删除数据、修改账户、支付等有副作用操作前必须确认。
- origin 白/黑名单不防重定向；高敏感场景使用 `--allowed-origins` 并在操作前核对 URL。
- 不把密码、cookie、token 写入技能或日志；需要登录时让用户自己完成。
- 并发场景保持 `--isolated`，避免多个会话争用同一 profile。

## 参考

- 仓库：https://github.com/microsoft/playwright-mcp
- 安装：https://playwright.dev/mcp/installation
