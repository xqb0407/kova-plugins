/**
 * PNG 工具：校验、读尺寸、等比缩放、落盘。
 *
 * 零依赖：解码只覆盖 screencap 的产出形态（8-bit、非隔行、色型 0/2/4/6），
 * 其它形态抛 PngUnsupportedError，调用方按原样透传（宿主对 >2MiB 图片有自己的归一化）。
 * 缩放用盒子平均（box sampling）：比最近邻平滑，实现也短。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

export class PngUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PngUnsupportedError";
  }
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(SIGNATURE);
}

/** 从 IHDR 读尺寸；不是 PNG 或结构异常返回 undefined */
export function pngSize(buf: Buffer): { width: number; height: number } | undefined {
  if (!isPng(buf) || buf.length < 24) return undefined;
  if (buf.readUInt32BE(8) !== 13 || buf.toString("ascii", 12, 16) !== "IHDR") return undefined;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return undefined;
  return { width, height };
}

/* ------------------------------------------------------------------ */
/* CRC32 与块写入                                                       */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/* ------------------------------------------------------------------ */
/* 解码（去滤波）                                                       */
/* ------------------------------------------------------------------ */

type DecodedPng = { width: number; height: number; channels: number; pixels: Buffer };

function paethPredict(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf: Buffer): DecodedPng {
  if (!isPng(buf)) throw new Error("不是 PNG 数据");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }
  if (!width || !height) throw new Error("PNG 缺少 IHDR 或尺寸为 0");
  if (bitDepth !== 8) throw new PngUnsupportedError(`不支持的 PNG 位深 ${bitDepth}`);
  if (interlace !== 0) throw new PngUnsupportedError("不支持的隔行 PNG");
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (!channels) throw new PngUnsupportedError(`不支持的 PNG 色型 ${colorType}（索引色等）`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error("PNG 像素数据不完整");

  const pixels = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[out + x - channels] : 0;
      const up = y > 0 ? pixels[out + x - stride] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[out + x - stride - channels] : 0;
      let value = line[x];
      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + up) & 0xff;
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) value = (value + paethPredict(left, up, upLeft)) & 0xff;
      pixels[out + x] = value;
    }
  }
  return { width, height, channels, pixels };
}

/* ------------------------------------------------------------------ */
/* 编码（filter 0 行 + deflate）                                        */
/* ------------------------------------------------------------------ */

function encodePng(width: number, height: number, channels: number, pixels: Buffer): Buffer {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 1 ? 0 : channels === 2 ? 4 : channels === 3 ? 2 : 6;
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ------------------------------------------------------------------ */
/* 对外能力                                                            */
/* ------------------------------------------------------------------ */

/**
 * 等比缩到最长边 ≤ maxSide；已达尺寸或遇到不支持的 PNG 形态时原样返回
 * （scaled=false 提示调用方）。缩放后不超过 maxSide + 1px（四舍五入）。
 */
export function scalePng(buf: Buffer, maxSide: number): { buffer: Buffer; width: number; height: number; scaled: boolean } {
  const size = pngSize(buf);
  if (!size) throw new Error("不是可解析的 PNG");
  const longest = Math.max(size.width, size.height);
  if (!maxSide || maxSide <= 0 || longest <= maxSide) return { buffer: buf, width: size.width, height: size.height, scaled: false };
  try {
    const src = decodePng(buf);
    const ratio = maxSide / longest;
    const tw = Math.max(1, Math.round(size.width * ratio));
    const th = Math.max(1, Math.round(size.height * ratio));
    const dst = Buffer.alloc(tw * th * src.channels);
    for (let ty = 0; ty < th; ty++) {
      const sy0 = Math.floor((ty * src.height) / th);
      const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * src.height) / th));
      for (let tx = 0; tx < tw; tx++) {
        const sx0 = Math.floor((tx * src.width) / tw);
        const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * src.width) / tw));
        const out = (ty * tw + tx) * src.channels;
        for (let ch = 0; ch < src.channels; ch++) {
          let sum = 0;
          let count = 0;
          for (let sy = sy0; sy < sy1; sy++) {
            for (let sx = sx0; sx < sx1; sx++) {
              sum += src.pixels[(sy * src.width + sx) * src.channels + ch];
              count++;
            }
          }
          dst[out + ch] = Math.round(sum / count);
        }
      }
    }
    return { buffer: encodePng(tw, th, src.channels, dst), width: tw, height: th, scaled: true };
  } catch (err) {
    if (err instanceof PngUnsupportedError) return { buffer: buf, width: size.width, height: size.height, scaled: false };
    throw err;
  }
}

/** 相对路径按工作区收拢；绝对路径按用户指定原样使用 */
export function resolveWorkspacePath(workspace: string, target: string): string {
  if (isAbsolute(target)) return resolve(target);
  return resolve(resolve(workspace), target);
}

export function saveImage(workspace: string, savePath: string, buf: Buffer): string {
  const path = resolveWorkspacePath(workspace, savePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return path;
}
