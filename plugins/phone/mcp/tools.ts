/**
 * phone 工具实现层：11 个工具，围绕「截图 → 控件树 → 操作 → 再截图」闭环。
 *
 * 设计取舍（DESIGN.md §4/§6/§7）：
 * - selector 优先于坐标：tap/long_press 先 dump 匹配、取中心点再操作；
 *   0 个或多个命中都直接报错不猜，避免误触；
 * - 不提供 shell 工具：不开 `adb shell` 后门，需要的信息用专门工具取；
 * - 包名/Activity 进入设备侧 shell 命令前做字符白名单校验，防注入；
 * - 中文输入走 ADBKeyboard 的 ADB_INPUT_B64 广播；缺失时报错给安装指引，不静默丢字；
 * - UI 树输出为紧凑文本行，按字节预算截断（宿主文本结果上限 8KB/1000 行）。
 */
import {
  AdbError,
  ADB_INSTALL_HINT,
  findAdb,
  listDevices,
  pickDevice,
  requireAdb,
  runText,
  shell,
  execOut,
  getProp,
  type Device,
} from "./lib/adb";
import {
  currentIme,
  dumpUi,
  findNodes,
  foregroundPackage,
  hasAdbKeyboard,
  hasSelector,
  screenSize,
  type Selector,
  type UiNode,
} from "./lib/ui";
import { isPng, pngSize, saveImage, scalePng } from "./lib/image";

export type ToolCtx = { workspace: string };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (args: Record<string, any>, ctx: ToolCtx) => unknown | Promise<unknown>;
};

/* ------------------------------------------------------------------ */
/* 参数小工具                                                           */
/* ------------------------------------------------------------------ */

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function int(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.round(v);
}

function float(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function selectorOf(args: Record<string, unknown>): Selector {
  return { text: str(args, "text"), desc: str(args, "desc"), id: str(args, "id") };
}

function describeSelector(selector: Selector): string {
  return (
    [selector.text && `text~"${selector.text}"`, selector.desc && `desc~"${selector.desc}"`, selector.id && `id~"${selector.id}"`]
      .filter(Boolean)
      .join(" AND ") || "(空)"
  );
}

/** 同步休眠：Atomics.wait 阻塞主线程但不空转 CPU（Bun 支持） */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* 环境不支持 Atomics.wait 时退化为忙等 */
    }
  }
}

const PACKAGE_RE = /^[A-Za-z0-9_.]+$/;
const ACTIVITY_RE = /^[A-Za-z0-9_.$]+$/;

function requirePackage(pkg: string): string {
  if (!PACKAGE_RE.test(pkg)) throw new AdbError(`包名不合法："${pkg}"。`, "包名形如 com.example.app（字母数字点下划线）");
  return pkg;
}

function requireActivity(activity: string): string {
  if (!ACTIVITY_RE.test(activity)) throw new AdbError(`Activity 名不合法："${activity}"。`, "Activity 形如 .MainActivity 或 com.example.app.MainActivity");
  return activity;
}

function target(args: Record<string, unknown>): { adb: string; device: Device } {
  const adb = requireAdb();
  const device = pickDevice(adb, str(args, "serial"));
  return { adb, device };
}

/**
 * 坐标软校验：`wm size` 报的是自然方向的尺寸，横屏时输入坐标系跟着旋转，
 * 所以点只要能落进任一方向（w×h 或 h×w）就放行；两个方向都装不下才算越界。
 */
function checkOnScreen(screenText: string | undefined, x: number, y: number): void {
  if (!screenText) return;
  const m = screenText.match(/^(\d+)x(\d+)$/);
  if (!m) return;
  const w = Number(m[1]);
  const h = Number(m[2]);
  const inRange = x >= 0 && y >= 0;
  const fitsPortrait = inRange && x <= w && y <= h;
  const fitsLandscape = inRange && x <= h && y <= w;
  if (!fitsPortrait && !fitsLandscape) {
    throw new AdbError(
      `坐标 (${x},${y}) 超出屏幕 ${screenText}（横竖屏两个方向都装不下）。`,
      "坐标应来自 phone__ui 输出的 center，或截图上的实际位置",
    );
  }
}

async function screenTextOf(adb: string, serial: string): Promise<string | undefined> {
  const s = screenSize(adb, serial);
  return s ? `${s.width}x${s.height}` : undefined;
}

/* ------------------------------------------------------------------ */
/* UI 树的紧凑文本行                                                    */
/* ------------------------------------------------------------------ */

/** 渲染一个节点为一行；只带对操作有用的字段 */
function nodeLine(index: number, n: UiNode): string {
  const parts = [`#${index}`];
  // XML 属性里解码出的控制字符（如 &#10;）会破坏一行一条的格式，先压平
  if (n.text) parts.push(`text="${n.text.replace(/\s+/g, " ").trim()}"`);
  if (n.desc) parts.push(`desc="${n.desc.replace(/\s+/g, " ").trim()}"`);
  if (n.id) parts.push(`id=${n.id}`);
  if (n.cls) parts.push(`cls=${n.cls}`);
  parts.push(`center=(${n.center[0]},${n.center[1]})`);
  if (n.clickable) parts.push("clickable");
  if (n.scrollable) parts.push("scrollable");
  if (!n.enabled) parts.push("disabled");
  if (n.checked !== undefined) parts.push(n.checked ? "checked" : "unchecked");
  if (n.selected) parts.push("selected");
  if (n.focused) parts.push("focused");
  return parts.join(" ");
}

/**
 * 紧凑行集：默认 80 条 + 6.5KB 字节预算双保险（序列化后宿主还有 8KB/1000 行上限）。
 */
function renderNodes(nodes: UiNode[], limit: number): { lines: string[]; shown: number; truncated: boolean } {
  const cap = clamp(limit, 1, 200);
  const budget = 6_500;
  const lines: string[] = [];
  let bytes = 0;
  for (let i = 0; i < Math.min(nodes.length, cap); i++) {
    const line = nodeLine(i, nodes[i]);
    if (bytes + line.length > budget && lines.length > 0) {
      return { lines, shown: lines.length, truncated: true };
    }
    lines.push(line);
    bytes += line.length + 1;
  }
  return { lines, shown: lines.length, truncated: lines.length < nodes.length };
}

