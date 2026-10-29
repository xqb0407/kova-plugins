/**
 * 概览分析：格式识别 → 对应解析器 → 哈希/熵/段表/导入导出汇总 → 加壳与加密线索。
 *
 * 解析失败不抛给调用方：返回已有信息 + error + sniff 结论，让 agent 仍能继续
 * 用 strings / entropy / disasm 这些不依赖结构解析的工具。
 */
import { entropy, hashAll, hex, humanSize, readSample } from "./util";
import { sniff, type SniffResult } from "./sniff";
import { parseMachO } from "./macho";
import { parsePE } from "./pe";
import { parseELF } from "./elf";
import { findSuspiciousApis, type SuspiciousHit } from "./suspicious";
import { isExecutable, isWritable, type BinaryInfo } from "./types";

export type PackingAssessment = {
  level: "none" | "possible" | "likely";
  reasons: string[];
};

export type Analysis = {
  file: {
    path: string;
    size: number;
    sizeHuman: string;
    md5: string;
    sha1: string;
    sha256: string;
    sniff: SniffResult;
  };
  format?: {
    name: string;
    arch: string;
    bits: number;
    endian: string;
    entryPoint?: string;
    entrySection?: string;
    imageBase?: string;
    header: Record<string, string | number | boolean>;
    slices?: Array<{ arch: string; bits: number; offset: string; size: number }>;
  };
  sections?: Array<{
    name: string;
    segment?: string;
    va: string;
    vsize: number;
    offset: string;
    size: number;
    entropy: number;
    flags: string[];
  }>;
  imports?: {
    total: number;
    libraries: Array<{ name: string; count: number }>;
    suspicious: SuspiciousHit[];
  };
  exports?: {
    total: number;
    preview: string[];
  };
  notes?: string[];
  triage: {
    overallEntropy: number;
    packing: PackingAssessment;
  };
  error?: string;
};

const PACKER_SECTION_RE = /^(upx\d?|\.aspack|\.adata|\.themida|\.vmp\d*|\.packed|\.petite|\.nsp|\.mpress|pec\d+)$/i;

function assessPacking(info: BinaryInfo, buf: Buffer, overallEntropy: number): PackingAssessment {
  const reasons: string[] = [];

  for (const s of info.sections) {
    if (PACKER_SECTION_RE.test(s.name)) reasons.push(`节 ${s.name} 是常见壳的节名`);
  }
  for (const s of info.sections) {
    if (s.size >= 4096 && s.entropy >= 7.2) {
      reasons.push(`节 ${s.name} 熵 ${s.entropy}（接近随机，可能压缩/加密）`);
    }
  }
  for (const s of info.sections) {
    if (isWritable(s) && isExecutable(s)) {
      reasons.push(`节 ${s.name} 同时可写可执行（W+X，运行时改代码的常见形态）`);
    }
  }
  if (buf.length > 64 * 1024 && info.imports.length < 10) {
    reasons.push(`导入符号只有 ${info.imports.length} 个（可能由壳/加载器动态解析）`);
  }
  if (buf.subarray(0, 8192).includes(Buffer.from("UPX!"))) {
    reasons.push("文件头附近出现 UPX! 标记");
  }
  if (info.encrypted) reasons.push("Mach-O cryptid≠0：__TEXT 加密");
  const overlay = info.header.overlayBytes;
  if (typeof overlay === "number" && overlay > buf.length * 0.2) {
    reasons.push(`PE overlay ${overlay} 字节（超过文件的 20%，可能内嵌载荷）`);
  }
  if (info.entryPoint !== undefined) {
    const exec = info.sections.filter(isExecutable);
    const inside = exec.some((s) => info.entryPoint! >= s.va && info.entryPoint! < s.va + Math.max(s.vsize, s.size));
    if (exec.length > 0 && !inside) {
      reasons.push("入口点不在任何可执行节里（典型壳特征：先跳到解密代码）");
    }
  }
  if (overallEntropy >= 7.4) reasons.push(`整文件熵 ${overallEntropy}（整体接近压缩/加密数据）`);

  const level: PackingAssessment["level"] = reasons.length >= 2 ? "likely" : reasons.length === 1 ? "possible" : "none";
  return { level, reasons };
}

function entrySectionOf(info: BinaryInfo): string | undefined {
  if (info.entryPoint === undefined) return undefined;
  for (const s of info.sections) {
    const span = Math.max(s.vsize, s.size);
    if (info.entryPoint >= s.va && info.entryPoint < s.va + span) {
      return s.segment ? `${s.segment},${s.name}` : s.name;
    }
  }
  return undefined;
}

export function analyze(opts: {
  path: string;
  buf: Buffer;
  arch?: string;
}): Analysis {
  const { path, buf, arch } = opts;
  const hashes = hashAll(buf);
  const sniffed = sniff(buf);
  const overallEntropy = entropy(buf);

  const base: Analysis = {
    file: {
      path,
      size: buf.length,
      sizeHuman: humanSize(buf.length),
      ...hashes,
      sniff: sniffed,
    },
    triage: {
      overallEntropy,
      packing: { level: "none", reasons: [] },
    },
  };

  let info: BinaryInfo | undefined;
  try {
    if (sniffed.kind === "macho" || sniffed.kind === "fat-macho") info = parseMachO(buf, { arch });
    else if (sniffed.kind === "pe") info = parsePE(buf);
    else if (sniffed.kind === "elf") info = parseELF(buf);
    else {
      return {
        ...base,
        error: `${sniffed.signature}：REA 的结构解析只覆盖 Mach-O / PE / ELF。可先用 rea_strings / rea_entropy / rea_search 做无结构分析。`,
      };
    }
  } catch (err) {
    return {
      ...base,
      error: `结构解析失败（${sniffed.signature}）：${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const libCounts = new Map<string, number>();
  for (const imp of info.imports) libCounts.set(imp.library, (libCounts.get(imp.library) ?? 0) + 1);

  const assessment = assessPacking(info, buf, overallEntropy);

  return {
    file: base.file,
    format: {
      name: info.format,
      arch: info.arch,
      bits: info.bits,
      endian: info.endian,
      ...(info.entryPoint !== undefined ? { entryPoint: hex(info.entryPoint) } : {}),
      ...(entrySectionOf(info) ? { entrySection: entrySectionOf(info)! } : {}),
      ...(info.imageBase !== undefined ? { imageBase: hex(info.imageBase) } : {}),
      header: info.header,
      ...(info.slices
        ? { slices: info.slices.map((s) => ({ arch: s.arch, bits: s.bits, offset: hex(s.offset), size: s.size })) }
        : {}),
    },
    sections: info.sections.map((s) => ({
      name: s.name,
      ...(s.segment ? { segment: s.segment } : {}),
      va: hex(s.va),
      vsize: s.vsize,
      offset: hex(s.offset),
      size: s.size,
      entropy: s.entropy,
      flags: s.flags,
    })),
    imports: {
      total: info.imports.length,
      libraries: [...libCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      suspicious: findSuspiciousApis(info.imports),
    },
    exports: {
      total: info.exports.length,
      preview: info.exports.slice(0, 40).map((e) => e.name),
    },
    notes: info.notes,
    triage: {
      overallEntropy,
      packing: assessment,
    },
  };
}

/** 读文件 + 分析（工具层入口） */
export function analyzePath(path: string, opts: { arch?: string } = {}): Analysis {
  const buf = readSample(path);
  return analyze({ path, buf, ...opts });
}
