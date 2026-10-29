# kova-plugins

独立于 `kova-electron` 主仓的 Kova 插件仓库。每个插件一个目录，根部的
`marketplace.json` 就是市场清单——Kova 的「插件 → 添加市场」直接读它。

仓库刻意保持零依赖、零构建：面板就是自包含的单文件 HTML，MCP 服务器是手写的
stdio JSON-RPC（由 Kova 内置运行时拉起，用户机器不用装 node/bun），克隆下来即可用。
（需要 React/Vite 的复杂面板，参照主仓 `plugins/canvas` 的
`vite-plugin-singlefile` 配置，构建产物拷到插件根并把 `entry` 指过去，产物入库。）

## 插件一览

| 插件 | 形态 | 说明 |
| --- | --- | --- |
| `gitlab` | 技能 + MCP | GitLab 工作流：项目、issue 与评论、MR 与 diff、审批、CI 流水线与作业日志、提交。只读为主，2 个评论写入工具 |
| `rea` | 技能 + MCP | 逆向工程静态分析（Mach-O / PE / ELF）：哈希、段表与熵、导入导出与可疑 API、字符串与 IOC、字节搜索、分块熵图、objdump 反汇编。只读，不执行样本 |
| `demo-skill` | 技能 | 最小技能型示例（周报整理），用于对照格式，可删 |
| `demo-panel` | 面板 | 最小面板型示例（`*.note.json` 快速笔记），演示 kova-ui-plugin/1 桥，可删 |

`rea` 的工具：`rea_analyze`（总览）、`rea_sections`、`rea_imports`、`rea_exports`、
`rea_strings`、`rea_search`、`rea_entropy`、`rea_disasm`。限制：macOS 的 objdump/otool
只能反汇编 Mach-O 的 `__TEXT,__text`，其它节需要 IDA / Hopper / Ghidra。

## 快速开始

### 本地开发（推荐）：目录市场 + 链接安装

1. Kova → 插件页 → 添加市场，类型选「目录」，路径填本仓库绝对路径：

   ```
   /Users/herther/Desktop/kova-plugins
   ```

2. 在市场列表里安装插件时选「链接安装 · 开发」——插件缓存是一个指向源码目录的
   符号链接，改完文件不用重新安装。
3. 清单（`plugin.json` / `panels.json` / `marketplace.json`）改动后，在插件页刷新市场
   或重装一次；面板 HTML / SKILL.md 改动重开面板、新开会话即生效。

### git 市场（推送到远端后）

1. 建远端仓库并推送（示例）：

   ```bash
   git remote add origin git@github.com:<you>/kova-plugins.git
   git push -u origin main
   ```

2. Kova → 添加市场，类型选「Git」，填仓库地址（支持 `https://`、`git@`、`ssh://`）。
3. 更新流程：本地改 → commit → push → 插件页刷新市场 → 对已装插件点更新。
   git 市场是浅克隆的工作副本，不推送远端看不到改动。

## 目录结构

```
kova-plugins/
├── marketplace.json              # 市场清单：plugins[] 即本仓库的插件白名单
└── plugins/
    ├── gitlab/                   # 技能 + MCP：GitLab API 工作流
    │   ├── .kova-plugin/plugin.json
    │   ├── .mcp.json
    │   ├── icon.svg
    │   ├── README.md
    │   ├── skills/gitlab/SKILL.md
    │   └── mcp/                  # server.ts + tools.ts + lib/（config/client/format）
    ├── rea/                      # 技能 + MCP：逆向分析
    │   ├── .kova-plugin/plugin.json
    │   ├── .mcp.json
    │   ├── icon.svg
    │   ├── skills/rea/SKILL.md
    │   └── mcp/                  # server.ts + tools.ts + lib/（解析器、字符串、熵、反汇编）
    ├── demo-skill/               # 技能型：清单 + skills/，无面板
    │   ├── .kova-plugin/plugin.json
    │   ├── icon.svg
    │   └── skills/demo-skill/SKILL.md
    └── demo-panel/               # 面板型：清单 + panels.json + 单文件 HTML
        ├── .kova-plugin/plugin.json
        ├── panels.json
        ├── icon.svg
        └── demo-panel.html
```

两个 `demo-*` 插件可以直接删掉，按下面的规范放自己的插件。

## 新建一个插件

1. 建目录 `plugins/<name>/`。`<name>` 必须匹配 `^[a-z0-9][a-z0-9._-]{0,127}$`，
   **且与 `plugin.json` 里的 `name` 完全一致**（硬校验，不匹配装不上）。
2. 写清单 `plugins/<name>/.kova-plugin/plugin.json`。
3. 按需加组件：`skills/`、`.mcp.json`、`panels.json`、hooks、subagents。
4. 在根部 `marketplace.json` 的 `plugins[]` 加一条：

   ```json
   {
     "name": "my-plugin",
     "source": "./plugins/my-plugin",
     "version": "0.1.0",
     "description": "一句话说明",
     "category": "效率",
     "keywords": ["my", "plugin"]
   }
   ```

   `version` 建议与清单保持一致；`source` 支持 `"./plugins/x"`、`"./"`（插件根即市场根）
   等写法。
