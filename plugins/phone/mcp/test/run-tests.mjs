/**
 * phone 插件端到端测试（DESIGN.md §10 的「假 adb」方案）。
 *
 * 真实 stdio 子进程跑 mcp/server.ts（优先 bun，其次 Kova.app 内置的 kova-worker，
 * 与 sidecar 生产启动一致），ADB_PATH 指向假 adb shim，覆盖：
 * 0/1/2 台设备、未授权、无 ADBKeyboard、非默认输入法、命令构造、
 * PNG 缩放落盘、UI 树解析与字节预算、选择器 0/多命中拒绝。
 *
 * 用法：node plugins/phone/mcp/test/run-tests.mjs
 * （指定运行时：TEST_RUNTIME=/path/to/bun node run-tests.mjs）
 */
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(TEST_DIR, "..", "server.ts");
const SHIM = path.join(TEST_DIR, "fake-adb.sh");

/* ------------------------------------------------------------------ */
/* 断言                                                                 */
/* ------------------------------------------------------------------ */

let pass = 0;
const failures = [];
function ok(cond, label) {
  if (cond) {
    pass++;
    process.stdout.write(`  ok  ${label}\n`);
  } else {
    failures.push(label);
    process.stdout.write(`FAIL  ${label}\n`);
  }
}

