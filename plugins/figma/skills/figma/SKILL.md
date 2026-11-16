---
name: figma
description: "用 Figma 官方 Dev Mode MCP 读取当前选中画板的设计上下文、元数据、截图、设计变量与 Code Connect 映射。用户提到 Figma、设计稿、画板、组件、设计变量、Code Connect、还原 UI 时使用。MCP 只读，不能修改 Figma 画布；改设计需回到 Figma。"
---

# Figma Dev Mode MCP

本技能随 Kova 的 `figma` 插件分发。插件连接 Figma Desktop 的本地 MCP，只读设计稿。

## 前置条件

1. 安装并打开 Figma Desktop。
2. 使用 Dev 或 Full seat（付费计划）。
3. 在 Figma 中打开目标文件，进入 Dev Mode，在侧栏启用 MCP server。
4. 确认本地端点可访问：`http://127.0.0.1:3845/mcp`。
5. 在画布中选中要实现的节点或画板，再让 agent 读取。

## 可用工具

| 工具 | 用途 |
|---|---|
| `get_design_context` | 获取选中节点的结构、样式、布局与文本，适合直接实现 |
| `get_metadata` | 获取节点层级、ID、类型与尺寸，适合先看结构 |
| `get_screenshot` | 获取选中节点截图，用于视觉对照 |
| `get_variable_defs` | 读取颜色、字体、间距等设计变量 |
| `get_code_connect_map` | 查看组件与代码的 Code Connect 映射 |
| `add_code_connect_map` | 写入 Code Connect 映射（会修改映射，需确认） |

## 使用顺序

1. 让用户在 Figma 中选中目标节点。
2. 先 `get_metadata` 看结构，再 `get_screenshot` 看视觉。
3. 实现前用 `get_design_context` 获取完整样式，用 `get_variable_defs` 对齐设计变量。
4. 实现后截取浏览器截图，与 Figma 截图对照。
5. 需要复用现有组件时先查 `get_code_connect_map`。

## 安全约定

- MCP 不修改 Figma 画布；不要声称已经“改了设计稿”。
- `add_code_connect_map` 会写映射，执行前展示组件与代码路径并获得同意。
- 设计稿可能包含未公开内容；不要把截图或设计 token 上传到外部服务。
- 没有 Dev/Full seat 或端点未启动时，明确说明前置条件，不要让用户反复重试。

## 回退

- 只需要 Code Connect 发布/解析时，使用官方 `@figma/code-connect` CLI。
- 需要批量读取文件结构时，使用 Figma REST API 或官方远程 MCP（若客户端支持）。

## 参考

- 安装：https://developers.figma.com/docs/figma-mcp-server/local-server-installation/
- 工具：https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
