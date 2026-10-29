# REA 逆向分析插件

对二进制样本做**静态**逆向分析：格式与哈希、段表与熵、导入导出与可疑 API、
字符串与 IOC、字节搜索、分块熵图、objdump 反汇编。agent 驱动，结论落
`.rea.json` + Markdown 报告。

- 只读：工具不执行样本、不写盘、不联网。
- 零依赖：Mach-O / PE / ELF 解析器是插件自带的，不要求装 radare2 / Ghidra / IDA。
- 反汇编复用系统 `objdump`，缺失时给出安装指引。

## 安装

本地开发（目录市场 + 链接安装）：

1. Kova → 插件页 → 添加市场 → 类型「目录」→ 填插件仓库根路径；
2. 安装 `rea` 时选「链接安装 · 开发」，改文件不用重装。

推送到远端后也可以「添加市场 → Git」填仓库地址，更新走 push → 刷新市场 → 更新插件。

装好后新开会话说「用 rea 分析一下 /bin/ls」即可。

**在 Kova 里怎么调用**：MCP 工具不会作为独立工具注册，而是经常驻的 `mcp` 网关代理，
全名 `<server>__<tool>`（本插件 server 名 `rea`）：

```text
mcp({ action: "status" })                                     # 确认 rea 已配置
mcp({ action: "call", tool: "rea__rea_analyze",
      args: "{\"path\": \"/bin/ls\"}" })                    # args 是 JSON 字符串
```

连接是懒的：第一次 `call` 才建立连接，所以刚装完时 `mcp search` 可能还搜不到；
直接按全名 call 即可。

## 目录结构

```
plugins/rea/
├── .kova-plugin/plugin.json     # 清单：skills + mcpServers
├── .mcp.json                    # stdio MCP：${BUN} 跑 mcp/server.ts
├── icon.svg
├── skills/rea/SKILL.md          # 分析工作流、报告规范、证据规则
└── mcp/
    ├── server.ts                # NDJSON JSON-RPC：initialize / tools/list / tools/call
    ├── tools.ts                 # 8 个工具的参数校验、结果整形、错误文案
    └── lib/
        ├── util.ts              # 路径解析、样本读取（256 MiB 上限）、边界安全 Cursor
        ├── sniff.ts             # 文件签名识别（含 MZ/Java/ZIP 等容器）
        ├── macho.ts             # Mach-O / fat：段、节、符号表、签名、cryptid
        ├── pe.ts                # PE32/PE32+：节、导入导出、PDB、证书、TLS、CLR、overlay
        ├── elf.ts               # ELF32/64 双端序：节、dynsym、DT_NEEDED、PIE/NX/RELRO
        ├── analyze.ts           # 概览编排：哈希 + 解析 + 加壳评估
        ├── strings.ts           # ASCII/UTF-8 + UTF-16LE 提取与 IOC 分类
        ├── search.ts            # hex / ascii / utf16le 字节搜索
        ├── entropy-map.ts       # 分块熵扫描与高熵区间合并
        ├── suspicious.ts        # 导入 API 的能力分类表
        └── disasm.ts            # objdump 封装 + 插件内地址过滤
```

## MCP 工具

下面写的是 server 内的原始工具名；在 Kova 里经 `mcp` 网关调用时加 `rea__` 前缀，
`args` 传 JSON 对象的字符串（见上一节）。所有工具第一个参数都是 `path`：
绝对路径，或相对会话工作区（`KOVA_WORKSPACE`）。

### `rea_analyze` — 总览（第一步）

`{ path, arch? }`

返回：文件哈希（md5/sha1/sha256）、格式与架构、入口点与所在节、段表摘要、
导入导出统计、可疑 API、加壳评估（`triage.packing.level` 与 `reasons`）。
非 Mach-O/PE/ELF 返回 `error` 字段而不抛错，后续仍可用无结构工具。

### `rea_sections` — 段/节明细

`{ path, arch? }`

每节给出 `va` / `vaEnd` / `offset` / `size` / `entropy` / `flags`。
地址是虚拟地址（VA），反汇编前用它确认范围。Mach-O 的 R/W/X 取自段 `initprot`
（同一段内的节共享）。

### `rea_imports` — 能力面

`{ path, arch?, suspiciousOnly?, library?, limit? }`

按库分组统计 + 全部导入符号；`suspicious` 按功能分类（进程注入、反调试、
执行、动态加载、网络、持久化、加密、信息收集、键盘/屏幕、凭证、沙箱探测、剪贴板）。
`suspiciousOnly=true` 只看命中项，`library` 按库名子串过滤。

### `rea_exports` — 导出符号

`{ path, arch?, filter?, limit? }`

符号名与 VA（PE 已加 imageBase）；`filter` 按名字子串过滤。

### `rea_strings` — 字符串与 IOC

`{ path, minLength?, encoding?, filter?, classes?, offset?, size?, limit? }`

`encoding`：`ascii`（含 UTF-8 中文）/ `utf16le` / `both`（默认）。
自动分类：`url`、`domain`、`ipv4`、`email`、`winpath`、`posixpath`、`registry`、
`base64?`、`jwt`、`pem`、`format-string`、`command`、`secret-keyword`、
`suspicious-keyword`。返回 `byClass` 计数与带偏移的命中列表；
`offset` + `size` 可只看文件某一段（配合熵图定位高熵区）。

### `rea_search` — 字节搜索

`{ path, pattern, mode?, limit?, context?, caseSensitive? }`

`mode`：`hex`（默认，`"48 89 e5"` 或 `"4889e5"`）/ `ascii` / `utf16le`。
返回命中文件偏移、前后 `context` 字节的 hex 与可打印预览。
`caseSensitive` 默认 true；对大文件关闭时会退化为区分大小写并附说明。

