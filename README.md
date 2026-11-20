# kova-plugins

独立于 `kova-electron` 主仓的 Kova 插件仓库。每个插件一个目录，根部的
`marketplace.json` 就是市场清单——Kova 的「插件 → 添加市场」直接读它。

仓库刻意保持零依赖、零构建：面板就是自包含的单文件 HTML，克隆下来即可用。MCP 有三种形态：

- 插件内手写 stdio JSON-RPC：由 Kova 内置 Bun 拉起 `${PLUGIN_ROOT}` 下的脚本，用户机器不用装 node/bun（`gitlab` / `rea` / `ui-design` / `office`）；
- 第三方 `bun x <npm 包>`：首次运行需联网拉包（`playwright` / `chrome-devtools` / `azure`）；
- 官方远程 HTTP：连接时走 OAuth 或匿名访问（`notion` / `linear` / `context7` 等）。

（需要 React/Vite 的复杂面板，参照本仓 `plugins/canvas` 的 `vite-plugin-singlefile`
配置，构建产物拷到插件根并把 `entry` 指过去，产物入库——`canvas` / `office` /
`ui-design` 三个工作台插件就是这种形态，见下文「构建重面板」。）

## 插件一览

| 插件 | 形态 | 说明 |
| --- | --- | --- |
| `gitlab` | 技能 + MCP | GitLab 工作流：项目、issue 与评论、MR 与 diff、审批、CI 流水线与作业日志、提交。只读为主，2 个评论写入工具 |
| `rea` | 技能 + MCP | 逆向工程静态分析（Mach-O / PE / ELF）：哈希、段表与熵、导入导出与可疑 API、字符串与 IOC、字节搜索、分块熵图、objdump 反汇编。只读，不执行样本 |
| `phone` | 技能 + MCP | Android 手机控制（ADB）：截图、uiautomator 控件树、点击/长按/滑动、中英文输入（ADBKeyboard）、启动应用、等待界面变化，「看 → 操作 → 验证」闭环操作真机/模拟器。需自装 Android Platform Tools |
| `wecom` | 技能 | 企业微信：内置官方 `wecom-unified` 技能与 references，用 `wecom-cli` 覆盖消息、通讯录、日程、会议、待办、文档、表格、微盘。技能负责安装、扫码授权与命令发现 |
| `dingtalk` | 技能 | 钉钉：内置官方 16 个 `dingtalk-*` 技能，用 `dws` 覆盖群聊消息、联系人、日历、待办、文档、AI 表格、邮件、会议纪要等。技能负责安装、浏览器授权与命令发现 |
| `feishu` | 技能 | 飞书 / Lark：内置官方 25 个 `lark-*` 技能，用 `lark-cli` 覆盖 IM、通讯录、云文档、多维表格、日历、任务、邮件、会议、审批等。技能负责安装、OAuth 授权与命令发现 |
| `github` | 技能 + MCP | GitHub：用官方 `gh` 覆盖仓库、issue、PR 与 diff、评审检查、Actions 失败日志、release 与代码搜索；附带 GitHub 远程 MCP（OAuth/PAT），agent 可直接调用结构化工具 |
| `jira` | 技能 | Jira：用 Atlassian 官方 `acli` 覆盖 JQL、work item 详情与编辑、sprint/board、字段与状态流转。当前 CLI 不含 Confluence（Confluence 见 `atlassian` 的 Rovo MCP） |
| `docker` | 技能 | Docker：用官方 `docker` / `docker compose` 构建镜像、启动 Compose 栈、查看日志与配置、清理资源 |
| `slack` | 技能 | Slack：用官方 Slack CLI 的 `slack api` 覆盖频道、消息、用户、文件与表情回应。技能负责登录与命令发现 |
| `notion` | 技能 + MCP | Notion：用官方 `ntn` CLI 读写页面、查询数据源、调用 Notion API 与管理 Workers；附带 Notion 远程 MCP（OAuth） |
| `cloudflare` | 技能 + MCP | Cloudflare：用官方 `wrangler` 开发与部署 Workers、Pages，管理 D1、R2、KV 与 secret；附带 Cloudflare 远程 MCP |
| `vercel` | 技能 + MCP | Vercel：用官方 `vercel` 部署预览与生产、查看日志、管理环境变量与提升部署；附带 Vercel 远程 MCP（Beta） |
| `supabase` | 技能 + MCP | Supabase：用官方 `supabase` 管理本地栈、数据库迁移、类型生成、secrets 与 Edge Functions；附带 Supabase 远程 MCP（默认只读） |
| `kubernetes` | 技能 | Kubernetes：用官方 `kubectl` 查询集群、排查 Pod、读取日志、diff/apply 清单与回滚 Deployment |
| `sentry` | 技能 + MCP | Sentry：用官方 `sentry` CLI 检索与解释 issue、查看事件与跨度、处理 feedback、下载 replay、列出 DSN；附带 Sentry 远程 MCP |
| `datadog` | 技能 + MCP | Datadog：用官方 `pup` CLI 查询 monitor、日志、指标、trace、SLO、incident 与 CI 流水线；附带 Datadog 远程 MCP |
| `stripe` | 技能 + MCP | Stripe：用官方 `stripe` CLI 转发与触发 webhook、调用 API、查看请求日志、管理客户与测试数据；附带 Stripe 远程 MCP |
| `ffmpeg` | 技能 | FFmpeg：用官方 `ffmpeg` / `ffprobe` 探测媒体、转码剪辑、缩放抽帧、提取音轨与查看进度 |
| `google-workspace` | MCP + 技能 | Google Workspace 官方 MCP：Gmail、Drive、Docs、Sheets、Calendar 与跨产品搜索。需 Workspace Developer Preview + GCP OAuth 客户端 |
| `figma` | MCP + 技能 | Figma Dev Mode MCP：读取画板设计上下文、变量、截图与 Code Connect 映射；只读，需 Figma Desktop 保持打开 |
| `linear` | MCP + 技能 | Linear 官方 MCP：issue、项目、团队、评论与 cycle；OAuth，另有只读端点可用于纯查询场景 |
| `atlassian` | MCP + 技能 | Atlassian Rovo MCP：Jira issue 与 Confluence 页面跨产品检索；OAuth，仅支持 Atlassian Cloud |
| `playwright` | MCP + 技能 | Playwright MCP：用无障碍快照操作真实浏览器，覆盖导航、点击、填表、截图、控制台与网络请求；默认 headless + 隔离 profile |
| `chrome-devtools` | MCP + 技能 | Chrome DevTools MCP：调试网页控制台、网络、性能 trace 与 Lighthouse；默认 headless + 隔离 profile |
| `context7` | MCP + 技能 | Context7 MCP：按库名解析 ID 并检索最新官方文档与代码示例；匿名可用，可选 API key 提高配额 |
| `aws` | MCP + 技能 | AWS 官方 MCP：查询 AWS 文档与区域可用性，并在沙箱中调用 AWS API；OAuth 2.1 |
| `azure` | MCP + 技能 | Azure 官方 MCP：订阅、资源组、存储、Key Vault、Monitor、Cosmos/SQL 与 AKS；复用 `az login` 凭证 |
| `canvas` | 技能 + 面板 + MCP | 无限画布工作台：Excalidraw 式无限空间，文本/形状/图片/Mermaid/表格/图表/网页嵌入自由摆放，整画布导出 SVG；agent 经 canvas MCP 直接控制画布（建档/读档/patch/长轮询），落盘新内容面板自动跟随视口 |
| `office` | 技能 + 面板 + MCP | 办公套件工作台：幻灯片（逐页编辑、放映、导出 pptx/pdf/svg/html）+ 表格（Univer）+ 文档；agent 以 `.deck.canvas.json` / `.sheet.univer.json` / `.doc.univer.json` 协作 |
| `ui-design` | 技能 + 面板 + MCP | Figma 式 UI 设计工作台：页面/画板/图层树 + 完整属性检视，独立 `*.uidesign.json` 文档；自带 MCP 工具，agent 可直接控制画布 |
| `demo-skill` | 技能 | 最小技能型示例（周报整理），用于对照格式，可删 |
| `demo-panel` | 面板 | 最小面板型示例（`*.note.json` 快速笔记），演示 kova-ui-plugin/1 桥，可删 |

