/**
 * PE / PE32+ 解析：DOS/COFF/可选头、节表、导入表、导出表、调试目录（PDB 路径）、
 * TLS / CLR / 证书表等安全相关目录，以及 overlay 体积。
 *
 * 全部按 RVA → 文件偏移经节表换算；任何一步越界都只影响该子项，不拖垮整体。
 */
import { cstrAt, Cursor, entropy, hex } from "./util";
import type { BinaryInfo, ExportInfo, ImportInfo, SectionInfo } from "./types";

const MACHINES: Record<number, string> = {
  0x014c: "x86",
  0x8664: "x86_64",
  0x01c0: "arm",
  0x01c4: "armv7",
  0xaa64: "arm64",
  0x0200: "ia64",
};

const SUBSYSTEMS: Record<number, string> = {
  1: "native",
  2: "Windows GUI",
  3: "Windows CUI",
  5: "OS/2 CUI",
  7: "POSIX CUI",
  9: "Windows CE",
  10: "EFI application",
  11: "EFI boot driver",
  12: "EFI runtime driver",
  13: "EFI ROM",
  14: "Xbox",
  16: "Windows boot application",
};

const DLL_CHARACTERISTICS: Array<[number, string]> = [
  [0x0020, "HIGH_ENTROPY_VA"],
  [0x0040, "DYNAMIC_BASE（ASLR）"],
  [0x0080, "FORCE_INTEGRITY"],
  [0x0100, "NX_COMPAT（DEP）"],
  [0x0200, "NO_ISOLATION"],
  [0x0400, "NO_SEH"],
  [0x0800, "NO_BIND"],
  [0x1000, "APPCONTAINER"],
  [0x2000, "WDM_DRIVER"],
  [0x4000, "GUARD_CF（控制流保护）"],
  [0x8000, "TERMINAL_SERVER_AWARE"],
];

type RawSection = {
  name: string;
  virtualAddress: number;
  virtualSize: number;
  rawPtr: number;
  rawSize: number;
  characteristics: number;
};

type DataDir = { rva: number; size: number };

function sectionFlags(chars: number): string[] {
  const flags: string[] = [];
  if (chars & 0x40000000) flags.push("R");
  if (chars & 0x80000000) flags.push("W");
  if (chars & 0x20000000) flags.push("X");
  if (chars & 0x00000020) flags.push("code");
  if (chars & 0x00000040) flags.push("idata");
  if (chars & 0x00000080) flags.push("uninit");
  if (chars & 0x02000000) flags.push("discardable");
  if (chars & 0x04000000) flags.push("not-cached");
  return flags;
}

function timestampIso(ts: number): string {
  if (ts === 0) return "0（无时间戳）";
  const d = new Date(ts * 1000);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString();
}

