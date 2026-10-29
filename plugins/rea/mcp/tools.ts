/**
 * REA 工具实现层：8 个只读工具，全部围绕「一份样本」。
 *
 * 设计取舍：
 * - 结构解析（analyze/sections/imports/exports）共用三个格式解析器，失败只影响该工具；
 * - strings/search/entropy 不依赖结构解析，畸形文件也能用；
 * - disasm 交给系统 objdump，并明确「地址是 VA 不是文件偏移」；
 * - 所有工具只读：不执行样本、不写盘、不改文件。
 */
import { readHead, readSample, resolveTarget, clampInt, hex } from "./lib/util";
import { sniff } from "./lib/sniff";
import { analyze } from "./lib/analyze";
import { parseMachO } from "./lib/macho";
import { parsePE } from "./lib/pe";
import { parseELF } from "./lib/elf";
import { extractStrings } from "./lib/strings";
import { parseHexPattern, searchBuffer, utf16lePattern, type SearchMode } from "./lib/search";
import { entropyMap } from "./lib/entropy-map";
import { disassemble, parseAddr } from "./lib/disasm";
import { findSuspiciousApis } from "./lib/suspicious";
import type { BinaryInfo } from "./lib/types";

export type ToolCtx = { workspace: string };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (args: Record<string, any>, ctx: ToolCtx) => unknown | Promise<unknown>;
};

const PATH_SCHEMA = {
  type: "string",
  description: "样本路径：绝对路径，或相对工作区（KOVA_WORKSPACE）的路径",
} as const;

const ARCH_SCHEMA = {
  type: "string",
  description: "universal Mach-O 的切片架构（arm64 / arm64e / x86_64 等），缺省第一个切片",
} as const;

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseStructured(path: string, arch?: string): { info: BinaryInfo; kind: string } {
  const buf = readSample(path);
  const s = sniff(buf);
  if (s.kind === "macho" || s.kind === "fat-macho") return { info: parseMachO(buf, { arch }), kind: s.kind };
  if (s.kind === "pe") return { info: parsePE(buf), kind: s.kind };
  if (s.kind === "elf") return { info: parseELF(buf), kind: s.kind };
  throw new Error(
    `${s.signature}：结构解析只覆盖 Mach-O / PE / ELF。` +
      (s.detail ? `（${s.detail}）` : "") +
      "可改用 rea_strings / rea_entropy / rea_search。",
  );
}

