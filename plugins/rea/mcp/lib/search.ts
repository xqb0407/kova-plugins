/**
 * 字节模式搜索：hex / ascii / utf16le 三种模式。
 *
 * ascii 模式默认区分大小写；caseSensitive=false 时对大文件做小写副本（上限 64 MiB，
 * 超过则退化为区分大小写并在结果里说明），避免为了搜索再复制一份 256 MiB。
 */
import { printablePreview, toHexBytes } from "./util";

export type SearchMode = "hex" | "ascii" | "utf16le";

export type SearchHit = {
  offset: number;
  /** 命中处前后的原始字节（hex） */
  contextHex: string;
  /** 同上的可打印预览 */
  contextText: string;
};

export type SearchOptions = {
  limit: number;
  contextBytes: number;
  caseSensitive: boolean;
};

const MAX_CASE_INSENSITIVE_BYTES = 64 * 1024 * 1024;

export function parseHexPattern(input: string): Buffer {
  const cleaned = input.replace(/0x/gi, "").replace(/[\s,;:_-]/g, "");
  if (!cleaned) throw new Error("hex 模式需要偶数长度的十六进制串，例如 \"48 89 e5\"");
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) throw new Error(`hex 模式含非法字符：${input}`);
  if (cleaned.length % 2 !== 0) throw new Error(`hex 串长度必须为偶数（当前 ${cleaned.length} 位）`);
  return Buffer.from(cleaned, "hex");
}

export function utf16lePattern(input: string, le = true): Buffer {
  const out = Buffer.alloc(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (le) {
      out[i * 2] = code & 0xff;
      out[i * 2 + 1] = (code >> 8) & 0xff;
    } else {
      out[i * 2] = (code >> 8) & 0xff;
      out[i * 2 + 1] = code & 0xff;
    }
  }
  return out;
}

function findAll(haystack: Buffer, needle: Buffer, limit: number, contextBytes: number): SearchHit[] {
  const hits: SearchHit[] = [];
  if (needle.length === 0) return hits;
  let from = 0;
  while (hits.length < limit) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    const ctxStart = Math.max(0, idx - contextBytes);
    const ctxEnd = Math.min(haystack.length, idx + needle.length + contextBytes);
    const ctx = haystack.subarray(ctxStart, ctxEnd);
    hits.push({
      offset: idx,
      contextHex: toHexBytes(ctx, 128),
      contextText: printablePreview(ctx, 128),
    });
    from = idx + 1;
  }
  return hits;
}

export function searchBuffer(buf: Buffer, needle: Buffer, opts: SearchOptions): { hits: SearchHit[]; note?: string } {
  if (opts.caseSensitive) {
    return { hits: findAll(buf, needle, opts.limit, opts.contextBytes) };
  }
  const lowerNeedle = Buffer.from(needle.toString("latin1").toLowerCase(), "latin1");
  if (buf.length > MAX_CASE_INSENSITIVE_BYTES) {
    return {
      hits: findAll(buf, needle, opts.limit, opts.contextBytes),
      note: `样本 ${buf.length} 字节超过不区分大小写的 ${MAX_CASE_INSENSITIVE_BYTES} 字节上限，已按区分大小写搜索`,
    };
  }
  const lowerHay = Buffer.from(buf.toString("latin1").toLowerCase(), "latin1");
  return { hits: findAll(lowerHay, lowerNeedle, opts.limit, opts.contextBytes) };
}