function compactHit(node: UiNode): Record<string, unknown> {
  const out: Record<string, unknown> = { center: node.center, bounds: node.bounds };
  if (node.text) out.text = node.text;
  if (node.desc) out.desc = node.desc;
  if (node.id) out.id = node.id;
  if (node.cls) out.cls = node.cls;
  if (node.clickable) out.clickable = true;
  if (node.scrollable) out.scrollable = true;
  if (!node.enabled) out.disabled = true;
  return out;
}

/* ------------------------------------------------------------------ */
/* observe：动作后随带取回新观察（省一轮调用）                            */
/* ------------------------------------------------------------------ */

type ObserveMode = "none" | "tree" | "screenshot" | "both";

const OBSERVE_MODES: ObserveMode[] = ["none", "tree", "screenshot", "both"];

function parseObserve(args: Record<string, unknown>): ObserveMode {
  const mode = (str(args, "observe") ?? "none") as ObserveMode;
  if (!OBSERVE_MODES.includes(mode)) {
    throw new AdbError(`observe 只支持 none / tree / screenshot / both，收到 "${mode}"。`, "已知下一步时用缺省 none，要验证再带 tree/screenshot/both");
  }
  return mode;
}

type Observation = { screen?: string; total: number; shown: number; truncated: boolean; nodes: string };

/** dump 一次并渲染紧凑观察（默认 40 条，控制在宿主文本上限内） */
function observeTreeNow(adb: string, serial: string, limit = 40): Observation {
  const { nodes } = dumpUi(adb, serial);
  const rendered = renderNodes(nodes, limit);
  const s = screenSize(adb, serial);
  return {
    ...(s ? { screen: `${s.width}x${s.height}` } : {}),
    total: nodes.length,
    shown: rendered.shown,
    truncated: rendered.truncated,
    nodes: rendered.lines.join("\n"),
  };
}

/**
 * 把动作结果按 observe 模式补全：tree 直接嵌进结果（result 已带 observation 时
 * 不重复 dump，text 工具的回读验证共用同一次 dump）；要截图时走 mcpContent 透传
 * （text 元信息在前，image 块在后，与 phone__screenshot 同构）。
 */