export function parsePE(buf: Buffer): BinaryInfo {
  if (buf.length < 0x40 || buf[0] !== 0x4d || buf[1] !== 0x5a) throw new Error("不是 PE 文件（缺 MZ 头）");
  const peOff = buf.readUInt32LE(0x3c);
  if (peOff < 0x40 || peOff + 24 > buf.length) throw new Error(`e_lfanew 非法：0x${peOff.toString(16)}`);
  if (buf.toString("latin1", peOff, peOff + 4) !== "PE\0\0") throw new Error("MZ 头之后找不到 PE\\0\\0 签名");

  const notes: string[] = [];
  const c = new Cursor(buf, peOff + 4, true);
  const machine = c.u16();
  const numberOfSections = c.u16();
  const timeDateStamp = c.u32();
  c.u32(); // pointerToSymbolTable
  c.u32(); // numberOfSymbols
  const sizeOfOptionalHeader = c.u16();
  const characteristics = c.u16();
  if (numberOfSections > 512) throw new Error(`节数量异常：${numberOfSections}`);

  const optOff = peOff + 24;
  const o = new Cursor(buf, optOff, true);
  const magic = o.u16();
  if (magic !== 0x10b && magic !== 0x20b) throw new Error(`可选头 magic 非法：0x${magic.toString(16)}`);
  const is64 = magic === 0x20b;

  o.u8(); // linker major
  o.u8(); // linker minor
  o.u32(); // sizeOfCode
  o.u32(); // sizeOfInitializedData
  o.u32(); // sizeOfUninitializedData
  const entryPointRva = o.u32();
  o.u32(); // baseOfCode
  if (!is64) o.u32(); // baseOfData
  const imageBase = is64 ? o.u64() : o.u32();
  o.u32(); // sectionAlignment
  o.u32(); // fileAlignment
  o.u16(); // os major
  o.u16(); // os minor
  o.u16(); // image major
  o.u16(); // image minor
  o.u16(); // subsystem major
  o.u16(); // subsystem minor
  o.u32(); // win32VersionValue
  const sizeOfImage = o.u32();
  const sizeOfHeaders = o.u32();
  o.u32(); // checksum
  const subsystem = o.u16();
  const dllCharacteristics = o.u16();
  // SizeOfStackReserve / Commit、SizeOfHeapReserve / Commit
  if (is64) {
    o.u64();
    o.u64();
    o.u64();
    o.u64();
  } else {
    o.u32();
    o.u32();
    o.u32();
    o.u32();
  }
  o.u32(); // loaderFlags
  const numberOfRvaAndSizes = o.u32();
  const dirCount = Math.min(numberOfRvaAndSizes, 16);
  const dirs: DataDir[] = [];
  for (let i = 0; i < dirCount; i++) dirs.push({ rva: o.u32(), size: o.u32() });

  const sections: RawSection[] = [];
  const secStart = optOff + sizeOfOptionalHeader;
  for (let i = 0; i < numberOfSections; i++) {
    const s = new Cursor(buf, secStart + i * 40, true);
    const name = s.fixed(8);
    const virtualSize = s.u32();
    const virtualAddress = s.u32();
    const rawSize = s.u32();
    const rawPtr = s.u32();
    s.u32(); // pointerToRelocations
    s.u32(); // pointerToLinenumbers
    s.u16(); // numberOfRelocations
    s.u16(); // numberOfLinenumbers
    const secChars = s.u32();
    sections.push({ name, virtualAddress, virtualSize, rawPtr, rawSize, characteristics: secChars });
  }

  const rvaToOffset = (rva: number): number | undefined => {
    if (rva < sizeOfHeaders && rva < buf.length) return rva;
    for (const s of sections) {
      const span = Math.max(s.virtualSize, s.rawSize);
      if (rva >= s.virtualAddress && rva < s.virtualAddress + span) {
        const delta = rva - s.virtualAddress;
        const off = s.rawPtr + delta;
        if (delta >= s.rawSize || off >= buf.length) return undefined;
        return off;
      }
    }
    return undefined;
  };

  // ---- 节表（带熵） ----
  const sectionInfos: SectionInfo[] = [];
  for (const s of sections) {
    let ent = 0;
    let fileSize = 0;
    if (s.rawPtr > 0 && s.rawSize > 0 && s.rawPtr + s.rawSize <= buf.length) {
      ent = entropy(buf, s.rawPtr, s.rawPtr + s.rawSize);
      fileSize = s.rawSize;
    } else if (s.rawPtr > 0 && s.rawSize > 0) {
      const end = Math.min(buf.length, s.rawPtr + s.rawSize);
      ent = end > s.rawPtr ? entropy(buf, s.rawPtr, end) : 0;
      fileSize = Math.max(0, end - s.rawPtr);
      notes.push(`节 ${s.name} 的原始区间越界，熵按可读部分计算`);
    }
    sectionInfos.push({
      name: s.name || "<unnamed>",
      va: imageBase + s.virtualAddress,
      vsize: s.virtualSize,
      offset: fileSize > 0 ? s.rawPtr : 0,
      size: fileSize,
      entropy: ent,
      flags: sectionFlags(s.characteristics),
    });
  }

  // ---- 导入 ----
  const imports: ImportInfo[] = [];
  const importDir = dirs[1];
  if (importDir && importDir.rva) {
    let descOff = rvaToOffset(importDir.rva);
    for (let i = 0; descOff !== undefined && i < 1024; i++, descOff += 20) {
      if (descOff + 20 > buf.length) break;
      const d = new Cursor(buf, descOff, true);
      const originalFirstThunk = d.u32();
      d.u32(); // timeDateStamp
      d.u32(); // forwarderChain
      const nameRva = d.u32();
      const firstThunk = d.u32();
      if (!originalFirstThunk && !nameRva && !firstThunk) break;
      const dllOff = nameRva ? rvaToOffset(nameRva) : undefined;
      const dll = (dllOff !== undefined ? cstrAt(buf, dllOff, 512) : undefined) ?? `<rva 0x${nameRva.toString(16)}>`;
      const thunkRva = originalFirstThunk || firstThunk;
      let thunkOff = thunkRva ? rvaToOffset(thunkRva) : undefined;
      const thunkSize = is64 ? 8 : 4;
      const ordinalFlag = is64 ? 0x8000000000000000n : 0x80000000n;
      for (let k = 0; thunkOff !== undefined && k < 20_000; k++, thunkOff += thunkSize) {
        if (thunkOff + thunkSize > buf.length) break;
        const value = is64 ? buf.readBigUInt64LE(thunkOff) : BigInt(buf.readUInt32LE(thunkOff));
        if (value === 0n) break;
        if ((value & ordinalFlag) !== 0n) {
          imports.push({ library: dll, name: `ordinal_${Number(value & 0xffffn)}` });
          continue;
        }
        const nameOff = rvaToOffset(Number(value));
        const fn = nameOff !== undefined ? cstrAt(buf, nameOff + 2, 512) : undefined;
        imports.push({ library: dll, name: fn ?? `rva_0x${value.toString(16)}` });
      }
    }
  }

  // ---- 导出 ----
  const exports: ExportInfo[] = [];
  const exportDir = dirs[0];
  if (exportDir && exportDir.rva) {
    const expOff = rvaToOffset(exportDir.rva);
    if (expOff === undefined) {
      notes.push("导出目录 RVA 无法映射到文件偏移");
    } else {
      const e = new Cursor(buf, expOff, true);
      e.u32(); // characteristics
      e.u32(); // timeDateStamp
      e.u16(); // major
      e.u16(); // minor
      const dllNameRva = e.u32();
      e.u32(); // ordinal base
      const numberOfFunctions = e.u32();
      const numberOfNames = e.u32();
      const functionsRva = e.u32();
      const namesRva = e.u32();
      const ordinalsRva = e.u32();
      const dllNameOff = dllNameRva ? rvaToOffset(dllNameRva) : undefined;
      const dllName = dllNameOff !== undefined ? cstrAt(buf, dllNameOff, 512) : undefined;
      if (dllName) notes.push(`导出模块名：${dllName}`);
      if (numberOfFunctions > numberOfNames) {
        notes.push(`有 ${numberOfFunctions - numberOfNames} 个按序号导出的函数（无名）`);
      }
      for (let i = 0; i < Math.min(numberOfNames, 50_000); i++) {
        const namePtrOff = rvaToOffset(namesRva + i * 4);
        const ordOff = rvaToOffset(ordinalsRva + i * 2);
        if (namePtrOff === undefined || ordOff === undefined) break;
        const nameStrRva = buf.readUInt32LE(namePtrOff);
        const ordinalIndex = buf.readUInt16LE(ordOff);
        const funcEntryOff = rvaToOffset(functionsRva + ordinalIndex * 4);
        if (funcEntryOff === undefined) continue;
        const funcRva = buf.readUInt32LE(funcEntryOff);
        const nameOff = rvaToOffset(nameStrRva);
        const name = nameOff !== undefined ? cstrAt(buf, nameOff, 512) : undefined;
        if (!name) continue;
        if (funcRva >= exportDir.rva && funcRva < exportDir.rva + exportDir.size) {
          const fwdOff = rvaToOffset(funcRva);
          const fwd = fwdOff !== undefined ? cstrAt(buf, fwdOff, 512) : undefined;
          if (fwd) notes.push(`导出转发：${name} → ${fwd}`);
          continue;
        }
        exports.push({ name, va: imageBase + funcRva });
      }
    }
  }

  // ---- 其它安全相关目录 ----
  const tlsDir = dirs[9];
  if (tlsDir && tlsDir.rva) notes.push("含 TLS 目录（TLS 回调可在入口点前执行代码）");
  const clrDir = dirs[14];
  if (clrDir && clrDir.rva) notes.push("托管 .NET 程序集（CLR 头存在）");
  const certDir = dirs[4];
  if (certDir && certDir.size > 0) notes.push(`Authenticode 证书表存在（${certDir.size} 字节，未验签）`);
  const resourceDir = dirs[2];
  if (resourceDir && resourceDir.size > 0) notes.push(`资源目录 ${resourceDir.size} 字节`);

  // ---- 调试目录：PDB 路径 ----
  const debugDir = dirs[6];
  if (debugDir && debugDir.rva) {
    let dbgOff = rvaToOffset(debugDir.rva);
    for (let i = 0; dbgOff !== undefined && i < 32; i++, dbgOff += 28) {
      if (dbgOff + 28 > buf.length) break;
      const d = new Cursor(buf, dbgOff, true);
      d.u32(); // characteristics
      d.u32(); // timeDateStamp
      d.u16(); // major
      d.u16(); // minor
      const type = d.u32();
      d.u32(); // sizeOfData
      d.u32(); // addressOfRawData
      const ptrToRaw = d.u32();
      if (type !== 2) continue; // IMAGE_DEBUG_TYPE_CODEVIEW
      if (ptrToRaw + 24 > buf.length) continue;
      const sig = buf.toString("latin1", ptrToRaw, ptrToRaw + 4);
      if (sig !== "RSDS") continue;
      const guidHex = buf.subarray(ptrToRaw + 4, ptrToRaw + 20).toString("hex");
      const age = buf.readUInt32LE(ptrToRaw + 20);
      const pdb = cstrAt(buf, ptrToRaw + 24, 512);
      notes.push(`PDB 路径：${pdb ?? "<不可读>"}（GUID ${guidHex.slice(0, 8)}…，age ${age}）`);
    }
  }

  const maxRawEnd = sections.reduce((m, s) => Math.max(m, s.rawPtr + s.rawSize), 0);
  const overlay = buf.length - maxRawEnd;
  if (overlay > 0) {
    notes.push(`overlay ${overlay} 字节（最后一个节之后的数据${certDir?.size ? "，含证书表" : ""}）`);
  }

  if (timeDateStamp) notes.push(`编译时间戳：${timestampIso(timeDateStamp)}（可被伪造，仅作线索）`);
  const dllFlags = DLL_CHARACTERISTICS.filter(([bit]) => dllCharacteristics & bit).map(([, name]) => name);
  if (characteristics & 0x2000) notes.push("DLL（IMAGE_FILE_DLL）");

  const header: Record<string, string | number | boolean> = {
    machine: MACHINES[machine] ?? `machine_0x${machine.toString(16)}`,
    subsystem: SUBSYSTEMS[subsystem] ?? `subsystem_${subsystem}`,
    timestamp: timestampIso(timeDateStamp),
    imageBase,
    sizeOfImage,
    sizeOfHeaders,
    numberOfSections,
    dllCharacteristics: dllFlags.join(", ") || "none",
    overlayBytes: overlay,
    entryPointRva: hex(entryPointRva),
  };

  return {
    format: is64 ? "PE32+" : "PE32",
    arch: MACHINES[machine] ?? `machine_0x${machine.toString(16)}`,
    bits: is64 ? 64 : 32,
    endian: "little",
    entryPoint: imageBase + entryPointRva,
    imageBase,
    sections: sectionInfos,
    imports,
    exports,
    notes,
    header,
  };
}
