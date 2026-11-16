# Linear 插件

通过 Linear 官方远程 MCP 检索和更新 issue、项目、团队、评论与 cycle。插件包含官方 MCP 配置与技能，技能负责授权、连接检查、工具选择与安全约定。

## 安装

无需本地安装。插件自带 `.mcp.json`，在 Kova 插件页连接并完成 OAuth。

## 授权

OAuth 2.1；探索阶段可使用只读端点 `https://mcp.linear.app/mcp/readonly`。

## 常用场景

```text
列出我负责的未完成 issue
读取某个 issue 的描述与评论
在当前 cycle 创建一个 bug
为 issue 添加评论
```

## 内置技能

`linear` —— issue、项目、团队、评论与 cycle

## 安全约定

- 创建/更新 issue、评论、状态流转前确认。
- 探索阶段优先只读端点。
- 不输出 OAuth token。

## 来源与许可

- 上游：https://linear.app/docs/mcp
- 许可：Linear 官方服务条款
