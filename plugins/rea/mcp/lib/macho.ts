/**
 * Mach-O / universal(fat) 解析：头部、load commands、段与节、符号表、签名与加密线索。
 *
 * 只读、纯函数；所有偏移都走边界检查的 Cursor。fat 包按 arch 选切片，缺省第一个。
 * 导入符号的「来自哪个 dylib」用 n_desc 里的 library ordinal 反查 LC_LOAD_DYLIB 顺序。
 */
import { cstrAt, Cursor, entropy, hex } from "./util";
import type { BinaryInfo, ExportInfo, ImportInfo, SectionInfo, SliceInfo } from "./types";

const CPU_NAMES: Record<number, string> = {
  7: "x86",
  0x01000007: "x86_64",
  12: "arm",
  0x0100000c: "arm64",
  18: "ppc",
  0x01000012: "ppc64",
};

const FILE_TYPES: Record<number, string> = {
  1: "object",
  2: "executable",
  3: "fixed VM library",
  4: "core",
  5: "preloaded executable",
  6: "dylib",
  7: "dylinker",
  8: "bundle",
  9: "dylib stub",
  10: "dSYM",
  11: "kext bundle",
  12: "fileset",
};

const PLATFORMS: Record<number, string> = {
  1: "macOS",
  2: "iOS",
  3: "tvOS",
  4: "watchOS",
  5: "bridgeOS",
  6: "Mac Catalyst",
  7: "iOS Simulator",
  8: "tvOS Simulator",
  9: "watchOS Simulator",
  10: "DriverKit",
  11: "visionOS",
  12: "visionOS Simulator",
};

// 注意：不要写成 `0x28 | 0x80000000`——JS 位运算按 int32 取负，常量会变成负数
const LC_SEGMENT = 0x1;
const LC_SYMTAB = 0x2;
const LC_UNIXTHREAD = 0x5;
const LC_DYSYMTAB = 0xb;
const LC_LOAD_DYLIB = 0xc;
const LC_ID_DYLIB = 0xd;
const LC_LOAD_WEAK_DYLIB = 0x80000018;
const LC_RPATH = 0x8000001c;
const LC_CODE_SIGNATURE = 0x1d;
const LC_SEGMENT_64 = 0x19;
const LC_UUID = 0x1b;
const LC_VERSION_MIN_MACOSX = 0x24;
const LC_VERSION_MIN_IPHONEOS = 0x25;
const LC_MAIN = 0x80000028;
const LC_ENCRYPTION_INFO = 0x21;
const LC_ENCRYPTION_INFO_64 = 0x2c;
const LC_BUILD_VERSION = 0x32;
const LC_REEXPORT_DYLIB = 0x8000001f;
const LC_LOAD_UPWARD_DYLIB = 0x80000023;

function cpuName(cputype: number, cpusubtype: number): string {
  if (cputype === 0x0100000c && (cpusubtype & 0x00ffffff) === 2) return "arm64e";
  return CPU_NAMES[cputype] ?? `cpu_0x${cputype.toString(16)}`;
}