/** universal 二进制的说明：strings/search/entropy 覆盖整文件（含其它切片） */
function wholeFileNote(buf: Buffer): string | undefined {
  const s = sniff(buf.subarray(0, 4096));
  if (s.kind !== "fat-macho") return undefined;
  return "universal 二进制：本工具按整文件扫描（包含所有切片）；各切片偏移见 rea_analyze 的 format.slices";
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const opAnalyze: ToolDef["run"] = (args, ctx) => {
  const path = resolveTarget(ctx.workspace, args.path);
  const buf = readSample(path);
  return analyze({ path, buf, ...(str(args, "arch") ? { arch: str(args, "arch") } : {}) });
};

const opSections: ToolDef["run"] = (args, ctx) => {
  const path = resolveTarget(ctx.workspace, args.path);
  const { info, kind } = parseStructured(path, str(args, "arch"));
  const isMachO = kind === "macho" || kind === "fat-macho";
  return {
    file: path,
    format: info.format,
    arch: info.arch,
    imageBase: info.imageBase !== undefined ? hex(info.imageBase) : undefined,
    entryPoint: info.entryPoint !== undefined ? hex(info.entryPoint) : undefined,
    sections: info.sections.map((s) => ({
      name: s.name,
      ...(s.segment ? { segment: s.segment } : {}),
      va: hex(s.va),
      vaEnd: hex(s.va + Math.max(s.vsize, s.size)),
      vsize: s.vsize,
      offset: hex(s.offset),
      size: s.size,
      entropy: s.entropy,
      flags: s.flags,
    })),
    notes: [
      ...info.notes,
      ...(isMachO ? ["flags 取自段的 initprot：同一 __TEXT 段内的所有节共享 R/W/X"] : []),
    ],
  };
};

const opImports: ToolDef["run"] = (args, ctx) => {
  const path = resolveTarget(ctx.workspace, args.path);
  const { info } = parseStructured(path, str(args, "arch"));
  const suspiciousOnly = args.suspiciousOnly === true;
  const library = str(args, "library");
  const limit = clampInt(args.limit, 300, 1, 5000);

  const libCounts = new Map<string, number>();
  for (const imp of info.imports) libCounts.set(imp.library, (libCounts.get(imp.library) ?? 0) + 1);

  let list = info.imports;
  if (suspiciousOnly) {
    const flagged = new Set(findSuspiciousApis(info.imports).map((h) => h.name));
    list = list.filter((imp) => flagged.has(imp.name));
  }
  if (library) list = list.filter((imp) => imp.library.toLowerCase().includes(library.toLowerCase()));

  return {
    file: path,
    format: info.format,
    arch: info.arch,
    total: info.imports.length,
    shown: Math.min(list.length, limit),
    libraries: [...libCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    suspicious: findSuspiciousApis(info.imports),
    imports: list.slice(0, limit).map((imp) => ({ library: imp.library, name: imp.name })),
    ...(list.length > limit ? { truncated: true, note: `共 ${list.length} 条，已截断到 ${limit} 条` } : {}),
    notes: info.notes,
  };
};

const opExports: ToolDef["run"] = (args, ctx) => {
  const path = resolveTarget(ctx.workspace, args.path);
  const { info } = parseStructured(path, str(args, "arch"));
  const filter = str(args, "filter")?.toLowerCase();
  const limit = clampInt(args.limit, 300, 1, 5000);
  let list = info.exports;
  if (filter) list = list.filter((e) => e.name.toLowerCase().includes(filter));
  return {
    file: path,
    format: info.format,
    arch: info.arch,
    total: info.exports.length,
    shown: Math.min(list.length, limit),
    exports: list.slice(0, limit).map((e) => ({ name: e.name, va: hex(e.va) })),
    ...(list.length > limit ? { truncated: true, note: `共 ${list.length} 条，已截断到 ${limit} 条` } : {}),
    notes: info.notes,
  };
};

const opStrings: ToolDef["run"] = (args, ctx) => {
  const path = resolveTarget(ctx.workspace, args.path);
  const buf = readSample(path);
  const minLength = clampInt(args.minLength, 4, 3, 256);
  const encodingRaw = str(args, "encoding") ?? "both";
  const encoding = encodingRaw === "ascii" || encodingRaw === "utf16le" ? encodingRaw : "both";
  const limit = clampInt(args.limit, 200, 1, 2000);
  const offset = args.offset !== undefined ? parseAddr(args.offset) : undefined;
  const size = args.size !== undefined ? clampInt(args.size, buf.length, 1, buf.length) : undefined;
  const windowStart = offset ?? 0;
  const windowEnd = size !== undefined ? Math.min(buf.length, windowStart + size) : buf.length;

  const hits = extractStrings(buf, { minLength, encoding, windowStart, windowEnd });

  const filter = str(args, "filter")?.toLowerCase();
  const classFilter = Array.isArray(args.classes)
    ? (args.classes as unknown[]).filter((c): c is string => typeof c === "string").map((c) => c.toLowerCase())
    : undefined;

  let list = hits;
  if (filter) list = list.filter((h) => h.value.toLowerCase().includes(filter));
  if (classFilter && classFilter.length > 0) {
    list = list.filter((h) => h.classes.some((c) => classFilter.includes(c.toLowerCase())));
  }

  const byClass: Record<string, number> = {};
  for (const hit of list) {
    for (const c of hit.classes) byClass[c] = (byClass[c] ?? 0) + 1;
  }

  return {
    file: path,
    encoding,
    minLength,
    window: { start: hex(windowStart), end: hex(windowEnd) },
    totalExtracted: hits.length,
    matched: list.length,
    shown: Math.min(list.length, limit),
    byClass: Object.fromEntries(Object.entries(byClass).sort((a, b) => b[1] - a[1])),
    strings: list.slice(0, limit).map((h) => ({
      offset: hex(h.offset),
      encoding: h.encoding,
      value: h.value.length > 1000 ? `${h.value.slice(0, 1000)}…` : h.value,
      ...(h.classes.length ? { classes: h.classes } : {}),
    })),
    ...(list.length > limit ? { truncated: true, note: `匹配 ${list.length} 条，已截断到 ${limit} 条；用 filter/classes/offset+size 收窄` } : {}),
    ...(wholeFileNote(buf) ? { scopeNote: wholeFileNote(buf)! } : {}),
  };
};

const opSearch: ToolDef["run"] = (args, ctx) => {
  const path = resolveTarget(ctx.workspace, args.path);
  const buf = readSample(path);
  const modeRaw = str(args, "mode") ?? "hex";
  if (modeRaw !== "hex" && modeRaw !== "ascii" && modeRaw !== "utf16le") {
    throw new Error(`mode 只能是 hex / ascii / utf16le（收到 "${modeRaw}"）`);
  }
  const mode = modeRaw as SearchMode;
  const patternInput = str(args, "pattern");
  if (!patternInput) throw new Error("缺少 pattern");
  const needle = mode === "hex" ? parseHexPattern(patternInput) : mode === "ascii" ? Buffer.from(patternInput, "utf8") : utf16lePattern(patternInput);
  const limit = clampInt(args.limit, 50, 1, 500);
  const contextBytes = clampInt(args.context, 16, 0, 256);

  const { hits, note } = searchBuffer(buf, needle, {
    limit: limit + 1,
    contextBytes,
    caseSensitive: args.caseSensitive !== false,
  });
  const possiblyMore = hits.length > limit;
  const shown = hits.slice(0, limit);

  return {
    file: path,
    mode,
    pattern: patternInput,
    needleBytes: needle.length,
    returned: shown.length,
    possiblyMore,
    matches: shown.map((h) => ({ offset: hex(h.offset), contextHex: h.contextHex, contextText: h.contextText })),
    ...(note ? { note } : {}),
    ...(wholeFileNote(buf) ? { scopeNote: wholeFileNote(buf)! } : {}),
    ...(shown.length === 0 ? { hint: "没命中：hex 模式确认字节序与空格；字符串换 ascii/utf16le 再试" } : {}),
  };
};

const opEntropy: ToolDef["run"] = (args, ctx) => {
  const path = resolveTarget(ctx.workspace, args.path);
  const buf = readSample(path);
  const map = entropyMap(buf, {
    blockSize: clampInt(args.blockSize, 4096, 256, 1024 * 1024),
    threshold: typeof args.threshold === "number" ? Math.min(8, Math.max(4, args.threshold)) : 7.2,
    maxRanges: clampInt(args.maxRanges, 40, 1, 500),
  });
  return {
    file: path,
    size: buf.length,
    ...map,
    ranges: map.ranges.map((r) => ({
      offset: hex(r.offset),
      end: hex(r.offset + r.size),
      size: r.size,
      entropy: r.entropy,
      maxEntropy: r.maxEntropy,
      blocks: r.blocks,
    })),
    ...(wholeFileNote(buf) ? { scopeNote: wholeFileNote(buf)! } : {}),
    hint:
      map.ranges.length > 0
        ? "高熵区可能是压缩/加密数据或内嵌载荷：用 rea_search / rea_strings 的 offset+size 直接看该区间"
        : "没有明显高熵区；若仍怀疑加壳，看 rea_sections 的节熵与导入数量",
  };
};

const opDisasm: ToolDef["run"] = async (args, ctx) => {
  const path = resolveTarget(ctx.workspace, args.path);
  const head = readHead(path, 8192);
  const sniffed = sniff(head);
  const limit = clampInt(args.limit, 200, 1, 2000);
  const result = await disassemble(path, sniffed, {
    ...(args.symbol !== undefined ? { symbol: String(args.symbol) } : {}),
    ...(args.section !== undefined ? { section: String(args.section) } : {}),
    ...(args.arch !== undefined ? { arch: String(args.arch) } : {}),
    ...(args.start !== undefined ? { start: parseAddr(args.start)! } : {}),
    ...(args.stop !== undefined ? { stop: parseAddr(args.stop)! } : {}),
    limit,
  });
  return { file: path, format: sniffed.signature, limit, ...result };
};

/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "rea_analyze",
    description:
      "样本总览（逆向分析第一步）：格式/架构/入口点、MD5/SHA1/SHA256、文件熵、段表摘要、" +
      "导入导出统计与可疑 API、加壳/加密线索（高熵节、W+X 节、入口不在可执行节、PE overlay、Mach-O cryptid）。" +
      "只读静态分析，不执行样本。",
    inputSchema: {
      type: "object",
      properties: { path: PATH_SCHEMA, arch: ARCH_SCHEMA },
      required: ["path"],
    },
    run: opAnalyze,
  },
  {
    name: "rea_sections",
    description:
      "段/节明细：每节的虚拟地址区间（va…vaEnd）、文件偏移、大小、熵、权限（R/W/X）与 zerofill 标记。" +
      "反汇编要找地址范围、定位资源/代码区时先用它。地址均为虚拟地址（VA）。",
    inputSchema: {
      type: "object",
      properties: { path: PATH_SCHEMA, arch: ARCH_SCHEMA },
      required: ["path"],
    },
    run: opSections,
  },
  {
    name: "rea_imports",
    description:
      "导入表：按库分组的统计 + 全部导入符号 + 按功能分类的可疑 API（注入/反调试/网络/加密/持久化/凭证…）。" +
      "suspiciousOnly=true 只看命中的；library 可按库名过滤。能力推断（能做什么）比字符串更可靠。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        arch: ARCH_SCHEMA,
        suspiciousOnly: { type: "boolean", description: "只返回命中可疑能力表的导入" },
        library: { type: "string", description: "按库名过滤（子串，如 kernel32、libSystem）" },
        limit: { type: "number", description: "最多返回多少条，缺省 300，上限 5000" },
      },
      required: ["path"],
    },
    run: opImports,
  },
  {
    name: "rea_exports",
    description:
      "导出表：符号名与虚拟地址（PE 已加 imageBase）。分析 DLL/dylib 的对外能力、找可调用入口时用；filter 按名字子串过滤。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        arch: ARCH_SCHEMA,
        filter: { type: "string", description: "按名字子串过滤（大小写不敏感）" },
        limit: { type: "number", description: "最多返回多少条，缺省 300，上限 5000" },
      },
      required: ["path"],
    },
    run: opExports,
  },
  {
    name: "rea_strings",
    description:
      "提取字符串并分类：URL / 域名 / IPv4 / 邮箱 / 路径 / 注册表 / base64 / JWT / PEM / 格式化串 / 命令片段 / 凭据关键字。" +
      "支持 ascii（含 UTF-8 中文）与 utf16le。filter 子串过滤，classes 按分类过滤，offset+size 只看文件某段。" +
      "offset 是文件偏移（十进制或 0x 十六进制）。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        minLength: { type: "number", description: "最短长度（字符），缺省 4" },
        encoding: { type: "string", enum: ["ascii", "utf16le", "both"], description: "缺省 both" },
        filter: { type: "string", description: "只看包含该子串的字符串（大小写不敏感）" },
        classes: {
          type: "array",
          items: { type: "string" },
          description: "只看这些分类：url/domain/ipv4/email/winpath/posixpath/registry/base64?/jwt/pem/format-string/command/secret-keyword/suspicious-keyword",
        },
        offset: { type: "string", description: "起始文件偏移（0x... 或十进制）" },
        size: { type: "number", description: "扫描区间长度（字节）" },
        limit: { type: "number", description: "最多返回多少条，缺省 200，上限 2000" },
      },
      required: ["path"],
    },
    run: opStrings,
  },
  {
    name: "rea_search",
    description:
      "字节/字符串搜索。mode=hex 用十六进制模式（\"48 89 e5\" / \"4889e5\"）；ascii 搜文本；utf16le 搜宽字符串。" +
      "返回命中偏移与前后 context 字节。caseSensitive 仅对 ascii/utf16le 有意义，缺省区分大小写。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        mode: { type: "string", enum: ["hex", "ascii", "utf16le"], description: "缺省 hex" },
        pattern: { type: "string", description: "搜索模式；hex 模式可带空格或 0x 前缀" },
        limit: { type: "number", description: "最多返回多少条命中，缺省 50，上限 500" },
        context: { type: "number", description: "命中前后附带多少字节上下文，缺省 16" },
        caseSensitive: { type: "boolean", description: "缺省 true；false 时对大文件可能退化为区分大小写" },
      },
      required: ["path", "pattern"],
    },
    run: opSearch,
  },
  {
    name: "rea_entropy",
    description:
      "分块熵扫描：按 blockSize（缺省 4096）计算滑动块的 Shannon 熵，把连续高熵块合并成区间。" +
      "用于定位加壳区、加密配置、内嵌压缩载荷。整文件熵与各节熵见 rea_analyze / rea_sections。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        blockSize: { type: "number", description: "块大小（字节），缺省 4096" },
        threshold: { type: "number", description: "高熵阈值（bit/byte），缺省 7.2，范围 4–8" },
        maxRanges: { type: "number", description: "最多返回多少个区间，缺省 40" },
      },
      required: ["path"],
    },
    run: opEntropy,
  },
  {
    name: "rea_disasm",
    description:
      "反汇编（调用系统 objdump，Mach-O 自动加 --macho）。可用 symbol（Mach-O 记得前导下划线，如 _main）、" +
      "section（Mach-O 形如 __TEXT,__text；ELF 形如 .text）、或 start/stop 地址范围（虚拟地址 VA，不是文件偏移）限定目标。" +
      "找不到 objdump 会提示安装 Xcode Command Line Tools / binutils。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        symbol: { type: "string", description: "按符号名反汇编（精确匹配）" },
        section: { type: "string", description: "只反汇编某个节" },
        start: { type: "string", description: "起始虚拟地址（0x1a2b / 十六进制 / 十进制）" },
        stop: { type: "string", description: "结束虚拟地址（不含）" },
        arch: { type: "string", description: "universal 二进制选架构（arm64 / arm64e / x86_64）" },
        limit: { type: "number", description: "最多返回多少条指令，缺省 200，上限 2000" },
      },
      required: ["path"],
    },
    run: opDisasm,
  },
];