/* ------------------------------------------------------------------ */
/* 测试用 PNG（2400x1080 渐变，RGBA，filter 0）                          */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function makePng(width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (stride + 1) + 1 + x * 4;
      raw[o] = (x * 255) / width;
      raw[o + 1] = (y * 255) / height;
      raw[o + 2] = 128;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

function pngDims(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/* ------------------------------------------------------------------ */
/* 运行时与 server 进程                                                  */
/* ------------------------------------------------------------------ */

function findRuntime() {
  if (process.env.TEST_RUNTIME) return process.env.TEST_RUNTIME;
  const v = spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (v.status === 0) return "bun";
  const kova = "/Applications/Kova.app/Contents/Resources/binaries/kova-worker";
  if (existsSync(kova)) return kova;
  throw new Error("没有可用的 TS 运行时：需要 bun 或 Kova.app 的 kova-worker");
}

const fixtureDir = mkdtempSync(path.join(tmpdir(), "phone-e2e-fix-"));
const screenshotPng = path.join(fixtureDir, "screen.png");
writeFileSync(screenshotPng, makePng(2400, 1080));
chmodSync(SHIM, 0o755);

const cleanupDirs = [fixtureDir];

function startServer(extraEnv = {}) {
  const runtime = findRuntime();
  const ws = mkdtempSync(path.join(tmpdir(), "phone-e2e-ws-"));
  cleanupDirs.push(ws);
  const adbLog = path.join(ws, "adb.log");
  const proc = spawn(runtime, ["run", SERVER], {
    env: {
      ...process.env,
      BUN_BE_BUN: "1",
      KOVA_WORKSPACE: ws,
      ADB_PATH: SHIM,
      FAKE_LOG: adbLog,
      FAKE_SCREENSHOT: screenshotPng,
      ...extraEnv,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  proc.stderr.on("data", () => {});
  let nextId = 1;
  const pending = new Map();
  const rl = createInterface({ input: proc.stdout, terminal: false });
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg && msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  function req(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`超时：${method}`)), 60_000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async function call(name, args = {}) {
    const msg = await req("tools/call", { name, arguments: args });
    if (msg.error) throw new Error(`${name}: ${msg.error.message}`);
    const result = msg.result ?? {};
    if (result.isError) return { isError: true, text: result.content?.[0]?.text ?? "" };
    const onlyText = result.content?.length === 1 && result.content[0].type === "text";
    if (onlyText) return { isError: false, data: JSON.parse(result.content[0].text), text: result.content[0].text };
    return { isError: false, content: result.content ?? [] };
  }

  function adbLogText() {
    try {
      return readFileSync(adbLog, "utf8");
    } catch {
      return "";
    }
  }

  return {
    ws,
    req,
    call,
    adbLogText,
    stop: () => {
      proc.stdin.end();
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 2_000).unref();
    },
  };
}

async function withServer(extraEnv, fn) {
  const s = startServer(extraEnv);
  try {
    await fn(s);
  } finally {
    s.stop();
  }
}

/* ------------------------------------------------------------------ */
/* 场景 A：单设备全工具                                                  */
/* ------------------------------------------------------------------ */

const TOOL_NAMES = ["status", "screenshot", "ui", "tap", "long_press", "swipe", "text", "key", "open_app", "apps", "wait_for", "scroll_find", "doctor"];

await withServer({}, async (s) => {
  const init = await s.req("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "phone-e2e", version: "0" },
  });
  ok(init.result?.serverInfo?.name === "phone", "initialize 返回 serverInfo.name=phone");
  ok(typeof init.result?.protocolVersion === "string", "initialize 返回协议版本");

  const list = await s.req("tools/list", {});
  const names = (list.result?.tools ?? []).map((t) => t.name);
  ok(names.length === TOOL_NAMES.length && TOOL_NAMES.every((n) => names.includes(n)), "tools/list 恰好 13 个工具且名字齐全");

  await s.req("notifications/initialized", {});
  const ping = await s.req("ping", {});
  ok(ping.result !== undefined, "ping 正常响应");

  const st = await s.call("status", {});
  ok(!st.isError, "status 不报错");
  ok(st.data?.device?.model === "Pixel Fake", "status 读到设备型号");
  ok(st.data?.device?.screen?.width === 1080 && st.data.device.screen.height === 2340, "status 读到屏幕尺寸 1080x2340");
  ok(st.data?.device?.adbKeyboardInstalled === true && st.data.device.adbKeyboardActive === true, "status 报告 ADBKeyboard 已装且激活");
  ok(st.data?.devices?.length === 1 && st.data.devices[0].serial === "FAKE001", "status 列出 1 台设备 FAKE001");

  const doc = await s.call("doctor", {});
  ok(!doc.isError && doc.data?.ready === true, "doctor 全绿就绪");
  ok(Array.isArray(doc.data?.checks) && doc.data.checks.length >= 5 && doc.data.checks.every((c) => c.ok), `doctor ${doc.data?.checks?.length} 项检查全过`);
  ok(doc.data?.device?.serial === "FAKE001" && doc.data.device.adbKeyboardInstalled === true, "doctor 汇总设备信息");

  const shot1 = await s.call("screenshot", { savePath: "shots/one.png", maxSide: 800 });
  ok(!shot1.isError && shot1.content.some((c) => c.type === "image"), "screenshot 返回 image 块");
  // mcpContent 透传：元信息 JSON 在 content[0].text
  const meta1 = shot1.content[0]?.type === "text" ? JSON.parse(shot1.content[0].text) : undefined;
  const saved = meta1?.savedTo;
  ok(typeof saved === "string" && saved.startsWith(s.ws) && existsSync(saved), "screenshot savePath 落盘到工作区");
  const dims = saved ? pngDims(saved) : { width: 0, height: 0 };
  ok(dims.width === 800 && dims.height === 360, `savePath 文件按 800 长边落盘（实际 ${dims.width}x${dims.height}）`);
  const imgBlock = shot1.content.find((c) => c.type === "image");
  ok(Buffer.from(imgBlock?.data ?? "", "base64").subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image 块 base64 解码是 PNG");

  const shot2 = await s.call("screenshot", {});
  ok(!shot2.isError && shot2.content.some((c) => c.type === "image"), "screenshot 缺省参数可用（内嵌 1400px）");
  ok(shot2.content[0]?.type === "text" && JSON.parse(shot2.content[0].text).returned?.width === 1400, "缺省缩到最长边 1400");

  const shot3 = await s.call("screenshot", { inline: false });
  ok(shot3.isError && shot3.text.includes("savePath"), "inline=false 且无 savePath 明确报错");

  const ui1 = await s.call("ui", {});
  ok(!ui1.isError && ui1.data?.total === 12 && ui1.data?.shown === 12, `ui 输出全部 12 个有效控件（实际 ${ui1.data?.total}）`);
  ok(!ui1.data?.truncated, "ui 默认不截断");
  ok(ui1.data?.nodes?.includes('text="设置"') && ui1.data.nodes.includes("center=(540,300)"), "ui 行含 text 与 center");
  ok(ui1.data.nodes.split("\n").length === 12, "ui 严格一行一条（属性里的换行实体被压平）");
  ok(ui1.text.length < 8 * 1024, `ui 文本在 8KB 内（${ui1.text.length}B）`);

  const ui2 = await s.call("ui", { find: "登录" });
  ok(ui2.data?.total === 2, "ui find=登录 命中 2 条");
  const ui3 = await s.call("ui", { find: "不存在的东西" });
  ok(ui3.data?.total === 0, "ui find 无命中返回 0");
  const ui4 = await s.call("ui", { clickableOnly: true });
  ok(ui4.data?.total === 8, "ui clickableOnly 命中 8 条");
  ok(ui4.data.nodes.split("\n").every((l) => l.includes("clickable") || l.includes("scrollable")), "clickableOnly 行都带 clickable/scrollable");

  const tapAmb = await s.call("tap", { text: "登录" });
  ok(tapAmb.isError && tapAmb.text.includes("匹配到 2 个控件"), "tap 选择器多命中拒绝并报候选");
  ok(tapAmb.text.includes("matchIndex"), "多命中报错带 matchIndex 用法提示");

  const tapIdx = await s.call("tap", { text: "登录", matchIndex: 1 });
  ok(!tapIdx.isError && tapIdx.data?.tapped?.[0] === 860 && tapIdx.data.tapped[1] === 2100, "tap matchIndex=1 选第二个候选");
  ok(tapIdx.data?.index === 1 && tapIdx.data?.matched === 2, "tap 返回 index 与 matched");

  const tapIdxBad = await s.call("tap", { text: "登录", matchIndex: 5 });
  ok(tapIdxBad.isError && tapIdxBad.text.includes("matchIndex"), "matchIndex 越界报候选范围");

  const badObs = await s.call("tap", { x: 10, y: 10, observe: "video" });
  ok(badObs.isError && badObs.text.includes("observe"), "observe 非法值在动作前报错");

  const tapSel = await s.call("tap", { text: "设置" });
  ok(!tapSel.isError && tapSel.data?.tapped?.[0] === 540 && tapSel.data.tapped[1] === 300, "tap 选择器命中取中心点");
  ok(tapSel.data?.matched === 1 && tapSel.data?.node?.text === "设置", "tap 返回命中节点信息");
  ok(s.adbLogText().includes("input tap 540 300"), "tap 构造 input tap 540 300");

  await s.call("tap", { x: 100, y: 100 });
  ok(s.adbLogText().includes("input tap 100 100"), "tap 坐标直达 input tap");

  const tapLandscape = await s.call("tap", { x: 2000, y: 100 });
  ok(!tapLandscape.isError && s.adbLogText().includes("input tap 2000 100"), "横屏方向的合法坐标不被误拦");

  const tapFar = await s.call("tap", { x: 5000, y: 0 });
  ok(tapFar.isError && tapFar.text.includes("超出屏幕"), "tap 越界坐标被拦下");

  const tapNone = await s.call("tap", {});
  ok(tapNone.isError && tapNone.text.includes("定位"), "tap 无定位参数明确报错");

  const tapObs = await s.call("tap", { text: "设置", observe: "tree" });
  ok(!tapObs.isError && tapObs.data?.observation?.total === 12 && tapObs.data.observation.nodes.includes('text="设置"'), "tap observe=tree 一步拿回动作结果+新树");

  const tapShot = await s.call("tap", { text: "设置", observe: "screenshot" });
  ok(!tapShot.isError && tapShot.content.some((c) => c.type === "image"), "tap observe=screenshot 返回截图块");
  ok(tapShot.content[0]?.type === "text" && JSON.parse(tapShot.content[0].text).actionSent === true, "observe=screenshot 的元信息含 actionSent");

  const lp = await s.call("long_press", { desc: "头像" });
  ok(!lp.isError && lp.data?.longPressed?.[0] === 960 && lp.data.longPressed[1] === 220, "long_press 按 desc 定位");
  ok(s.adbLogText().includes("input swipe 960 220 960 220 1000"), "long_press 用零位移 swipe 实现");

  await s.call("swipe", { x1: 540, y1: 1600, x2: 540, y2: 600, durationMs: 800 });
  ok(s.adbLogText().includes("input swipe 540 1600 540 600 800"), "swipe 构造带时长的 input swipe");

  const swipeObs = await s.call("swipe", { x1: 540, y1: 1600, x2: 540, y2: 600, durationMs: 800, observe: "both" });
  ok(!swipeObs.isError && swipeObs.content.some((c) => c.type === "image"), "swipe observe=both 返回截图块");
  ok(swipeObs.content[0]?.type === "text" && JSON.parse(swipeObs.content[0].text).observation?.total === 12, "swipe observe=both 元信息含 observation");

  const swipeBad = await s.call("swipe", { x1: 540, y1: 1600, x2: 540 });
  ok(swipeBad.isError, "swipe 缺坐标报错");

  const txt1 = await s.call("text", { text: "hello world" });
  ok(!txt1.isError && txt1.data?.method === "input text", "ASCII 文本走 input text");
  ok(s.adbLogText().includes("input text 'hello world'"), "input text 带引号包裹空格");

  const txt2 = await s.call("text", { text: "你好" });
  ok(!txt2.isError && txt2.data?.method === "ADBKeyboard/ADB_INPUT_B64", "中文走 ADBKeyboard 广播");
  ok(s.adbLogText().includes("ADB_INPUT_B64 --es msg 5L2g5aW9"), "中文按 UTF-8 base64 广播");
  ok(txt2.data?.imeSwitchedFrom === undefined, "输入法已是 ADBKeyboard 时不切换");

  await s.call("text", { text: "hi", submit: true });
  ok(s.adbLogText().includes("input keyevent 66"), "submit=true 追加回车键");

  const key1 = await s.call("key", { key: "back" });
  ok(!key1.isError && key1.data?.code === 4, "key back → keycode 4");
  ok(s.adbLogText().includes("input keyevent 4"), "key 构造 input keyevent");

  const key2 = await s.call("key", { key: "火箭" });
  ok(key2.isError && key2.text.includes("keycode"), "未知按键报可选列表");

  const app1 = await s.call("open_app", { package: "com.fake.settings" });
  ok(!app1.isError && app1.data?.started === true && app1.data?.foreground === "com.fake.settings", "open_app 启动并确认前台");
  ok(s.adbLogText().includes("monkey -p com.fake.settings"), "open_app 经 launcher intent 启动");

  const app2 = await s.call("open_app", { package: "com.a; rm -rf /" });
  ok(app2.isError && app2.text.includes("包名不合法"), "open_app 拦截包名注入");

  const apps1 = await s.call("apps", {});
  ok(!apps1.isError && apps1.data?.total === 3, "apps 列出 3 个第三方包");
  ok(JSON.stringify(apps1.data?.shown) === JSON.stringify(["com.fake.chat", "com.fake.maps", "com.fake.settings"]), "apps 排序输出");
  const apps2 = await s.call("apps", { filter: "chat" });
  ok(apps2.data?.total === 1 && apps2.data.shown[0] === "com.fake.chat", "apps filter 子串过滤");

  const wf1 = await s.call("wait_for", { text: "登录" });
  ok(!wf1.isError && wf1.data?.found === true && wf1.data?.matched === 2, "wait_for 立即命中");

  const wf2 = await s.call("wait_for", { text: "绝不出现", timeoutMs: 1500, intervalMs: 500 });
  ok(!wf2.isError && wf2.data?.found === false, "wait_for 超时返回 found=false 而非报错");
  ok(wf2.data?.polls >= 2, `wait_for 超时前轮询多次（${wf2.data?.polls} 次）`);

  let unknownThrew = "";
  try {
    await s.call("no_such_tool", {});
  } catch (err) {
    unknownThrew = err.message;
  }
  ok(unknownThrew.includes("未知工具"), "未知工具返回 JSON-RPC 错误");
});

/* ------------------------------------------------------------------ */
/* 场景 B–E：设备数 / 授权 / ADBKeyboard / 输入法切换                     */
/* ------------------------------------------------------------------ */

await withServer({ FAKE_DEVICES: "0" }, async (s) => {
  const st = await s.call("status", {});
  ok(st.isError && st.text.includes("Android 设备"), "0 台设备时明确报错并给指引");
  const doc = await s.call("doctor", {});
  ok(!doc.isError && doc.data?.ready === false, "doctor 无设备时 ready=false 而非报错");
  ok(doc.data?.checks?.some((c) => c.name === "devices" && c.ok === false), "doctor 标记 devices 检查失败并给 hint");
});

await withServer({ FAKE_DEVICES: "2" }, async (s) => {
  const st1 = await s.call("status", {});
  ok(st1.isError && st1.text.includes("2 台在线设备"), "多台设备不猜，要求 serial");
  const st2 = await s.call("status", { serial: "FAKE002" });
  ok(!st2.isError && st2.data?.device?.serial === "FAKE002", "指定 serial 可选设备");
});

await withServer({ FAKE_DEVICES: "unauthorized" }, async (s) => {
  const st = await s.call("status", {});
  ok(st.isError && st.text.includes("允许"), "未授权设备提示手机上点允许");
});

await withServer({ FAKE_NO_ADBKEYBOARD: "1" }, async (s) => {
  const t = await s.call("text", { text: "中文输入" });
  ok(t.isError && t.text.includes("ADBKeyboard"), "缺 ADBKeyboard 时中文输入报安装指引");
  const t2 = await s.call("text", { text: "ok" });
  ok(!t2.isError && t2.data?.method === "input text", "缺 ADBKeyboard 不影响 ASCII 输入");
});

await withServer({ FAKE_IME: "com.other.ime/.OtherIME" }, async (s) => {
  const t = await s.call("text", { text: "你好" });
  ok(!t.isError && t.data?.imeSwitchedFrom === "com.other.ime/.OtherIME", "非 ADBKeyboard 输入法先自动切换");
  ok(s.adbLogText().includes("ime set com.android.adbkeyboard/.AdbIME"), "自动 ime set 命令正确");
});

await withServer({ FAKE_IME: "com.other.ime/.OtherIME", FAKE_IME_SET_FAILS: "1" }, async (s) => {
  const t = await s.call("text", { text: "你好" });
  ok(t.isError && t.text.includes("切换输入法"), "ime set 失败时报错而不是静默丢字");
});

await withServer({ FAKE_UI_TYPED_AFTER: "input text" }, async (s) => {
  const t1 = await s.call("text", { text: "hello world", observe: "tree" });
  ok(!t1.isError && t1.data?.verified === true, "text observe=tree 回读焦点框 verified=true");
  ok(t1.data?.observation?.nodes?.includes("hello world"), "text 的 observation 含焦点框内容");
  ok(t1.data?.actionSent === true, "text 结果带 actionSent");

  const t2 = await s.call("text", { text: "不会出现的内容xyz", observe: "tree" });
  ok(!t2.isError && t2.data?.verified === false && t2.data?.verifyHint, "回读不到时 verified=false 并给不重放指引");
});

await withServer({ FAKE_UI_SCROLLED_AFTER: "input swipe 540 1638" }, async (s) => {
  const sf1 = await s.call("scroll_find", { text: "登录" });
  ok(!sf1.isError && sf1.data?.found === true && sf1.data?.swipes === 0, "scroll_find 首屏命中零滑动");
  ok(sf1.data?.matched === 2 && sf1.data?.index === 0 && String(sf1.data?.hint).includes("#0"), "scroll_find 多命中返回 index 与可操作的候选");

  const sf1b = await s.call("scroll_find", { text: "登录", matchIndex: 1 });
  ok(!sf1b.isError && sf1b.data?.index === 1 && sf1b.data?.node?.center?.[0] === 860, "scroll_find matchIndex 选中指定候选");

  const sf2 = await s.call("scroll_find", { text: "藏在列表底部的按钮" });
  ok(!sf2.isError && sf2.data?.found === true && sf2.data?.swipes === 1, "scroll_find 滑一次后命中");
  ok(s.adbLogText().includes("input swipe 540 1638 540 234 300"), "scroll_find 默认方向/距离的滑动命令正确");

  const sf3 = await s.call("scroll_find", { text: "绝不出现", maxSwipes: 2 });
  ok(!sf3.isError && sf3.data?.found === false && sf3.data?.swipes === 2, "scroll_find 超次返回 found=false 而非报错");

  const sfBad = await s.call("scroll_find", {});
  ok(sfBad.isError, "scroll_find 无匹配条件报错");
});

/* ------------------------------------------------------------------ */
/* 汇总                                                                 */
/* ------------------------------------------------------------------ */

for (const dir of cleanupDirs) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 清理失败不影响结论 */
  }
}

process.stdout.write(`\n${pass} 通过，${failures.length} 失败\n`);
if (failures.length) {
  process.stdout.write(`${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
// fixture server / 迟退出的子进程会吊住事件循环，显式收尾保证脚本必然退出
process.exit(0);
