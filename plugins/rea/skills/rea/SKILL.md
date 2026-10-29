---
name: rea
description: 对二进制样本做逆向工程静态分析（Mach-O / PE / ELF）——格式与哈希、段表与熵、导入导出与可疑 API、字符串与 IOC、字节搜索、分块熵图、objdump 反汇编。当用户说「逆向分析」「分析这个二进制/样本/App/dll/so/dylib」「看看这个程序在干什么」「提取 IOC」「这个是不是加壳了」「查一下这个恶意软件」时使用。只做静态分析，不执行样本。
---

# REA 逆向分析

一个 MCP 工具面（8 个只读工具）+ 一套固定工作流。目标是**可复核的结论**，不是猜故事。

## 边界（先读）

- **只读静态分析**：工具不执行样本、不写盘、不联网。要动态分析请在隔离环境里另行处理。
- 只在合法授权范围内做：自己的软件、恶意样本分析、教学/CTF、互操作性研究。
- 不提供破解授权、绕过保护机制、规避检测（免杀）方面的指导；遇到这类请求，说明边界并停在分析层面。

## 控制面：`mcp` 网关

本插件的 MCP 工具**不会作为独立工具**出现在工具表里——Kova 用常驻的 `mcp` 网关代理
所有 MCP 工具。调用三步：

1. `mcp({ action: "search", query: "rea" })` → 拿全名（`rea__rea_analyze` 等）；
2. `mcp({ action: "describe", tool: "rea__rea_analyze" })` → 看参数 schema；
3. `mcp({ action: "call", tool: "rea__rea_analyze", args: "{\"path\": \"/bin/ls\"}" })` → 执行。

要点：

- 全名约定 `<server>__<tool>`，本插件 server 名是 `rea`，所以是 `rea__rea_analyze`、
  `rea__rea_strings` 这样；
- `args` 是 **JSON 对象的字符串**（不是对象字面量）；
- 连接是**懒的**：第一次 `call` 才建立连接。刚装好插件时 `search` 可能还搜不到
  （索引来自上次握手缓存），直接按全名 `call` 即可；`mcp({ action: "status" })`
  可确认 `rea` 是否已配置/已连接；
- 下文工具名（`rea_analyze` 等）都是 server 内的原始名，实际调用要加 `rea__` 前缀。

## 工作流（按顺序，别跳）

### 1. 建档：`rea__rea_analyze`

一次拿到：文件哈希（md5/sha1/sha256）、格式与架构、入口点与所在节、段表摘要、导入导出统计、
可疑 API 预筛、加壳/加密线索（`triage.packing`）。

```text
mcp({ action: "call", tool: "rea__rea_analyze", args: "{\"path\": \"/bin/ls\"}" })
```

- universal Mach-O 默认分析第一个切片；要看另一个架构传 `arch`。
- 解析失败（`error` 字段）不影响后续无结构分析，继续走 2–4。
- **记下 sha256**，报告里必填。

### 2. 字符串与 IOC：`rea__rea_strings`

先默认跑一遍（both 编码，minLength 4），再按需要收窄：

- 只找网络线索：`"classes": ["url","domain","ipv4"]`
- 只找命令/外联行为：`"classes": ["command","posixpath","winpath","registry"]`
- 只找密钥：`"classes": ["secret-keyword","pem","jwt","base64?"]`
- 已知大致区域：配合 `rea_entropy` / `rea_sections` 的偏移，用 `offset` + `size` 只看那一段。

`offset` 是文件偏移，转 VA 时用 `rea_sections` 的「文件偏移 → va」对照。

### 3. 能力面：`rea__rea_imports`

`total` 少、`libraries` 集中或为 0，本身就是结论（静态链接 / 加壳 / 只用系统调用）。

- 快速过：`"suspiciousOnly": true`，看命中的分类（进程注入、反调试、网络、加密、持久化、凭证、键盘/屏幕…）。
- 深挖某个库：`"library": "kernel32"` / `"libSystem"`。
- 可疑 API 是**能力**不是**行为**：命中 `OpenProcess` 只说明「能打开进程」，是否注入要看反汇编调用点。

### 4. 结构定位：`rea__rea_sections` + `rea__rea_entropy`

- `rea_sections`：每节 VA 范围、文件偏移、熵、权限。反汇编前先在这里找目标地址范围。
- `rea_entropy`：连续高熵区间 = 压缩/加密载荷、加密配置、资源包。拿 `offset` 去 `rea_strings`/`rea_search` 看内容。
- 判断加壳至少两条线索：高熵节 + 导入稀少 / 入口不在可执行节 / 壳节名（UPX0、.aspack…）/ W+X 节。

### 5. 验证：`rea__rea_disasm`

限定目标再反汇编，别整份 dump：

- 按符号：`symbol: "_main"`（Mach-O 前导下划线）、ELF 的 `main`；
- 按节：`section: "__TEXT,__text"`（Mach-O）、`".text"`（ELF）；
- 按地址：`start: "0x100000f50"`, `stop: "0x100000f90"`（VA）。
- 想看「哪个函数调用了导入的 `socket`」：先 `rea_imports` 确认符号，再在反汇编输出里搜调用点；
  找不到时用 `rea_search` 搜字符串引用地址反推函数。

### 6. 写报告

两份，放工作区根目录（或用户指定目录）：

**`<样本名>.rea.json`**（结构化，供后续对比/自动化）：

