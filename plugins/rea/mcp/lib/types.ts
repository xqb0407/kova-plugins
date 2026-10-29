/** 三个格式解析器共用的统一模型：上层工具只认这些形状，不再区分 Mach-O / PE / ELF。 */

export type SectionInfo = {
  name: string;
  /** Mach-O 的段名 / PE 的节所属无段概念 / ELF 无（保留字段） */
  segment?: string;
  /** 虚拟地址 */
  va: number;
  /** 虚拟大小 */
  vsize: number;
  /** 文件内偏移；0 表示纯内存段（如 bss / zerofill） */
  offset: number;
  /** 文件内字节数 */
  size: number;
  /** 该节在文件中的熵；零填充段为 0 */
  entropy: number;
  /** R / W / X 与其它属性 */
  flags: string[];
};

export type ImportInfo = { library: string; name: string };

export type ExportInfo = { name: string; va: number };

export type SliceInfo = {
  arch: string;
  bits: 32 | 64;
  offset: number;
  size: number;
};

export type BinaryInfo = {
  format: string;
  arch: string;
  bits: 32 | 64;
  endian: "little" | "big";
  entryPoint?: number;
  imageBase?: number;
  sections: SectionInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  /** fat 包里的全部切片（非 fat 时为 undefined） */
  slices?: SliceInfo[];
  /** Mach-O：cryptid≠0（App Store 加密二进制） */
  encrypted?: boolean;
  /** 解析过程中观察到的结构化事实：签名、版本、加密、PDB 路径… */
  notes: string[];
  /** 格式特有的原始头部字段（少量、扁平） */
  header: Record<string, string | number | boolean>;
};

export function isWritable(s: SectionInfo): boolean {
  return s.flags.includes("W");
}

export function isExecutable(s: SectionInfo): boolean {
  return s.flags.includes("X");
}
