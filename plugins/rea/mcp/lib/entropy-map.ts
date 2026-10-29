/**
 * 分块熵扫描：定位压缩/加密/打包区。
 *
 * 高熵不等于恶意（图片、字体、压缩资源同样高熵），但「代码段之外的连续高熵区」
 * 是加壳、内嵌载荷、加密配置的强线索。相邻高熵块合并成区间，方便直接跳到偏移看。
 */
import { entropy } from "./util";

export type EntropyRange = {
  offset: number;
  size: number;
  /** 区间整体的熵 */
  entropy: number;
  /** 区间内单块最高熵 */
  maxEntropy: number;
  blocks: number;
};

export type EntropyMap = {
  blockSize: number;
  totalBlocks: number;
  flaggedBlocks: number;
  overallEntropy: number;
  ranges: EntropyRange[];
};

export function entropyMap(
  buf: Buffer,
  opts: { blockSize: number; threshold: number; maxRanges: number },
): EntropyMap {
  const blockSize = Math.max(256, Math.min(1024 * 1024, opts.blockSize));
  const threshold = Math.max(4, Math.min(8, opts.threshold));
  const totalBlocks = Math.ceil(buf.length / blockSize);
  const ranges: EntropyRange[] = [];

  let current: EntropyRange | undefined;
  let flaggedBlocks = 0;

  for (let i = 0; i < totalBlocks; i++) {
    const start = i * blockSize;
    const end = Math.min(buf.length, start + blockSize);
    if (end <= start) break;
    const h = entropy(buf, start, end);
    if (h >= threshold) {
      flaggedBlocks++;
      if (!current) {
        current = { offset: start, size: end - start, entropy: h, maxEntropy: h, blocks: 1 };
      } else if (current.offset + current.size === start) {
        current.size += end - start;
        current.blocks += 1;
        current.maxEntropy = Math.max(current.maxEntropy, h);
      } else {
        ranges.push(current);
        current = { offset: start, size: end - start, entropy: h, maxEntropy: h, blocks: 1 };
      }
    } else if (current) {
      ranges.push(current);
      current = undefined;
    }
  }
  if (current) ranges.push(current);

  for (const r of ranges) {
    r.entropy = entropy(buf, r.offset, r.offset + r.size);
  }
  ranges.sort((a, b) => b.size - a.size);

  return {
    blockSize,
    totalBlocks,
    flaggedBlocks,
    overallEntropy: entropy(buf),
    ranges: ranges.slice(0, Math.max(1, opts.maxRanges)),
  };
}
