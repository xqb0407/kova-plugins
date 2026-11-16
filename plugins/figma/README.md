# Figma 插件

通过 Figma Desktop 的官方 Dev Mode MCP 读取设计上下文、元数据、截图、变量与 Code Connect 映射。插件包含官方 MCP 配置与技能，技能负责授权、连接检查、工具选择与安全约定。

## 安装

无需 npm 安装。需要 Figma Desktop 保持打开，并在 Dev Mode 侧栏启用 MCP server。

## 授权

本地桌面授权，无需 OAuth；需要 Dev 或 Full seat。端点：`http://127.0.0.1:3845/mcp`。

## 常用场景

```text
读取当前选中画板的结构与样式
导出选中节点截图
读取颜色/字体/间距变量
查询组件的 Code Connect 映射
```

## 内置技能

`figma` —— 设计上下文、截图、变量与 Code Connect

## 安全约定

- MCP 只读，不修改 Figma 画布。
- 写入 Code Connect 映射前确认。
- 不把设计稿截图上传到外部服务。

## 来源与许可

- 上游：https://developers.figma.com/docs/figma-mcp-server/
- 许可：Figma 官方服务条款
