/**
 * ADB 封装：找 adb、列设备、选设备、跑命令。
 *
 * 设计约束：
 * - adb 由用户安装（Android Platform Tools），插件不打包二进制；缺失时给安装指引；
 * - 设备选择必须明确：0 台 / 多台都直接报错，绝不猜一台去点；
 * - shell 命令作为单个参数传给 `adb shell`，本地不经过 shell，设备侧再做引号处理。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export class AdbError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "AdbError";
    this.hint = hint;
  }
}

export const ADB_INSTALL_HINT =
  "安装 Android Platform Tools：macOS `brew install android-platform-tools`；" +
  "其它平台从 https://developer.android.com/tools/releases/platform-tools 下载后把 platform-tools 加入 PATH。" +
  "装好后用 USB 连接手机，打开「开发者选项 → USB 调试」，在手机上点允许。";

export type Device = {
  serial: string;
  state: string;
  model?: string;
  product?: string;
  device?: string;
  transportId?: string;
};

/** 找 adb：ADB_PATH → PATH → 各平台常见 SDK 位置 */
export function findAdb(): string | undefined {
  const env = process.env.ADB_PATH?.trim();
  if (env) return env;
  const exe = process.platform === "win32" ? "adb.exe" : "adb";
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    if (existsSync(candidate)) return candidate;
  }
  const home = homedir();
  const candidates =
    process.platform === "darwin"
      ? [join(home, "Library/Android/sdk/platform-tools/adb"), "/opt/homebrew/bin/adb", "/usr/local/bin/adb"]
      : process.platform === "win32"
        ? [join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Android", "Sdk", "platform-tools", "adb.exe")]
        : [join(home, "Android/Sdk/platform-tools/adb"), "/usr/bin/adb", "/usr/local/bin/adb"];
  return candidates.find((p) => existsSync(p));
}

export function requireAdb(): string {
  const adb = findAdb();
  if (!adb) throw new AdbError("找不到 adb（Android Platform Tools）。", ADB_INSTALL_HINT);
  return adb;
}

function spawnError(err: NodeJS.ErrnoException, adb: string, timeoutMs: number): AdbError {
  if (err.code === "ETIMEDOUT") {
    return new AdbError(`adb 命令超时（${timeoutMs}ms）：设备可能锁屏、无响应，或正在等授权`, "唤醒并解锁手机后重试");
  }
  if (err.code === "ENOENT") return new AdbError(`adb 不可执行：${adb}`, ADB_INSTALL_HINT);
  return new AdbError(`执行 adb 失败：${err.message}`);
}

export function runText(
  adb: string,
  args: string[],
  timeoutMs = 15_000,
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(adb, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  if (r.error) throw spawnError(r.error as NodeJS.ErrnoException, adb, timeoutMs);
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? -1 };
}

export function runBuffer(
  adb: string,
  args: string[],
  timeoutMs = 30_000,
): { buffer: Buffer; stderr: string; status: number } {
  const r = spawnSync(adb, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw spawnError(r.error as NodeJS.ErrnoException, adb, timeoutMs);
  return { buffer: Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.alloc(0), stderr: (r.stderr ?? "").toString(), status: r.status ?? -1 };
}

export function listDevices(adb: string): Device[] {
  const r = runText(adb, ["devices", "-l"], 10_000);
  if (r.status !== 0) {
    throw new AdbError(`adb devices 失败：${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  }
  const devices: Device[] = [];
  for (const line of r.stdout.split("\n").slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*")) continue;
    const parts = trimmed.split(/\s+/);
    const [serial, state] = parts;
    if (!serial || !state) continue;
    const extra: Record<string, string> = {};
    for (const token of parts.slice(2)) {
      const idx = token.indexOf(":");
      if (idx > 0) extra[token.slice(0, idx)] = token.slice(idx + 1);
    }
    devices.push({
      serial,
      state,
      ...(extra.model ? { model: extra.model.replace(/_/g, " ") } : {}),
      ...(extra.product ? { product: extra.product } : {}),
      ...(extra.device ? { device: extra.device } : {}),
      ...(extra.transport_id ? { transportId: extra.transport_id } : {}),
    });
  }
  return devices;
}

/** 选设备：显式 serial 优先，否则要求“恰好一台在线” */
export function pickDevice(adb: string, serial?: string): Device {
  const devices = listDevices(adb);
  const online = devices.filter((d) => d.state === "device");
  const wanted = serial?.trim();
  if (wanted) {
    const hit = devices.find((d) => d.serial === wanted);
    if (!hit) {
      throw new AdbError(
        `找不到设备 "${wanted}"。`,
        devices.length ? `当前设备：${devices.map((d) => `${d.serial}（${d.state}）`).join(", ")}` : "当前没有任何已连接设备",
      );
    }
    if (hit.state !== "device") {
      throw new AdbError(
        `设备 ${wanted} 当前状态是 ${hit.state}，不能操作。`,
        hit.state === "unauthorized"
          ? "在手机上勾选「始终允许此电脑的 USB 调试」并点允许，然后重试"
          : "重新插拔 USB，或 `adb reconnect` 后再试",
      );
    }
    return hit;
  }
  if (online.length === 1) return online[0];
  if (online.length === 0) {
    const unauthorized = devices.filter((d) => d.state === "unauthorized");
    throw new AdbError(
      "没有可用于操作的 Android 设备。",
      unauthorized.length
        ? "设备未授权：解锁手机，在 USB 调试弹窗里点「允许」"
        : "用 USB 连接手机并打开「开发者选项 → USB 调试」；或先 `adb connect <ip:端口>` 连无线调试",
    );
  }
  throw new AdbError(
    `检测到 ${online.length} 台在线设备，请用 serial 指定。`,
    `可选：${online.map((d) => d.serial).join(", ")}`,
  );
}

export function shell(adb: string, serial: string, command: string, timeoutMs = 15_000) {
  return runText(adb, ["-s", serial, "shell", command], timeoutMs);
}

export function execOut(adb: string, serial: string, args: string[], timeoutMs = 30_000) {
  return runBuffer(adb, ["-s", serial, "exec-out", ...args], timeoutMs);
}

export function getProp(adb: string, serial: string, name: string): string | undefined {
  try {
    const r = shell(adb, serial, `getprop ${name}`, 5_000);
    const value = r.stdout.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}