function versionOf(v: number): string {
  return `${(v >>> 16) & 0xffff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
}

function permsOf(initprot: number): string[] {
  const flags: string[] = [];
  if (initprot & 1) flags.push("R");
  if (initprot & 2) flags.push("W");
  if (initprot & 4) flags.push("X");
  return flags;
}

type ThinHeader = {
  le: boolean;
  is64: boolean;
  cputype: number;
  cpusubtype: number;
  filetype: number;
  ncmds: number;
  sizeofcmds: number;
  flags: number;
  cmdsStart: number;
};

function readThinHeader(buf: Buffer): ThinHeader {
  if (buf.length < 28) throw new Error("文件太短，不是 Mach-O");
  const le32 = buf.readUInt32LE(0);
  let le: boolean;
  let is64: boolean;
  if (le32 === 0xfeedface) {
    le = true;
    is64 = false;
  } else if (le32 === 0xfeedfacf) {
    le = true;
    is64 = true;
  } else if (buf.readUInt32BE(0) === 0xfeedface) {
    le = false;
    is64 = false;
  } else if (buf.readUInt32BE(0) === 0xfeedfacf) {
    le = false;
    is64 = true;
  } else {
    throw new Error("不是 Mach-O 文件（magic 不匹配）");
  }
  const c = new Cursor(buf, 4, le);
  const cputype = c.u32();
  const cpusubtype = c.u32();
  const filetype = c.u32();
  const ncmds = c.u32();
  const sizeofcmds = c.u32();
  const flags = c.u32();
  if (is64) c.u32(); // reserved
  if (ncmds > 100_000) throw new Error(`load commands 数量异常：${ncmds}`);
  return { le, is64, cputype, cpusubtype, filetype, ncmds, sizeofcmds, flags, cmdsStart: c.pos };
}

type SymtabLC = { symoff: number; nsyms: number; stroff: number; strsize: number };
type DysymtabLC = { iundefsym: number; nundefsym: number };

function parseThin(buf: Buffer): BinaryInfo {
  const h = readThinHeader(buf);
  const arch = cpuName(h.cputype, h.cpusubtype);
  const bits: 32 | 64 = h.is64 ? 64 : 32;
  const notes: string[] = [];
  const sections: SectionInfo[] = [];
  const dylibs: string[] = [];
  let symtab: SymtabLC | undefined;
  let dysymtab: DysymtabLC | undefined;
  let entryoff: number | undefined;
  let textVmaddr: number | undefined;
  let imageBase: number | undefined;
  let platform: string | undefined;
  let minimumOS: string | undefined;
  let sdk: string | undefined;
  let uuid: string | undefined;
  let codesign: { off: number; size: number } | undefined;
  let encrypted: number | undefined;

  let p = h.cmdsStart;
  for (let i = 0; i < h.ncmds; i++) {
    const c = new Cursor(buf, p, h.le);
    const cmd = c.u32();
    const cmdsize = c.u32();
    if (cmdsize < 8) throw new Error(`load command #${i} 长度非法：${cmdsize}`);
    const cmdEnd = p + cmdsize;
    if (cmdEnd > buf.length) {
      notes.push(`load command #${i} 越界（0x${p.toString(16)} + ${cmdsize}），后续命令停止解析`);
      break;
    }

    if (cmd === LC_SEGMENT || cmd === LC_SEGMENT_64) {
      const is64 = cmd === LC_SEGMENT_64;
      const s = new Cursor(buf, p + 8, h.le);
      const segname = s.fixed(16);
      let vmaddr: number;
      let initprot: number;
      let nsects: number;
      if (is64) {
        vmaddr = s.u64();
        s.u64(); // vmsize
        s.u64(); // fileoff
        s.u64(); // filesize
        s.u32(); // maxprot
        initprot = s.u32();
        nsects = s.u32();
        s.u32(); // flags
      } else {
        vmaddr = s.u32();
        s.u32(); // vmsize
        s.u32(); // fileoff
        s.u32(); // filesize
        s.u32(); // maxprot
        initprot = s.u32();
        nsects = s.u32();
        s.u32(); // flags
      }
      if (nsects > 10_000) throw new Error(`段 ${segname} 的节数量异常：${nsects}`);
      if (segname === "__TEXT" && vmaddr) {
        textVmaddr = vmaddr;
        imageBase = vmaddr;
      }
      const segPerms = permsOf(initprot);
      for (let j = 0; j < nsects; j++) {
        const sectname = s.fixed(16);
        s.fixed(16); // 节所在段名（与父段一致）
        let addr: number;
        let size: number;
        let offset: number;
        let sflags: number;
        if (is64) {
          addr = s.u64();
          size = s.u64();
          offset = s.u32();
          s.u32(); // align
          s.u32(); // reloff
          s.u32(); // nreloc
          sflags = s.u32();
          s.u32();
          s.u32();
          s.u32();
        } else {
          addr = s.u32();
          size = s.u32();
          offset = s.u32();
          s.u32();
          s.u32();
          s.u32();
          sflags = s.u32();
          s.u32();
          s.u32();
        }
        if (s.pos > cmdEnd) throw new Error(`段 ${segname} 的节表越出 load command 边界`);
        const type = sflags & 0xff;
        const zerofill = type === 0x1 || type === 0xc || type === 0x12;
        const flags = [...segPerms];
        if (zerofill) flags.push("zerofill");
        if (sectname === "__text") flags.push("__text");
        if (size === 0 && !zerofill) continue;
        let fileSize = 0;
        let ent = 0;
        if (!zerofill && offset > 0 && size > 0) {
          if (offset + size <= buf.length) {
            ent = entropy(buf, offset, offset + size);
            fileSize = size;
          } else {
            notes.push(
              `节 ${segname},${sectname} 的文件区间越界（0x${offset.toString(16)} + ${size}），熵按可读部分计算`,
            );
            const end = Math.min(buf.length, offset + size);
            ent = end > offset ? entropy(buf, offset, end) : 0;
            fileSize = Math.max(0, end - offset);
          }
        }
        sections.push({
          name: sectname,
          segment: segname,
          va: addr,
          vsize: size,
          offset: zerofill ? 0 : offset,
          size: fileSize,
          entropy: ent,
          flags,
        });
      }
    } else if (cmd === LC_SYMTAB) {
      const s = new Cursor(buf, p + 8, h.le);
      symtab = { symoff: s.u32(), nsyms: s.u32(), stroff: s.u32(), strsize: s.u32() };
    } else if (cmd === LC_DYSYMTAB) {
      const s = new Cursor(buf, p + 8, h.le);
      s.u32(); // ilocalsym
      s.u32(); // nlocalsym
      s.u32(); // iextdefsym
      s.u32(); // nextdefsym
      const iundefsym = s.u32();
      const nundefsym = s.u32();
      dysymtab = { iundefsym, nundefsym };
    } else if (
      cmd === LC_LOAD_DYLIB ||
      cmd === LC_LOAD_WEAK_DYLIB ||
      cmd === LC_REEXPORT_DYLIB ||
      cmd === LC_LOAD_UPWARD_DYLIB ||
      cmd === LC_ID_DYLIB
    ) {
      const s = new Cursor(buf, p + 8, h.le);
      const nameOff = s.u32();
      const name = cstrAt(buf, p + nameOff, 1024);
      if (name) {
        if (cmd === LC_ID_DYLIB) notes.push(`install name：${name}`);
        else dylibs.push(name);
      }
    } else if (cmd === LC_MAIN) {
      const s = new Cursor(buf, p + 8, h.le);
      entryoff = s.u64();
    } else if (cmd === LC_UNIXTHREAD) {
      notes.push("入口点由 LC_UNIXTHREAD 给出（未解析具体寄存器状态）");
    } else if (cmd === LC_UUID) {
      const raw = new Cursor(buf, p + 8, h.le).bytes(16);
      const hx = raw.toString("hex");
      uuid = `${hx.slice(0, 8)}-${hx.slice(8, 12)}-${hx.slice(12, 16)}-${hx.slice(16, 20)}-${hx.slice(20)}`;
    } else if (cmd === LC_CODE_SIGNATURE) {
      const s = new Cursor(buf, p + 8, h.le);
      codesign = { off: s.u32(), size: s.u32() };
    } else if (cmd === LC_ENCRYPTION_INFO || cmd === LC_ENCRYPTION_INFO_64) {
      const s = new Cursor(buf, p + 8, h.le);
      s.u32(); // cryptoff
      s.u32(); // cryptsize
      encrypted = s.u32(); // cryptid
    } else if (cmd === LC_BUILD_VERSION) {
      const s = new Cursor(buf, p + 8, h.le);
      const plat = s.u32();
      const minos = s.u32();
      const sdkv = s.u32();
      platform = PLATFORMS[plat] ?? `platform_${plat}`;
      minimumOS = versionOf(minos);
      sdk = versionOf(sdkv);
    } else if (cmd === LC_VERSION_MIN_MACOSX || cmd === LC_VERSION_MIN_IPHONEOS) {
      const s = new Cursor(buf, p + 8, h.le);
      const minos = s.u32();
      const sdkv = s.u32();
      platform = cmd === LC_VERSION_MIN_MACOSX ? "macOS" : "iOS";
      minimumOS = versionOf(minos);
      sdk = versionOf(sdkv);
    } else if (cmd === LC_RPATH) {
      const s = new Cursor(buf, p + 8, h.le);
      const off = s.u32();
      const rp = cstrAt(buf, p + off, 1024);
      if (rp) notes.push(`rpath：${rp}`);
    }

    p = cmdEnd;
  }

  let entryPoint: number | undefined;
  if (entryoff !== undefined && textVmaddr !== undefined) entryPoint = textVmaddr + entryoff;
  else if (entryoff !== undefined) notes.push(`入口点偏移 0x${entryoff.toString(16)}，但没找到 __TEXT 段基址`);

  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  if (symtab && symtab.symoff > 0 && symtab.symoff < buf.length && symtab.stroff > 0 && symtab.stroff < buf.length) {
    const nlistSize = h.is64 ? 16 : 12;
    const symCount = Math.min(symtab.nsyms, Math.floor((buf.length - symtab.symoff) / nlistSize));
    if (symCount < symtab.nsyms) notes.push("符号表被截断（文件不完整或 symoff/nsyms 异常）");

    const readSym = (idx: number): { strx: number; type: number; desc: number; value: number } => {
      const off = symtab.symoff + idx * nlistSize;
      const c = new Cursor(buf, off, h.le);
      const strx = c.u32();
      const type = c.u8();
      c.u8(); // n_sect
      const desc = c.u16();
      const value = h.is64 ? c.u64() : c.u32();
      return { strx, type, desc, value };
    };
    const nameOf = (strx: number): string => cstrAt(buf, symtab.stroff + strx, 2048) ?? "";

    if (dysymtab && dysymtab.nundefsym > 0) {
      const end = Math.min(symtab.nsyms, dysymtab.iundefsym + dysymtab.nundefsym);
      for (let i = dysymtab.iundefsym; i < end && imports.length < 20_000; i++) {
        const sym = readSym(i);
        const name = nameOf(sym.strx);
        if (!name) continue;
        const ordinal = (sym.desc >> 8) & 0xff;
        const library =
          ordinal >= 1 && ordinal <= dylibs.length
            ? dylibs[ordinal - 1]
            : ordinal === 0
              ? "self"
              : ordinal === 0xfe
                ? "dynamic-lookup"
                : ordinal === 0xff
                  ? "executable"
                  : `ordinal_${ordinal}`;
        imports.push({ library, name });
      }
    } else if (!dysymtab) {
      notes.push("没有 LC_DYSYMTAB，未解析导入符号");
    }

    for (let i = 0; i < symCount && exports.length < 20_000; i++) {
      const sym = readSym(i);
      if ((sym.type & 0xe0) !== 0) continue; // N_STAB 调试符号
      const isExternal = (sym.type & 0x01) !== 0;
      const isUndef = (sym.type & 0x0e) === 0x0;
      if (!isExternal || isUndef) continue;
      const name = nameOf(sym.strx);
      if (name) exports.push({ name, va: sym.value });
    }
  } else {
    notes.push("无符号表（stripped）：导入/导出为空，改用 strings / disasm 定位行为");
  }

  if (encrypted !== undefined) {
    notes.push(
      encrypted !== 0
        ? "App Store 加密二进制（cryptid≠0）：__TEXT 已加密，静态反汇编看到的是密文"
        : "未加密（cryptid=0）",
    );
  }  if (codesign) notes.push(`含代码签名 blob（${codesign.size} 字节，未验签）`);
  if (uuid) notes.push(`UUID：${uuid}`);

  const header: Record<string, string | number | boolean> = {
    filetype: FILE_TYPES[h.filetype] ?? `type_${h.filetype}`,
    loadCommands: h.ncmds,
    loadCommandsBytes: h.sizeofcmds,
    flags: hex(h.flags),
    dylibs: dylibs.length,
  };
  if (platform) header.platform = platform;
  if (minimumOS) header.minimumOS = minimumOS;
  if (sdk) header.sdk = sdk;
  if (uuid) header.uuid = uuid;

  return {
    format: "Mach-O",
    arch,
    bits,
    endian: h.le ? "little" : "big",
    ...(entryPoint !== undefined ? { entryPoint } : {}),
    ...(imageBase !== undefined ? { imageBase } : {}),
    sections,
    imports,
    exports,
    ...(encrypted ? { encrypted: true } : {}),
    notes,
    header,
  };
}

