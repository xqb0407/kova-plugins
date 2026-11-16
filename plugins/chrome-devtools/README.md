# Chrome DevTools 插件

通过 Google 官方 Chrome DevTools MCP 调试控制台、网络、性能 trace 与 Lighthouse。插件包含官方 MCP 配置与技能，技能负责授权、连接检查、工具选择与安全约定。

## 安装

无需手动安装，插件用 `${BUN} x chrome-devtools-mcp@latest` 启动；需要 Chrome stable。

## 授权

无需账号。默认 headless + isolated。

## 常用场景

```text
打开页面并列出控制台错误
查看失败的网络请求
采集性能 trace 并分析瓶颈
运行 Lighthouse 审计
```

## 内置技能

`chrome-devtools` —— 控制台、网络、性能 trace 与 Lighthouse

## 安全约定

- 不要在执行脚本时修改数据，除非用户明确同意。
- 不输出 cookie、Authorization 头或个人信息。
- 内网页面注意性能 trace 的 URL 外发。

## 来源与许可

- 上游：https://github.com/ChromeDevTools/chrome-devtools-mcp
- 许可：Apache-2.0
