/**
 * 反汇编：调用系统 objdump，并**自己做地址过滤**。
 *
 * 为什么不用 --start-address / --disassemble-symbols：Apple 自带 llvm-objdump 对
 * Mach-O 会静默忽略这些选项，输出整节反汇编——直接交出去会让 agent 以为那个函数存在。
 * 所以这里：符号先查符号表拿地址 → 流式读 objdump 输出 → 按 [start, stop) 与节名过滤
 * → 凑够 limit 条立刻杀掉子进程（大二进制不会把输出和内存打爆）。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SniffResult } from "./sniff";

export type DisasmOptions = {
  start?: number;
  stop?: number;
  symbol?: string;
  section?: string;
  arch?: string;
  limit: number;
};

export type DisasmResult = {
  tool: string;
  command: string;
  instructions: string[];
  instructionCount: number;
  /** 达到 limit 提前停止：目标范围里可能还有更多指令 */
  truncated: boolean;
  /** 输出里出现过的节（便于纠正 section 拼写） */
  sectionsSeen: string[];
  notes: string[];
};

type Tool = { path: string; llvm: boolean };

function findObjdump(): Tool | undefined {
  const candidates: string[] = [];
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir) candidates.push(join(dir, "objdump"));
  }
  candidates.push("/usr/bin/objdump", "/usr/local/bin/objdump", "/opt/homebrew/bin/objdump", "/opt/local/bin/objdump");

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const v = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 5000 });
    return { path: candidate, llvm: /llvm|apple/i.test(`${v.stdout ?? ""}${v.stderr ?? ""}`) };
  }
  return undefined;
}

/** 地址参数：支持 "0x1a2b"、"1a2b"（十六进制）与十进制数字 */
export function parseAddr(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new Error(`非法地址：${input}`);
    return Math.trunc(input);
  }
  const s = String(input).trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return Number.parseInt(s.slice(2), 16);
  if (/^[0-9a-f]+$/i.test(s) && /[a-f]/i.test(s)) return Number.parseInt(s, 16);
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10);
  throw new Error(`无法解析地址 "${s}"：用 0x 前缀或纯十六进制（含 a-f）/ 十进制`);
}

/** 符号表：名字 → 地址。列不出来（工具不支持 / 已剥离）返回 undefined */
function listSymbols(tool: Tool, path: string, isMachO: boolean, arch: string | undefined): Map<string, number> | undefined {
  const args: string[] = [];
  if (isMachO) args.push("--macho");
  args.push(tool.llvm ? "--syms" : "-t");
  if (arch) args.push(tool.llvm ? `--arch=${arch}` : `-m${arch}`);
  args.push(path);
  const r = spawnSync(tool.path, args, { encoding: "utf8", timeout: 10_000, maxBuffer: 32 * 1024 * 1024 });
  if (r.error || r.status !== 0) return undefined;

  const syms = new Map<string, number>();
  for (const line of (r.stdout ?? "").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("SYMBOL TABLE") || /\(architecture /.test(t) || t.endsWith(":")) continue;
    if (t.includes("*UND*")) continue; // 未定义符号没有代码地址
    const parts = t.split(/\s+/);
    if (parts.length < 3) continue;
    const addr = /^[0-9a-f]+$/i.test(parts[0]) ? Number.parseInt(parts[0], 16) : NaN;
    const name = parts[parts.length - 1];
    if (!Number.isFinite(addr) || !name) continue;
    syms.set(name, addr);
  }
  return syms.size > 0 ? syms : undefined;
}

type Filter = {
  start?: number;
  stop?: number;
  section?: string;
  limit: number;
};

type StreamResult = {
  instructions: string[];
  sectionsSeen: string[];
  truncated: boolean;
  stderr: string;
  timedOut: boolean;
  rawHead: string;
};

