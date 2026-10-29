/**
 * ELF 解析：ELF32/64 双端序，节表、动态符号表、DT_NEEDED 依赖、程序头里的
 * PIE / NX / RELRO / interpreter 线索。
 *
 * 节表被裁掉（只留程序头）的加固样本也能给出类型、架构与入口点。
 */
import { cstrAt, Cursor, entropy } from "./util";
import type { BinaryInfo, ExportInfo, ImportInfo, SectionInfo } from "./types";

const MACHINES: Record<number, string> = {
  3: "x86",
  62: "x86_64",
  40: "arm",
  183: "aarch64",
  8: "mips",
  20: "ppc",
  21: "ppc64",
  22: "s390",
  243: "riscv",
  258: "loongarch",
};

const TYPES: Record<number, string> = { 1: "REL（可重定位）", 2: "EXEC（可执行）", 3: "DYN（共享对象/PIE）", 4: "CORE（core dump）" };

const SHT_NOBITS = 8;
const SHT_DYNSYM = 11;
const SHT_DYNAMIC = 6;
const PT_LOAD = 1;
const PT_INTERP = 3;
const PT_GNU_STACK = 0x6474e551;
const PT_GNU_RELRO = 0x6474e552;
const DT_NEEDED = 1;

type Shdr = {
  name: string;
  /** 节名在 .shstrtab 里的偏移（解析出 name 之前先存这里） */
  nameOff: number;
  type: number;
  flags: number;
  addr: number;
  offset: number;
  size: number;
  link: number;
  entsize: number;
};

function sectionFlags(flags: number): string[] {
  const out: string[] = [];
  if (flags & 0x2) out.push("R"); // SHF_ALLOC
  if (flags & 0x1) out.push("W");
  if (flags & 0x4) out.push("X");
  if (flags & 0x10) out.push("merge");
  if (flags & 0x20) out.push("strings");
  return out;
}

