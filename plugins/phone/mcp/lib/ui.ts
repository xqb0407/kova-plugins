/**
 * uiautomator 控件树：dump → 解析 → 紧凑节点。
 *
 * 只保留对操作有用的字段（文本/描述/id/类/包围盒/中心点/可点击/可滚动），
 * 丢掉无文字又不可交互的容器，避免整棵树把 8KB 的工具输出上限撑爆。
 */
import { execOut, shell, AdbError } from "./adb";

export type UiNode = {
  text?: string;
  desc?: string;
  id?: string;
  cls?: string;
  bounds: [number, number, number, number];
  center: [number, number];
  clickable: boolean;
  scrollable: boolean;
  enabled: boolean;
  checked?: boolean;
  focused?: boolean;
  selected?: boolean;
  pkg?: string;
};

export type Selector = { text?: string; desc?: string; id?: string };

const NODE_RE = /<node\b([^>]*?)\/?>/g;
const ATTR_RE = /([A-Za-z_][\w:-]*)="([^"]*)"/g;
const BOUNDS_RE = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function clip(value: string | undefined, max = 120): string | undefined {
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** 解析 uiautomator dump 的 XML（不依赖 XML 库；属性正则足够） */
export function parseUiXml(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  for (const match of xml.matchAll(NODE_RE)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(ATTR_RE)) {
      attrs[attr[1]] = decodeEntities(attr[2]);
    }
    const boundsMatch = attrs.bounds?.match(BOUNDS_RE);
    if (!boundsMatch) continue;
    const x1 = Number(boundsMatch[1]);
    const y1 = Number(boundsMatch[2]);
    const x2 = Number(boundsMatch[3]);
    const y2 = Number(boundsMatch[4]);
    if (x2 <= x1 || y2 <= y1) continue;

    const text = clip(attrs.text);
    const desc = clip(attrs["content-desc"]);
    const id = clip(attrs["resource-id"], 160);
    const clickable = attrs.clickable === "true";
    const scrollable = attrs.scrollable === "true";
    // 无文字又不可交互的容器对操作没有价值，直接丢掉
    if (!text && !desc && !id && !clickable && !scrollable) continue;

    const cls = attrs.class ? attrs.class.split(".").pop() : undefined;
    nodes.push({
      ...(text ? { text } : {}),
      ...(desc ? { desc } : {}),
      ...(id ? { id } : {}),
      ...(cls ? { cls } : {}),
      bounds: [x1, y1, x2, y2],
      center: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
      clickable,
      scrollable,
      enabled: attrs.enabled !== "false",
      ...(attrs.checkable === "true" ? { checked: attrs.checked === "true" } : {}),
      ...(attrs.focused === "true" ? { focused: true } : {}),
      ...(attrs.selected === "true" ? { selected: true } : {}),
      ...(attrs.package ? { pkg: attrs.package } : {}),
    });
  }
  return nodes;
}

/** dump 一次 UI 树；动画期间可能失败，重试一次 */
export function dumpUi(
  adb: string,
  serial: string,
  timeoutMs = 20_000,
): { nodes: UiNode[]; xml: string } {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const dump = shell(adb, serial, "uiautomator dump /sdcard/kova_ui.xml", timeoutMs);
    const combined = `${dump.stdout}\n${dump.stderr}`;
    if (/dumped to/i.test(combined)) {
      const file = execOut(adb, serial, ["cat", "/sdcard/kova_ui.xml"], timeoutMs);
      const xml = file.buffer.toString("utf8");
      if (xml.includes("<hierarchy")) return { nodes: parseUiXml(xml), xml };
      lastError = "读取 /sdcard/kova_ui.xml 失败（内容为空或不是 UI 树）";
    } else {
      lastError = combined.trim().slice(0, 300) || "uiautomator dump 没有返回成功信息";
    }
    if (attempt === 0) sleepSync(400);
  }
  throw new AdbError(
    `获取 UI 控件树失败：${lastError}`,
    "锁屏 / 系统弹窗 / 界面持续动画都会导致 dump 失败：先唤醒并解锁，稍后重试；实在不行用截图 + 坐标操作",
  );
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* 忙等：只在重试间隔用 400ms */
  }
}

/** 按 selector 匹配：给出多个字段时是 AND 关系，均为不区分大小写的子串匹配 */
export function matchNode(node: UiNode, selector: Selector): boolean {
  const probe = (value: string | undefined, needle: string | undefined): boolean => {
    if (!needle) return true;
    return (value ?? "").toLowerCase().includes(needle.toLowerCase());
  };
  return probe(node.text, selector.text) && probe(node.desc, selector.desc) && probe(node.id, selector.id);
}

export function hasSelector(selector: Selector): boolean {
  return Boolean(selector.text || selector.desc || selector.id);
}

export function findNodes(nodes: UiNode[], selector: Selector): UiNode[] {
  return nodes.filter((node) => matchNode(node, selector));
}

/** 解析 `wm size`：优先返回 override，其次 physical */
export function screenSize(adb: string, serial: string): { width: number; height: number; physical?: string; override?: string } | undefined {
  try {
    const r = shell(adb, serial, "wm size", 8_000);
    const physical = r.stdout.match(/Physical size:\s*(\d+)x(\d+)/i);
    const override = r.stdout.match(/Override size:\s*(\d+)x(\d+)/i);
    const chosen = override ?? physical;
    if (!chosen) return undefined;
    return {
      width: Number(chosen[1]),
      height: Number(chosen[2]),
      ...(physical ? { physical: `${physical[1]}x${physical[2]}` } : {}),
      ...(override ? { override: `${override[1]}x${override[2]}` } : {}),
    };
  } catch {
    return undefined;
  }
}

/** 当前前台应用包名（尽力而为；取不到返回 undefined） */
export function foregroundPackage(adb: string, serial: string): string | undefined {
  try {
    const r = shell(adb, serial, "dumpsys activity activities", 10_000);
    const line = r.stdout.split("\n").find((l) => /mResumedActivity|topResumedActivity/.test(l));
    const m = line?.match(/([A-Za-z0-9_.]+)\/[A-Za-z0-9_.$]+/);
    return m?.[1];
  } catch {
    return undefined;
  }
}

export function currentIme(adb: string, serial: string): string | undefined {
  try {
    const r = shell(adb, serial, "settings get secure default_input_method", 5_000);
    const value = r.stdout.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function hasAdbKeyboard(adb: string, serial: string): boolean {
  try {
    const r = shell(adb, serial, "pm list packages com.android.adbkeyboard", 8_000);
    return r.stdout.includes("com.android.adbkeyboard");
  } catch {
    return false;
  }
}