/** 读 fat 头，返回切片表（不做解析） */
function readFatSlices(buf: Buffer): SliceInfo[] {
  const be = buf.readUInt32BE(0);
  const swapped = be === 0xbebafeca || be === 0xbfbafeca;
  const is64 = be === 0xcafebabf || be === 0xbfbafeca;
  const c = new Cursor(buf, 4, swapped);
  const n = c.u32();
  if (n < 1 || n > 32) throw new Error(`fat 头里的切片数量异常：${n}`);

  const slices: SliceInfo[] = [];
  for (let i = 0; i < n; i++) {
    const cputype = c.u32();
    const cpusubtype = c.u32();
    let offset: number;
    let size: number;
    if (is64) {
      offset = c.u64();
      size = c.u64();
      c.u32(); // align
      c.u32(); // reserved
    } else {
      offset = c.u32();
      size = c.u32();
      c.u32(); // align
    }
    if (size <= 0 || offset < 0 || offset + size > buf.length) {
      throw new Error(`fat 切片 #${i} 越界（offset=0x${offset.toString(16)}, size=${size}）`);
    }
    slices.push({
      arch: cpuName(cputype, cpusubtype),
      bits: cputype === 0x01000007 || cputype === 0x0100000c || cputype === 0x01000012 ? 64 : 32,
      offset,
      size,
    });
  }
  return slices;
}