const SECTION_MARKERS = [/^\(([^)]+)\) section\s*$/, /^Disassembly of section (.+):\s*$/, /^([.\w-]+) section\s*$/];
const LABEL_RE = /^([A-Za-z_.$][\w.$@]*):\s*$/;
const INSTR_RE = /^\s*([0-9a-f]{1,16}):\s(.*)$/;
const GNU_LABEL_RE = /^([0-9a-f]{1,16})\s+<([^>]+)>:\s*$/;

function streamFiltered(cmd: string, args: string[], filter: Filter): Promise<StreamResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const instructions: string[] = [];
    const sectionsSeen: string[] = [];
    let stderr = "";
    let buf = "";
    let currentSection: string | undefined;
    let pendingLabel: string | undefined;
    let kept = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let rawHead = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        child.kill("SIGKILL");
      } catch {
        /* 已退出 */
      }
      resolve({ instructions, sectionsSeen, truncated, stderr: stderr.trim(), timedOut, rawHead });
    };

    const handleLine = (raw: string): void => {
      const line = raw.trimEnd();
      if (rawHead.length < 2000) rawHead += `${raw}\n`;

      for (const re of SECTION_MARKERS) {
        const m = line.trim().match(re);
        if (m) {
          currentSection = m[1];
          pendingLabel = undefined;
          if (!sectionsSeen.includes(currentSection)) sectionsSeen.push(currentSection);
          return;
        }
      }

      const gnuLabel = line.trim().match(GNU_LABEL_RE);
      if (gnuLabel) {
        pendingLabel = `${gnuLabel[2]}:`;
        return;
      }

      const label = line.trim().match(LABEL_RE);
      if (label) {
        if (filter.start !== undefined && filter.stop === undefined && kept > 0) {
          // 没有可用的结束地址时，用下一个标签当函数边界（局部标签可能提前截断，故仅兜底）
          finish();
          return;
        }
        // 标签只作为「下一条指令属于谁」的上下文，等真正命中指令时再带上
        pendingLabel = label[0].trim();
        return;
      }

      if (line.trim() === "...") {
        // llvm-objdump 用 "..." 表示被跳过的零填充区，保留这个标记
        if (kept < filter.limit) instructions.push("...");
        return;
      }

      const ins = line.match(INSTR_RE);
      if (!ins) return;
      if (filter.section && !(currentSection && currentSection.includes(filter.section))) return;
      const addr = Number.parseInt(ins[1], 16);
      if (filter.start !== undefined && addr < filter.start) return;
      if (filter.stop !== undefined && addr >= filter.stop) {
        finish();
        return;
      }
      if (kept === 0 && pendingLabel) {
        instructions.push(pendingLabel);
        pendingLabel = undefined;
      }
      if (kept < filter.limit) {
        instructions.push(line.trimStart());
        kept++;
      }
      if (kept >= filter.limit) {
        truncated = true;
        finish();
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (settled) return;
      buf += chunk;
      let idx: number;
      while (!settled && (idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        handleLine(line);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 8000) stderr += chunk;
    });
    child.on("error", (err) => {
      stderr += `\n${err.message}`;
      finish();
    });
    child.on("close", () => {
      if (!settled) {
        if (buf) handleLine(buf);
        finish();
      }
    });
    timer = setTimeout(() => {
      timedOut = true;
      finish();
    }, 30_000);
  });
}