export function parseELF(buf: Buffer): BinaryInfo {
  if (buf.length < 0x34) throw new Error("文件太短，不是 ELF");
  if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
    throw new Error("不是 ELF 文件（magic 不匹配）");
  }
  const cls = buf[4];
  const data = buf[5];
  if (cls !== 1 && cls !== 2) throw new Error(`ELF class 非法：${cls}`);
  if (data !== 1 && data !== 2) throw new Error(`ELF data encoding 非法：${data}`);
  const is64 = cls === 2;
  const le = data === 1;

  const c = new Cursor(buf, 16, le);
  const eType = c.u16();
  const eMachine = c.u16();
  c.u32(); // e_version
  const eEntry = is64 ? c.u64() : c.u32();
  const ePhoff = is64 ? c.u64() : c.u32();
  const eShoff = is64 ? c.u64() : c.u32();
  c.u32(); // e_flags
  c.u16(); // e_ehsize
  const ePhentsize = c.u16();
  const ePhnum = c.u16();
  const eShentsize = c.u16();
  let eShnum = c.u16();
  let eShstrndx = c.u16();

  const notes: string[] = [];

  // ---- 节表（可能不存在或被裁掉） ----
  const rawShdrs: Shdr[] = [];
  const readShdr = (index: number): Shdr => {
    const off = eShoff + index * eShentsize;
    const s = new Cursor(buf, off, le);
    const nameOff = s.u32();
    const type = s.u32();
    const flags = is64 ? s.u64() : s.u32();
    const addr = is64 ? s.u64() : s.u32();
    const offset = is64 ? s.u64() : s.u32();
    const size = is64 ? s.u64() : s.u32();
    const link = s.u32();
    s.u32(); // info
    if (is64) s.u64(); // addralign
    else s.u32();
    const entsize = is64 ? s.u64() : s.u32();
    return { name: "", nameOff, type, flags, addr, offset, size, link, entsize };
  };

  if (eShoff > 0 && eShoff < buf.length && eShentsize >= (is64 ? 64 : 40)) {
    const maxByFile = Math.floor((buf.length - eShoff) / eShentsize);
    if (eShnum === 0) {
      // 扩展编号：真实数量存在 section[0].sh_size
      const zero = readShdr(0);
      eShnum = zero.size;
    }
    if (eShstrndx === 0xffff) {
      const zero = readShdr(0);
      eShstrndx = zero.link;
    }
    const count = Math.min(eShnum, maxByFile);
    if (count < eShnum) notes.push(`节表声明 ${eShnum} 项，文件只够 ${count} 项（可能被裁切）`);

    let shstrtab: Shdr | undefined;
    for (let i = 0; i < count; i++) {
      try {
        rawShdrs.push(readShdr(i));
      } catch {
        notes.push(`节头 #${i} 读取失败，节表截断`);
        break;
      }
    }
    if (eShstrndx < rawShdrs.length) shstrtab = rawShdrs[eShstrndx];
    if (shstrtab && shstrtab.offset < buf.length) {
      for (const s of rawShdrs) {
        const name = cstrAt(buf, shstrtab.offset + s.nameOff, 256);
        s.name = name ?? "";
      }
    } else if (rawShdrs.length > 0) {
      notes.push("找不到 .shstrtab，节名不可用");
    }
  } else {
    notes.push("没有可用的节表（e_shoff 为 0 或越界）：按程序头解析");
  }

  // ---- 程序头：PIE / NX / RELRO / interpreter ----
  let imageBase: number | undefined;
  let hasInterp: string | undefined;
  let stackExecutable: boolean | undefined;
  let hasRelro = false;
  if (ePhoff > 0 && ePhoff < buf.length && ePhnum > 0 && ePhnum < 4096 && ePhentsize >= (is64 ? 56 : 32)) {
    for (let i = 0; i < ePhnum; i++) {
      const off = ePhoff + i * ePhentsize;
      if (off + ePhentsize > buf.length) break;
      const p = new Cursor(buf, off, le);
      const pType = p.u32();
      let pFlags: number;
      let pOffset: number;
      let pVaddr: number;
      if (is64) {
        pFlags = p.u32();
        pOffset = p.u64();
        pVaddr = p.u64();
        p.u64(); // paddr
        p.u64(); // filesz
        p.u64(); // memsz
        p.u64(); // align
      } else {
        pOffset = p.u32();
        pVaddr = p.u32();
        p.u32(); // paddr
        p.u32(); // filesz
        p.u32(); // memsz
        pFlags = p.u32();
        p.u32(); // align
      }
      if (pType === PT_LOAD) imageBase = imageBase === undefined ? pVaddr : Math.min(imageBase, pVaddr);
      else if (pType === PT_INTERP) hasInterp = cstrAt(buf, pOffset, 512) ?? "<不可读>";
      else if (pType === PT_GNU_STACK) stackExecutable = (pFlags & 0x1) !== 0;
      else if (pType === PT_GNU_RELRO) hasRelro = true;
    }
  }

  // ---- 节（统一模型） ----
  const sections: SectionInfo[] = [];
  for (const s of rawShdrs) {
    const nobits = s.type === SHT_NOBITS;
    const flags = sectionFlags(s.flags);
    if (nobits) flags.push("nobits");
    let ent = 0;
    let fileSize = 0;
    if (!nobits && s.size > 0 && s.offset > 0 && s.offset < buf.length) {
      const end = Math.min(buf.length, s.offset + s.size);
      ent = entropy(buf, s.offset, end);
      fileSize = end - s.offset;
      if (fileSize < s.size) notes.push(`节 ${s.name || `#${s.type}`} 数据被截断（声明 ${s.size} B，实得 ${fileSize} B）`);
    }
    if (s.size === 0 && !nobits) continue;
    sections.push({
      name: s.name || `<type ${s.type}>`,
      va: s.addr,
      vsize: s.size,
      offset: nobits ? 0 : s.offset,
      size: fileSize,
      entropy: ent,
      flags,
    });
  }

  // ---- 动态符号表：导入 / 导出 ----
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const needed: string[] = [];
  const dynsym = rawShdrs.find((s) => s.type === SHT_DYNSYM);
  if (dynsym && dynsym.link < rawShdrs.length) {
    const strtab = rawShdrs[dynsym.link];
    const entSize = dynsym.entsize || (is64 ? 24 : 16);
    const count = Math.min(Math.floor(dynsym.size / entSize), 200_000);
    for (let i = 0; i < count; i++) {
      const off = dynsym.offset + i * entSize;
      if (off + entSize > buf.length) break;
      const s = new Cursor(buf, off, le);
      const nameOff = s.u32();
      let info: number;
      let shndx: number;
      let value: number;
      if (is64) {
        info = s.u8();
        s.u8(); // other
        shndx = s.u16();
        value = s.u64();
      } else {
        value = s.u32();
        s.u32(); // size
        info = s.u8();
        s.u8(); // other
        shndx = s.u16();
      }
      if (nameOff === 0) continue;
      const name = cstrAt(buf, strtab.offset + nameOff, 2048);
      if (!name) continue;
      const bind = info >> 4;
      if (shndx === 0) {
        imports.push({ library: "dynamic", name });
      } else if ((bind === 1 || bind === 2) && imports.length < 50_000) {
        exports.push({ name, va: value });
      }
    }
  } else if (rawShdrs.length > 0) {
    notes.push("没有 .dynsym：导入/导出为空（静态链接或已剥离动态符号）");
  }

  const dynamic = rawShdrs.find((s) => s.type === SHT_DYNAMIC);
  if (dynamic && dynamic.link < rawShdrs.length) {
    const strtab = rawShdrs[dynamic.link];
    const entSize = dynamic.entsize || (is64 ? 16 : 8);
    const count = Math.min(Math.floor(dynamic.size / entSize), 10_000);
    for (let i = 0; i < count; i++) {
      const off = dynamic.offset + i * entSize;
      if (off + entSize > buf.length) break;
      const d = new Cursor(buf, off, le);
      const tag = is64 ? d.u64() : d.u32();
      const val = is64 ? d.u64() : d.u32();
      if (tag === DT_NEEDED) {
        const name = cstrAt(buf, strtab.offset + val, 1024);
        if (name) needed.push(name);
      }
    }
  }

  // ---- 其它线索 ----
  if (eType === 3) notes.push("ET_DYN：PIE 可执行或共享库（看是否有 PT_INTERP 区分）");
  if (hasInterp) notes.push(`interpreter：${hasInterp}（动态链接）`);
  else if (rawShdrs.length > 0) notes.push("无 PT_INTERP：静态链接或自包含加载器");
  if (stackExecutable === true) notes.push("PT_GNU_STACK 带执行位：栈可执行（少见，值得注意）");
  if (hasRelro) notes.push("启用 GNU RELRO");
  if (!rawShdrs.some((s) => s.type === 2 /* SHT_SYMTAB */)) notes.push("无 .symtab：已剥离常规符号");

  const header: Record<string, string | number | boolean> = {
    type: TYPES[eType] ?? `type_${eType}`,
    machine: MACHINES[eMachine] ?? `machine_${eMachine}`,
    sections: rawShdrs.length,
    needed: needed.length,
  };
  if (hasInterp) header.interpreter = hasInterp;

  return {
    format: "ELF",
    arch: MACHINES[eMachine] ?? `machine_${eMachine}`,
    bits: is64 ? 64 : 32,
    endian: le ? "little" : "big",
    ...(eEntry ? { entryPoint: eEntry } : {}),
    ...(imageBase !== undefined ? { imageBase } : {}),
    sections,
    imports,
    exports,
    notes: [...(needed.length ? [`DT_NEEDED 依赖：${needed.slice(0, 20).join(", ")}${needed.length > 20 ? ` …共 ${needed.length} 个` : ""}`] : []), ...notes],
    header,
  };
}