```json
{
  "version": 1,
  "sample": {
    "path": "samples/foo.dylib",
    "size": 123456,
    "md5": "…",
    "sha1": "…",
    "sha256": "…",
    "format": "Mach-O (universal)",
    "arch": "arm64"
  },
  "triage": {
    "packing": "none | possible | likely",
    "verdict": "一句话定性（例：常规命令行工具，未见可疑行为）",
    "confidence": "high | medium | low"
  },
  "findings": [
    {
      "id": "F1",
      "title": "短标题",
      "severity": "info | low | medium | high",
      "evidence": "rea_imports: 命中「进程注入」OpenProcess/WriteProcessMemory；rea_disasm 0x100001234 调用点",
      "detail": "解释与推断"
    }
  ],
  "iocs": { "urls": [], "domains": [], "ipv4": [], "files": [], "hashes": [] },
  "notes": "分析过程、没弄清的问题、下一步",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

**`<样本名>-report.md`**（人读）：样本信息表 → 结论摘要（≤5 行）→ 主要发现（编号与 JSON 的
`findings[].id` 对应）→ IOC → 未解决问题。

## 证据规则

1. **每条结论都要能指回工具输出**：文件偏移、VA、符号名、熵值、API 名、命中次数。
2. **区分观察到与推断**：工具直接给出的是观察；「它可能在窃取凭据」是推断，写清依据与不确定性。
3. **不做完整性表演**：没验证的写「未验证」，不要补脑补的调用链。
4. **哈希只用 `rea_analyze` 的结果**，别自己用别的工具重算后混用。
5. **加壳判断 ≥ 2 条线索**，单条高熵不足以定性（字体/图片/压缩资源同样高熵）。

## 平台差异

- **Mach-O**：符号带前导下划线（`_main`、`_malloc`）；地址是 VA（通常 `0x100000000+`）；
  universal 包用 `arch` 选切片；`cryptid≠0` 是 App Store 加密二进制，`__TEXT` 是密文。
  **系统 objdump/otool 只反汇编 `__TEXT,__text`**：`__stubs`、`__const` 等节取不到，
  需要 IDA / Hopper / Ghidra；`rea_disasm` 会明确报这个限制。
- **PE**：入口 VA = `imageBase + AddressOfEntryPoint`；overlay（最后一节之后的字节）与 PDB 路径是重要线索；
  .NET 程序集看 `CLR 头存在`。
- **ELF**：`ET_DYN` + 有 `PT_INTERP` = PIE 可执行；节表可能被裁掉，只靠程序头也能出基本信息。

## 常见套路

- **「这是干嘛的」**：strings 里的命令/路径 + imports 的库与函数 + 导出名 → 一句话定性。
- **疑似窃密/远控**：网络 + 凭证 + 键盘/屏幕分类同时命中；strings 找 C2 域名/URL；反汇编看 URL 引用点。
- **疑似加壳**：packing=likely → 找 OOP/OEP 线索（入口不在可执行节）、看高熵区、搜壳标记（UPX!、VMProtect）。
- **宏/脚本样本**：不是本插件的结构解析范围；用 `rea_strings` + `rea_search` 当通用文本分析用。
- **对比两个版本**：分别 `rea_analyze` 记哈希与导入差异，`rea_strings` 比 URL/路径变化。

## 工具速查

| 全名 | 用途 | 关键参数 |
| --- | --- | --- |
| `rea__rea_analyze` | 总览 + 哈希 + 加壳判断 | `path`, `arch` |
| `rea__rea_sections` | 段/节地址范围、偏移、熵、权限 | `path`, `arch` |
| `rea__rea_imports` | 导入 + 可疑 API 分类 | `suspiciousOnly`, `library`, `limit` |
| `rea__rea_exports` | 导出符号与地址 | `filter`, `limit` |
| `rea__rea_strings` | 字符串 + IOC 分类 | `classes`, `filter`, `offset`, `size`, `encoding` |
| `rea__rea_search` | hex / ascii / utf16le 搜索 | `mode`, `pattern`, `context` |
| `rea__rea_entropy` | 分块熵图 | `blockSize`, `threshold` |
| `rea__rea_disasm` | objdump 反汇编 | `symbol` / `section` / `start`+`stop` / `arch` |

## 故障排查

- **工具表里没有 `rea_*`**：正常——MCP 工具经 `mcp` 网关调用，全名是 `rea__rea_analyze`；
  先 `mcp({ action: "status" })` 看服务器，再按全名 `call`。
- **`mcp search` 搜不到 rea**：首次连接前索引里没有它；直接按全名 `call`（调用时建立连接）。
- **「找不到 objdump」**：macOS 装 Xcode Command Line Tools（`xcode-select --install`）；Linux 装 binutils。
- **fat 包报「没有架构 X」**：错误信息里会列出可选架构，换 `arch` 或省略。
- **反汇编空输出**：地址不是 VA，或不在可执行节；先用 `rea_sections` 确认范围，或改用 `symbol`。
  Mach-O 的非 `__TEXT,__text` 节无论如何都取不到（macOS 工具链限制）。
- **strings 里中文变乱码**：用 `encoding: "ascii"`（含 UTF-8）；`utf16le` 只覆盖 ASCII 范围的宽字符。
- **导入为 0**：静态链接、已剥离、或加壳；结合 `rea_sections` / `rea_entropy` 判断。