export async function disassemble(
  path: string,
  sniffed: SniffResult,
  opts: DisasmOptions,
): Promise<DisasmResult> {
  const tool = findObjdump();
  if (!tool) {
    throw new Error(
      "找不到 objdump。macOS 安装 Xcode Command Line Tools（xcode-select --install）即可获得；" +
        "Linux 用 binutils（apt install binutils / dnf install binutils）。",
    );
  }
  const isMachO = sniffed.kind === "macho" || sniffed.kind === "fat-macho";
  const notes: string[] = [`objdump：${tool.path}（${tool.llvm ? "LLVM" : "GNU"}）`];

  // 符号 → 地址；顺带拿「下一个符号」当函数结束上界
  let start = opts.start;
  let stop = opts.stop;
  let symbolResolved: { name: string; addr: number } | undefined;
  if (opts.symbol) {
    const syms = listSymbols(tool, path, isMachO, opts.arch);
    if (!syms) {
      notes.push("符号表为空或无法列出（已剥离？）：无法按符号定位，改传 start/stop 地址范围");
    } else {
      let symbol = opts.symbol;
      if (!syms.has(symbol)) {
        if (isMachO && syms.has(`_${symbol}`)) {
          notes.push(`符号自动补前导下划线：${symbol} → _${symbol}`);
          symbol = `_${symbol}`;
        } else {
          const needle = symbol.toLowerCase().replace(/^_+/, "");
          const similar = [...syms.keys()]
            .filter((s) => s.toLowerCase().replace(/^_+/, "").includes(needle))
            .slice(0, 12);
          throw new Error(
            `符号 "${symbol}" 不在符号表里` +
              (similar.length ? `；相近符号：${similar.join(", ")}` : "（没有名字相近的符号）") +
              "。可改用 start/stop 地址范围（VA），节地址范围见 rea_sections。",
          );
        }
      }
      const addr = syms.get(symbol)!;
      symbolResolved = { name: symbol, addr };
      if (start === undefined || start > addr) start = addr;
      if (stop === undefined) {
        const next = [...syms.values()].filter((v) => v > addr).sort((a, b) => a - b)[0];
        if (next !== undefined) stop = next;
      }
    }
  }

  const args: string[] = [];
  if (isMachO) args.push("--macho");
  // 指定节时用 -D：macOS 的 llvm-objdump 对 Mach-O 会忽略 --section，
  // 只有 -D 会把 __stubs 等非 __text 的节也反汇编出来（本插件再按节标记过滤）
  args.push(opts.section ? "-D" : "-d");
  if (opts.arch) args.push(tool.llvm ? `--arch=${opts.arch}` : `-m${opts.arch}`);
  args.push(path);

  const result = await streamFiltered(tool.path, args, {
    ...(start !== undefined ? { start } : {}),
    ...(stop !== undefined ? { stop } : {}),
    ...(opts.section ? { section: opts.section } : {}),
    limit: opts.limit,
  });

  if (isMachO) notes.push("Mach-O 符号名通常带前导下划线（C 函数 main 在符号表里是 _main）");
  notes.push("地址是虚拟地址（VA），不是文件偏移；节地址范围见 rea_sections");
  notes.push("地址过滤在本插件内完成：macOS 的 llvm-objdump 对 Mach-O 会忽略 --start-address");
  if (symbolResolved) {
    notes.push(
      `符号定位：${symbolResolved.name} @ 0x${symbolResolved.addr.toString(16)}` +
        (stop !== undefined ? `，上界 0x${stop.toString(16)}（下一个符号）` : ""),
    );
  }
  if (result.timedOut) notes.push("反汇编超时（30 秒）已中断");
  if (result.stderr) notes.push(`objdump 警告/错误：${result.stderr.split("\n").slice(0, 5).join(" | ")}`);

  if (result.instructions.length === 0) {
    const sectionHint = result.sectionsSeen.length
      ? `输出里出现过的节：${result.sectionsSeen.slice(0, 10).join("、")}`
      : "没有看到任何节标记";
    throw new Error(
      "没有反汇编出任何指令。" +
        (opts.section ? `section="${opts.section}" 里没有可反汇编的指令。` : "") +
        (isMachO
          ? "macOS 的 objdump / otool 只反汇编 Mach-O 的 __TEXT,__text：__stubs、__const 等节取不到，需要 IDA / Hopper / Ghidra 这类工具。"
          : "用 start/stop（VA）缩小范围，或换 symbol。") +
        `（${sectionHint}）`,
    );
  }

  return {
    tool: tool.path,
    command: [tool.path, ...args].join(" "),
    instructions: result.instructions,
    instructionCount: result.instructions.filter((l) => INSTR_RE.test(l)).length,
    truncated: result.truncated,
    sectionsSeen: result.sectionsSeen,
    notes,
  };
}
