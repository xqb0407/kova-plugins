/**
 * 无限画布 MCP 工具实现（stdio server 见 server.ts）。
 *
 * 设计取向：与 office 同一套——面板是唯一的渲染者，agent 只经文件协作。所有工具
 * 都作用于工作区里的画布文档（`*.canvas.json`，`*.deck.canvas.json` 属 office 不碰），
 * 原子落盘后宿主 600ms 轮询会推给已打开的面板，用户的编辑也会防抖写回同一文件。
 *
 * 工具分四类：
 * - 发现/读取：list_docs、read_doc（summary 摘要 / full 整档 / elementId 深入单元素）
 * - 局部写入：patch_canvas（add/update/delete/z/move 五种 op，按 kind 白名单字段校验）
 * - 整档：write_doc（整档）、create_doc（空白骨架，不覆盖已有文件）
 * - 实时：watch_doc（长轮询，等面板写盘后返回变更摘要，是「面板 → agent」的拉取通道）
 *
 * 校验复用面板的数据模型（../ui/src/doc 的 parseDoc/serializeDoc）：服务端与面板
 * 同一份容错解析——能救的救、救不了的丢弃，两边对同一份 JSON 的判定永远一致。
 * patch 在校验层之外再叠 kind 白名单与规模上限（SKILL.md 的排版规范），坏字段
 * 拒绝写入而不是静默丢弃，agent 能拿到明确的错误反馈。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CHART_KINDS,
  DRAW_MAX_POINTS,
  LINE_SHAPE_KINDS,
  TABLE_MAX_CELL,
  TABLE_MAX_COLS,
  TABLE_MAX_ROWS,
  blankDoc,
  parseDoc,
  serializeDoc,
  type CanvasDoc,
  type El,
} from "../ui/src/doc";

export type ToolCtx = { workspace: string };

type Spec = Record<string, unknown>;
type Json = Record<string, unknown>;

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** 可同步返回，也可返回 Promise（watch_doc 要长轮询）——server.ts 一律 await */
  run: (args: Spec, ctx: ToolCtx) => unknown;
};

/* ------------------------------------------------------------------ */
/* 基础：路径 / 读写 / 版本                                              */
/* ------------------------------------------------------------------ */

const CANVAS_SUFFIX = ".canvas.json";
const DECK_SUFFIX = ".deck.canvas.json";

const MAX_LIST = 60;
const MAX_LIST_DEPTH = 2;
const MAX_FULL_CHARS = 1_000_000;
const MAX_WRITE_BYTES = 20 * 1024 * 1024;
/** SKILL.md 排版规范：整档元素数 ≤ 500（再多拆档） */
const MAX_OBJECTS = 500;
const MAX_OPS = 100;
const MAX_SUMMARY_ELEMENTS = 200;
const MAX_CODE_CHARS = 100_000;
const MAX_LABEL_CHARS = 80;
/** patch 单次 add 元素上限 */
const MAX_ADD_PER_OP = 100;

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const sha = (text: string): string => createHash("sha1").update(text).digest("hex").slice(0, 12);

/** 画布档路径：workspace 相对；`.deck.canvas.json` 是幻灯片（office 插件），不接 */
function resolveDocPath(raw: unknown, ctx: ToolCtx): { abs: string; rel: string } {
  const p = str(raw)?.trim();
  if (!p) throw new Error("path 不能为空");
  const lower = p.toLowerCase();
  if (lower.endsWith(DECK_SUFFIX)) {
    throw new Error("*.deck.canvas.json 是「幻灯片」档（office 插件），画布工具不接；普通画布档以 *.canvas.json 结尾");
  }
  if (!lower.endsWith(CANVAS_SUFFIX)) {
    throw new Error(`path 必须以 *.canvas.json 结尾（画布档的扩展名约定）：${p}`);
  }
  // 工作区信任根：只允许工作区内的相对路径（绝对路径 / .. 一律拒绝，
  // 与宿主文件命令的相对路径守卫同一纪律）
  if (path.isAbsolute(p)) throw new Error(`path 需为工作区相对路径（不带盘符/前导 /）：${p}`);
  const abs = path.resolve(ctx.workspace, p);
  if (abs !== ctx.workspace && !abs.startsWith(ctx.workspace + path.sep)) {
    throw new Error(`path 不许越过工作区根（..）：${p}`);
  }
  const rel = relPath(abs, ctx);
  return { abs, rel };
}