/** 解析 Mach-O（含 universal）；arch 用于选择 fat 切片，缺省第一个 */
export function parseMachO(buf: Buffer, opts: { arch?: string } = {}): BinaryInfo {
  const be = buf.length >= 4 ? buf.readUInt32BE(0) : 0;
  const isFat = be === 0xcafebabe || be === 0xcafebabf || be === 0xbebafeca || be === 0xbfbafeca;
  if (!isFat) return parseThin(buf);

  const slices = readFatSlices(buf);
  const want = opts.arch?.trim().toLowerCase();
  let chosen = slices[0];
  if (want) {
    const hit = slices.find((s) => s.arch.toLowerCase() === want);
    if (!hit) {
      throw new Error(`fat 包里没有架构 "${opts.arch}"；可选：${slices.map((s) => s.arch).join(", ")}`);
    }
    chosen = hit;
  }

  const sliceBuf = buf.subarray(chosen.offset, chosen.offset + chosen.size);
  const info = parseThin(sliceBuf);
  info.format = "Mach-O (universal)";
  info.slices = slices.map(({ arch, bits, offset, size }) => ({ arch, bits, offset, size }));
  // 切片内的节偏移换算回整文件偏移：strings / search / 十六进制查看工具都按整文件算
  for (const s of info.sections) {
    if (s.offset > 0) s.offset += chosen.offset;
  }
  const others = slices
    .filter((s) => s !== chosen)
    .map((s) => `${s.arch}(${s.size} B @0x${s.offset.toString(16)})`);
  info.notes.unshift(
    `universal 二进制：${slices.length} 个切片；当前分析 ${chosen.arch} 切片` +
      (others.length ? `；其余：${others.join("、")}` : ""),
  );
  info.header.sliceOffset = chosen.offset;
  return info;
}