5. 插件页刷新市场 → 安装/更新。

## 清单字段（.kova-plugin/plugin.json）

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 插件 id，规则见上 |
| `version` | 否 | 默认 `0.0.0` |
| `description` | 否 | 市场卡片文案 |
| `author` | 否 | `{ "name": "...", "url": "..." }` |
| `category` / `keywords` | 否 | 分类与关键词 |
| `icon` | 否 | 相对插件根的图标路径（建议 `icon.svg`） |
| `skills` | 否 | 技能目录，如 `"skills"` |
| `mcpServers` | 否 | MCP 配置文件，如 `".mcp.json"` |
| `panels` | 否 | 面板清单，如 `"panels.json"` |
| `hooks` / `subagents` | 否 | 钩子与子智能体声明 |

声明的组件路径必须真实存在，且在插件目录内部。

## 技能（skills/）

```
skills/<skill-name>/SKILL.md
```

`SKILL.md` 用 YAML frontmatter 描述自己，`description` 决定 agent 什么时候触发它：

```markdown
---
name: demo-skill
description: 什么时候该用这个技能（写触发场景，别写功能清单）
---

# 标题

具体步骤、格式约束、示例。
```

## 面板（panels.json）

```json
[
  {
    "id": "demo-panel",
    "title": "快速笔记",
    "icon": "icon.svg",
    "entry": "demo-panel.html",
    "opens": ["*.note.json"],
    "permissions": ["document", "agent", "notify"]
  }
]
```

- `entry`：**自包含单文件 HTML**。宿主把它挂进 `sandbox="allow-scripts"` 的 blob iframe
  （不透明源），因此 CSS/JS 必须内联、不能引用相对路径资源、`localStorage` 会抛异常。
- `opens`：认领的工作区文件 glob（`*` 不跨 `/`，大小写不敏感）。agent 或用户写到
  命中文件时，宿主自动打开面板并绑定该文档。
- `permissions`：`document`（文档读写）/ `export`（产物落盘）/ `agent`（预填输入框）/
  `notify`（轻提示）；没声明的能力发消息会被宿主丢弃。

### 桥协议 kova-ui-plugin/1（摘要）

线路是一条 `postMessage` 纯对象：`{ v, dir, kind, ...载荷 }`。
面板发 `dir: "ui"`，宿主回 `dir: "host"`。完整定义见主仓
`apps/desktop/lib/plugins/ui-plugin-bridge.ts`，可运行的完整例子就是
`plugins/demo-panel/demo-panel.html`。

时序：

```
面板  → 宿主   ui.ready
宿主  → 面板   handshake { theme, context: { workspaceName, fileRelPath } }
面板  → 宿主   doc.request            （fileRelPath 非空时才请求）
宿主  → 面板   doc.open { rev, json, path }
面板  → 宿主   doc.change { json }     （宿主防抖 800ms 写盘）
宿主  → 面板   doc.saved { rev }
```

其他常用消息：

| 方向 | kind | 作用 |
| --- | --- | --- |
| UI→宿主 | `doc.create { path, json }` | 新建并绑定文档（拒绝覆盖已有文件） |
| UI→宿主 | `doc.bind { path }` | 换绑到另一个已有文档 |
| UI→宿主 | `doc.attach { name, base64 }` | 落盘图片等附属资产 |
| UI→宿主 | `doc.export { filename, base64 }` | 导出产物（如 pptx） |
| UI→宿主 | `agent.prefill { text }` | 预填会话输入框 |
| UI→宿主 | `ui.notify { text, level }` | 轻提示 |
| 宿主→面板 | `doc.error { errorText }` | 读盘/写盘失败，或尚未绑定文档 |
| 宿主→面板 | `theme.update { theme }` | 明暗主题切换 |
| 宿主→面板 | `doc.list.reply` / `asset.reply` | 历史文档列表 / 资产字节回包 |

## MCP 工具（可选）

`.mcp.json` 里可以引用插件内文件和工作区，主仓 `plugins/ui-design/.mcp.json` 是现成例子：

```json
{
  "mcpServers": {
    "my-plugin": {
      "type": "stdio",
      "command": "${BUN}",
      "args": ["run", "${PLUGIN_ROOT}/mcp/server.ts"],
      "env": { "KOVA_WORKSPACE": "${WORKSPACE}" }
    }
  }
}
```

## 发布前自检

```bash
node scripts/check.mjs
```

零依赖脚本，检查清单互相一致（目录名 == `name`、市场条目 version 对齐、组件路径存在、
技能 frontmatter、面板 entry 存在且不引用外部资源、权限值合法）。它不校验运行时行为，
所以再顺手做两件事：

- 面板 HTML 双击打开应能正常渲染（内置 mock 宿主），从 `ui.ready` 走到 `handshake`。
- 在 Kova 里实际装一遍，确认面板能打开、技能能被触发。

## 参考

主仓 `kova-electron` 里的三个内置插件是完整实现，遇到协议细节先看它们：

- `plugins/canvas` —— 无限画布（React + Vite 单文件构建、大量桥消息）
- `plugins/office` —— 幻灯片/表格
- `plugins/ui-design` —— UI 设计 + 自带 MCP 服务器