function relPath(abs: string, ctx: ToolCtx): string {
  const rel = path.relative(ctx.workspace, abs);
  return (rel && !rel.startsWith("..") ? rel : abs).split(path.sep).join("/");
}

function readText(abs: string): string {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    throw new Error(`文件不存在或不可读：${abs}（先用 list_docs 找档）`);
  }
}

/** 读档并过面板同款容错解析；JSON 坏 → 报错（面板正在写盘时让 agent 稍后重试） */
function loadDoc(abs: string): { doc: CanvasDoc; version: string } {
  const text = readText(abs);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`文件不是合法 JSON：${abs}（面板可能正在写盘，稍后重试）`);
  }
  const doc = parseDoc(raw);
  if (!doc) throw new Error(`文件不是画布文档（缺 objects）：${abs}`);
  return { doc, version: sha(text) };
}

/** 原子落盘：临时文件 + rename，避免宿主 600ms 轮询读到半截 JSON */
function saveDoc(abs: string, doc: CanvasDoc): { version: string; bytes: number } {
  const text = serializeDoc(doc) + "\n";
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_WRITE_BYTES) throw new Error(`文档过大（${bytes} 字节 > ${MAX_WRITE_BYTES}），拒绝写入`);
  const tmp = `${abs}.tmp-mcp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, abs);
  return { version: sha(text), bytes };
}

/** 文档名清洗：空白转 -、去路径/非法字符（与面板 createDoc 同族，Windows 安全） */
function safeDocName(raw: unknown): string {
  const cleaned = (str(raw) ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/\\:*?"<>|？：＊｜＞＜＼／]/g, "");
  return cleaned.slice(0, 80).replace(/^[-.]+/, "");
}

/* ------------------------------------------------------------------ */
/* 元素校验（kind 白名单 + 规模上限，照 SKILL.md schema）                 */
/* ------------------------------------------------------------------ */

const SHAPES = ["rect", "ellipse", "diamond", "triangle", "trapezoid", "pentagon", "hexagon", "star", ...LINE_SHAPE_KINDS];
const HEX = /^#[0-9a-fA-F]{3,8}$/;

function fail(msg: string): never {
  throw new Error(msg);
}

/** 数值范围校验（patch 白名单之外的脏数据在此拦下，报错而不是静默丢） */
function checkField(kind: string, key: string, v: unknown): void {
  const label = `${kind}.${key}`;
  const bad = (why: string): never => fail(`${label} ${why}`);
  switch (key) {
    case "x":
    case "y":
    case "w":
    case "h":
      if (num(v) === undefined) bad("必须是数字");
      // 负 w/h 会被面板解析钳成 1（线塌缩成点）：反向线类的正确写法是正 w/h + dir
      if ((key === "w" || key === "h") && (v as number) < 1) bad("需 ≥1（线类反向画向用 dir:1|2|3，别用负 w/h）");
      return;
    case "opacity":
      if (num(v) === undefined || (v as number) < 0 || (v as number) > 1) bad("需 0–1");
      return;
    case "rotation":
      if (num(v) === undefined) bad("必须是数字（角度）");
      return;
    case "radius":
    case "size":
      if (num(v) === undefined) bad("必须是数字");
      if (key === "radius" && ((v as number) < 0 || (v as number) > 200)) bad("需 0–200");
      if (key === "size" && ((v as number) < 1 || (v as number) > 400)) bad("需 1–400");
      return;
    case "strokeWidth":
      if (num(v) === undefined || (v as number) < 0 || (v as number) > 40) bad("需 0–40");
      return;
    case "curve":
      if (num(v) === undefined || (v as number) < -1 || (v as number) > 1) bad("需 -1–1");
      return;
    case "fill":
    case "stroke":
    case "color":
    case "headerFill":
      if (v !== "none" && (typeof v !== "string" || !HEX.test(v))) bad('需 #hex 或 "none"');
      return;
    case "shape":
      if (typeof v !== "string" || !SHAPES.includes(v)) bad(`需 ${SHAPES.join(" / ")}`);
      return;
    case "strokeStyle":
      if (v !== "solid" && v !== "dashed" && v !== "dotted") bad("需 solid / dashed / dotted");
      return;
    case "route":
      if (v !== "orth") bad('只支持 "orth"（正交走线）');
      return;
    case "label":
      if (typeof v !== "string" || v.length === 0 || v.length > MAX_LABEL_CHARS) bad(`需 1–${MAX_LABEL_CHARS} 字符`);
      return;
    case "fit":
      if (v !== "cover" && v !== "contain" && v !== "stretch") bad("需 cover / contain / stretch");
      return;
    case "src": {
      // 表达式位置收窄（语句位置的 never 调用在 TS7 下不参与 CFA）
      const s = typeof v === "string" && v.trim() ? v : bad("需 workspace 相对路径");
      if (s.startsWith("/") || s.includes("\\") || s.split("/").some((seg) => seg === "..")) {
        bad("必须是工作区相对路径（不许绝对路径或 ..）");
      }
      return;
    }
    case "url":
      if (typeof v !== "string" || !/^https?:\/\//.test(v)) bad("需 http(s) 绝对地址");
      return;
    case "title":
      if (typeof v !== "string" || v.length > 200) bad("需 ≤200 字符");
      return;
    case "code": {
      const s = typeof v === "string" && v.trim() ? v : bad("需非空源码");
      if (s.length > MAX_CODE_CHARS) bad(`超过 ${MAX_CODE_CHARS} 字符`);
      return;
    }
    case "theme":
      if (v !== "default" && v !== "dark" && v !== "neutral" && v !== "follow") bad("需 default / dark / neutral / follow");
      return;
    case "align":
      if (v !== "left" && v !== "center" && v !== "right") bad("需 left / center / right");
      return;
    case "vAlign":
      if (v !== "top" && v !== "middle" && v !== "bottom") bad("需 top / middle / bottom");
      return;
    case "runs": {
      const arr = Array.isArray(v) && v.length > 0 ? v : bad("需非空数组（字符串或 {text,…} run）");
      for (const r of arr) {
        const text = isObj(r) ? r.text : r;
        if (typeof text !== "string") bad("run 需含 text 字符串（或直接是字符串）");
      }
      return;
    }
    case "points": {
      const arr = Array.isArray(v) && v.length >= 2 ? v : bad("需 ≥2 个 [x,y] 点");
      if (arr.length > DRAW_MAX_POINTS) bad(`点数上限 ${DRAW_MAX_POINTS}（超出会被抽稀，先自己抽）`);
      for (const p of arr) {
        if (!Array.isArray(p) || num(p[0]) === undefined || num(p[1]) === undefined) bad("点是 [x,y] 数字对");
      }
      return;
    }
    case "pts": {
      const arr = Array.isArray(v) && v.length >= 3 ? v : bad("折线 pts 需 ≥3 个 [x,y]（相对 bbox 左上角）");
      for (const p of arr) {
        if (!Array.isArray(p) || num(p[0]) === undefined || num(p[1]) === undefined) bad("点是 [x,y] 数字对");
      }
      return;
    }
    case "startBind":
    case "endBind":
    case "groupId":
      if (v !== null && typeof v !== "string") bad("需元素 id 字符串（null 清除）");
      return;
    case "locked":
    case "header":
    case "showLegend":
      if (typeof v !== "boolean") bad("需 boolean");
      return;
    case "chart":
      if (typeof v !== "string" || !CHART_KINDS.includes(v as never)) bad(`需 ${CHART_KINDS.join(" / ")}`);
      return;
    case "labels": {
      const arr = Array.isArray(v) ? v : bad("需字符串数组");
      if (arr.some((s) => typeof s !== "string")) bad("需字符串数组");
      if (arr.length > 200) bad("≤200 项");
      return;
    }
    case "colors":
      if (!Array.isArray(v) || v.some((c) => typeof c !== "string" || !HEX.test(c))) bad("需 #hex 数组");
      return;
    case "colWidths":
      if (!Array.isArray(v) || v.some((n) => num(n) === undefined || (n as number) <= 0)) bad("需正数数组（列宽权重）");
      return;
    case "series": {
      const arr = Array.isArray(v) && v.length > 0 && v.length <= 8 ? v : bad("需 1–8 个系列的对象数组");
      for (const s of arr) {
        const so = isObj(s) ? s : bad("系列需为对象 {name, data}");
        const raw = so.data;
        const data = Array.isArray(raw) ? raw : bad("系列 data 需数值数组");
        if (data.some((d) => num(d) === undefined)) bad("系列 data 需数值数组");
        if (data.length > 500) bad("单系列 ≤500 个点");
      }
      return;
    }
    case "rows": {
      const arr = Array.isArray(v) && v.length > 0 ? v : bad("需非空二维数组");
      if (arr.length > TABLE_MAX_ROWS) bad(`行数上限 ${TABLE_MAX_ROWS}`);
      for (const row of arr) {
        const cells = Array.isArray(row) ? row : bad("rows 是二维数组");
        if (cells.length > TABLE_MAX_COLS) bad(`列数上限 ${TABLE_MAX_COLS}`);
        for (const cell of cells) {
          if (typeof cell !== "string" || cell.length > TABLE_MAX_CELL) bad(`单元格需字符串且 ≤${TABLE_MAX_CELL} 字符`);
        }
      }
      return;
    }
    default:
      return; // 白名单内但无需专检的字段
  }
}

/** 各 kind 可写的字段（patch_canvas update 的白名单；id/kind 不可改） */
const COMMON_FIELDS = ["x", "y", "w", "h", "opacity", "rotation", "groupId", "locked"] as const;
const KIND_FIELDS: Record<El["kind"], readonly string[]> = {
  text: [...COMMON_FIELDS, "runs", "align", "vAlign"],
  shape: [...COMMON_FIELDS, "shape", "fill", "stroke", "strokeWidth", "strokeStyle", "radius", "curve", "pts", "startBind", "endBind", "route", "label"],
  image: [...COMMON_FIELDS, "src", "fit", "radius"],
  mermaid: [...COMMON_FIELDS, "code", "theme"],
  draw: [...COMMON_FIELDS, "points", "stroke", "strokeWidth"],
  embed: [...COMMON_FIELDS, "url", "title"],
  svg: [...COMMON_FIELDS, "code"],
  table: [...COMMON_FIELDS, "rows", "colWidths", "header", "size", "fill", "headerFill", "stroke", "color"],
  chart: [...COMMON_FIELDS, "chart", "labels", "series", "colors", "showLegend", "size"],
};

/** 白名单过滤 + 逐字段校验；返回可直接合并进元素的补丁（不认识的字段丢弃并记名） */
function sanitizePatch(el: El, patch: Spec): { patch: Json; ignored: string[] } {
  const allowed = KIND_FIELDS[el.kind];
  const out: Json = {};
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) {
      ignored.push(k);
      continue;
    }
    checkField(el.kind, k, v);
    out[k] = v;
  }
  return { patch: out, ignored };
}

/**
 * add 路径的规模上限：add 走 parseDoc 容错（不在白名单校验路径上），
 * 超长 svg/mermaid 源码、超点数笔迹/表格会绕过 checkField 直达落盘——
 * 面板渲染 19MB svg 直接卡死。这里对四个体量大户补同一套上限（与 update 同规）。
 */
function checkElementBounds(el: El): void {
  const label = el.kind;
  switch (el.kind) {
    case "svg":
    case "mermaid":
      if (el.code.length > MAX_CODE_CHARS) fail(`${label}.code 超过 ${MAX_CODE_CHARS} 字符`);
      return;
    case "draw":
      if (el.points.length > DRAW_MAX_POINTS) fail(`${label}.points 超过 ${DRAW_MAX_POINTS} 点`);
      return;
    case "table":
      if (el.rows.length > TABLE_MAX_ROWS) fail(`${label}.rows 超过 ${TABLE_MAX_ROWS} 行`);
      return;
    case "text":
      if (el.runs.length > 400) fail(`${label}.runs 超过 400 段`);
      return;
    default:
      return;
  }
}

/* ------------------------------------------------------------------ */
/* 摘要视图                                                             */
/* ------------------------------------------------------------------ */

function head(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** 按类型抽一行摘要（read_doc summary 用；控制返回体积） */
function previewOf(el: El): Json {
  switch (el.kind) {
    case "text":
      return { text: head(el.runs.map((r) => (typeof r === "string" ? r : r.text)).join("")) };
    case "shape": {
      const out: Json = { shape: el.shape };
      if (el.dir) out.dir = el.dir;
      if (el.label) out.label = el.label;
      if (el.fill && el.fill !== "none") out.fill = el.fill;
      return out;
    }
    case "image":
      return { src: el.src };
    case "mermaid":
      return { code: head(el.code, 60) };
    case "draw":
      return { points: el.points.length };
    case "embed":
      return { url: head(el.url, 100) };
    case "svg":
      return { code: head(el.code, 60) };
    case "table":
      return {
        rows: el.rows.length,
        cols: el.rows[0]?.length ?? 0,
        head: head((el.rows[0] ?? []).join(" | ")),
      };
    case "chart":
      return {
        chart: el.chart,
        labels: el.labels.length,
        series: el.series.map((s) => str(s.name) ?? ""),
      };
    default:
      return {};
  }
}

function summaryOf(doc: CanvasDoc, path: string, version: string): Json {
  const objects = doc.objects.slice(0, MAX_SUMMARY_ELEMENTS).map((el) => ({
    id: el.id,
    kind: el.kind,
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    ...(el.groupId ? { groupId: el.groupId } : {}),
    ...previewOf(el),
  }));
  return {
    path,
    version,
    name: doc.meta.name,
    objects,
    total: doc.objects.length,
    ...(doc.objects.length > objects.length ? { truncated: true } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* 工具实现                                                             */
/* ------------------------------------------------------------------ */

function opListDocs(args: Spec, ctx: ToolCtx): unknown {
  const dirArg = str(args.dir)?.trim();
  let root = ctx.workspace;
  if (dirArg) {
    if (path.isAbsolute(dirArg)) throw new Error(`dir 需为工作区相对路径：${dirArg}`);
    root = path.resolve(ctx.workspace, dirArg);
    if (root !== ctx.workspace && !root.startsWith(ctx.workspace + path.sep)) {
      throw new Error(`dir 不许越过工作区根（..）：${dirArg}`);
    }
  }
  const docs: Json[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_LIST_DEPTH || docs.length >= MAX_LIST) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (docs.length >= MAX_LIST) return;
      if (name === "node_modules" || name.startsWith(".") || name.endsWith("-assets")) continue;
      const abs = path.join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(abs, depth + 1);
        continue;
      }
      const lower = name.toLowerCase();
      if (!lower.endsWith(CANVAS_SUFFIX) || lower.endsWith(DECK_SUFFIX)) continue;
      const entry: Json = { path: relPath(abs, ctx) };
      try {
        const st = statSync(abs);
        entry.size = st.size;
        entry.mtime = Math.round(st.mtimeMs);
        const { doc, version } = loadDoc(abs);
        entry.version = version;
        entry.name = doc.meta.name;
        entry.objects = doc.objects.length;
      } catch (err) {
        // 盘上存在但解析失败：照常列出并标注（agent 半途写坏等），不静默消失
        entry.corrupt = true;
        entry.error = err instanceof Error ? err.message : String(err);
      }
      docs.push(entry);
    }
  };
  walk(root, 0);
  return { workspace: ctx.workspace, dir: relPath(root, ctx), docs, truncated: docs.length >= MAX_LIST };
}

function opReadDoc(args: Spec, ctx: ToolCtx): unknown {
  const { abs, rel } = resolveDocPath(args.path, ctx);
  const { doc, version } = loadDoc(abs);
  const elementId = str(args.elementId)?.trim();
  if (elementId) {
    const el = doc.objects.find((e) => e.id === elementId);
    if (!el) {
      throw new Error(`元素 "${elementId}" 不存在（用 view:summary 拿最新 id 列表）`);
    }
    return { path: rel, version, element: el };
  }
  const view = str(args.view) ?? "summary";
  if (view === "full") {
    const text = serializeDoc(doc);
    return {
      path: rel,
      version,
      name: doc.meta.name,
      chars: text.length,
      ...(text.length <= MAX_FULL_CHARS ? { doc } : { truncated: true }),
    };
  }
  if (view !== "summary") throw new Error('view 只支持 summary（默认）/ full，或传 elementId 看单元素');
  return summaryOf(doc, rel, version);
}

function opCreateDoc(args: Spec, ctx: ToolCtx): unknown {
  const safe = safeDocName(args.name);
  if (!safe) throw new Error("name 需非空且不含路径分隔符（空格会转成 -）");
  // 后缀边界：造出来就进不了自家工具的档，建之前就拦（resolveDocPath 对这两种都拒绝）
  if (safe.toLowerCase().endsWith(".deck")) throw new Error("name 不能以 .deck 结尾（*.deck.canvas.json 是幻灯片档）");
  if (safe.toLowerCase().endsWith(CANVAS_SUFFIX)) throw new Error(`name 不带扩展名（.canvas.json 会自动补）：${safe}`);
  const rel = `${safe}${CANVAS_SUFFIX}`;
  const abs = path.resolve(ctx.workspace, rel);
  if (existsSync(abs)) throw new Error(`${rel} 已存在（换个名字，或直接 read_doc 后用 patch_canvas 改）`);
  const doc = blankDoc(safe);
  const { version } = saveDoc(abs, doc);
  return { path: rel, version, name: safe, objects: 0 };
}

function opWriteDoc(args: Spec, ctx: ToolCtx): unknown {
  const { abs, rel } = resolveDocPath(args.path, ctx);
  const doc = parseDoc(args.doc);
  if (!doc) throw new Error("doc 无法解析为画布文档（需 {version, meta, objects} 对象）");
  if (doc.objects.length > MAX_OBJECTS) fail(`元素数上限 ${MAX_OBJECTS}（当前 ${doc.objects.length}），再多拆档`);
  const { version } = saveDoc(abs, doc);
  return { path: rel, version, objects: doc.objects.length, name: doc.meta.name };
}

const Z_MODES = ["front", "back", "forward", "backward"] as const;
type ZMode = (typeof Z_MODES)[number];

/** patch_canvas：五种 op 顺序执行；校验先行（任一失败整体拒绝，不落半截档） */
function opPatchCanvas(args: Spec, ctx: ToolCtx): unknown {
  const { abs, rel } = resolveDocPath(args.path, ctx);
  const opsRaw = args.ops;
  if (!Array.isArray(opsRaw) || opsRaw.length === 0) throw new Error("ops 需非空数组");
  if (opsRaw.length > MAX_OPS) throw new Error(`单次最多 ${MAX_OPS} 个 op，分批调用`);

  const { doc } = loadDoc(abs);
  const results: Json[] = [];
  const addedIds: string[] = [];
  const updatedIds = new Set<string>();

  const idOr = (v: unknown, what: string): string =>
    typeof v === "string" && v.trim() ? v.trim() : fail(`${what} 缺 id 或 id 非字符串`);
  const findEl = (id: string): El => {
    const el = doc.objects.find((e) => e.id === id);
    return el ?? fail(`元素 "${id}" 不存在（先 read_doc view:summary 拿最新 id）`);
  };

  for (let i = 0; i < opsRaw.length; i += 1) {
    const op = opsRaw[i];
    if (!isObj(op)) fail(`ops[${i}] 需为对象`);
    const kind = str(op.op);
    switch (kind) {
      case "add": {
        const listRaw = op.el !== undefined ? [op.el] : op.els;
        if (!Array.isArray(listRaw) || listRaw.length === 0) fail(`ops[${i}] add 需要 el（单个）或 els（数组）`);
        if (listRaw.length > MAX_ADD_PER_OP) fail(`ops[${i}] add 单次 ≤${MAX_ADD_PER_OP} 个元素`);
        const ids: string[] = [];
        for (const raw of listRaw) {
          const parsed = parseDoc({ version: 3, meta: {}, objects: [raw] });
          const el = parsed?.objects[0] ?? fail(`ops[${i}] 元素无法解析（kind 必须是 text/shape/image/mermaid/draw/embed/svg/table/chart，几何字段齐全）`);
          // 安全面与规模上限在容错解析之外再拦一道：资产路径/嵌入地址不许逃逸，
          // 体量大户（源码/点集/表格）与 update 同规封口
          if (el.kind === "image") checkField("image", "src", el.src);
          if (el.kind === "embed") checkField("embed", "url", el.url);
          checkElementBounds(el);
          if (el.id && doc.objects.some((e) => e.id === el.id)) fail(`ops[${i}] 元素 id "${el.id}" 与现有元素重复`);
          doc.objects.push(el);
          ids.push(el.id);
          addedIds.push(el.id);
        }
        results.push({ op: "add", ids });
        break;
      }
      case "update": {
        const id = idOr(op.id, `ops[${i}] update`);
        const el = findEl(id);
        if (!isObj(op.patch)) fail(`ops[${i}] update 需要 patch 对象`);
        const { patch, ignored } = sanitizePatch(el, op.patch);
        // null = 清除该字段（删除属性而不是落 "field": null——面板解析同样按缺失处理，
        // 档面保持干净；非 null 的白名单字段直接合并）
        const record = el as unknown as Json;
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete record[k];
          else record[k] = v;
        }
        updatedIds.add(id);
        results.push({ op: "update", id, applied: Object.keys(patch), ...(ignored.length > 0 ? { ignored } : {}) });
        break;
      }
      case "delete": {
        const ids = op.ids ?? op.id;
        const list = Array.isArray(ids) ? ids : ids !== undefined ? [ids] : [];
        if (list.length === 0) fail(`ops[${i}] delete 需要 id 或 ids 数组`);
        const set = new Set<string>();
        for (const id of list) {
          if (typeof id !== "string") fail(`ops[${i}] delete 的 id 需为字符串`);
          if (!doc.objects.some((e) => e.id === id)) fail(`ops[${i}] 元素 "${id}" 不存在`);
          set.add(id);
        }
        doc.objects = doc.objects.filter((e) => !set.has(e.id));
        results.push({ op: "delete", deleted: [...set] });
        break;
      }
      case "z": {
        const id = idOr(op.id, `ops[${i}] z`);
        findEl(id);
        const mode = str(op.mode) as ZMode | undefined;
        if (!mode || !Z_MODES.includes(mode)) fail(`ops[${i}] z.mode 需 ${Z_MODES.join(" / ")}`);
        const from = doc.objects.findIndex((e) => e.id === id);
        const [el] = doc.objects.splice(from, 1);
        if (mode === "front") doc.objects.push(el);
        else if (mode === "back") doc.objects.unshift(el);
        else if (mode === "forward") doc.objects.splice(Math.min(from + 1, doc.objects.length), 0, el);
        else doc.objects.splice(Math.max(from - 1, 0), 0, el);
        results.push({ op: "z", id, mode });
        break;
      }
      case "move": {
        const id = idOr(op.id, `ops[${i}] move`);
        const el = findEl(id);
        const dx = num(op.dx) ?? 0;
        const dy = num(op.dy) ?? 0;
        const x = num(op.x);
        const y = num(op.y);
        if (x === undefined && y === undefined && dx === 0 && dy === 0) {
          fail(`ops[${i}] move 需要 x/y（绝对）或 dx/dy（相对）`);
        }
        if (x !== undefined) el.x = x;
        if (y !== undefined) el.y = y;
        el.x += dx;
        el.y += dy;
        updatedIds.add(id);
        results.push({ op: "move", id, x: el.x, y: el.y });
        break;
      }
      default:
        fail(`ops[${i}] op 只支持 add / update / delete / z / move："${kind ?? ""}"`);
    }
  }

  if (doc.objects.length > MAX_OBJECTS) fail(`元素数将超上限 ${MAX_OBJECTS}（当前 ${doc.objects.length}），本次 patch 整体拒绝`);
  const { version } = saveDoc(abs, doc);
  return {
    path: rel,
    version,
    applied: results.length,
    ...(addedIds.length > 0 ? { addedIds } : {}),
    ...(updatedIds.size > 0 ? { updatedIds: [...updatedIds] } : {}),
    results,
    hint: "改动已落盘，宿主会把新内容推给已打开的面板（约半秒上屏）",
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function opWatchDoc(args: Spec, ctx: ToolCtx): Promise<unknown> {
  const { abs, rel } = resolveDocPath(args.path, ctx);
  const timeout = Math.min(120_000, Math.max(1_000, num(args.timeoutMs) ?? 25_000));
  const view = str(args.view) ?? "summary";
  let current = str(args.since)?.trim() || sha(readText(abs));
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(350);
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue; // 面板换绑/写盘瞬间可能短暂不可读
    }
    const version = sha(text);
    if (version === current) continue;
    current = version;
    let doc: CanvasDoc | null = null;
    try {
      doc = parseDoc(JSON.parse(text));
    } catch {
      doc = null; // 面板写盘瞬间可能读到半截 JSON
    }
    if (!doc) return { path: rel, changed: true, version, error: "文件内容不是合法画布 JSON（面板可能正在写盘），稍后重试" };
    const payload = view === "full" ? { chars: text.length, ...(text.length <= MAX_FULL_CHARS ? { doc } : { truncated: true }) } : summaryOf(doc, rel, version);
    return { path: rel, changed: true, version, ...payload };
  }
  return { path: rel, changed: false, version: current, timedOut: true, hint: "超时无变更；再次调用继续等待" };
}

/* ------------------------------------------------------------------ */
/* 工具清单                                                             */
/* ------------------------------------------------------------------ */

const PATH_SCHEMA = {
  type: "string",
  description: "画布文档路径：工作区相对或绝对，扩展名须为 .canvas.json（*.deck.canvas.json 属幻灯片插件，不接）",
};

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "list_docs",
    description:
      "列出工作区里的画布文档（*.canvas.json，根目录 + 两层子目录，最多 60 份；*.deck.canvas.json 幻灯片档除外），带名称、元素数、版本哈希与损坏标记。找不到目标文档时先用它；返回的 version 可直接传给 watch_doc 的 since。",
    inputSchema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "可选：限定子目录（相对工作区）" },
      },
    },
    run: opListDocs,
  },
  {
    name: "read_doc",
    description:
      "读画布文档。默认 view:summary 返回元素摘要（id/kind/盒/类型预览），view:full 返回整档 JSON；给 elementId 只返回该元素完整 JSON。" +
      "编辑/推内容前先读，拿最新 id 与 version——面板会把用户的手动编辑防抖写回同一文件，你上次写的内容可能已被改动。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        view: { type: "string", description: "summary（默认）/ full" },
        elementId: { type: "string", description: "只看某个元素的完整 JSON" },
      },
      required: ["path"],
    },
    run: opReadDoc,
  },
  {
    name: "create_doc",
    description:
      "新建空白画布文档（<名称>.canvas.json），骨架原子落盘（不覆盖已有文件）。骨架落盘后宿主会自动打开「无限画布」面板并绑定；之后用 read_doc + patch_canvas 填内容。name 里的空格会转成 -。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "文档名（不含扩展名；如「头脑风暴」）" },
      },
      required: ["name"],
    },
    run: opCreateDoc,
  },
  {
    name: "patch_canvas",
    description:
      "画布局部写入（agent → 面板的主通道）。ops 按序执行、任一校验失败整体拒绝：" +
      '{op:"add", el}（或 els 数组批量，元素为 text/shape/image/mermaid/draw/embed/svg/table/chart 任一 kind 的完整 JSON，id 缺省自动生成，加在 z 顶层）；' +
      '{op:"update", id, patch}（字段白名单按 kind 校验，白名单外字段忽略并回报）；' +
      '{op:"delete", ids:[…]}；{op:"z", id, mode:"front/back/forward/backward"}；' +
      '{op:"move", id, x?, y?, dx?, dy?}。' +
      "坐标是画布绝对值（可负）；线类 bbox 用正 w/h，反向画向用 dir:1(右上)/2(左上)/3(左下)，别写负 w/h（会被钳成 1）；" +
      "连线建议带 startBind/endBind + route:\"orth\"。返回新 version，可直接给 watch_doc 的 since。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        ops: {
          type: "array",
          description: '操作数组（按序执行）：[{op:"add", el:{…}}, {op:"update", id:"t1", patch:{…}}, {op:"delete", ids:["r1"]}, …]',
          items: { type: "object" },
        },
      },
      required: ["path", "ops"],
    },
    run: opPatchCanvas,
  },
  {
    name: "write_doc",
    description:
      "整档写入画布文档（原子落盘，宿主会把新内容推给已打开的面板）。用于大批量重排/重构。" +
      "写入前务必先 read_doc（view:full）拿最新内容再增量改，别凭空整档重写（会丢用户刚做的编辑）；常规增删改请优先 patch_canvas。",
    inputSchema: {
      type: "object",
      properties: { path: PATH_SCHEMA, doc: { type: "object", description: "完整画布文档 JSON（{version:3, meta, objects}，对象不是字符串）" } },
      required: ["path", "doc"],
    },
    run: opWriteDoc,
  },
  {
    name: "watch_doc",
    description:
      "长轮询等待画布文档变更（默认 25 秒，最多 120 秒）：面板里用户的编辑会防抖写回文件，本工具等到内容变化后立刻返回变更摘要（view 同 read_doc）。" +
      "用 list_docs/read_doc/patch_canvas 返回的 version 传 since，避免漏掉两次调用之间的改动。返回 changed:false + timedOut 时再调一次即可继续等。这是「面板 → agent」的实时拉取通道。",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        since: { type: "string", description: "上次拿到的 version（缺省取调用时的当前版本）" },
        timeoutMs: { type: "number", description: "最长等待毫秒数（1000–120000，缺省 25000）" },
        view: { type: "string", description: "变更后返回的视图：summary（默认）/ full" },
      },
      required: ["path"],
    },
    run: opWatchDoc,
  },
];