> 注意：不要做「记忆类」插件——Kova 宿主自带 `~/.kova/memory/MEMORY.md`（宿主注入会话、
> `.history` 版本快照、`.trash` 可恢复、行内 #lesson/#preference 标签），再做一套只会把记忆分裂成两个存储。

`rea` 的工具：`rea_analyze`（总览）、`rea_sections`、`rea_imports`、`rea_exports`、
`rea_strings`、`rea_search`、`rea_entropy`、`rea_disasm`。限制：macOS 的 objdump/otool
只能反汇编 Mach-O 的 `__TEXT,__text`，其它节需要 IDA / Hopper / Ghidra。

## 构建重面板（canvas / office / ui-design）

这三个插件的面板是 React + Vite 单文件应用，源码在各自 `ui/` 子目录，构建产物
（插件根的 `canvas.html` / `office.html` / `design.html`）**已入库**——普通使用者
克隆即用，无需构建。改面板源码时才需要：

```bash
cd plugins/canvas && bun install && bun run build   # office、ui-design 同理
```

构建把 `ui/dist/index.html` 拷为插件根的 `<name>.html`（postbuild 自动），
提交产物即可。`node_modules/` 与 `ui/dist/` 不入库。

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
    ├── demo-panel/               # 面板型：清单 + panels.json + 单文件 HTML
    │   ├── .kova-plugin/plugin.json
    │   ├── panels.json
    │   ├── icon.svg
    │   └── demo-panel.html
    ├── canvas/                   # 无限画布：React+Vite 重面板（产物 canvas.html 入库）
    │   ├── .kova-plugin/plugin.json
    │   ├── panels.json
    │   ├── icon.svg
    │   ├── canvas.html           # 构建产物，入库
    │   ├── skills/
    │   ├── ui/                   # 面板源码（vite 单文件构建）
    │   └── package.json
    ├── office/                   # 幻灯片/表格/文档：重面板 + MCP（产物 office.html 入库）
    │   ├── .kova-plugin/plugin.json
    │   ├── .mcp.json
    │   ├── panels.json
    │   ├── icon.svg
    │   ├── office.html           # 构建产物，入库
    │   ├── skills/
    │   ├── mcp/
    │   └── ui/
    ├── ui-design/                # UI 设计：重面板 + MCP（产物 design.html 入库）
    │   ├── .kova-plugin/plugin.json
    │   ├── .mcp.json
    │   ├── panels.json
    │   ├── icon.svg
    │   ├── design.html           # 构建产物，入库
    │   ├── skills/
    │   ├── mcp/
    │   └── ui/
    ├── wecom/                    # 技能：企业微信（内置 wecom-unified + references）
    ├── dingtalk/                 # 技能：钉钉（内置 16 个 dingtalk-* 技能）
    ├── feishu/                   # 技能：飞书 / Lark（内置 25 个 lark-* 技能）
    ├── github/                   # 技能 + MCP：GitHub（官方 gh CLI + 远程 MCP）
    ├── jira/                     # 技能：Jira（Atlassian 官方 acli）
    ├── docker/                   # 技能：Docker / Compose
    ├── slack/                    # 技能：Slack（官方 Slack CLI 的 slack api）
    ├── notion/                   # 技能 + MCP：Notion（官方 ntn CLI + 远程 MCP）
    ├── cloudflare/               # 技能 + MCP：Cloudflare Workers（wrangler + 远程 MCP）
    ├── vercel/                   # 技能 + MCP：Vercel（vercel CLI + 远程 MCP）
    ├── supabase/                 # 技能 + MCP：Supabase（supabase CLI + 远程 MCP，默认只读）
    ├── kubernetes/               # 技能：Kubernetes（官方 kubectl）
    ├── sentry/                   # 技能 + MCP：Sentry（sentry CLI + 远程 MCP）
    ├── datadog/                  # 技能 + MCP：Datadog（pup CLI + 远程 MCP）
    ├── stripe/                   # 技能 + MCP：Stripe（stripe CLI + 远程 MCP）
    ├── ffmpeg/                   # 技能：FFmpeg / ffprobe
    ├── google-workspace/         # MCP + 技能：Gmail / Drive / Docs / Sheets / Calendar（远程 MCP）
    ├── figma/                    # MCP + 技能：Figma Dev Mode（本地 3845 端口）
    ├── linear/                   # MCP + 技能：Linear（远程 MCP）
    ├── atlassian/                # MCP + 技能：Jira + Confluence（Rovo 远程 MCP）
    ├── playwright/               # MCP + 技能：Playwright 浏览器自动化（stdio npx）
    ├── chrome-devtools/          # MCP + 技能：Chrome DevTools（stdio npx）
    ├── context7/                 # MCP + 技能：Context7 文档检索（远程 MCP，需 API key）
    ├── aws/                      # MCP + 技能：AWS（远程 MCP）
    └── azure/                    # MCP + 技能：Azure（stdio npx，复用 az login）
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

`.mcp.json` 支持两种形态。stdio 用 `${BUN}` 拉起插件内文件，可引用工作区，
`plugins/ui-design/.mcp.json` 是现成例子：

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

远程 HTTP 直接填 URI，连接时由宿主完成 OAuth；需要静态密钥时用 `headers` 引用环境变量，
`plugins/notion/.mcp.json`、`plugins/context7/.mcp.json` 可对照：

```json
{
  "mcpServers": {
    "my-remote": {
      "type": "http",
      "url": "https://example.com/mcp"
    },
    "my-keyed": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${MY_API_KEY}" }
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

`canvas` / `office` / `ui-design` 三个工作台插件是完整实现，遇到协议细节先看它们：

- `plugins/canvas` —— 无限画布（React + Vite 单文件构建、大量桥消息）
- `plugins/office` —— 幻灯片/表格
- `plugins/ui-design` —— UI 设计 + 自带 MCP 服务器

桥协议的宿主端实现在主仓 `kova-electron` 的
`apps/desktop/lib/plugins/ui-plugin-bridge.ts`。