### `rea_entropy` — 分块熵图

`{ path, blockSize?, threshold?, maxRanges? }`

按块计算 Shannon 熵，合并连续高熵块成区间（默认阈值 7.2 bit/byte），
按大小排序返回。用于定位加壳区、加密配置、内嵌压缩载荷。

### `rea_disasm` — 反汇编

`{ path, symbol?, section?, start?, stop?, arch?, limit? }`

- `symbol` 先查符号表再定位；Mach-O 会自动补前导下划线（`main` → `_main`），
  符号不存在时报错并给出相近符号，不会静默反汇编整节。
- `start` / `stop` 是**虚拟地址**（VA），不是文件偏移。
- `section`：Mach-O 形如 `__TEXT,__text`；ELF 形如 `.text`。
- 返回 `instructions`、`sectionsSeen`、`truncated`；凑够 `limit` 条会提前停止
  子进程，大二进制不会把输出撑爆。

## 技能：分析工作流

`skills/rea/SKILL.md` 定义固定流程，agent 按 `description` 在用户提到逆向分析时加载：

1. **建档**：`rea_analyze` 记录哈希、格式、入口、加壳线索；
2. **字符串与 IOC**：`rea_strings`，按分类收窄；
3. **能力面**：`rea_imports`，优先看可疑 API 分类；
4. **结构定位**：`rea_sections` / `rea_entropy` 找代码范围与高熵区；
5. **验证**：`rea_disasm` 按符号或 VA 范围看关键路径；
6. **写报告**：`<样本名>.rea.json`（结构化）+ `<样本名>-report.md`（人读）。

报告 schema（详见 SKILL.md）：

```json
{
  "version": 1,
  "sample": { "path": "...", "size": 0, "md5": "", "sha1": "", "sha256": "",
              "format": "Mach-O (universal)", "arch": "arm64" },
  "triage": { "packing": "none|possible|likely", "verdict": "一句话定性", "confidence": "high|medium|low" },
  "findings": [
    { "id": "F1", "title": "...", "severity": "info|low|medium|high",
      "evidence": "rea_imports: ... / rea_disasm 0x...", "detail": "..." }
  ],
  "iocs": { "urls": [], "domains": [], "ipv4": [], "files": [], "hashes": [] },
  "notes": "...",
  "updatedAt": "ISO8601"
}
```

证据规则（SKILL.md 里是硬要求）：每条结论能指回偏移/地址/符号/熵值；
区分「观察到」与「推断」；哈希只用 `rea_analyze` 的结果；加壳判断至少两条线索。

## 设计取舍

- **自己写解析器**：目标机器不一定有 r2/Ghidra/IDA，而静态结构解析（段表、导入导出、
  熵、PDB、DT_NEEDED）用几百行就能做对，装完即用。
- **解析失败不阻断分析**：`rea_analyze` 把结构解析错误放进 `error`，`strings` /
  `search` / `entropy` 不依赖结构解析，畸形文件照样能看。
- **反汇编自己过滤**：macOS 的 llvm-objdump 对 Mach-O 会忽略 `--start-address` /
  `--disassemble-symbols`，所以插件流式读输出、按 VA 过滤，并在符号不存在时明确失败。
- **只读**：不执行样本、不写盘，动态行为分析留给隔离环境。
- **结果有上限**：所有列表类工具都有 `limit` 与截断提示，避免一次调用撑爆上下文。

## 限制

- 只做**静态**分析，不执行样本、不模拟运行。
- macOS 的 objdump/otool 只反汇编 Mach-O 的 `__TEXT,__text`；`__stubs`、`__const`
  等节需要 IDA / Hopper / Ghidra（工具会明确报这个限制）。
- 反汇编依赖系统 `objdump`：macOS 装 Xcode Command Line Tools，Linux 装 binutils。
- 单份样本上限 256 MiB；更大的文件需要先切分。
- universal Mach-O 默认分析第一个切片，用 `arch` 指定 `arm64` / `arm64e` / `x86_64`。
- 不是 IDA 级工具：没有交叉引用数据库、类型恢复与反编译；这些交给专业工具。

## 验证记录

开发时做过的实测（改动解析器后建议重跑）：

- `/bin/ls`（fat，x86_64 + arm64e）：哈希与系统 `md5` 一致；入口落在 `__TEXT,__text`；
  91 个导入按 3 个库归组；arm64e 切片按 `arch` 切换。
- Chrome 的 `libvulkan.dylib`：导出符号 `vkCreateInstance` 定位到 `0x3bffc` 并反汇编。
- 手工构造的 PE32+ / ELF64 夹具：导入导出、PDB、overlay、DT_NEEDED、interpreter、
  RELRO 均解析正确。
- MCP 协议端到端：`initialize` → `tools/list` → `tools/call`，参数错误返回 `isError`，
  未知工具返回 JSON-RPC 错误。

## 本地调试

```bash
# 直接调工具（绕过 JSON-RPC），改解析器时最快
bun -e 'import { TOOL_DEFS } from "./mcp/tools.ts";
const t = TOOL_DEFS.find((x) => x.name === "rea_analyze");
console.log(await t.run({ path: "/bin/ls" }, { workspace: process.cwd() }));'

# 起 MCP server（注意 stdout 是协议行，别往里打日志）
KOVA_WORKSPACE="$PWD" bun run mcp/server.ts

# 插件仓库自检（清单/组件/技能 frontmatter）
node ../../scripts/check.mjs
```

修改清单或 `panels.json` 后需要刷新市场/重装；改 `mcp/`、`skills/` 在链接安装下
重开会话或重载 MCP 即可生效。