function applyObserve(
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  mode: ObserveMode,
  adb: string,
  serial: string,
): Record<string, unknown> {
  const wantTree = mode === "tree" || mode === "both";
  const wantShot = mode === "screenshot" || mode === "both";
  if (!wantTree && !wantShot) return result;
  if (wantTree && !result.observation) result.observation = observeTreeNow(adb, serial);
  if (!wantShot) return result;
  const shot = execOut(adb, serial, ["screencap", "-p"], 30_000);
  if (!shot.buffer.length || !isPng(shot.buffer)) {
    throw new AdbError("动作已执行，但随后的截图失败（返回的不是 PNG）。", "解锁后用 phone__screenshot 确认界面状态");
  }
  const scaled = scalePng(shot.buffer, clamp(int(args, "maxSide") ?? 1400, 200, 4000));
  return {
    mcpContent: [
      { type: "text", text: JSON.stringify(result, null, 2) },
      { type: "image", data: scaled.buffer.toString("base64"), mimeType: "image/png" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 选择器定位（tap / long_press / scroll_find 共用）                     */
/* ------------------------------------------------------------------ */

function withHint(err: unknown): string {
  if (err instanceof AdbError) return err.hint ? `${err.message}（建议：${err.hint}）` : err.message;
  return err instanceof Error ? err.message : String(err);
}

/**
 * 多命中消歧：单命中直接用；带 matchIndex 时按下标取（0 起，与报错信息里的 #序号 对应）；
 * 否则返回 undefined，由调用方报候选列表。
 */
function pickHit(hits: UiNode[], matchIndex: number | undefined): { node: UiNode; index: number } | undefined {
  if (hits.length === 1) return { node: hits[0], index: 0 };
  if (matchIndex !== undefined && Number.isInteger(matchIndex) && matchIndex >= 0 && matchIndex < hits.length) {
    return { node: hits[matchIndex], index: matchIndex };
  }
  return undefined;
}

function candidateList(hits: UiNode[]): string {
  return hits
    .slice(0, 5)
    .map((h, i) => `#${i} ${nodeLine(0, h).replace(/^#\d+ /, "")}`)
    .join("；");
}

function resolvePoint(
  args: Record<string, unknown>,
): Promise<{ adb: string; serial: string; x: number; y: number; screen?: string; matched?: number; index?: number; node?: Record<string, unknown> }> {
  const { adb, device } = target(args);
  const selector = selectorOf(args);
  const matchIndex = int(args, "matchIndex");
  const x = int(args, "x");
  const y = int(args, "y");
  return (async () => {
    const screen = await screenTextOf(adb, device.serial);
    if (hasSelector(selector)) {
      const { nodes } = dumpUi(adb, device.serial);
      const hits = findNodes(nodes, selector);
      if (hits.length === 0) {
        throw new AdbError(
          `没有控件匹配 ${describeSelector(selector)}。`,
          "用 phone__ui 看当前控件树，换更接近的文本/描述/id；目标在列表深处用 phone__scroll_find；纯弹窗或游戏画面改用坐标（截图上确认位置）",
        );
      }
      const picked = pickHit(hits, matchIndex);
      if (!picked) {
        throw new AdbError(
          `${describeSelector(selector)} 匹配到 ${hits.length} 个控件${
            matchIndex !== undefined ? `，matchIndex ${matchIndex} 超出范围` : ""
          }，为避免误触没有点击。`,
          `候选：${candidateList(hits)}${hits.length > 5 ? "…" : ""}。确认目标后带 matchIndex（0 起）重试，或换更精确的选择器/直接给 x,y 坐标`,
        );
      }
      return {
        adb,
        serial: device.serial,
        x: picked.node.center[0],
        y: picked.node.center[1],
        screen,
        matched: hits.length,
        index: picked.index,
        node: compactHit(picked.node),
      };
    }
    if (x === undefined || y === undefined) {
      throw new AdbError("需要定位目标：给 x,y 坐标，或 text/desc/id 选择器。", "优先选择器（屏幕变化时坐标会漂移）；坐标必须来自当前 UI 树或用户指定");
    }
    checkOnScreen(screen, x, y);
    return { adb, serial: device.serial, x, y, screen };
  })();
}

/* ------------------------------------------------------------------ */
/* 工具实现                                                             */
/* ------------------------------------------------------------------ */

const opStatus: ToolDef["run"] = (args) => {
  const adb = requireAdb();
  const version = runText(adb, ["version"], 8_000).stdout.split("\n")[0]?.trim();
  const devices = listDevices(adb);
  const device = pickDevice(adb, str(args, "serial"));
  const serial = device.serial;
  const sdkRaw = getProp(adb, serial, "ro.build.version.sdk");
  const ime = currentIme(adb, serial);
  const adbKeyboard = hasAdbKeyboard(adb, serial);
  return {
    adb: { path: adb, version: version || undefined },
    devices: devices.map((d) => ({ serial: d.serial, state: d.state, ...(d.model ? { model: d.model } : {}) })),
    device: {
      serial,
      model: getProp(adb, serial, "ro.product.model"),
      android: getProp(adb, serial, "ro.build.version.release"),
      sdk: sdkRaw ? Number(sdkRaw) : undefined,
      screen: screenSize(adb, serial),
      foreground: foregroundPackage(adb, serial),
      ime,
      adbKeyboardInstalled: adbKeyboard,
      adbKeyboardActive: Boolean(ime?.startsWith("com.android.adbkeyboard")),
    },
    notes: [
      "非 ASCII（中文）输入需要 ADBKeyboard 且处于激活态；缺失时 phone__text 会报安装指引",
      "操作前先 phone__screenshot 看界面；每步操作后再截图验证",
    ],
  };
};

const opScreenshot: ToolDef["run"] = (args, ctx) => {
  const { adb, device } = target(args);
  const shot = execOut(adb, device.serial, ["screencap", "-p"], 30_000);
  if (!shot.buffer.length || !isPng(shot.buffer)) {
    throw new AdbError("截图失败：adb 返回的不是 PNG 数据。", "锁屏 / 未授权 / 部分老设备会返回空图：解锁后重试");
  }
  const original = pngSize(shot.buffer) ?? { width: 0, height: 0 };
  const maxSide = clamp(int(args, "maxSide") ?? 1400, 200, 4000);
  const scaled = scalePng(shot.buffer, maxSide);
  const savePath = str(args, "savePath");
  const inline = args.inline !== false;
  if (!inline && !savePath) {
    throw new AdbError("inline=false 时必须给 savePath。", "否则结果里既没有图片也没有落盘路径");
  }
  const savedTo = savePath ? saveImage(ctx.workspace, savePath, scaled.buffer) : undefined;
  const meta: Record<string, unknown> = {
    device: device.serial,
    size: { width: original.width, height: original.height },
    returned: { width: scaled.width, height: scaled.height, scaled: scaled.scaled, bytes: scaled.buffer.length },
    inline,
    ...(savedTo ? { savedTo } : {}),
    note: "验证结果请再截一张；需要原图分析细节时用 savePath 落盘",
  };
  const content: Array<Record<string, unknown>> = [{ type: "text", text: JSON.stringify(meta, null, 2) }];
  if (inline) {
    content.push({ type: "image", data: scaled.buffer.toString("base64"), mimeType: "image/png" });
  }
  return { mcpContent: content };
};

const opUi: ToolDef["run"] = async (args) => {
  const { adb, device } = target(args);
  const find = str(args, "find");
  const clickableOnly = args.clickableOnly === true;
  const limit = int(args, "limit") ?? 80;
  const { nodes } = dumpUi(adb, device.serial);
  let list = nodes;
  if (find) {
    const needle = find.toLowerCase();
    list = list.filter(
      (n) =>
        (n.text ?? "").toLowerCase().includes(needle) ||
        (n.desc ?? "").toLowerCase().includes(needle) ||
        (n.id ?? "").toLowerCase().includes(needle),
    );
  }
  if (clickableOnly) list = list.filter((n) => n.clickable || n.scrollable);
  const rendered = renderNodes(list, limit);
  return {
    device: device.serial,
    screen: await screenTextOf(adb, device.serial),
    foreground: foregroundPackage(adb, device.serial),
    total: list.length,
    shown: rendered.shown,
    truncated: rendered.truncated || list.length > limit,
    nodes: rendered.lines.join("\n"),
    hint: "center 可直接用于 tap/swipe 坐标；find 是对 text/desc/id 的不区分大小写子串匹配",
  };
};

const opTap: ToolDef["run"] = async (args) => {
  const mode = parseObserve(args);
  const point = await resolvePoint(args);
  shell(point.adb, point.serial, `input tap ${point.x} ${point.y}`, 10_000);
  return applyObserve(
    args,
    {
      device: point.serial,
      actionSent: true,
      tapped: [point.x, point.y],
      ...(point.matched !== undefined
        ? { matched: point.matched, ...(point.index !== undefined && point.matched > 1 ? { index: point.index } : {}), node: point.node }
        : {}),
      note: "observe=none 时记得用 phone__screenshot / wait_for 验证界面变化",
    },
    mode,
    point.adb,
    point.serial,
  );
};

const opLongPress: ToolDef["run"] = async (args) => {
  const mode = parseObserve(args);
  const durationMs = clamp(int(args, "durationMs") ?? 1_000, 200, 5_000);
  const point = await resolvePoint(args);
  // input 没有长按子命令，用零位移 swipe + 时长实现
  shell(point.adb, point.serial, `input swipe ${point.x} ${point.y} ${point.x} ${point.y} ${durationMs}`, 15_000);
  return applyObserve(
    args,
    {
      device: point.serial,
      actionSent: true,
      longPressed: [point.x, point.y],
      durationMs,
      ...(point.matched !== undefined
        ? { matched: point.matched, ...(point.index !== undefined && point.matched > 1 ? { index: point.index } : {}), node: point.node }
        : {}),
      note: "长按后验证是否弹出菜单/进入选择模式",
    },
    mode,
    point.adb,
    point.serial,
  );
};

const opSwipe: ToolDef["run"] = async (args) => {
  const mode = parseObserve(args);
  const { adb, device } = target(args);
  const x1 = int(args, "x1");
  const y1 = int(args, "y1");
  const x2 = int(args, "x2");
  const y2 = int(args, "y2");
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    throw new AdbError("swipe 需要 x1,y1（起点）与 x2,y2（终点）四个坐标。", "示例：从列表中部向上滑一屏 x1=540,y1=1600,x2=540,y2=600");
  }
  const screen = await screenTextOf(adb, device.serial);
  checkOnScreen(screen, x1, y1);
  checkOnScreen(screen, x2, y2);
  const durationMs = int(args, "durationMs");
  const cmd = `input swipe ${x1} ${y1} ${x2} ${y2}${durationMs !== undefined ? ` ${clamp(durationMs, 50, 10_000)}` : ""}`;
  shell(adb, device.serial, cmd, 15_000);
  return applyObserve(
    args,
    {
      device: device.serial,
      actionSent: true,
      swipe: [x1, y1, x2, y2],
      ...(durationMs !== undefined ? { durationMs: clamp(durationMs, 50, 10_000) } : {}),
      note: "快速轻扫（flick）不带 durationMs；带 durationMs 的是拖拽（drag）。滑动后没有新内容不代表列表到底",
    },
    mode,
    adb,
    device.serial,
  );
};

const ASCII_PRINTABLE = /^[\x20-\x7E]+$/;
const ADBKEYBOARD_IME = "com.android.adbkeyboard/.AdbIME";

/** `input text` 的设备侧引号：整段单引号包裹，内部单引号按 POSIX 规则转义 */
function quoteInputText(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

const opText: ToolDef["run"] = (args) => {
  const mode = parseObserve(args);
  const wantTree = mode === "tree" || mode === "both";
  const text = str(args, "text");
  if (!text) throw new AdbError("缺少 text 参数。", "要按键盘上的键用 phone__key；输入框没聚焦时先点击输入框");
  const submit = args.submit === true;
  const method = str(args, "method") ?? "auto";
  if (method !== "auto" && method !== "ascii" && method !== "adbkeyboard") {
    throw new AdbError(`method 只支持 auto / ascii / adbkeyboard，收到 "${method}"。`);
  }
  const { adb, device } = target(args);
  const isAscii = ASCII_PRINTABLE.test(text);

  let used: string;
  let imeSwitched: string | undefined;
  if (method === "ascii" || (method === "auto" && isAscii)) {
    if (!isAscii) {
      throw new AdbError(
        "text 含非 ASCII 字符，`input text` 会丢字。",
        '改用 method: "adbkeyboard"（设备需装 ADBKeyboard），或先去掉中文等非 ASCII 字符',
      );
    }
    shell(adb, device.serial, `input text ${quoteInputText(text)}`, 10_000);
    used = "input text";
  } else {
    if (!hasAdbKeyboard(adb, device.serial)) {
      throw new AdbError(
        "非 ASCII 输入需要 ADBKeyboard，但设备上没有安装。",
        "安装：从 https://github.com/senzhk/ADBKeyBoard 下载 APK 后 `adb install ADBKeyboard.apk`，再 `adb shell ime set com.android.adbkeyboard/.AdbIME`；纯英文/数字可直接用 method: \"ascii\"",
      );
    }
    const ime = currentIme(adb, device.serial);
    if (!ime?.startsWith("com.android.adbkeyboard")) {
      const switched = shell(adb, device.serial, `ime set ${ADBKEYBOARD_IME}`, 8_000);
      if (/error|exception|unknown/i.test(`${switched.stdout}\n${switched.stderr}`)) {
        throw new AdbError(
          `切换输入法到 ADBKeyboard 失败：${(switched.stderr || switched.stdout).trim().slice(0, 200)}`,
          '在系统设置里启用 ADBKeyboard 后重试；纯英文数字可改用 method: "ascii"',
        );
      }
      // 等 IME 切换生效，避免紧跟着的广播被旧输入法吞掉
      sleepSync(300);
      imeSwitched = ime ?? "(未知)";
    }
    const b64 = Buffer.from(text, "utf8").toString("base64");
    shell(adb, device.serial, `am broadcast -a ADB_INPUT_B64 --es msg ${b64}`, 10_000);
    used = "ADBKeyboard/ADB_INPUT_B64";
  }

  if (submit) shell(adb, device.serial, "input keyevent 66", 8_000);

  // 回读验证 + 观察：不带 submit 时一次 dump 同时干两件事（焦点框回读 + 观察树）
  const probe = text.replace(/\s+/g, " ").trim();
  let verified: boolean | undefined;
  let observation: Observation | undefined;
  if (wantTree && !submit) {
    const { nodes } = dumpUi(adb, device.serial);
    const focused = nodes.find((n) => n.focused);
    const focusedText = focused?.text?.replace(/\s+/g, " ").trim();
    verified = Boolean(focusedText && focusedText.includes(probe));
    const rendered = renderNodes(nodes, 40);
    const s = screenSize(adb, device.serial);
    observation = {
      ...(s ? { screen: `${s.width}x${s.height}` } : {}),
      total: nodes.length,
      shown: rendered.shown,
      truncated: rendered.truncated,
      nodes: rendered.lines.join("\n"),
    };
  } else if (wantTree && submit) {
    observation = observeTreeNow(adb, device.serial);
  }

  return applyObserve(
    args,
    {
      device: device.serial,
      actionSent: true,
      method: used,
      submitted: submit,
      ...(verified !== undefined
        ? verified
          ? { verified: true }
          : { verified: false, verifyHint: "焦点框里没回读到输入内容——可能被应用拦截或页面已跳转；先看 observation/截图确认，不要盲目重发" }
        : {}),
      ...(observation ? { observation } : {}),
      ...(verified === undefined
        ? { note: "结果未回读验证；继续前先确认文本真的进了框（带 observe:\"tree\" 可回读焦点框）" }
        : {}),
      ...(imeSwitched !== undefined ? { imeSwitchedFrom: imeSwitched, imeNote: `当前输入法已切到 ${ADBKEYBOARD_IME}；要换回可用 ime set ${imeSwitched}` } : {}),
    },
    mode,
    adb,
    device.serial,
  );
};

const KEY_CODES: Record<string, number> = {
  home: 3,
  back: 4,
  enter: 66,
  del: 67,
  backspace: 67,
  tab: 61,
  esc: 111,
  escape: 111,
  volume_up: 24,
  volume_down: 25,
  volume_mute: 164,
  power: 26,
  menu: 82,
  notifications: 83,
  search: 84,
  recent: 187,
  recents: 187,
  dpad_up: 19,
  dpad_down: 20,
  dpad_left: 21,
  dpad_right: 22,
  dpad_center: 23,
  page_up: 92,
  page_down: 93,
  move_home: 122,
  move_end: 123,
  camera: 27,
  focus: 80,
  media_play_pause: 126,
  media_next: 87,
  media_previous: 88,
  brightness_up: 221,
  brightness_down: 220,
};

const opKey: ToolDef["run"] = (args) => {
  const mode = parseObserve(args);
  const raw = str(args, "key");
  if (!raw) throw new AdbError(`缺少 key 参数。`, `支持：${Object.keys(KEY_CODES).join(", ")}，或数字 keycode`);
  const code = KEY_CODES[raw.toLowerCase()] ?? (/^\d{1,3}$/.test(raw) ? Number(raw) : undefined);
  if (code === undefined) {
    throw new AdbError(`未知按键 "${raw}"。`, `支持：${Object.keys(KEY_CODES).join(", ")}，或数字 keycode`);
  }
  const { adb, device } = target(args);
  shell(adb, device.serial, `input keyevent ${code}`, 8_000);
  return applyObserve(
    args,
    { device: device.serial, actionSent: true, key: raw, code, note: "按 back/home 后确认所在界面" },
    mode,
    adb,
    device.serial,
  );
};

const opOpenApp: ToolDef["run"] = (args) => {
  const mode = parseObserve(args);
  const pkg = str(args, "package");
  if (!pkg) throw new AdbError("缺少 package 参数。", "用 phone__apps 查包名；系统设置是 com.android.settings");
  requirePackage(pkg);
  const activity = str(args, "activity");
  const { adb, device } = target(args);
  if (args.stop === true) shell(adb, device.serial, `am force-stop ${requirePackage(pkg)}`, 10_000);
  if (activity) shell(adb, device.serial, `am start -n ${pkg}/${requireActivity(activity)}`, 15_000);
  else shell(adb, device.serial, `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`, 15_000);
  sleepSync(600);
  const foreground = foregroundPackage(adb, device.serial);
  const started = foreground === pkg;
  return applyObserve(
    args,
    {
      device: device.serial,
      actionSent: true,
      package: pkg,
      ...(activity ? { activity } : {}),
      stopped: args.stop === true || undefined,
      foreground,
      started,
      ...(started ? {} : { hint: `前台现在是 ${foreground ?? "未知"}——目标应用可能没装、崩溃或停在启动页；用 phone__apps 确认包名，或截图看当前画面` }),
    },
    mode,
    adb,
    device.serial,
  );
};

/* ------------------------------------------------------------------ */
/* scroll_find：滚动查找（v0.2，参考 phone-use 的 scroll_find 思路）      */
/* ------------------------------------------------------------------ */

const SCROLL_DIRECTIONS = ["up", "down", "left", "right"] as const;

const opScrollFind: ToolDef["run"] = (args) => {
  const selector = selectorOf(args);
  if (!hasSelector(selector)) {
    throw new AdbError("scroll_find 需要 text/desc/id 至少一个匹配条件。", "示例：在列表里找「设置」 scroll_find({text:\"设置\"})");
  }
  const matchIndex = int(args, "matchIndex");
  const direction = (str(args, "direction") ?? "up") as (typeof SCROLL_DIRECTIONS)[number];
  if (!SCROLL_DIRECTIONS.includes(direction)) {
    throw new AdbError(`direction 只支持 up / down / left / right，收到 "${direction}"。`, "方向是手指移动方向：up 显示更靠后的内容");
  }
  const maxSwipes = clamp(int(args, "maxSwipes") ?? 6, 1, 12);
  const distance = clamp(float(args, "distance") ?? 0.6, 0.2, 0.9);
  const durationMs = clamp(int(args, "durationMs") ?? 300, 100, 3_000);
  const { adb, device } = target(args);
  const screen = screenSize(adb, device.serial);
  if (!screen) {
    throw new AdbError("拿不到屏幕尺寸（wm size 无返回）。", "设备可能没完全启动；等几秒重试，或直接给 swipe 坐标");
  }

  const swipeOnce = (): void => {
    const distW = Math.round(distance * screen.width);
    const distH = Math.round(distance * screen.height);
    const cx = Math.round(screen.width / 2);
    const cy = Math.round(screen.height / 2);
    const clampX = (v: number) => clamp(v, 0, screen.width - 1);
    const clampY = (v: number) => clamp(v, 0, screen.height - 1);
    let x1: number, y1: number, x2: number, y2: number;
    if (direction === "up") {
      x1 = cx; y1 = clampY(Math.round(screen.height * 0.7)); x2 = cx; y2 = clampY(y1 - distH);
    } else if (direction === "down") {
      x1 = cx; y1 = clampY(Math.round(screen.height * 0.3)); x2 = cx; y2 = clampY(y1 + distH);
    } else if (direction === "left") {
      x1 = clampX(Math.round(screen.width * 0.7)); y1 = cy; x2 = clampX(x1 - distW); y2 = cy;
    } else {
      x1 = clampX(Math.round(screen.width * 0.3)); y1 = cy; x2 = clampX(x1 + distW); y2 = cy;
    }
    shell(adb, device.serial, `input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`, 15_000);
  };

  const start = Date.now();
  let swipes = 0;
  for (;;) {
    const { nodes } = dumpUi(adb, device.serial);
    const hits = findNodes(nodes, selector);
    if (hits.length > 0) {
      // scroll_find 只定位不点击：多命中默认取 #0 并列全候选；只有 matchIndex 明确越界才报 ambiguous
      const picked = pickHit(hits, matchIndex) ?? (matchIndex === undefined ? { node: hits[0], index: 0 } : undefined);
      if (picked) {
        return {
          device: device.serial,
          found: true,
          swipes,
          elapsedMs: Date.now() - start,
          ...(hits.length > 1 ? { matched: hits.length, index: picked.index } : {}),
          node: compactHit(picked.node),
          ...(hits.length > 1 && matchIndex === undefined
            ? { hint: `${hits.length} 个命中，返回的是 #0；要选别的带 matchIndex（0 起）。候选：${candidateList(hits)}` }
            : {}),
        };
      }
      return {
        device: device.serial,
        found: true,
        swipes,
        elapsedMs: Date.now() - start,
        matched: hits.length,
        ambiguous: true,
        hint: `matchIndex ${matchIndex} 超出范围（共 ${hits.length} 个命中）。候选：${candidateList(hits)}。带正确的 matchIndex 重试`,
      };
    }
    if (swipes >= maxSwipes) {
      return {
        device: device.serial,
        found: false,
        swipes,
        elapsedMs: Date.now() - start,
        hint: "滑完没找到：可能已到底、文案不一致，或目标在弹窗/锁屏后面。用 phone__screenshot 看实际界面再换思路",
      };
    }
    swipeOnce();
    swipes++;
    sleepSync(450);
  }
};

/* ------------------------------------------------------------------ */
/* doctor：就绪自检（v0.2，参考 phone-use 的 doctor/ready 模式）          */
/* ------------------------------------------------------------------ */

const opDoctor: ToolDef["run"] = (args) => {
  const checks: Array<{ name: string; ok: boolean; detail: string; hint?: string }> = [];
  const adb = findAdb();
  if (!adb) {
    checks.push({ name: "adb", ok: false, detail: "PATH 与常见 SDK 位置都没找到 adb", hint: ADB_INSTALL_HINT });
    return { ready: false, checks, hint: "先安装 Android Platform Tools；装完新开会话让 PATH 生效（或设 ADB_PATH 环境变量），再重跑 doctor" };
  }
  try {
    const version = runText(adb, ["version"], 8_000).stdout.split("\n")[0]?.trim() ?? "";
    checks.push({ name: "adb", ok: true, detail: version || adb });
  } catch (err) {
    checks.push({ name: "adb", ok: false, detail: `${adb} 不可执行`, hint: withHint(err) });
    return { ready: false, checks, hint: "adb 存在但跑不起来；确认平台架构与可执行权限" };
  }

  let devices: Device[] = [];
  try {
    devices = listDevices(adb);
    const online = devices.filter((d) => d.state === "device");
    const unauthorized = devices.filter((d) => d.state === "unauthorized");
    checks.push({
      name: "devices",
      ok: online.length > 0,
      detail: `${devices.length} 台已连接，${online.length} 台可用`,
      hint: online.length
        ? undefined
        : unauthorized.length
          ? "设备未授权：解锁手机，在 USB 调试弹窗里勾选「始终允许」并点允许"
          : "用 USB 连接手机并打开「开发者选项 → USB 调试」；无线调试先在终端 adb pair/connect",
    });
  } catch (err) {
    checks.push({ name: "devices", ok: false, detail: "adb devices 失败", hint: withHint(err) });
  }

  let device: Device | undefined;
  try {
    device = pickDevice(adb, str(args, "serial"));
    checks.push({ name: "device-select", ok: true, detail: `${device.serial}（${device.state}）` });
  } catch (err) {
    checks.push({ name: "device-select", ok: false, detail: withHint(err).split("（建议：")[0], hint: withHint(err) });
  }
  if (!device) {
    return { ready: false, devices: devices.map((d) => ({ serial: d.serial, state: d.state })), checks, hint: "解决设备问题后重跑 doctor" };
  }

  const screen = screenSize(adb, device.serial);
  checks.push({
    name: "screen",
    ok: Boolean(screen),
    detail: screen ? `${screen.width}x${screen.height}` : "wm size 无返回",
    hint: screen ? undefined : "设备可能未完全启动或暂时无响应；等几秒重试",
  });
  try {
    const count = dumpUi(adb, device.serial, 20_000).nodes.length;
    checks.push({ name: "ui-dump", ok: true, detail: `${count} 个可操作控件` });
  } catch (err) {
    checks.push({ name: "ui-dump", ok: false, detail: "uiautomator dump 失败", hint: withHint(err) });
  }

  const ime = currentIme(adb, device.serial);
  const kb = hasAdbKeyboard(adb, device.serial);
  const ready = checks.every((c) => c.ok);
  return {
    ready,
    device: {
      serial: device.serial,
      model: getProp(adb, device.serial, "ro.product.model"),
      android: getProp(adb, device.serial, "ro.build.version.release"),
      screen,
      foreground: foregroundPackage(adb, device.serial),
      ime,
      adbKeyboardInstalled: kb,
      adbKeyboardActive: Boolean(ime?.startsWith("com.android.adbkeyboard")),
    },
    checks,
    hint: ready
      ? "就绪。中文输入依赖 ADBKeyboard（未装时 phone__text 会给安装指引）；开操作前先 phone__screenshot 看界面"
      : "按 checks 里带 hint 的项修复后重跑 doctor",
  };
};

const opApps: ToolDef["run"] = (args) => {
  const { adb, device } = target(args);
  const filter = str(args, "filter");
  const includeSystem = args.includeSystem === true;
  const limit = clamp(int(args, "limit") ?? 50, 1, 150);
  const r = shell(adb, device.serial, includeSystem ? "pm list packages" : "pm list packages -3", 15_000);
  const all = r.stdout
    .split("\n")
    .map((l) => l.replace(/^package:/, "").trim())
    .filter(Boolean)
    .sort();
  const list = filter ? all.filter((p) => p.toLowerCase().includes(filter.toLowerCase())) : all;
  return {
    device: device.serial,
    thirdPartyOnly: !includeSystem,
    total: list.length,
    shown: list.slice(0, limit),
    truncated: list.length > limit,
    hint: "包名可直接给 open_app 的 package；要连同系统应用一起列传 includeSystem: true",
  };
};

const opWaitFor: ToolDef["run"] = (args) => {
  const selector = selectorOf(args);
  if (!hasSelector(selector)) {
    throw new AdbError("wait_for 需要 text/desc/id 至少一个匹配条件。", "纯视觉变化没有控件对应时，改用 screenshot + sleep 由会话层等待");
  }
  const timeoutMs = clamp(int(args, "timeoutMs") ?? 10_000, 1_000, 60_000);
  const intervalMs = clamp(int(args, "intervalMs") ?? 1_200, 500, 5_000);
  const { adb, device } = target(args);
  const start = Date.now();
  let polls = 0;
  let lastTotal = 0;
  while (Date.now() - start < timeoutMs) {
    polls++;
    const { nodes } = dumpUi(adb, device.serial);
    lastTotal = nodes.length;
    const hits = findNodes(nodes, selector);
    if (hits.length > 0) {
      return {
        device: device.serial,
        found: true,
        elapsedMs: Date.now() - start,
        polls,
        matched: hits.length,
        node: compactHit(hits[0]),
      };
    }
    sleepSync(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - start))));
  }
  return {
    device: device.serial,
    found: false,
    elapsedMs: Date.now() - start,
    polls,
    lastUiNodes: lastTotal,
    hint: "超时没等到。用 phone__screenshot 看当前界面：可能停在弹窗/锁屏/加载页，或目标文案与选择器不一致",
  };
};

/* ------------------------------------------------------------------ */
/* 工具面                                                               */
/* ------------------------------------------------------------------ */

const SERIAL_SCHEMA = { type: "string", description: "设备序列号（adb devices 里的）；缺省时要求恰好一台在线设备，0 台或多台都会报错" } as const;

const OBSERVE_SCHEMA = {
  type: "string",
  enum: ["none", "tree", "screenshot", "both"],
  description:
    "动作后随带取回新观察：tree=控件树（紧凑 40 条）、screenshot=截图、both=两者；缺省 none。" +
    "已知下一步时省掉这轮，要验证时一步拿回动作结果+新界面，比单独再调 ui/screenshot 省一个来回",
} as const;

const MATCH_INDEX_SCHEMA = {
  type: "number",
  description: "选择器多命中时选第几个候选（0 起，与报错信息里的 #序号 对应）；单命中不用传",
} as const;

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "status",
    description:
      "设备总览：adb 路径与版本、在线设备列表、选中设备的型号/Android 版本/屏幕尺寸/前台应用/输入法。" +
      "开始操作前先调用它确认设备与前置条件（尤其 ADBKeyboard 是否可用）。",
    inputSchema: { type: "object", properties: { serial: SERIAL_SCHEMA } },
    run: opStatus,
  },
  {
    name: "screenshot",
    description:
      "截屏并返回图像块（最长边默认缩到 1400px 以内）。savePath 可同时把图存到工作区（相对路径）或绝对路径；" +
      "inline=false 时不内嵌图片只落盘（必须配 savePath）。操作后建议再截一张验证结果。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        maxSide: { type: "number", description: "返回图最长边（px），缺省 1400，范围 200–4000" },
        savePath: { type: "string", description: "落盘路径：相对工作区或绝对路径" },
        inline: { type: "boolean", description: "是否在结果里内嵌图片，缺省 true" },
      },
    },
    run: opScreenshot,
  },
  {
    name: "ui",
    description:
      "当前界面控件树（uiautomator dump 的紧凑视图）：文本/描述/id/中心点坐标/可点击可滚动等。" +
      "find 参数按 text/desc/id 子串过滤。点按优先用这里的 center 坐标或选择器。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        find: { type: "string", description: "只显示 text/desc/id 含该子串的控件" },
        clickableOnly: { type: "boolean", description: "只看可点击/可滚动的控件，缺省 false" },
        limit: { type: "number", description: "最多返回多少条，缺省 80，上限 200" },
      },
    },
    run: opUi,
  },
  {
    name: "tap",
    description:
      "点击。优先给 text/desc/id 选择器（内部 dump 匹配、取中心点，命中 0 个或多个都会报错不猜）；" +
      "多命中时按报错候选带 matchIndex 重选；选择器定位不到时再用 x,y 坐标（应来自 phone__ui 的 center 或截图实际位置）。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        text: { type: "string", description: "按文本子串匹配（与 desc/id 是 AND 关系）" },
        desc: { type: "string", description: "按 content-desc 子串匹配" },
        id: { type: "string", description: "按 resource-id 子串匹配" },
        matchIndex: MATCH_INDEX_SCHEMA,
        x: { type: "number", description: "横坐标（px，与 y 一起用）" },
        y: { type: "number", description: "纵坐标（px）" },
        observe: OBSERVE_SCHEMA,
      },
    },
    run: opTap,
  },
  {
    name: "long_press",
    description:
      "长按（零位移 swipe 实现）。定位方式同 tap：text/desc/id 选择器（可带 matchIndex 消歧）或 x,y 坐标；durationMs 缺省 1000。" +
      "用于呼出上下文菜单、进入多选模式等。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        text: { type: "string", description: "按文本子串匹配" },
        desc: { type: "string", description: "按 content-desc 子串匹配" },
        id: { type: "string", description: "按 resource-id 子串匹配" },
        matchIndex: MATCH_INDEX_SCHEMA,
        x: { type: "number", description: "横坐标（px）" },
        y: { type: "number", description: "纵坐标（px）" },
        durationMs: { type: "number", description: "按压时长，缺省 1000，范围 200–5000" },
        observe: OBSERVE_SCHEMA,
      },
    },
    run: opLongPress,
  },
  {
    name: "swipe",
    description:
      "从 (x1,y1) 滑到 (x2,y2)。不带 durationMs 是快速轻扫（flick，触发惯性滚动）；带 durationMs（如 800）是拖拽。" +
      "上滑一屏的常见起点：屏幕中部到上三分之一。列表里找元素优先用 phone__scroll_find。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        x1: { type: "number", description: "起点横坐标（px）" },
        y1: { type: "number", description: "起点纵坐标（px）" },
        x2: { type: "number", description: "终点横坐标（px）" },
        y2: { type: "number", description: "终点纵坐标（px）" },
        durationMs: { type: "number", description: "滑动时长 ms；缺省为快速轻扫" },
        observe: OBSERVE_SCHEMA,
      },
      required: ["x1", "y1", "x2", "y2"],
    },
    run: opSwipe,
  },
  {
    name: "text",
    description:
      "向当前聚焦的输入框输入文本。ASCII 直接 input text；非 ASCII（中文等）走 ADBKeyboard 广播——" +
      "设备需装 ADBKeyboard（缺失时报安装指引，不静默丢字），没激活会自动切换。submit=true 输完补回车。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        text: { type: "string", description: "要输入的文本（输入框须已聚焦）" },
        submit: { type: "boolean", description: "输入后按回车，缺省 false" },
        method: { type: "string", enum: ["auto", "ascii", "adbkeyboard"], description: "缺省 auto：ASCII 走 input text，否则走 ADBKeyboard" },
        observe: OBSERVE_SCHEMA,
      },
      required: ["text"],
    },
    run: opText,
  },
  {
    name: "key",
    description:
      "按一个系统键：back/home/enter/del/tab/esc/volume_up/volume_down/power/recents/dpad_*/page_up/page_down/media_* 等，" +
      "或直接给数字 keycode。返回键常用在关闭弹窗/返回上一级后验证界面。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        key: { type: "string", description: "按键名（back/home/enter/…）或数字 keycode" },
        observe: OBSERVE_SCHEMA,
      },
      required: ["key"],
    },
    run: opKey,
  },
  {
    name: "open_app",
    description:
      "启动应用：只给 package 时经 launcher intent 启动（monkey）；给 activity 时 am start -n 精确启动。" +
      "stop=true 先 force-stop 再启动（冷启动）。启动后返回当前前台包名以确认是否成功。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        package: { type: "string", description: "应用包名，如 com.android.settings" },
        activity: { type: "string", description: "可选 Activity，如 .MainActivity" },
        stop: { type: "boolean", description: "先强制停止再启动，缺省 false" },
        observe: OBSERVE_SCHEMA,
      },
      required: ["package"],
    },
    run: opOpenApp,
  },
  {
    name: "apps",
    description: "列出已安装应用包名（默认只列第三方，includeSystem=true 连系统应用）。filter 按包名子串过滤，给 open_app 用。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        filter: { type: "string", description: "包名子串过滤，如 wechat" },
        includeSystem: { type: "boolean", description: "包含系统应用，缺省 false" },
        limit: { type: "number", description: "最多返回多少条，缺省 50，上限 150" },
      },
    },
    run: opApps,
  },
  {
    name: "wait_for",
    description:
      "轮询等待界面出现匹配 text/desc/id 的控件（点击/滑动后的验证首选）。timeoutMs 缺省 10000、intervalMs 缺省 1200。" +
      "found=false 时按 hint 截图排查，不要盲目重试点击。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        text: { type: "string", description: "按文本子串匹配（与 desc/id 是 AND 关系）" },
        desc: { type: "string", description: "按 content-desc 子串匹配" },
        id: { type: "string", description: "按 resource-id 子串匹配" },
        timeoutMs: { type: "number", description: "最长等待，缺省 10000，范围 1000–60000" },
        intervalMs: { type: "number", description: "轮询间隔，缺省 1200，范围 500–5000" },
      },
    },
    run: opWaitFor,
  },
  {
    name: "scroll_find",
    description:
      "在可滚动列表里边滑边找：从当前界面开始按方向滑动，每滑一次重新 dump 匹配，找到即停并返回控件。" +
      "找不到列表深处的元素时的首选，不要手写「滑一下再看」循环。多命中规则同 tap（matchIndex 消歧）。",
    inputSchema: {
      type: "object",
      properties: {
        serial: SERIAL_SCHEMA,
        text: { type: "string", description: "按文本子串匹配（与 desc/id 是 AND 关系）" },
        desc: { type: "string", description: "按 content-desc 子串匹配" },
        id: { type: "string", description: "按 resource-id 子串匹配" },
        matchIndex: MATCH_INDEX_SCHEMA,
        direction: { type: "string", enum: ["up", "down", "left", "right"], description: "手指移动方向，缺省 up（显示更靠后的内容）" },
        maxSwipes: { type: "number", description: "最多滑几次，缺省 6，上限 12" },
        distance: { type: "number", description: "每次滑动距离占屏幕比例，缺省 0.6，范围 0.2–0.9" },
        durationMs: { type: "number", description: "每次滑动时长，缺省 300（受控滚动而非甩动）" },
      },
    },
    run: opScrollFind,
  },
  {
    name: "doctor",
    description:
      "就绪自检：adb 可执行 → 设备在线 → 选中设备 → 屏幕尺寸 → uiautomator dump，逐项给通过/失败与修复建议，" +
      "并汇总设备信息（型号/Android 版本/输入法/ADBKeyboard）。首次操作设备前先跑一次；ready=false 按提示修复，不要盲试其它工具。",
    inputSchema: {
      type: "object",
      properties: { serial: SERIAL_SCHEMA },
    },
    run: opDoctor,
  },
];
