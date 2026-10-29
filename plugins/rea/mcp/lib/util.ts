/**
 * 通用工具：路径解析、样本读取、熵、边界安全的二进制游标、哈希。
 *
 * 分析对象是任意字节序列（可能是畸形文件，也可能被刻意构造成越界读取），
 * 所以每一次读都做边界检查：解析器在单元级别抛错，MCP server 不因此崩溃。
 */
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/** 单次分析样本上限：超过直接拒绝，避免把 MCP 进程内存打爆 */
export const MAX_SAMPLE_BYTES = 256 * 1024 * 1024;

export function resolveTarget(workspace: string, input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) throw new Error("缺少 path");
  return isAbsolute(raw) ? resolve(raw) : resolve(workspace, raw);
}

function statFile(path: string): { size: number; isFile(): boolean } {
  try {
    return statSync(path);
  } catch {
    throw new Error(`文件不存在或不可访问：${path}`);
  }
}

export function readSample(path: string): Buffer {
  const st = statFile(path);
  if (!st.isFile()) throw new Error(`不是普通文件：${path}`);
  if (st.size > MAX_SAMPLE_BYTES) {
    throw new Error(`样本过大（${st.size} 字节，上限 ${MAX_SAMPLE_BYTES} 字节）：${path}`);
  }
  return readFileSync(path);
}

/** 只读文件头（格式识别 / 反汇编这类不需要整份缓冲的场景） */
export function readHead(path: string, bytes = 8192): Buffer {
  const st = statFile(path);
  if (!st.isFile()) throw new Error(`不是普通文件：${path}`);
  const fd = openSync(path, "r");
  try {
    const size = Math.min(bytes, st.size);
    const buf = Buffer.alloc(size);
    const read = readSync(fd, buf, 0, size, 0);
    return read === size ? buf : buf.subarray(0, Math.max(0, read));
  } finally {
    closeSync(fd);
  }
}

/** 区间 Shannon 熵（bit/byte）；空区间返回 0 */
export function entropy(buf: Buffer, start = 0, end = buf.length): number {
  const from = Math.max(0, start);
  const to = Math.min(buf.length, end);
  const n = to - from;
  if (n <= 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = from; i < to; i++) counts[buf[i]]++;
  let h = 0;
  for (let i = 0; i < 256; i++) {
    if (counts[i] === 0) continue;
    const p = counts[i] / n;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 1000) / 1000;
}

export function hex(n: number | bigint): string {
  return typeof n === "bigint" ? `0x${n.toString(16)}` : `0x${n.toString(16)}`;
}

export function hashAll(buf: Buffer): { md5: string; sha1: string; sha256: string } {
  return {
    md5: createHash("md5").update(buf).digest("hex"),
    sha1: createHash("sha1").update(buf).digest("hex"),
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

export function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** 可打印预览：非打印字节显示为 . */
export function printablePreview(buf: Buffer, max = 96): string {
  const n = Math.min(buf.length, max);
  let s = "";
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    s += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".";
  }
  return s;
}

export function toHexBytes(buf: Buffer, max = 64): string {
  return Array.from(buf.subarray(0, max), (b) => b.toString(16).padStart(2, "0")).join(" ");
}

export function align(n: number, a: number): number {
  return a <= 1 ? n : Math.ceil(n / a) * a;
}

export function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** 边界安全的二进制游标：越界一律抛带偏移的错误，不返回 undefined */
export class Cursor {
  readonly buf: Buffer;
  pos: number;
  readonly le: boolean;

  constructor(buf: Buffer, pos = 0, le = true) {
    this.buf = buf;
    this.pos = pos;
    this.le = le;
  }

  private need(n: number): void {
    if (this.pos < 0 || this.pos + n > this.buf.length) {
      throw new Error(
        `越界读取：偏移 0x${this.pos.toString(16)} 需要 ${n} 字节，文件只有 ${this.buf.length} 字节`,
      );
    }
  }

  seek(pos: number): void {
    if (pos < 0 || pos > this.buf.length) throw new Error(`非法偏移：0x${pos.toString(16)}`);
    this.pos = pos;
  }

  skip(n: number): void {
    this.seek(this.pos + n);
  }

  at(pos: number): Cursor {
    if (pos < 0 || pos > this.buf.length) throw new Error(`非法偏移：0x${pos.toString(16)}`);
    return new Cursor(this.buf, pos, this.le);
  }

  u8(): number {
    this.need(1);
    return this.buf[this.pos++];
  }

  u16(): number {
    this.need(2);
    const v = this.le ? this.buf.readUInt16LE(this.pos) : this.buf.readUInt16BE(this.pos);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.le ? this.buf.readUInt32LE(this.pos) : this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }

  u64(): number {
    this.need(8);
    const v = this.le ? this.buf.readBigUInt64LE(this.pos) : this.buf.readBigUInt64BE(this.pos);
    this.pos += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`64 位值超出安全整数范围：0x${v.toString(16)}`);
    return Number(v);
  }

  u64big(): bigint {
    this.need(8);
    const v = this.le ? this.buf.readBigUInt64LE(this.pos) : this.buf.readBigUInt64BE(this.pos);
    this.pos += 8;
    return v;
  }

  bytes(n: number): Buffer {
    this.need(n);
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** 定长字符串：截到第一个 NUL */
  fixed(n: number): string {
    const raw = this.bytes(n);
    const end = raw.indexOf(0);
    return raw.toString("latin1", 0, end === -1 ? raw.length : end);
  }

  /** NUL 结尾字符串（最多 max 字节，超长截断） */
  cstr(max = 4096): string {
    const start = this.pos;
    const limit = Math.min(this.buf.length, start + max);
    let end = start;
    while (end < limit && this.buf[end] !== 0) end++;
    const s = this.buf.toString("latin1", start, end);
    this.pos = Math.min(this.buf.length, end + 1);
    return s;
  }
}

/** 从 buf 的某个绝对偏移读 NUL 结尾字符串；越界返回 undefined */
export function cstrAt(buf: Buffer, offset: number, max = 4096): string | undefined {
  if (offset < 0 || offset >= buf.length) return undefined;
  const limit = Math.min(buf.length, offset + max);
  let end = offset;
  while (end < limit && buf[end] !== 0) end++;
  return buf.toString("latin1", offset, end);
}
