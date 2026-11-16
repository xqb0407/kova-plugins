# Playwright 插件

通过 Microsoft 官方 Playwright MCP 用无障碍快照操作真实浏览器，覆盖导航、点击、填表、截图与控制台。插件包含官方 MCP 配置与技能，技能负责授权、连接检查、工具选择与安全约定。

## 安装

无需手动安装 MCP，插件用 `${BUN} x @playwright/mcp@latest` 启动，首次运行需联网拉取 npm 包。默认 `--browser chrome`，需要本机已安装 Google Chrome。

## 授权

无需账号。默认 headless + isolated，不保存登录态。

## 常用场景

```text
打开本地开发页面并截图
点击登录按钮并填写表单
读取控制台错误与失败请求
对比修改前后的页面快照
```

## 内置技能

`playwright` —— 浏览器导航、快照、点击、填表与截图

## 安全约定

- 有副作用的提交/删除/支付前必须确认。
- 不要把 Playwright MCP 当作安全边界。
- 不要输出密码、cookie 或 token。

## 来源与许可

- 上游：https://github.com/microsoft/playwright-mcp
- 许可：Apache-2.0
