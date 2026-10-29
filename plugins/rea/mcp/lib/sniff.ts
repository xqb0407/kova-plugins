/**
 * 文件签名识别：只看魔数与少量探测字节，不做完整解析。
 * 完整解析失败时上层仍能用这里的结论给出「这是什么」（例如加了壳的 PE）。
 */
import { printablePreview } from "./util";

export type SniffKind =
  | "macho"
  | "fat-macho"
  | "pe"
  | "elf"
  | "java-class"
  | "zip"
  | "gzip"
  | "other"
  | "text"
  | "unknown";

export type SniffResult = {
  kind: SniffKind;
  /** 简短签名描述，如 "Mach-O 64-bit (小端)" */
  signature: string;
  /** 给分析者看的补充说明，如 "MZ 头但找不到 PE 签名" */
  detail?: string;
};

const KNOWN_CPUS = new Set([7, 12, 18, 0x01000007, 0x0100000c, 0x0200000c]);

function readU32BE(buf: Buffer, off: number): number {
  return buf.length >= off + 4 ? buf.readUInt32BE(off) : 0;
}

/** fat 头与 Java class 都以 CAFEBABE 开头：用 nfat_arch / cputype 的合理性区分 */
function looksLikeFatMachO(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  const n = readU32BE(buf, 4);
  if (n < 1 || n > 32) return false;
  if (buf.length < 8 + n * 20) return false;
  return KNOWN_CPUS.has(readU32BE(buf, 8));
}

export function sniff(buf: Buffer): SniffResult {
  if (buf.length >= 4) {
    const le32 = buf.readUInt32LE(0);
    if (le32 === 0xfeedface || le32 === 0xfeedfacf) {
      return { kind: "macho", signature: `Mach-O ${le32 === 0xfeedfacf ? 64 : 32}-bit（小端）` };
    }
    const be32 = buf.readUInt32BE(0);
    if (be32 === 0xfeedface || be32 === 0xfeedfacf) {
      return { kind: "macho", signature: `Mach-O ${be32 === 0xfeedfacf ? 64 : 32}-bit（大端）` };
    }
    if (be32 === 0xcafebabf || be32 === 0xbfbafeca) {
      return { kind: "fat-macho", signature: "Mach-O universal（fat，64 位头）" };
    }
    if (be32 === 0xcafebabe || be32 === 0xbebafeca) {
      if (looksLikeFatMachO(buf)) return { kind: "fat-macho", signature: "Mach-O universal（fat）" };
      return { kind: "java-class", signature: "Java class（CAFEBABE）" };
    }
  }

  if (buf.length >= 0x40 && buf[0] === 0x4d && buf[1] === 0x5a) {
    const peOff = buf.readUInt32LE(0x3c);
    if (peOff > 0 && peOff + 4 <= buf.length && buf.toString("latin1", peOff, peOff + 4) === "PE\0\0") {
      return { kind: "pe", signature: "PE（MZ + PE\\0\\0）" };
    }
    return {
      kind: "other",
      signature: "DOS/MZ 可执行文件",
      detail: "找不到有效的 PE 签名（e_lfanew 越界或无 PE\\0\\0），可能是 DOS 程序或加壳/损坏",
    };
  }

  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    const bits = buf[4] === 2 ? 64 : 32;
    const endian = buf[5] === 2 ? "大端" : "小端";
    return { kind: "elf", signature: `ELF ${bits}-bit（${endian}）` };
  }

  if (buf.length >= 4) {
    const b0 = buf[0];
    const b1 = buf[1];
    const b2 = buf[2];
    const b3 = buf[3];
    if (b0 === 0x50 && b1 === 0x4b && ((b2 === 3 && b3 === 4) || (b2 === 5 && b3 === 6) || (b2 === 7 && b3 === 8))) {
      return { kind: "zip", signature: "ZIP / JAR / APK（PK）" };
    }
    if (b0 === 0x1f && b1 === 0x8b) return { kind: "gzip", signature: "gzip" };
    if (b0 === 0x37 && b1 === 0x7a && b2 === 0xbc && b3 === 0xaf) return { kind: "other", signature: "7-Zip 压缩包" };
    if (b0 === 0x52 && b1 === 0x61 && b2 === 0x72 && b3 === 0x21) return { kind: "other", signature: "RAR 压缩包" };
    if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) return { kind: "other", signature: "PDF" };
    if (b0 === 0xd0 && b1 === 0xcf && b2 === 0x11 && b3 === 0xe0) return { kind: "other", signature: "OLE 复合文档（MSI/DOC/XLS）" };
    if (b0 === 0x00 && b1 === 0x61 && b2 === 0x73 && b3 === 0x6d) return { kind: "other", signature: "WebAssembly 模块" };
    if (b0 === 0x23 && b1 === 0x21) {
      const line = buf.toString("latin1", 0, Math.min(buf.length, 120)).split("\n")[0];
      return { kind: "text", signature: "脚本", detail: `shebang：${line}` };
    }
  }

  const head = buf.subarray(0, Math.min(buf.length, 4096));
  let printable = 0;
  for (const b of head) {
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80) printable++;
  }
  if (head.length > 0 && printable / head.length > 0.9) {
    return { kind: "text", signature: "文本", detail: printablePreview(head, 80) };
  }

  return { kind: "unknown", signature: "未知格式", detail: `头 32 字节：${printablePreview(buf, 32)}` };
}
