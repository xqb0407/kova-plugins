// @bun
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// node_modules/polygon-clipping/dist/polygon-clipping.esm.js
var exports_polygon_clipping_esm = {};
__export(exports_polygon_clipping_esm, {
  default: () => index
});

// mcp/server.ts
import { createInterface } from "readline";

// mcp/tools.ts
import { readdirSync, readFileSync as readFileSync3, renameSync, statSync, writeFileSync as writeFileSync2 } from "fs";
import path3 from "path";

// ui/src/jsonfix.ts
var MAX_INPUT = 4 * 1024 * 1024;
var MAX_CUT_CANDIDATES = 160;
var isIdentStart = (ch) => /[\p{L}_$]/u.test(ch);
var isIdentPart = (ch) => /[\p{L}\p{N}_$-]/u.test(ch);

class Counter {
  m = new Map;
  bump(label) {
    this.m.set(label, (this.m.get(label) ?? 0) + 1);
  }
  list() {
    return [...this.m.entries()].map(([k, n]) => n > 1 ? `${k} \xD7${n}` : k);
  }
  get size() {
    return this.m.size;
  }
}
function fixJsonText(input) {
  const raw = typeof input === "string" ? input : "";
  if (!raw)
    return { text: raw, fixes: [], changed: false };
  if (tryParse(raw) !== NOT_JSON)
    return { text: raw, fixes: [], changed: false };
  if (raw.length > MAX_INPUT)
    return { text: raw, fixes: [], changed: false };
  const count = new Counter;
  const stripped = stripOuter(raw, count);
  const scanned = scanRepair(stripped, count);
  if (tryParse(scanned) !== NOT_JSON) {
    return { text: scanned, fixes: count.list(), changed: true };
  }
  const closed = closeAndParse(scanned);
  if (closed !== null) {
    count.bump("\u5185\u5BB9\u622A\u65AD\uFF08\u5DF2\u8865\u5168\u7ED3\u5C3E\uFF09");
    return { text: closed, fixes: count.list(), changed: true };
  }
  const salvaged = salvageByCut(scanned);
  if (salvaged !== null) {
    count.bump("\u5185\u5BB9\u622A\u65AD\uFF08\u5DF2\u5F03\u5C3E\u4FDD\u5168\uFF09");
    return { text: salvaged, fixes: count.list(), changed: true };
  }
  return { text: scanned, fixes: count.list(), changed: true };
}
function stripOuter(input, count) {
  let s = input;
  if (s.charCodeAt(0) === 65279) {
    s = s.slice(1);
    count.bump("BOM \u5934");
  }
  const fence = /```[ \t]*[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)```/.exec(s);
  if (fence) {
    const inner = fence[1] ?? "";
    if (tryParse(inner.trim()) !== NOT_JSON || /[[{]/.test(inner)) {
      s = inner;
      count.bump("Markdown \u56F4\u680F");
    }
  }
  const first = firstOf(s, "{", "[");
  const last = lastOf(s, "}", "]");
  if (first > 0 || last >= 0 && last < trimEnd(s).length - 1) {
    if (first >= 0 && last > first) {
      s = s.slice(first, last + 1);
      count.bump("\u9996\u5C3E\u591A\u4F59\u6587\u5B57");
    }
  }
  return s;
}
var firstOf = (s, a, b) => {
  const ia = s.indexOf(a);
  const ib = s.indexOf(b);
  if (ia < 0)
    return ib;
  if (ib < 0)
    return ia;
  return Math.min(ia, ib);
};
var lastOf = (s, a, b) => Math.max(s.lastIndexOf(a), s.lastIndexOf(b));
var trimEnd = (s) => s.replace(/\s+$/, "");
function scanRepair(input, count) {
  let out = "";
  let i = 0;
  const n = input.length;
  const lastSig = () => {
    for (let k = out.length - 1;k >= 0; k--) {
      const c = out[k];
      if (c !== " " && c !== `
` && c !== "\t" && c !== "\r")
        return c;
    }
    return "";
  };
  const skipWs = (from) => {
    let k = from;
    while (k < n && /\s/.test(input[k]))
      k++;
    return k;
  };
  const skipWsComments = (from) => {
    let k = from;
    for (;; ) {
      k = skipWs(k);
      if (input[k] === "/" && input[k + 1] === "/") {
        const nl = input.indexOf(`
`, k);
        k = nl < 0 ? n : nl + 1;
        continue;
      }
      if (input[k] === "/" && input[k + 1] === "*") {
        const end = input.indexOf("*/", k + 2);
        k = end < 0 ? n : end + 2;
        continue;
      }
      return k;
    }
  };
  while (i < n) {
    const ch = input[i];
    if (ch === "/" && input[i + 1] === "/") {
      const nl = input.indexOf(`
`, i);
      i = nl < 0 ? n : nl;
      count.bump("\u884C\u6CE8\u91CA //");
      continue;
    }
    if (ch === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      count.bump("\u5757\u6CE8\u91CA /* */");
      continue;
    }
    if (ch === '"') {
      out += ch;
      i++;
      while (i < n) {
        const c = input[i];
        if (c === "\\") {
          out += c + (input[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (c === '"') {
          out += c;
          i++;
          break;
        }
        if (c === `
`) {
          out += "\\n";
          count.bump("\u5B57\u7B26\u4E32\u5185\u672A\u8F6C\u4E49\u6362\u884C");
          i++;
          continue;
        }
        if (c === "\r") {
          out += "\\r";
          i++;
          continue;
        }
        if (c === "\t") {
          out += "\\t";
          count.bump("\u5B57\u7B26\u4E32\u5185\u672A\u8F6C\u4E49\u5236\u8868\u7B26");
          i++;
          continue;
        }
        if (c < " ") {
          out += `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
          i++;
          continue;
        }
        out += c;
        i++;
      }
      continue;
    }
    if (ch === "'") {
      let body = "";
      let j = i + 1;
      while (j < n) {
        const c = input[j];
        if (c === "\\") {
          const nxt = input[j + 1] ?? "";
          body += nxt === "'" ? "'" : nxt === '"' ? "\\\"" : `\\${nxt}`;
          j += 2;
          continue;
        }
        if (c === "'") {
          j++;
          break;
        }
        if (c === '"') {
          body += "\\\"";
          j++;
          continue;
        }
        if (c === `
`) {
          body += "\\n";
          j++;
          continue;
        }
        body += c;
        j++;
      }
      out += `"${body}"`;
      i = j;
      count.bump("\u5355\u5F15\u53F7\u5B57\u7B26\u4E32");
      continue;
    }
    if (ch === ",") {
      const k = skipWsComments(i + 1);
      if (input[k] === "}" || input[k] === "]") {
        count.bump("\u5C3E\u9017\u53F7");
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === "\u201C" || ch === "\u2018") {
      const closer = ch === "\u201C" ? "\u201D" : "\u2019";
      const end = input.indexOf(closer, i + 1);
      if (end > i) {
        const after = skipWs(end + 1);
        const isKey = input[after] === ":";
        const ctxChar = lastSig();
        const isValuePos = ctxChar === ":" || ctxChar === "," || ctxChar === "[" || ctxChar === "";
        if (isKey || isValuePos) {
          const body = input.slice(i + 1, end).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n");
          out += `"${body}"`;
          i = end + 1;
          count.bump(isKey ? "\u4E2D\u6587\u5F15\u53F7\u952E\u540D" : "\u4E2D\u6587\u5F15\u53F7\u5B57\u7B26\u4E32");
          continue;
        }
      }
      out += ch;
      i++;
      continue;
    }
    if (isIdentStart(ch)) {
      const ctxChar = lastSig();
      let j = i;
      while (j < n && isIdentPart(input[j]))
        j++;
      const word = input.slice(i, j);
      const after = skipWsComments(j);
      const isKeyPos = ctxChar === "{" || ctxChar === "," || ctxChar === "";
      if (input[after] === ":" && isKeyPos) {
        out += `"${word}"`;
        i = j;
        count.bump("\u88F8\u952E\u540D");
        continue;
      }
      if (!isKeyPos && (word === "undefined" || word === "NaN" || word === "Infinity")) {
        out += "null";
        i = j;
        count.bump(`${word} \u2192 null`);
        continue;
      }
      out += word;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
var NOT_JSON = Symbol("not-json");
function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}
function closersFor(text) {
  const stack = [];
  let inStr = false;
  for (let i = 0;i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\")
        i++;
      else if (c === '"')
        inStr = false;
      continue;
    }
    if (c === '"')
      inStr = true;
    else if (c === "{")
      stack.push("}");
    else if (c === "[")
      stack.push("]");
    else if (c === "}" || c === "]")
      stack.pop();
  }
  let out = inStr ? '"' : "";
  while (stack.length)
    out += stack.pop();
  return out;
}
function closeAndParse(text) {
  let s = text.replace(/\s+$/, "");
  for (let round = 0;round < 4; round++) {
    const before = s;
    if (s.endsWith(":"))
      s = s.slice(0, -1).replace(/\s+$/, "");
    if (s.endsWith(","))
      s = s.slice(0, -1).replace(/\s+$/, "");
    const m = /"((?:[^"\\]|\\.)*)"$/.exec(s);
    if (m) {
      const beforeKey = s.slice(0, m.index).replace(/\s+$/, "");
      if (beforeKey.endsWith(",") || beforeKey.endsWith("{") || beforeKey.endsWith("[")) {
        s = beforeKey;
      }
    }
    if (s === before)
      break;
  }
  const candidate = s + closersFor(s);
  return tryParse(candidate) !== NOT_JSON ? candidate : null;
}
function salvageByCut(text) {
  const cuts = [];
  let inStr = false;
  for (let i = 0;i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\")
        i++;
      else if (c === '"')
        inStr = false;
      continue;
    }
    if (c === '"')
      inStr = true;
    else if (c === ",")
      cuts.push(i);
  }
  let tried = 0;
  for (let k = cuts.length - 1;k >= 0 && tried < MAX_CUT_CANDIDATES; k--, tried++) {
    const prefix = text.slice(0, cuts[k]).replace(/\s+$/, "");
    const candidate = prefix + closersFor(prefix.replace(/"$/, ""));
    const parsed = tryParse(candidate);
    if (parsed !== NOT_JSON)
      return candidate;
  }
  return null;
}

// ui/src/icons/data.ts
var ICONS = {
  "a-arrow-down": "M14 12l4 4 4 -4 M18 16V7M2 16l4.04 -9.69 a .5 .5 0 0 1 .923 0 L 11 16M3.304 13h6.392",
  "a-arrow-up": "M14 11l4 -4 4 4 M18 16V7M2 16l4.04 -9.69 a .5 .5 0 0 1 .923 0 L 11 16M3.304 13h6.392",
  "a-large-small": "M15 16l2.54 -7.33 a 1.02 1.02 1 0 1 1.928 0 L 22 16M15.697 14h5.606M2 16l4.04 -9.69 a .5 .5 0 0 1 .923 0 L 11 16M3.304 13h6.392",
  accessibility: "M15 4a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18 19l1 -7 -6 1 M5 8l3 -3 5.5 3 -2.36 3.5 M4.24 14.5a5 5 0 0 0 6.88 6M13.76 17.5a5 5 0 0 0-6.88-6",
  activity: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
  ad: "M10 13H6M10 15v-4a2 2 0 0 0-4 0v4M14 14.5a.5.5 0 0 0 .5.5h1a2.5 2.5 0 0 0 2.5-2.5v-1A2.5 2.5 0 0 0 15.5 9h-1a.5.5 0 0 0-.5.5zM4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "air-vent": "M18 17.5a2.5 2.5 0 1 1-4 2.03V12M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 8h12M6.6 15.572A2 2 0 1 0 10 17v-5",
  airplay: "M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1M12 15l5 6 H 7 Z",
  "alarm-clock": "M4 13a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M12 9v4l2 2M5 3 2 6M22 6l-3 -3 M6.38 18.7 4 21M17.64 18.67 20 21",
  "alarm-clock-check": "M4 13a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M5 3 2 6M22 6l-3 -3 M6.38 18.7 4 21M17.64 18.67 20 21M9 13l2 2 4 -4 ",
  "alarm-clock-minus": "M4 13a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M5 3 2 6M22 6l-3 -3 M6.38 18.7 4 21M17.64 18.67 20 21M9 13h6",
  "alarm-clock-off": "M6.87 6.87a8 8 0 1 0 11.26 11.26M19.9 14.25a8 8 0 0 0-9.15-9.15M22 6l-3 -3 M6.26 18.67 4 21M2 2l20 20 M4 4 2 6",
  "alarm-clock-plus": "M4 13a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M5 3 2 6M22 6l-3 -3 M6.38 18.7 4 21M17.64 18.67 20 21M12 10v6M9 13h6",
  "alarm-smoke": "M11 21c0-2.5 2-2.5 2-5M16 21c0-2.5 2-2.5 2-5M19 8l-0.8 3 a 1.25 1.25 0 0 1 -1.2 1 H 7 a 1.25 1.25 0 0 1 -1.2 -1 L 5 8M21 3a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1zM6 21c0-2.5 2-2.5 2-5",
  "align-center-horizontal": "M2 12h20M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1",
  "align-center-vertical": "M12 2v20M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1",
  "align-end-horizontal": "M6 2h2a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM16 9h2a2 2 0 0 1 2 2v5a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-5a2 2 0 0 1 2 -2ZM22 22H2",
  "align-end-vertical": "M4 4h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM11 14h5a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-5a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM22 22V2",
  "align-horizontal-distribute-center": "M6 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM16 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2ZM17 22v-5M17 7V2M7 22v-3M7 5V2",
  "align-horizontal-distribute-end": "M6 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM16 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2ZM10 2v20M20 2v20",
  "align-horizontal-distribute-start": "M6 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM16 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2ZM4 2v20M14 2v20",
  "align-horizontal-justify-center": "M4 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM18 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2ZM12 2v20",
  "align-horizontal-justify-end": "M4 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM14 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2ZM22 2v20",
  "align-horizontal-justify-start": "M8 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM18 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2ZM2 2v20",
  "align-horizontal-space-around": "M11 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2ZM4 22V2M20 22V2",
  "align-horizontal-space-between": "M5 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM17 7h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2ZM3 2v20M21 2v20",
  "align-start-horizontal": "M6 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM16 6h2a2 2 0 0 1 2 2v5a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-5a2 2 0 0 1 2 -2ZM22 2H2",
  "align-start-vertical": "M8 14h5a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-5a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM8 4h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM2 2v20",
  "align-vertical-distribute-center": "M22 17h-3M22 7h-5M5 17H2M7 7H2M7 14h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM9 4h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2Z",
  "align-vertical-distribute-end": "M7 14h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM9 4h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM2 20h20M2 10h20",
  "align-vertical-distribute-start": "M7 14h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM9 4h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM2 14h20M2 4h20",
  "align-vertical-justify-center": "M7 16h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM9 2h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM2 12h20",
  "align-vertical-justify-end": "M7 12h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM9 2h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM2 22h20",
  "align-vertical-justify-start": "M7 16h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM9 6h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM2 2h20",
  "align-vertical-space-around": "M9 9h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM22 20H2M22 4H2",
  "align-vertical-space-between": "M7 15h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM9 3h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM2 21h20M2 3h20",
  ambulance: "M10 10H6M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14M8 8v4M9 18h6M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  ampersand: "M16 12h3M17.5 12a8 8 0 0 1-8 8A4.5 4.5 0 0 1 5 15.5c0-6 8-4 8-8.5a3 3 0 1 0-6 0c0 3 2.5 8.5 12 13",
  ampersands: "M10 17c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6 0 1.7 1.3 3 3 3 2.8 0 5-2.2 5-5M22 17c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6 0 1.7 1.3 3 3 3 2.8 0 5-2.2 5-5",
  amphora: "M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8M10 5H8a2 2 0 0 0 0 4h.68M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8M14 5h2a2 2 0 0 1 0 4h-.68M18 22H6M9 2h6",
  anchor: "M12 6v16M19 13l2 -1 a 9 9 0 0 1 -18 0 l 2 1M9 11h6M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  angle: "M3 3v16a2 2 0 0 0 2 2h16M3 11a10 10 0 0 1 10 10",
  antenna: "M2 12 7 2M7 12l5 -10 M12 12l5 -10 M17 12l5 -10 M4.5 7h15M12 16v6",
  anvil: "M7 10H6a4 4 0 0 1-4-4 1 1 0 0 1 1-1h4M7 5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1 7 7 0 0 1-7 7H8a1 1 0 0 1-1-1zM9 12v5M15 12v5M5 20a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3 1 1 0 0 1-1 1H6a1 1 0 0 1-1-1",
  aperture: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M14.31 8l5.74 9.94 M9.69 8h11.48M7.38 12l5.74 -9.94 M9.69 16 3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94 ",
  "app-window": "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM10 4v4M2 8h20M6 4v4",
  "app-window-mac": "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM6 8h.01M10 8h.01M14 8h.01",
  apple: "M12 6.528V3a1 1 0 0 1 1-1h0M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21",
  archive: "M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4",
  "archive-restore": "M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM4 8v11a2 2 0 0 0 2 2h2M20 8v11a2 2 0 0 1-2 2h-2M9 15l3 -3 3 3 M12 12v9",
  "archive-x": "M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M9.5 17l5 -5 M9.5 12l5 5 ",
  armchair: "M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0zM5 18v2M19 18v2",
  "arrow-big-down": "M9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-7.086 7.086a1 1 0 0 1-1.414 0l-7.086-7.086a.707.707 0 0 1 .5-1.207H8a1 1 0 0 0 1-1z",
  "arrow-big-down-dash": "M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1zM9 4h6",
  "arrow-big-left": "M10.793 19.793a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-6a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707z",
  "arrow-big-left-dash": "M13 9a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707l6.94 6.94a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1zM20 9v6",
  "arrow-big-right": "M13.207 19.793a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707z",
  "arrow-big-right-dash": "M11 9a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707l-6.94 6.94a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM4 9v6",
  "arrow-big-up": "M9 19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-7.086-7.086a1 1 0 0 0-1.414 0l-7.086 7.086a.707.707 0 0 0 .5 1.207H8a1 1 0 0 1 1 1z",
  "arrow-big-up-dash": "M14 16a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-6.939-6.939a1.207 1.207 0 0 0-1.708 0l-6.94 6.94a.707.707 0 0 0 .5 1.206H8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1zM9 20h6",
  "arrow-down": "M12 5v14M19 12l-7 7 -7 -7 ",
  "arrow-down-0-1": "M3 16l4 4 4 -4 M7 20V4M17 4h0a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM17 20v-6h-2M15 20h4",
  "arrow-down-1-0": "M3 16l4 4 4 -4 M7 20V4M17 10V4h-2M15 10h4M17 14h0a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2Z",
  "arrow-down-a-z": "M3 16l4 4 4 -4 M7 20V4M20 8h-5M15 10V6.5a2.5 2.5 0 0 1 5 0V10M15 14h5l-5 6h5",
  "arrow-down-from-line": "M19 3H5M12 21V7M6 15l6 6 6 -6 ",
  "arrow-down-left": "M17 7 7 17M17 17H7V7",
  "arrow-down-narrow-wide": "M3 16l4 4 4 -4 M7 20V4M11 4h4M11 8h7M11 12h10",
  "arrow-down-right": "M7 7l10 10 M17 7v10H7",
  "arrow-down-to-dot": "M12 2v14M19 9l-7 7 -7 -7 M11 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "arrow-down-to-line": "M12 17V3M6 11l6 6 6 -6 M19 21H5",
  "arrow-down-up": "M3 16l4 4 4 -4 M7 20V4M21 8l-4 -4 -4 4 M17 4v16",
  "arrow-down-wide-narrow": "M3 16l4 4 4 -4 M7 20V4M11 4h10M11 8h7M11 12h4",
  "arrow-down-z-a": "M3 16l4 4 4 -4 M7 4v16M15 4h5l-5 6h5M15 20v-3.5a2.5 2.5 0 0 1 5 0V20M20 18h-5",
  "arrow-left": "M12 19l-7 -7 7 -7 M19 12H5",
  "arrow-left-from-line": "M9 6l-6 6 6 6 M3 12h14M21 19V5",
  "arrow-left-right": "M8 3 4 7l4 4M4 7h16M16 21l4 -4 -4 -4 M20 17H4",
  "arrow-left-to-line": "M3 19V5M13 6l-6 6 6 6 M7 12h14",
  "arrow-right": "M5 12h14M12 5l7 7 -7 7 ",
  "arrow-right-from-line": "M3 5v14M21 12H7M15 18l6 -6 -6 -6 ",
  "arrow-right-left": "M16 3l4 4 -4 4 M20 7H4M8 21l-4 -4 4 -4 M4 17h16",
  "arrow-right-to-line": "M17 12H3M11 18l6 -6 -6 -6 M21 5v14",
  "arrow-up": "M5 12l7 -7 7 7 M12 19V5",
  "arrow-up-0-1": "M3 8l4 -4 4 4 M7 4v16M17 4h0a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM17 20v-6h-2M15 20h4",
  "arrow-up-1-0": "M3 8l4 -4 4 4 M7 4v16M17 10V4h-2M15 10h4M17 14h0a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2Z",
  "arrow-up-a-z": "M3 8l4 -4 4 4 M7 4v16M20 8h-5M15 10V6.5a2.5 2.5 0 0 1 5 0V10M15 14h5l-5 6h5",
  "arrow-up-down": "M21 16l-4 4 -4 -4 M17 20V4M3 8l4 -4 4 4 M7 4v16",
  "arrow-up-from-dot": "M5 9l7 -7 7 7 M12 16V2M11 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "arrow-up-from-line": "M18 9l-6 -6 -6 6 M12 3v14M5 21h14",
  "arrow-up-left": "M7 17V7h10M17 17 7 7",
  "arrow-up-narrow-wide": "M3 8l4 -4 4 4 M7 4v16M11 12h4M11 16h7M11 20h10",
  "arrow-up-right": "M7 7h10v10M7 17 17 7",
  "arrow-up-to-line": "M5 3h14M18 13l-6 -6 -6 6 M12 7v14",
  "arrow-up-wide-narrow": "M3 8l4 -4 4 4 M7 4v16M11 12h10M11 16h7M11 20h4",
  "arrow-up-z-a": "M3 8l4 -4 4 4 M7 4v16M15 4h5l-5 6h5M15 20v-3.5a2.5 2.5 0 0 1 5 0V20M20 18h-5",
  "arrows-up-from-line": "M4 6l3 -3 3 3 M7 17V3M14 6l3 -3 3 3 M17 17V3M4 21h16",
  asterisk: "M12 5v14M18.07 8.5l-12.12 7 M5.94 8.5l12.13 7 ",
  astroid: "M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203",
  "at-sign": "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8",
  atom: "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5ZM15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z",
  "audio-lines": "M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3",
  "audio-lines-off": "M10 10v11M10 3v1.35M14 14v1M14 8v.35M18 5v7.35M2 10v3M2 2l20 20 M22 10v3M6 6v11",
  "audio-lines-x": "M10 3v18M14 8v6.35M17 17l5 5 M18 5v8.1M2 10v3M22 10v3M22 17l-5 5 M6 6v11",
  "audio-waveform": "M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2",
  award: "M15.48 12.89l1.52 8.53 a .5 .5 0 0 1 -.81 .47 l -3.58 -2.687 a 1 1 0 0 0 -1.197 0 l -3.586 2.686 a .5 .5 0 0 1 -.81 -.469 l 1.514 -8.526M6 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  axe: "M14 12l-8.38 8.38 a 1 1 0 0 1 -3.001 -3 L 11 9M15 15.5a.5.5 0 0 0 .5.5A6.5 6.5 0 0 0 22 9.5a.5.5 0 0 0-.5-.5h-1.672a2 2 0 0 1-1.414-.586l-5.062-5.062a1.205 1.205 0 0 0-1.704 0L9.352 5.648a1.205 1.205 0 0 0 0 1.704l5.062 5.062A2 2 0 0 1 15 13.828z",
  "axis-3d": "M13.5 10.5 15 9M4 4v15a1 1 0 0 0 1 1h15M4.293 19.707 6 18M9 15l1.5 -1.5 ",
  baby: "M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5M15 12h.01M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1M9 12h.01",
  backpack: "M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 10h8M8 18h8M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2",
  badge: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
  "badge-alert": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM12 8L12 12M12 16L12.01 16",
  "badge-cent": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM12 7v10M15.4 10a4 4 0 1 0 0 4",
  "badge-check": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM16 9l-5.5 5.5 L 8 12",
  "badge-dollar-sign": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6",
  "badge-euro": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM7 12h5M15 9.4a4 4 0 1 0 0 5.2",
  "badge-indian-rupee": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM8 8h8M8 12h8M13 17l-5 -1 h 1 a 4 4 0 0 0 0 -8",
  "badge-info": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM12 16L12 12M12 8L12.01 8",
  "badge-japanese-yen": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM9 8l3 3 v 7M12 11l3 -3 M9 12h6M9 16h6",
  "badge-minus": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM8 12L16 12",
  "badge-percent": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM15 9l-6 6 M9 9h.01M15 15h.01",
  "badge-plus": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM12 8L12 16M8 12L16 12",
  "badge-pound-sterling": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM8 12h4M10 16V9.5a2.5 2.5 0 0 1 5 0M8 16h7",
  "badge-question-mark": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17L12.01 17",
  "badge-russian-ruble": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM9 16h5M9 12h5a2 2 0 1 0 0-4h-3v9",
  "badge-swiss-franc": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM11 17V8h4M11 12h3M9 16h4",
  "badge-turkish-lira": "M11 7v10a5 5 0 0 0 5-5M15 8l-6 3 M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76",
  "badge-x": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM15 9L9 15M9 9L15 15",
  "baggage-claim": "M22 18H6a2 2 0 0 1-2-2V7a2 2 0 0 0-2-2M17 14V4a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2v10M9 6h11a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-11a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1ZM16 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M7 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  balloon: "M12 16v1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v1M12 6a2 2 0 0 1 2 2M18 8c0 4-3.5 8-6 8s-6-4-6-8a6 6 0 0 1 12 0",
  ban: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M4.929 4.929 19.07 19.071",
  banana: "M4 13c3.5-2 8-2 10 2a5.5 5.5 0 0 1 8 5M5.15 17.89c5.52-1.52 8.65-6.89 7-12C11.55 4 11.5 2 13 2c3.22 0 5 5.5 5 8 0 6.5-4.2 12-10.49 12C5.11 22 2 22 2 20c0-1.5 1.14-1.55 3.15-2.11Z",
  bandage: "M10 10.01h.01M10 14.01h.01M14 10.01h.01M14 14.01h.01M18 6v12M6 6v12M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  banknote: "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 12h.01M18 12h.01",
  "banknote-arrow-down": "M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5M16 19l3 3 3 -3 M18 12h.01M19 16v6M6 12h.01M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "banknote-arrow-up": "M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5M18 12h.01M19 22v-6M22 19l-3 -3 -3 3 M6 12h.01M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "banknote-check": "M11.748 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4.875M16 19l2 2 4 -4 M18 12h.01M6 12h.01M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "banknote-x": "M13 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5M17 17l5 5 M18 12h.01M22 17l-5 5 M6 12h.01M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  barcode: "M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14",
  barrel: "M10 3a41 41 0 000 18M14 3a41 41 0 010 18M16.997 21a2 2 0 001.68-.92 15.25 15.25 0 000-16.16 2 2 0 00-1.68-.92h-10a2 2 0 00-1.681.92 15.25 15.25 0 000 16.16 2 2 0 001.681.92zM3.54 16h16.914M3.54 8h16.914",
  baseline: "M4 20h16M6 16l6 -12 6 12 M8 12h8",
  bath: "M10 4 8 6M17 19v2M2 12h20M7 19v2M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
  battery: "M 22 14 L 22 10M4 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "battery-charging": "M11 7l-3 5 h 4 l -3 5M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935M22 14v-4M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936",
  "battery-full": "M10 10v4M14 10v4M22 14v-4M6 10v4M4 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "battery-low": "M22 14v-4M6 14v-4M4 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "battery-medium": "M10 14v-4M22 14v-4M6 14v-4M4 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "battery-plus": "M10 9v6M12.543 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.605M22 14v-4M7 12h6M7.606 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.606",
  "battery-warning": "M10 17h.01M10 7v6M14 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2M22 14v-4M6 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2",
  beaker: "M4.5 3h15M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3M6 14h12",
  bean: "M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402ZM5.341 10.62a4 4 0 1 0 5.279-5.28",
  "bean-off": "M9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22a13.96 13.96 0 0 0 9.9-4.1M10.75 5.093A6 6 0 0 1 22 8c0 2.411-.61 4.68-1.683 6.66M5.341 10.62a4 4 0 0 0 6.487 1.208M10.62 5.341a4.015 4.015 0 0 1 2.039 2.04M2 2L22 22",
  bed: "M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9",
  "bed-double": "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 4v6M2 18h20",
  "bed-single": "M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M3 18h18",
  beef: "M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3M18.5 6l1.75 3.5 a 6.48 6.48 0 0 1 -1.854 8.2 C 15.4 20.2 11 22 7 22 a 3 3 0 0 1 -2.68 -1.66 L 2.4 16.5M10 8.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  "beef-off": "M11.771 6.109a2.5 2.5 0 0 1 3.12 3.12M17.852 12.185a6.5 6.5 0 0 0-9.035-9.04M18.013 18.013C15.029 20.349 10.831 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5M18.5 6l2.19 4.5 a 6.48 6.48 0 0 1 -.139 4.393M2 2l20 20 M6.355 6.37a7 7 0 0 0-.075.23c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c3.356 0 6.993-1.267 9.85-3.151",
  beer: "M17 11h1a3 3 0 0 1 0 6h-1M9 12v6M13 12v6M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5ZM5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8",
  "beer-off": "M13 13v5M17 11.47V8M17 11h1a3 3 0 0 1 2.745 4.211M2 2l20 20 M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3M7.536 7.535C6.766 7.649 6.154 8 5.5 8a2.5 2.5 0 0 1-1.768-4.268M8.727 3.204C9.306 2.767 9.885 2 11 2c1.56 0 2 1.5 3 1.5s1.72-.5 2.5-.5a1 1 0 1 1 0 5c-.78 0-1.5-.5-2.5-.5a3.149 3.149 0 0 0-.842.12M9 14.6V18",
  bell: "M10.268 21a2 2 0 0 0 3.464 0M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
  "bell-check": "M10.268 21a2 2 0 0 0 3.464 0M15 8l2 2 4 -4 M16.8607 4.4824A6 6 0 0 0 6 8C6 12.499 4.589 13.956 3.262 15.326M3.262 15.326A1 1 0 0 0 4 17H20A1 1 0 0 0 20.74 15.327C20.209 14.779 19.665 14.218 19.203 13.454",
  "bell-dot": "M10.268 21a2 2 0 0 0 3.464 0M11.68 2.009A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673c-.824-.85-1.678-1.731-2.21-3.348M15 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "bell-electric": "M18.518 17.347A7 7 0 0 1 14 19M18.8 4A11 11 0 0 1 20 9M9 9h.01M18 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M2 9a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M6 16h6a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2Z",
  "bell-minus": "M10.268 21a2 2 0 0 0 3.464 0M15 8h6M16.243 3.757A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673A9.4 9.4 0 0 1 18.667 12",
  "bell-off": "M10.268 21a2 2 0 0 0 3.464 0M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742M2 2l20 20 M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05",
  "bell-plus": "M10.268 21a2 2 0 0 0 3.464 0M15 8h6M18 5v6M20.002 14.464a9 9 0 0 0 .738.863A1 1 0 0 1 20 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 8.75-5.332",
  "bell-ring": "M10.268 21a2 2 0 0 0 3.464 0M22 8c0-2.3-.8-4.3-2-6M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326M4 2C2.8 3.7 2 5.7 2 8",
  "between-horizontal-end": "M4 3h11a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-11a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM22 15l-3 -3 3 -3 M4 14h11a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-11a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  "between-horizontal-start": "M9 3h11a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-11a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM2 9l3 3 -3 3 M9 14h11a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-11a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  "between-vertical-end": "M4 3h5a1 1 0 0 1 1 1v11a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-11a1 1 0 0 1 1 -1ZM9 22l3 -3 3 3 M15 3h5a1 1 0 0 1 1 1v11a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-11a1 1 0 0 1 1 -1Z",
  "between-vertical-start": "M4 8h5a1 1 0 0 1 1 1v11a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-11a1 1 0 0 1 1 -1ZM15 2l-3 3 -3 -3 M15 8h5a1 1 0 0 1 1 1v11a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-11a1 1 0 0 1 1 -1Z",
  "biceps-flexed": "M12.409 13.017A5 5 0 0 1 22 15c0 3.866-4 7-9 7-4.077 0-8.153-.82-10.371-2.462-.426-.316-.631-.832-.62-1.362C2.118 12.723 2.627 2 10 2a3 3 0 0 1 3 3 2 2 0 0 1-2 2c-1.105 0-1.64-.444-2-1M15 14a5 5 0 0 0-7.584 2M9.964 6.825C8.019 7.977 9.5 13 8 15",
  bike: "M15 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M2 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 17.5V14l-3-3 4-3 2 3h2",
  binary: "M16 14h0a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM8 4h0a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM6 20h4M14 10h4M6 14h2v6M14 4h2v6",
  binoculars: "M10 10h4M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2zM 22 16 L 2 16M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2zM9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3",
  biohazard: "M10 11.9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6.7 3.4c-.9 2.5 0 5.2 2.2 6.7C6.5 9 3.7 9.6 2 11.6M8.9 10.1l1.4 0.8 M17.3 3.4c.9 2.5 0 5.2-2.2 6.7 2.4-1.2 5.2-.6 6.9 1.5M15.1 10.1l-1.4 0.8 M16.7 20.8c-2.6-.4-4.6-2.6-4.7-5.3-.2 2.6-2.1 4.8-4.7 5.2M12 13.9v1.6M13.5 5.4c-1-.2-2-.2-3 0M17 16.4c.7-.7 1.2-1.6 1.5-2.5M5.5 13.9c.3.9.8 1.8 1.5 2.5",
  bird: "M16 7h.01M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20M20 7l2 0.5 -2 0.5 M10 18v3M14 17.75V21M7 18a6 6 0 0 0 3.84-10.61",
  birdhouse: "M12 18v4M17 18l1.96 -11.47 M3 8l7.82 -5.61 a 2 2 0 0 1 2.36 0 L 21 8M4 18h16M7 18 5.044 6.532M10 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  bitcoin: "M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727",
  blend: "M8 9a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M2 15a7 7 0 1 0 14 0a7 7 0 1 0 -14 0",
  blender: "M8 14a2 2 0 0 0-1.963 1.615l-1.018 5.193A1 1 0 0 0 6 22h12a1 1 0 0 0 .981-1.192l-1.018-5.193A2 2 0 0 0 16 14zM17 2l-1 12 M8.006 14 7 2M7.565 8.787A5 5 0 0 0 12 8a5 5 0 0 1 4.56-.75M19 2H5a2 2 0 0 0-2 2v5a2 2 0 0 0 .688 1.5M12 18h.01",
  blinds: "M3 3h18M20 7H8M20 11H8M10 19h10M8 15h12M4 3v14M2 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  blocks: "M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2M15 2h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  bluetooth: "M7 7l10 10 -5 5 V 2 l 5 5 L 7 17",
  "bluetooth-connected": "M7 7l10 10 -5 5 V 2 l 5 5 L 7 17M18 12L21 12M3 12L6 12",
  "bluetooth-off": "M17 17l-5 5 V 12 l -5 5M2 2l20 20 M14.5 9.5 17 7l-5-5v4.5",
  "bluetooth-searching": "M7 7l10 10 -5 5 V 2 l 5 5 L 7 17M20.83 14.83a4 4 0 0 0 0-5.66M18 12h.01",
  bold: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8",
  bolt: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  bomb: "M2 13a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95M22 2l-1.5 1.5 ",
  bone: "M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z",
  "bone-fracture": "M14 4.5a1 1 0 0 1 5 0 .5.5 0 0 0 .5.5 1 1 0 0 1 0 5c-.81 0-1.8-.7-2.5 0l-1.958 1.957a.15.15 0 0 1-.252-.072l-.493-2.07a.15.15 0 0 0-.111-.112l-2.072-.494a.15.15 0 0 1-.072-.252L14 7c.7-.7 0-1.69 0-2.5M16 20l-1 -2 M20 16l-2 -1 M4 8l2 1 M8 4l1 2 M9.698 14.19a.15.15 0 0 0 .112.112l2.074.489a.15.15 0 0 1 .072.252L10 17c-.7.7 0 1.69 0 2.5a1 1 0 0 1-5 0 .495.495 0 0 0-.5-.5 1 1 0 0 1 0-5c.81 0 1.8.7 2.5 0l1.956-1.957a.15.15 0 0 1 .252.072z",
  book: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
  "book-a": "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M8 13l4 -7 4 7 M9.1 11h5.7",
  "book-alert": "M12 13h.01M12 6v3M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
  "book-audio": "M12 6v7M16 8v3M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M8 8v3",
  "book-bookmark": "M10 2v7.751a.25.25 0 00.407.195l2.28-1.834a.5.5 0 01.627 0l2.28 1.834A.25.25 0 0016 9.751V2M4 19.5v-15A2.5 2.5 0 016.5 2H19a1 1 0 011 1v18a1 1 0 01-1 1H6.5a1 1 0 010-5H20",
  "book-check": "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M9 9.5l2 2 4 -4 ",
  "book-copy": "M5 7a2 2 0 0 0-2 2v11M5.803 18H5a2 2 0 0 0 0 4h9.5a.5.5 0 0 0 .5-.5V21M9 15V4a2 2 0 0 1 2-2h9.5a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H11a2 2 0 0 1 0-4h10",
  "book-dashed": "M12 17h1.5M12 22h1.5M12 2h1.5M17.5 22H19a1 1 0 0 0 1-1M17.5 2H19a1 1 0 0 1 1 1v1.5M20 14v3h-2.5M20 8.5V10M4 10V8.5M4 19.5V14M4 4.5A2.5 2.5 0 0 1 6.5 2H8M8 22H6.5a1 1 0 0 1 0-5H8",
  "book-down": "M12 13V7M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M9 10l3 3 3 -3 ",
  "book-headphones": "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M8 12v-2a4 4 0 0 1 8 0v2M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "book-heart": "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M8.62 9.8A2.25 2.25 0 1 1 12 6.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z",
  "book-image": "M20 13.7l-2.1 -2.1 a 2 2 0 0 0 -2.8 0 L 9.7 17M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M8 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "book-key": "M13 2H6.5A2.5 2.5 0 0 0 4 4.5v15M17 2v6M17 4h2M20 15.2V21a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M15 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "book-lock": "M18 6V4a2 2 0 1 0-4 0v2M20 15v6a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H10M13 6h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  "book-minus": "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M9 10h6",
  "book-open": "M12 5v16M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
  "book-open-check": "M12 5v16M16 12l2 2 4 -4 M22 6V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2h4.001A2 2 0 0022 17v-1.344",
  "book-open-text": "M12 5v16M16 13h2M16 9h2M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2zM6 13h2M6 9h2",
  "book-plus": "M12 7v6M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M9 10h6",
  "book-search": "M11 22H5.5a1 1 0 0 1 0-5h4.501M21 22l-1.88 -1.88 M3 19.5v-15A2.5 2.5 0 0 1 5.5 2H18a1 1 0 0 1 1 1v8M14 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "book-text": "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M8 11h8M8 7h6",
  "book-type": "M10 13h4M12 6v7M16 8V6H8v2M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
  "book-up": "M12 13V7M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M9 10l3 -3 3 3 ",
  "book-up-2": "M12 13V7M18 2h1a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M4 19.5v-15A2.5 2.5 0 0 1 6.5 2M9 10l3 -3 3 3 M9 5l3 -3 3 3 ",
  "book-user": "M15 13a3 3 0 1 0-6 0M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M10 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "book-x": "M14.5 7.5l-5 5 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M9.5 7.5l5 5 ",
  bookmark: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
  "bookmark-check": "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2zM9 10l2 2 4 -4 ",
  "bookmark-minus": "M15 10H9M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
  "bookmark-off": "M19 19v1a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5M2 2l20 20 M8.656 3H17a2 2 0 0 1 2 2v8.344",
  "bookmark-plus": "M12 7v6M15 10H9M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
  "bookmark-x": "M14.5 7.5l-5 5 M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2zM9.5 7.5l5 5 ",
  "boom-box": "M4 9V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M8 8v1M12 8v1M16 8v1M4 9h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM6 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M14 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  bot: "M12 8V4H8M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM2 14h2M20 14h2M15 13v2M9 13v2",
  "bot-message-square": "M12 6V2H8M15 11v2M2 12h2M20 12h2M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2zM9 11v2",
  "bot-off": "M13.67 8H18a2 2 0 0 1 2 2v4.33M2 14h2M20 14h2M22 22 2 2M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.414-.586M9 13v2M9.67 4H12v2.33",
  "bottle-wine": "M10 3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a6 6 0 0 0 1.2 3.6l.6.8A6 6 0 0 1 17 13v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a6 6 0 0 1 1.2-3.6l.6-.8A6 6 0 0 0 10 5zM17 13h-4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h4",
  "bow-arrow": "M17 3h4v4M18.575 11.082a13 13 0 0 1 1.048 9.027 1.17 1.17 0 0 1-1.914.597L14 17M7 10 3.29 6.29a1.17 1.17 0 0 1 .6-1.91 13 13 0 0 1 9.03 1.05M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18H5a1 1 0 0 1 1 1v1.5a.5.5 0 0 0 .854.354L9.5 18.207A1.7 1.7 0 0 0 10 17v-2a1 1 0 0 0-1-1zM9.707 14.293 21 3",
  box: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16ZM3.3 7l8.7 5 8.7 -5 M12 22V12",
  boxes: "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42ZM7 16.5l-4.74 -2.85 M7 16.5l5 -3 M7 16.5v5.17M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3ZM17 16.5l-5 -3 M17 16.5l4.74 -2.85 M17 16.5v5.17M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8ZM12 8 7.26 5.15M12 8l4.74 -2.85 M12 13.5V8",
  braces: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
  brackets: "M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3",
  brain: "M12 18V5M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5M17.997 5.125a4 4 0 0 1 2.526 5.77M18 18a4 4 0 0 0 2-7.464M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517M6 18a4 4 0 0 1-2-7.464M6.003 5.125a4 4 0 0 0-2.526 5.77",
  "brain-circuit": "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18ZM9 13a4.5 4.5 0 0 0 3-4M6.003 5.125A3 3 0 0 0 6.401 6.5M3.477 10.896a4 4 0 0 1 .585-.396M6 18a4 4 0 0 1-1.967-.516M12 13h4M12 18h6a2 2 0 0 1 2 2v1M12 8h8M16 8V5a2 2 0 0 1 2-2M15.5 13a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M17.5 3a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M19.5 21a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M19.5 8a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
  "brain-cog": "M10.85 14.77l-0.38 0.92 M10.85 9.23l-0.38 -0.92 M13.15 14.77l0.38 0.92 M13.53 8.31l-0.38 0.92 M14.77 10.85l0.92 -0.38 M14.77 13.15l0.92 0.38 M17.598 6.5A3 3 0 1 0 12 5a3 3 0 0 0-5.63-1.446 3 3 0 0 0-.368 1.571 4 4 0 0 0-2.525 5.771M17.998 5.125a4 4 0 0 1 2.525 5.771M19.505 10.294a4 4 0 0 1-1.5 7.706M4.032 17.483A4 4 0 0 0 11.464 20c.18-.311.892-.311 1.072 0a4 4 0 0 0 7.432-2.516M4.5 10.291A4 4 0 0 0 6 18M6.002 5.125a3 3 0 0 0 .4 1.375M9.23 10.85l-0.92 -0.38 M9.23 13.15l-0.92 0.38 M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "brick-wall": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 9v6M16 15v6M16 3v6M3 15h18M3 9h18M8 15v6M8 3v6",
  "brick-wall-fire": "M16 3v2.107M17 9c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 22 17a5 5 0 0 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C13 11.5 16 9 17 9M21 8.274V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.938M3 15h5.253M3 9h8.228M8 15v6M8 3v6",
  "brick-wall-shield": "M12 9v1.258M16 3v5.46M21 9.118V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5.75M22 17.5c0 2.499-1.75 3.749-3.83 4.474a.5.5 0 0 1-.335-.005c-2.085-.72-3.835-1.97-3.835-4.47V14a.5.5 0 0 1 .5-.499c1 0 2.25-.6 3.12-1.36a.6.6 0 0 1 .76-.001c.875.765 2.12 1.36 3.12 1.36a.5.5 0 0 1 .5.5zM3 15h7M3 9h12.142M8 15v6M8 3v6",
  bridge: "M10 9.728V16M14 9.728V16M18 20V4M22 11l-4 -4 A 7.5 7.5 0 0 1 6 7 l -4 4M22 16H2M6 20V4",
  briefcase: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "briefcase-business": "M12 12h.01M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M22 13a18.15 18.15 0 0 1-20 0M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "briefcase-conveyor-belt": "M10 20v2M14 20v2M18 20v2M21 20H3M6 20v2M8 16V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12M6 6h12a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2Z",
  "briefcase-medical": "M12 11v4M14 13h-4M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M18 6v14M6 6v14M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "bring-to-front": "M10 8h4a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2",
  broccoli: "M10 13a3 3 0 01-2.121-5.121M15.606 14.204c-3.5 1.5-5.899 4.503-8.899 7.503A1 1 0 016 22c-2 0-4-2-4-4a1 1 0 01.293-.707c1.911-1.911 3.823-3.578 5.347-5.441M16.573 14.737A4 4 0 0114 11M7.14 10.907a4 4 0 112.756-7.43A4 4 0 0116.7 4.48a2 2 0 012.82 2.82 4 4 0 011.002 6.805 4 4 0 11-7.51 1.59",
  broom: "M13.5 10.5 22 2M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204zM5 18l2 -2 M7.7 10.7l5.6 5.6 ",
  "broom-sparkles": "M11 2v2M12 3h-2M13.5 10.5 22 2M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204zM20 15v4M22 17h-4M4 4v4M5 18l2 -2 M6 6H2M7.7 10.7l5.6 5.6 ",
  brush: "M11 10l3 3 M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21zM9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031",
  "brush-cleaning": "M16 22l-1 -4 M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233zM8 22l1 -4 ",
  bubbles: "M7.001 15.085A1.5 1.5 0 0 1 9 16.5M15 8.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M2 16.5a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0M5 4.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  bug: "M12 20v-9M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4zM14.12 3.88 16 2M21 21a4 4 0 0 0-3.81-4M21 5a4 4 0 0 1-3.55 3.97M22 13h-4M3 21a4 4 0 0 1 3.81-4M3 5a4 4 0 0 0 3.55 3.97M6 13H2M8 2l1.88 1.88 M9 7.13V6a3 3 0 1 1 6 0v1.13",
  "bug-off": "M12 20v-8M12.656 7H14a4 4 0 0 1 4 4v1.344M14.12 3.88 16 2M17.123 17.123A6 6 0 0 1 6 14v-3a4 4 0 0 1 1.72-3.287M2 2l20 20 M21 5a4 4 0 0 1-3.55 3.97M22 13h-3.344M3 21a4 4 0 0 1 3.81-4M3 5a4 4 0 0 0 3.55 3.97M6 13H2M8 2l1.88 1.88 M9.712 4.06A3 3 0 0 1 15 6v1.13",
  "bug-play": "M10 19.655A6 6 0 0 1 6 14v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 3.97M14 15.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86zM14.12 3.88 16 2M21 5a4 4 0 0 1-3.55 3.97M3 21a4 4 0 0 1 3.81-4M3 5a4 4 0 0 0 3.55 3.97M6 13H2M8 2l1.88 1.88 M9 7.13V6a3 3 0 1 1 6 0v1.13",
  building: "M12 10h.01M12 14h.01M12 6h.01M16 10h.01M16 14h.01M16 6h.01M8 10h.01M8 14h.01M8 6h.01M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
  "building-complex": "M10 12h4M10 8h4M14 21v-3a2 2 0 0 0-4 0v3M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
  "building-complex-plus": "M10 12h4M10 21v-3a2 2 0 013.05-1.702M10 8h4M16 19h6M18 7h2a2 2 0 012 2v4.355M19 16v6M6 10H4a2 2 0 00-2 2v7a2 2 0 002 2h8.535M6 21V5a2 2 0 012-2h8a2 2 0 012 2v7.126",
  bus: "M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M9 18h5M14 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "bus-front": "M4 6 2 7M10 6h4M22 7l-2 -1 M6 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM4 11h16M8 15h.01M16 15h.01M6 19v2M18 21v-2",
  cable: "M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1zM17 21v-2M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10M21 21v-2M3 5V3M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2zM7 5V3",
  "cable-car": "M10 3h.01M14 2h.01M2 9l20 -5 M12 12V6.5M7 12h10a3 3 0 0 1 3 3v4a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3v-4a3 3 0 0 1 3 -3ZM9 12v5M15 12v5M4 17h16",
  cake: "M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01",
  "cake-slice": "M16 13H3M16 17H3M7.2 7.9l-3.39 2.5 A 2 2 0 0 0 3 12.01 V 20 a 1 1 0 0 0 1 1 h 16 a 1 1 0 0 0 1 -1 v -8.654 c 0 -2 -2.44 -6.026 -6.44 -8.026 a 1 1 0 0 0 -1.082 .057 L 10.4 5.6M7 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  calculator: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM8 6L16 6M16 14L16 18M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01",
  calendar: "M8 2v3M16 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18",
  "calendar-1": "M11 13h1v4M16 2v3M3 9h18M8 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "calendar-arrow-down": "M14 17l4 4 4 -4 M16 2v3M18 13v8M21 10.354V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7.343M3 9h18M8 2v3",
  "calendar-arrow-up": "M14 17l4 -4 4 4 M16 2v3M18 21v-8M21 10.343V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h9M3 9h18M8 2v3",
  "calendar-check": "M8 2v3M16 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M9 15l2 2 4 -4 ",
  "calendar-check-2": "M 19 3 L 5 3M 21 13 L 21 5M 21 5 A2 2 0 0 0 19 3M 3 19 A2 2 0 0 0 5 21M 3 5 L 3 19M 5 3 A2 2 0 0 0 3 5M16 19l2 2 4 -4 M16 2v3M3 9h18M5 21 L12.5 21M8 2v3",
  "calendar-chevrons-right": "M13 21l3 -3 -3 -3 M16 2v3M19 21l3 -3 -3 -3 M21 11.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h4M3 9h18M8 2v3",
  "calendar-clock": "M16 14v2.2l1.6 1M16 2v3M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338M3 9h5.859M8 2v3M10 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "calendar-cog": "M15.23 16.85l-0.92 -0.38 M15.23 19.15l-0.92 0.38 M16 2v3M16.47 14.31l0.38 0.92 M16.85 20.77l-0.38 0.92 M19.15 15.23l0.38 -0.92 M19.53 21.7l-0.38 -0.92 M20.77 16.85l0.92 -0.38 M20.77 19.15l0.92 0.38 M21 10.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h5.5M3 9h18M8 2v3M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "calendar-days": "M8 2v3M16 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01",
  "calendar-fold": "M16 2v3M21 15V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h10v-5a1 1 0 011-1za2.4 2.4 0 01-.706 1.706l-3.588 3.588A2.4 2.4 0 0115 21M3 9h18M8 2v3",
  "calendar-heart": "M12.127 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v5.125M14.62 17.8A2.25 2.25 0 1118 14.836a2.25 2.25 0 113.38 2.966l-2.626 2.856a.998.998 0 01-1.507 0zM16 2v3M3 9h18M8 2v3",
  "calendar-minus": "M16 18h6M16 2v3M21 14V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8.3M3 9h18M8 2v3",
  "calendar-minus-2": "M8 2v3M16 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M10 15h4",
  "calendar-off": "M16 2v3M2 2l20 20 M21 9h-5.5M3 9h6M3.586 3.586A2 2 0 003 5v14a2 2 0 002 2h14a2 2 0 001.414-.586M8.656 3H19a2 2 0 012 2v10.344",
  "calendar-plus": "M16 18h6M16 2v3M19 15v6M21 11.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8.3M3 9h18M8 2v3",
  "calendar-plus-2": "M8 2v3M16 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M10 15h4M12 13v4",
  "calendar-range": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 2v3M3 9h18M8 2v3M17 13h-6M13 17H7M7 13h.01M17 17h.01",
  "calendar-search": "M16 2v3M21 10.69V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7.25M22 21l-1.87 -1.87 M3 9h18M8 2v3M15 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "calendar-sync": "M11 10v4h4M11 14l1.54 -1.6 a 5 5 0 018 1.5M16 2v3M21 18l-1.53 1.61 a 5 5 0 01 -8 -1.5M21 22v-4h-4M21 8.517V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h3.517M3 9h4M8 2v3",
  "calendar-x": "M8 2v3M16 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M14 13l-4 4 M10 13l4 4 ",
  "calendar-x-2": "M16 2v3M17 16l5 5 M17 21l5 -5 M21 12V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8M3 9h18M8 2v3",
  calendars: "M12 2v2M15.726 21.01A2 2 0 0 1 14 22H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2M18 2v2M2 13h2M8 8h14M10 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  camera: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4zM9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "camera-off": "M14.564 14.558a3 3 0 1 1-4.122-4.121M2 2l20 20 M20 20H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 .819-.175M9.695 4.024A2 2 0 0 1 10.004 4h3.993a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v7.344",
  can: "M21 10.5a9 2.5 0 01-18 0v8a9 2.5 0 0018 0zM21 10.5A9 2.5 25.32 004.59 3.47 9 2.5 25.32 0021 10.5M3 10.5a9 2.5 0 016.527-2.405M9 16.858a31 31 0 006 0",
  "can-soda": "M17 22l1.66 -2.5 a 2 2 0 00.336 -1.11 V 5.606 a 2 2 0 00 -.336 -1.11 L 17 2M18 22H6M18 2H6M5 17h14M5 7h14M7 22l-1.66 -2.5 A 2 2 0 015 18.394 V 5.606 a 2 2 0 01.336 -1.11 L 7 2",
  candy: "M10 7v10.9M14 6.1V17M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4M16.536 7.465a5 5 0 0 0-7.072 0l-2 2a5 5 0 0 0 0 7.07 5 5 0 0 0 7.072 0l2-2a5 5 0 0 0 0-7.07M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4",
  "candy-cane": "M10.8 5l2.11 4.22 M17.75 7 15 2.1M4.87 14.65l2.12 4.24 M5.7 21a2 2 0 0 1-3.5-2l8.6-14a6 6 0 0 1 10.4 6 2 2 0 1 1-3.464-2 2 2 0 1 0-3.464-2zM7.91 9.71l2.01 4.41 ",
  "candy-off": "M10 10v7.9M11.802 6.145a5 5 0 0 1 6.053 6.053M14 6.1v2.243M15.5 15.57l-0.96 0.96 a 5 5 0 0 1 -7.071 0 5 5 0 0 1 0 -7.07 l .964 -.965M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4M2 2l20 20 M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4",
  cannabis: "M12 22v-4M7 12c-1.5 0-4.5 1.5-5 3 3.5 1.5 6 1 6 1-1.5 1.5-2 3.5-2 5 2.5 0 4.5-1.5 6-3 1.5 1.5 3.5 3 6 3 0-1.5-.5-3.5-2-5 0 0 2.5.5 6-1-.5-1.5-3.5-3-5-3 1.5-1 4-4 4-6-2.5 0-5.5 1.5-7 3 0-2.5-.5-5-2-7-1.5 2-2 4.5-2 7-1.5-1.5-4.5-3-7-3 0 2 2.5 5 4 6",
  "cannabis-off": "M12 22v-4c1.5 1.5 3.5 3 6 3 0-1.5-.5-3.5-2-5M13.988 8.327C13.902 6.054 13.365 3.82 12 2a9.3 9.3 0 0 0-1.445 2.9M17.375 11.725C18.882 10.53 21 7.841 21 6c-2.324 0-5.08 1.296-6.662 2.684M2 2l20 20 M21.024 15.378A15 15 0 0 0 22 15c-.426-1.279-2.67-2.557-4.25-2.907M6.995 6.992C5.714 6.4 4.29 6 3 6c0 2 2.5 5 4 6-1.5 0-4.5 1.5-5 3 3.5 1.5 6 1 6 1-1.5 1.5-2 3.5-2 5 2.5 0 4.5-1.5 6-3",
  captions: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM7 15h4M15 15h2M7 11h2M13 11h4",
  "captions-off": "M10.5 5H19a2 2 0 0 1 2 2v8.5M17 11h-.5M19 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M2 2l20 20 M7 11h4M7 15h2.5",
  car: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M9 17h6M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "car-battery": "M14 13h4M16 15v-4M18 5v2M6 13h4M6 5v2M4 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "car-front": "M21 8l-2 2 -1.5 -3.7 A 2 2 0 0 0 15.646 5 H 8.4 a 2 2 0 0 0 -1.903 1.257 L 5 10 3 8M7 14h.01M17 14h.01M5 10h14a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM5 18v2M19 18v2",
  "car-taxi-front": "M10 2h4M21 8l-2 2 -1.5 -3.7 A 2 2 0 0 0 15.646 5 H 8.4 a 2 2 0 0 0 -1.903 1.257 L 5 10 3 8M7 14h.01M17 14h.01M5 10h14a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM5 18v2M19 18v2",
  caravan: "M18 19V9a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2h2M2 9h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2M22 17v1a1 1 0 0 1-1 1H10v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9M6 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "card-sim": "M12 14v4M14.172 2a2 2 0 0 1 1.414.586l3.828 3.828A2 2 0 0 1 20 7.828V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 14h8M9 10h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  carrot: "M15 16a1 1 0 0 0-7-7q-4 4-5.987 12.385a.5.5 0 0 0 .602.602Q11 20 15 16l-3-3M15 9q4 4 7 0-3-4-7 0 4-4 0-7-4 3 0 7M8 15l-2.58 -2.58 ",
  carton: "M13 22V10a2 2 0 01.539-1.367L16 6H8L5.539 8.633A2 2 0 005 10v10a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-.539-1.367L16 6V3a1 1 0 00-1-1H9a1 1 0 00-1 1v3M5 10h8",
  "carton-off": "M10 10H5v10a2 2 0 002 2h10a2 2 0 002-2v-1M13 22v-9M13.902 8.245 16 6h-4.343M19 13.343V10a2 2 0 00-.539-1.367L16 6V3a1 1 0 00-1-1H9a1 1 0 00-.857.486M2 2l20 20 M7.034 7.034 5.539 8.633A2 2 0 005 10",
  "case-lower": "M10 9v7M14 6v10M14 12.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M3 12.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
  "case-sensitive": "M2 16l4.04 -9.69 a .5 .5 0 0 1 .923 0 L 11 16M22 9v7M3.304 13h6.392M15 12.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
  "case-upper": "M15 11h4.5a1 1 0 0 1 0 5h-4a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h3a1 1 0 0 1 0 5M2 16l4.04 -9.69 a .5 .5 0 0 1 .923 0 L 11 16M3.304 13h6.392",
  "cassette-tape": "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM6 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M8 12h8M14 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 20l0.7 -2.9 A 1.4 1.4 0 0 1 8.1 16 h 7.8 a 1.4 1.4 0 0 1 1.4 1 l .7 3",
  cast: "M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 12a9 9 0 0 1 8 8M2 16a5 5 0 0 1 4 4M2 20L2.01 20",
  castle: "M10 5V3M14 5V3M15 21v-3a3 3 0 0 0-6 0v3M18 3v8M18 5H6M22 11H2M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9M6 3v8",
  cat: "M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5ZM8 14v.5M16 14v.5M11.25 16.25h1.5L12 17l-.75-.75Z",
  cctv: "M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3zM2 19h3.76a2 2 0 0 0 1.8-1.1L9 15M2 21v-4M7 9h.01",
  "cctv-off": "M12.31 6.65l4.8 2.4 a 1 1 0 0 1 .447 1.341 l -.501 1.001 .605 .605 h 2.725 a 1 1 0 0 1 .894 1.447 l -.724 1.448M15.17 15.17l-0.72 1.44 a 1 1 0 0 1 -1.342 .447 L 3.61 12.3 a 2.92 2.92 0 0 1 -1.3 -3.91 L 3.69 5.6 a 2.9 2.9 0 0 1 .873 -1.037M2 19h3.76a2 2 0 0 0 1.8-1.1l1.441-2.902M2 2l20 20 M2 21v-4M7 9h.01",
  "chart-area": "M3 3v16a2 2 0 0 0 2 2h16M7 11.207a.5.5 0 0 1 .146-.353l2-2a.5.5 0 0 1 .708 0l3.292 3.292a.5.5 0 0 0 .708 0l4.292-4.292a.5.5 0 0 1 .854.353V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z",
  "chart-bar": "M3 3v16a2 2 0 0 0 2 2h16M7 16h8M7 11h12M7 6h3",
  "chart-bar-big": "M3 3v16a2 2 0 0 0 2 2h16M8 13h7a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-7a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM8 5h10a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  "chart-bar-decreasing": "M3 3v16a2 2 0 0 0 2 2h16M7 11h8M7 16h3M7 6h12",
  "chart-bar-increasing": "M3 3v16a2 2 0 0 0 2 2h16M7 11h8M7 16h12M7 6h3",
  "chart-bar-stacked": "M11 13v4M15 5v4M3 3v16a2 2 0 0 0 2 2h16M8 13h7a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-7a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM8 5h10a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  "chart-candlestick": "M9 5v4M8 9h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1ZM9 15v2M17 3v2M16 5h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1ZM17 13v3M3 3v16a2 2 0 0 0 2 2h16",
  "chart-column": "M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3",
  "chart-column-big": "M3 3v16a2 2 0 0 0 2 2h16M16 5h2a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1ZM8 8h2a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1Z",
  "chart-column-decreasing": "M13 17V9M18 17v-3M3 3v16a2 2 0 0 0 2 2h16M8 17V5",
  "chart-column-increasing": "M13 17V9M18 17V5M3 3v16a2 2 0 0 0 2 2h16M8 17v-3",
  "chart-column-stacked": "M11 13H7M19 9h-4M3 3v16a2 2 0 0 0 2 2h16M16 5h2a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1ZM8 8h2a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1Z",
  "chart-gantt": "M10 6h8M12 16h6M3 3v16a2 2 0 0 0 2 2h16M8 11h7",
  "chart-line": "M3 3v16a2 2 0 0 0 2 2h16M19 9l-5 5 -4 -4 -3 3 ",
  "chart-network": "M13.11 7.66l1.78 2.67 M14.16 12.79l-3.32 1.42 M20 4l-6.06 1.52 M3 3v16a2 2 0 0 0 2 2h16M10 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M14 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M7 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "chart-no-axes-column": "M5 21v-6M12 21V3M19 21V9",
  "chart-no-axes-column-decreasing": "M5 21V3M12 21V9M19 21v-6",
  "chart-no-axes-column-increasing": "M5 21v-6M12 21V9M19 21V3",
  "chart-no-axes-combined": "M12 16v5M16 14.639V21M20 10.656V21M22 3l-8.65 8.65 a .5 .5 0 0 1 -.708 0 L 9.354 8.354 a .5 .5 0 0 0 -.707 0 L 2 15M4 18.463V21M8 14.656V21",
  "chart-no-axes-gantt": "M6 5h12M4 12h10M12 19h8",
  "chart-pie": "M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1zM21.21 15.89A10 10 0 1 1 8 2.83",
  "chart-scatter": "M7 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M18 5.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M11 11.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M7 16.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M17 14.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M3 3v16a2 2 0 0 0 2 2h16",
  "chart-spline": "M3 3v16a2 2 0 0 0 2 2h16M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7",
  check: "M20 6 9 17l-5-5",
  "check-check": "M18 6 7 17l-5-5M22 10l-7.5 7.5 L 13 16",
  "check-line": "M20 4L9 15M21 19L3 19M9 15L4 10",
  "chef-hat": "M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1ZM6 17h12",
  cherry: "M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3ZM12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3ZM7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12M22 9c-4.29 0-7.14-2.33-10-7 5.71 0 10 4.67 10 7Z",
  "chess-bishop": "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM15 18c1.5-.615 3-2.461 3-4.923C18 8.769 14.5 4.462 12 2 9.5 4.462 6 8.77 6 13.077 6 15.539 7.5 17.385 9 18M16 7l-2.5 2.5 M9 2h6",
  "chess-king": "M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM6.7 18l-1 -1 C 4.35 15.682 3 14.09 3 12 a 5 5 0 0 1 4.95 -5 c 1.584 0 2.7 .455 4.05 1.818 C 13.35 7.455 14.466 7 16.05 7 A 5 5 0 0 1 21 12 c 0 2.082 -1.359 3.673 -2.7 5 l -1 1M10 4h4M12 2v6.818",
  "chess-knight": "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM16.5 18c1-2 2.5-5 2.5-9a7 7 0 0 0-7-7H6.635a1 1 0 0 0-.768 1.64L7 5l-2.32 5.802a2 2 0 0 0 .95 2.526l2.87 1.456M15 5l1.43 -1.42 M17 8l1.53 -1.53 M9.713 12.185 7 18",
  "chess-pawn": "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM14.5 10l1.5 8 M7 10h10M8 18l1.5 -8 M8 6a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "chess-queen": "M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM12.47 5.94l1.57 5.34 a 1 1 0 0 0 1.75 .328 l 2.616 -3.402M20 9l-3 9 M5.59 8.21l2.62 3.4 a 1 1 0 0 0 1.75 -.329 l 1.567 -5.34M7 18 4 9M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M2 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "chess-rook": "M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM10 2v2M14 2v2M17 18l-1 -9 M6 2v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2M6 4h12M7 18l1 -9 ",
  "chevron-down": "M6 9l6 6 6 -6 ",
  "chevron-first": "M17 18l-6 -6 6 -6 M7 6v12",
  "chevron-last": "M7 18l6 -6 -6 -6 M17 6v12",
  "chevron-left": "M15 18l-6 -6 6 -6 ",
  "chevron-right": "M9 18l6 -6 -6 -6 ",
  "chevron-up": "M18 15l-6 -6 -6 6 ",
  "chevrons-down": "M7 6l5 5 5 -5 M7 13l5 5 5 -5 ",
  "chevrons-down-up": "M7 20l5 -5 5 5 M7 4l5 5 5 -5 ",
  "chevrons-left": "M11 17l-5 -5 5 -5 M18 17l-5 -5 5 -5 ",
  "chevrons-left-right": "M9 7l-5 5 5 5 M15 7l5 5 -5 5 ",
  "chevrons-left-right-ellipsis": "M12 12h.01M16 12h.01M17 7l5 5 -5 5 M7 7l-5 5 5 5 M8 12h.01",
  "chevrons-right": "M6 17l5 -5 -5 -5 M13 17l5 -5 -5 -5 ",
  "chevrons-right-left": "M20 17l-5 -5 5 -5 M4 17l5 -5 -5 -5 ",
  "chevrons-up": "M17 11l-5 -5 -5 5 M17 18l-5 -5 -5 5 ",
  "chevrons-up-down": "M7 15l5 5 5 -5 M7 9l5 -5 5 5 ",
  church: "M10 9h4M12 7v5M14 21v-3a2 2 0 0 0-4 0v3M18 9l3.52 2.15 a 1 1 0 0 1 .48 .854 V 19 a 2 2 0 0 1 -2 2 H 4 a 2 2 0 0 1 -2 -2 v -6.999 a 1 1 0 0 1 .48 -.854 L 6 9M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14",
  cigarette: "M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14M18 8c0-2.5-2-2.5-2-5M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M22 8c0-2.5-2-2.5-2-5M7 12v4",
  "cigarette-off": "M12 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h13M18 8c0-2.5-2-2.5-2-5M2 2l20 20 M21 12a1 1 0 0 1 1 1v2a1 1 0 0 1-.5.866M22 8c0-2.5-2-2.5-2-5M7 12v4",
  circle: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "circle-alert": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 8L12 12M12 16L12.01 16",
  "circle-arrow-down": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 8v8M8 12l4 4 4 -4 ",
  "circle-arrow-left": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 8l-4 4 4 4 M16 12H8",
  "circle-arrow-out-down-left": "M2 12a10 10 0 1 1 10 10M2 22l10 -10 M8 22H2v-6",
  "circle-arrow-out-down-right": "M12 22a10 10 0 1 1 10-10M22 22 12 12M22 16v6h-6",
  "circle-arrow-out-up-left": "M2 8V2h6M2 2l10 10 M12 2A10 10 0 1 1 2 12",
  "circle-arrow-out-up-right": "M22 12A10 10 0 1 1 12 2M22 2 12 12M16 2h6v6",
  "circle-arrow-right": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 16l4 -4 -4 -4 M8 12h8",
  "circle-arrow-up": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M16 12l-4 -4 -4 4 M12 16V8",
  "circle-check": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M16 9l-5.5 5.5 L 8 12",
  "circle-check-big": "M21.801 10A10 10 0 1 1 17 3.335M9 11l3 3 L 22 4",
  "circle-chevron-down": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M16 10l-4 4 -4 -4 ",
  "circle-chevron-left": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M14 16l-4 -4 4 -4 ",
  "circle-chevron-right": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M10 8l4 4 -4 4 ",
  "circle-chevron-up": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M8 14l4 -4 4 4 ",
  "circle-dashed": "M10.1 2.182a10 10 0 0 1 3.8 0M13.9 21.818a10 10 0 0 1-3.8 0M17.609 3.721a10 10 0 0 1 2.69 2.7M2.182 13.9a10 10 0 0 1 0-3.8M20.279 17.609a10 10 0 0 1-2.7 2.69M21.818 10.1a10 10 0 0 1 0 3.8M3.721 6.391a10 10 0 0 1 2.7-2.69M6.391 20.279a10 10 0 0 1-2.69-2.7",
  "circle-dashed-check": "M10.1 2.182a10 10 0 013.8 0M13.9 21.818a10 10 0 01-3.8 0M16 9l-5.5 5.5 L 8 12M17.609 3.721a10 10 0 012.69 2.7M2.182 13.9a10 10 0 010-3.8M20.279 17.609a10 10 0 01-2.7 2.69M21.818 10.1a10 10 0 010 3.8M3.721 6.391a10 10 0 012.7-2.69M6.391 20.279a10 10 0 01-2.69-2.7",
  "circle-divide": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M8 12L16 12M12 16L12 16M12 8L12 8",
  "circle-dollar-sign": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6",
  "circle-dot": "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "circle-dot-dashed": "M10.1 2.18a9.93 9.93 0 0 1 3.8 0M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7M21.82 10.1a9.93 9.93 0 0 1 0 3.8M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69M13.9 21.82a9.94 9.94 0 0 1-3.8 0M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7M2.18 13.9a9.93 9.93 0 0 1 0-3.8M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "circle-ellipsis": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M17 12h.01M12 12h.01M7 12h.01",
  "circle-equal": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M7 10h10M7 14h10",
  "circle-euro": "M15 9.4a4 4 0 1 0 0 5.2M7 12h5M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "circle-fading-arrow-up": "M12 2a10 10 0 0 1 7.38 16.75M16 12l-4 -4 -4 4 M12 16V8M2.5 8.875a10 10 0 0 0-.5 3M2.83 16a10 10 0 0 0 2.43 3.4M4.636 5.235a10 10 0 0 1 .891-.857M8.644 21.42a10 10 0 0 0 7.631-.38",
  "circle-fading-plus": "M12 2a10 10 0 0 1 7.38 16.75M12 8v8M16 12H8M2.5 8.875a10 10 0 0 0-.5 3M2.83 16a10 10 0 0 0 2.43 3.4M4.636 5.235a10 10 0 0 1 .891-.857M8.644 21.42a10 10 0 0 0 7.631-.38",
  "circle-gauge": "M15.6 2.7a10 10 0 1 0 5.7 5.7M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M13.4 10.6 19 5",
  "circle-minus": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M8 12h8",
  "circle-off": "M2 2l20 20 M8.35 2.69A10 10 0 0 1 21.3 15.65M19.08 19.08A10 10 0 1 1 4.92 4.92",
  "circle-parking": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M9 17V7h4a3 3 0 0 1 0 6H9",
  "circle-parking-off": "M12.656 7H13a3 3 0 0 1 2.984 3.307M13 13H9M19.071 19.071A1 1 0 0 1 4.93 4.93M2 2l20 20 M8.357 2.687a10 10 0 0 1 12.956 12.956M9 17V9",
  "circle-pause": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M10 15L10 9M14 15L14 9",
  "circle-percent": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M15 9l-6 6 M9 9h.01M15 15h.01",
  "circle-pile": "M10 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M14 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M2 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "circle-play": "M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996zM2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "circle-plus": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M8 12h8M12 8v8",
  "circle-pound-sterling": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M10 16V9.5a1 1 0 0 1 5 0M8 12h4M8 16h7",
  "circle-power": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 7v4M7.998 9.003a5 5 0 1 0 8-.005",
  "circle-question-mark": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
  "circle-slash": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M9 15L15 9",
  "circle-slash-2": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M22 2 2 22",
  "circle-small": "M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "circle-star": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M11.051 7.616a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.867l-1.156-1.152a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535z",
  "circle-stop": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M10 9h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1Z",
  "circle-user": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662",
  "circle-user-round": "M17.925 20.056a6 6 0 0 0-11.851.001M8 11a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "circle-x": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M15 9l-6 6 M9 9l6 6 ",
  "circuit-board": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM11 9h4a2 2 0 0 0 2-2V3M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M7 21v-4a2 2 0 0 1 2-2h4M13 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  citrus: "M21.66 17.67a1.08 1.08 0 0 1-.04 1.6A12 12 0 0 1 4.73 2.38a1.1 1.1 0 0 1 1.61-.04zM19.65 15.66A8 8 0 0 1 8.35 4.34M14 10l-5.5 5.5 M14 17.85V10H6.15",
  clapperboard: "M12.3 3.46l3.02 3.96 M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3zM3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM6.18 5.28l3.1 3.9 ",
  "clef-alto": "M10 4v16M14 4.764a3 3 0 1 1-.152 4.327A4 4 0 0 1 10 12a4 4 0 0 1 3.848 2.909A3 3 0 1 1 14 19.236M6 4v16",
  "clef-bass": "M19 11h.01M19 6h.01M5 8c0-4 4-4 4-4 6 0 6 6 6 6 0 7-10 11-10 11M5 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "clef-treble": "M10.586 21.414a2 2 0 0 0 3.378-1.791L11.036 4.377a2 2 0 1 1 3.378 1.037C12.414 7.414 7 8 7 13a5 5 0 0 0 5 5 5 4 0 0 0 5-4 3 3 0 0 0-3-3 3 2 0 0 0-3 2",
  clipboard: "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
  "clipboard-check": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4 -4 ",
  "clipboard-clock": "M16 14v2.2l1.6 1M16 4h2a2 2 0 0 1 2 2v.832M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2M10 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  "clipboard-copy": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M16 4h2a2 2 0 0 1 2 2v4M21 14H11M15 10l-4 4 4 4 ",
  "clipboard-list": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01",
  "clipboard-minus": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14h6",
  "clipboard-paste": "M11 14h10M16 4h2a2 2 0 0 1 2 2v1.344M17 18l4 -4 -4 -4 M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  "clipboard-pen": "M16 4h2a2 2 0 0 1 2 2v2M21.34 15.664a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506zM8 22H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  "clipboard-pen-line": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5M16 4h2a2 2 0 0 1 1.73 1M8 18h1M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
  "clipboard-plus": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14h6M12 17v-6",
  "clipboard-type": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12v-1h6v1M11 17h2M12 11v6",
  "clipboard-x": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M14.5 11.5l-5 5 M9.5 11.5l5 5 ",
  clock: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l4 2",
  "clock-1": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l2-4",
  "clock-10": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l-4-2",
  "clock-11": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l-2-4",
  "clock-12": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6",
  "clock-2": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l4-2",
  "clock-3": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6h4",
  "clock-4": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l4 2",
  "clock-5": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l2 4",
  "clock-6": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v10",
  "clock-7": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l-2 4",
  "clock-8": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l-4 2",
  "clock-9": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6H8",
  "clock-alert": "M12 6v6l4 2M20 12v5M20 21h.01M21.25 8.2A10 10 0 1 0 16 21.16",
  "clock-arrow-down": "M12 6v6l2 1M12.337 21.994a10 10 0 1 1 9.588-8.767M14 18l4 4 4 -4 M18 14v8",
  "clock-arrow-left": "M12 6v6l1.5.8M12.338 21.994a10 10 0 1 1 9.587-8.767M14 18h8M18 22l-4 -4 4 -4 ",
  "clock-arrow-right": "M12 6v6l2 1M13.5 21.885A10 10 0 1 1 22 12M14 18h8M18 22l4 -4 -4 -4 ",
  "clock-arrow-up": "M12 6v6l1.56.78M13.227 21.925a10 10 0 1 1 8.767-9.588M14 18l4 -4 4 4 M18 22v-8",
  "clock-check": "M21.95 13a10 10 0 1 0-8.685 8.92M12 6v6l4 2M16 19l2 2 4 -4 ",
  "clock-fading": "M12 2a10 10 0 0 1 7.38 16.75M12 6v6l4 2M2.5 8.875a10 10 0 0 0-.5 3M2.83 16a10 10 0 0 0 2.43 3.4M4.636 5.235a10 10 0 0 1 .891-.857M8.644 21.42a10 10 0 0 0 7.631-.38",
  "clock-plus": "M12 6v6l3.644 1.822M16 19h6M19 16v6M21.92 13.267a10 10 0 1 0-8.653 8.653",
  "closed-caption": "M10 9.17a3 3 0 1 0 0 5.66M17 9.17a3 3 0 1 0 0 5.66M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  cloud: "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",
  "cloud-alert": "M12 12v4M12 20h.01M8.128 16.949A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642",
  "cloud-backup": "M21 15.251A4.5 4.5 0 0 0 17.5 8h-1.79A7 7 0 1 0 3 13.607M7 11v4h4M8 19a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5 4.82 4.82 0 0 0-3.41 1.41L7 15",
  "cloud-check": "M17 15l-5.5 5.5 L 9 18M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327",
  "cloud-cog": "M10.85 19.77l-0.38 0.92 M13.15 14.23l0.38 -0.92 M13.148 19.772a3 3 0 1 0-2.296-5.544l-.383-.923M13.53 20.7l-0.38 -0.92 a 3 3 0 1 1 -2.296 -5.544M14.77 15.85l0.92 -0.38 M14.77 18.15l0.92 0.38 M4.2 15.1a7 7 0 1 1 9.93-9.858A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2M9.23 15.85l-0.92 -0.38 M9.23 18.15l-0.92 0.38 ",
  "cloud-download": "M12 13v8l-4-4M12 21l4 -4 M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284",
  "cloud-drizzle": "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1",
  "cloud-fog": "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 17H7M17 21H9",
  "cloud-hail": "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v2M8 14v2M16 20h.01M8 20h.01M12 16v2M12 22h.01",
  "cloud-lightning": "M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973M13 12l-3 5 h 4 l -3 5",
  "cloud-moon": "M13 16a3 3 0 0 1 0 6H7a5 5 0 1 1 4.9-6zM18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36",
  "cloud-moon-rain": "M11 20v2M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24M7 19v2",
  "cloud-off": "M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78M2 2l20 20 ",
  "cloud-rain": "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v6M8 14v6M12 16v6",
  "cloud-rain-wind": "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M9.2 22l3 -7 M9 13l-3 7 M17 13l-3 7 ",
  "cloud-snow": "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01",
  "cloud-sun": "M12 2v2M4.93 4.93l1.41 1.41 M20 12h2M19.07 4.93l-1.41 1.41 M15.947 12.65a4 4 0 0 0-5.925-4.128M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z",
  "cloud-sun-rain": "M12 2v2M4.93 4.93l1.41 1.41 M20 12h2M19.07 4.93l-1.41 1.41 M15.947 12.65a4 4 0 0 0-5.925-4.128M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24M11 20v2M7 19v2",
  "cloud-sync": "M17 18l-1.53 1.61 a 5 5 0 0 1 -8 -1.5M17 22v-4h-4M20.996 15.251A4.5 4.5 0 0 0 17.495 8h-1.79a7 7 0 1 0-12.709 5.607M7 10v4h4M7 14l1.54 -1.6 a 5 5 0 0 1 8 1.5",
  "cloud-upload": "M12 13v8M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 17l4 -4 4 4 ",
  cloudy: "M17.5 12a1 1 0 1 1 0 9H9.006a7 7 0 1 1 6.702-9zM21.832 9A3 3 0 0 0 19 7h-2.207a5.5 5.5 0 0 0-10.72.61",
  clover: "M16.17 7.83 2 22M4.02 12a2.827 2.827 0 1 1 3.81-4.17A2.827 2.827 0 1 1 12 4.02a2.827 2.827 0 1 1 4.17 3.81A2.827 2.827 0 1 1 19.98 12a2.827 2.827 0 1 1-3.81 4.17A2.827 2.827 0 1 1 12 19.98a2.827 2.827 0 1 1-4.17-3.81A1 1 0 1 1 4 12M7.83 7.83l8.34 8.34 ",
  club: "M17.28 9.05a5.5 5.5 0 1 0-10.56 0A5.5 5.5 0 1 0 12 17.66a5.5 5.5 0 1 0 5.28-8.6ZM12 17.66L12 22",
  code: "M16 18l6 -6 -6 -6 M8 6l-6 6 6 6 ",
  "code-xml": "M18 16l4 -4 -4 -4 M6 8l-4 4 4 4 M14.5 4l-5 16 ",
  coffee: "M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1M6 2v2",
  cog: "M11 10.27 7 3.34M11 13.73l-4 6.93 M12 22v-2M12 2v2M14 12h8M17 20.66l-1 -1.73 M17 3.34l-1 1.73 M2 12h2M20.66 17l-1.73 -1 M20.66 7l-1.73 1 M3.34 17l1.73 -1 M3.34 7l1.73 1 M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0",
  coins: "M13.744 17.736a6 6 0 1 1-7.48-7.48M15 6h1v4M6.13 14.77l0.87 -0.5 2 3.46 M10 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "columns-2": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 3v18",
  "columns-3": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 3v18M15 3v18",
  "columns-3-cog": "M10.6 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v5.6M14.31 19.53l0.92 -0.38 M15 3v7.6M15.23 16.85l-0.92 -0.38 M16.85 15.23l-0.38 -0.92 M16.85 20.77l-0.38 0.92 M19.15 15.23l0.38 -0.92 M19.53 21.7l-0.38 -0.92 M20.77 16.85l0.92 -0.38 M20.77 19.15l0.92 0.38 M9 3v18M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "columns-4": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7.5 3v18M12 3v18M16.5 3v18",
  combine: "M14 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1M19 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1M7 15l3 3 M7 21l3 -3 H 5 a 2 2 0 0 1 -2 -2 v -2M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  command: "M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3",
  compass: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M16.24 7.76l-1.8 5.41 a 2 2 0 0 1 -1.265 1.265 L 7.76 16.24 l 1.804 -5.411 a 2 2 0 0 1 1.265 -1.265 z",
  component: "M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0zM2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0zM8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0zM8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z",
  computer: "M12 18h6M6 18h.01M8 6h1M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM6 2h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "concierge-bell": "M3 20a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1ZM20 16a8 8 0 1 0-16 0M12 4v4M10 4h4",
  cone: "M20.9 18.55l-8 -15.98 a 1 1 0 0 0 -1.8 0 l -8 15.98M3 19a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
  construction: "M3 6h18a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1ZM17 14v7M7 14v7M17 3v3M7 3v3M10 14 2.3 6.3M14 6l7.7 7.7 M8 6l8 8 ",
  contact: "M16 2v2M7 21v-2a2 2 0 012-2h6a2 2 0 012 2v2M8 2v2M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "contact-round": "M16 2v2M17.915 21a6 6 0 10-12 0M8 2v2M8 11a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  container: "M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5ZM10 21.9V14L2.1 9.1M10 14l11.9 -6.9 M14 19.8v-8.1M18 17.5V9.4",
  contrast: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 18a6 6 0 0 0 0-12v12z",
  cookie: "M11 17h.01M11.496 2c.324-.016.558.292.529.615a4 4 0 004.235 4.368.713.713 0 01.758.757 4 4 0 004.366 4.237c.323-.03.63.204.614.527a10 10 0 01-2.915 6.566A1 1 0 114.93 4.918 10 10 0 0111.496 2M12 12h.01M16 16h.01M16 3h.01M21 4h.01M21 8h.01M7 14h.01M9 8h.01",
  "cooking-pot": "M2 12h20M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8M4 8l16 -4 M8.86 6.78l-0.45 -1.81 a 2 2 0 0 1 1.45 -2.43 l 1.94 -.48 a 2 2 0 0 1 2.43 1.46 l .45 1.8",
  copy: "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  "copy-check": "M12 15l2 2 4 -4 M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  "copy-minus": "M12 15L18 15M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  "copy-plus": "M15 12L15 18M12 15L18 15M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  "copy-slash": "M12 18L18 12M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  "copy-x": "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM12.5 12.5l5 5 M12.5 17.5l5 -5 ",
  copyleft: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M9.17 14.83a4 4 0 1 0 0-5.66",
  copyright: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M14.83 14.83a4 4 0 1 1 0-5.66",
  "corner-down-left": "M20 4v7a4 4 0 0 1-4 4H4M9 10l-5 5 5 5 ",
  "corner-down-right": "M15 10l5 5 -5 5 M4 4v7a4 4 0 0 0 4 4h12",
  "corner-left-down": "M14 15l-5 5 -5 -5 M20 4h-7a4 4 0 0 0-4 4v12",
  "corner-left-up": "M14 9 9 4 4 9M20 20h-7a4 4 0 0 1-4-4V4",
  "corner-right-down": "M10 15l5 5 5 -5 M4 4h7a4 4 0 0 1 4 4v12",
  "corner-right-up": "M10 9l5 -5 5 5 M4 20h7a4 4 0 0 0 4-4V4",
  "corner-up-left": "M20 20v-7a4 4 0 0 0-4-4H4M9 14 4 9l5-5",
  "corner-up-right": "M15 14l5 -5 -5 -5 M4 20v-7a4 4 0 0 1 4-4h12",
  cpu: "M12 20v2M12 2v2M17 20v2M17 2v2M2 12h2M2 17h2M2 7h2M20 12h2M20 17h2M20 7h2M7 20v2M7 2v2M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM9 8h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  "creative-commons": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M10 9.3a2.8 2.8 0 0 0-3.5 1 3.1 3.1 0 0 0 0 3.4 2.7 2.7 0 0 0 3.5 1M17 9.3a2.8 2.8 0 0 0-3.5 1 3.1 3.1 0 0 0 0 3.4 2.7 2.7 0 0 0 3.5 1",
  "credit-card": "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM2 10L22 10M6 14h2",
  "credit-card-check": "M12.5 19H4a2 2 0 01-2-2V7a2 2 0 012-2h16a2 2 0 012 2v4M2 10h20M6 14h2M16 17l2 2 4 -4 ",
  "credit-card-minus": "M22 13V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h8.536M22 10H2M6 14h2M16 17h6",
  "credit-card-plus": "M22 11.354V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h8.536M22 10H2M6 14h2M16 17h6M19 14v6",
  "credit-card-reader": "M15 16v1M16.963 7.734A1 1 0 0015.999 7H8.003a1 1 0 00-.964.734L4.073 18.467A2 2 0 006 21h12a2 2 0 001.927-2.532zM2.678 8.5A2 2 0 012 7V5a2 2 0 012-2h16a2 2 0 012 2v2a2 2 0 01-.676 1.499M9 21l2 -14 ",
  "credit-card-x": "M12.5 19H4a2 2 0 01-2-2V7a2 2 0 012-2h16a2 2 0 012 2v3.5M2 10h20M6 14h2M16.5 14.5l5 5 M21.5 14.5l-5 5 ",
  croissant: "M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676",
  crop: "M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2",
  cross: "M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z",
  crosshair: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M22 12L18 12M6 12L2 12M12 6L12 2M12 22L12 18",
  crown: "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294zM5 21h14",
  cuboid: "M10 22v-8M2.336 8.89 10 14l11.715-7.029M22 14a2 2 0 0 1-.971 1.715l-10 6a2 2 0 0 1-2.138-.05l-6-4A2 2 0 0 1 2 16v-6a2 2 0 0 1 .971-1.715l10-6a2 2 0 0 1 2.138.05l6 4A2 2 0 0 1 22 8z",
  "cup-soda": "M6 8l1.75 12.28 a 2 2 0 0 0 2 1.72 h 4.54 a 2 2 0 0 0 2 -1.72 L 18 8M5 8h14M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0M12 8l1 -6 h 2",
  cupcake: "M12 22v-9M14 4h1a3 3 0 013 3l-.004.125A4 4 0 0121 11v2M15.5 22l1.5 -9 M21 13a1 1 0 01.919 1.394l-2.74 6.394A2 2 0 0117.34 22H6.659a2 2 0 01-1.838-1.212l-2.74-6.394A1 1 0 013 13zM3 13v-2a4 4 0 013.003-3.875L6 7a3 3 0 013-3h1M8.5 22 7 13M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  currency: "M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M3 3L6 6M21 3L18 6M3 21L6 18M21 21L18 18",
  cylinder: "M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0M3 5v14a9 3 0 0 0 18 0V5",
  dam: "M11 11.31c1.17.56 1.54 1.69 3.5 1.69 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M11.75 18c.35.5 1.45 1 2.75 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 10h4M2 14h4M2 18h4M2 6h4M7 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1L10 4a1 1 0 0 0-1-1z",
  database: "M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0M3 5V19A9 3 0 0 0 21 19V5M3 12A9 3 0 0 0 21 12",
  "database-arrow-down": "M16 19l3 3 3 -3 M19 16v6M21 12.536V5M3 12A9 3 0 0 0 15.182 14.806M3 5V19A9 3 0 0 0 13.318 21.968M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
  "database-arrow-up": "M19 22v-6M21 12.536V5M22 19l-3 -3 -3 3 M3 12A9 3 0 0 0 14.457 14.886M3 5V19A9 3 0 0 0 13.318 21.968M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
  "database-backup": "M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0M3 12a9 3 0 0 0 5 2.69M21 9.3V5M3 5v14a9 3 0 0 0 6.47 2.88M12 12v4h4M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16",
  "database-check": "M16 19l2 2 4 -4 M21 13.127V5M3 12A9 3 0 0 0 21 12M3 5V19A9 3 0 0 0 13.318 21.968M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
  "database-minus": "M21 15V5M22 19h-6M3 12A9 3 0 0 0 21 12M3 5V19A9 3 0 0 0 13.318 21.968M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
  "database-plus": "M19 16v6M21 12.536V5M22 19h-6M3 12A9 3 0 0 0 15.1824 14.8061M3 5V19A9 3 0 0 0 13.318 21.968M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
  "database-search": "M21 11.693V5M22 22l-1.87 -1.87 M3 12a9 3 0 0 0 8.697 2.998M3 5v14a9 3 0 0 0 9.28 2.999M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
  "database-x": "M17 17l5 5 M19.323 13.744A9 3 0 0 0 21 12M21 13.127V5M22 17l-5 5 M3 12A9 3 0 0 0 13.563 14.954M3 5V19A9 3 0 0 0 13 21.981M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
  "database-zap": "M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0M3 5V19A9 3 0 0 0 15 21.84M21 5V8M21 12L18 17H22L19 22M3 12A9 3 0 0 0 14.59 14.87",
  "decimals-arrow-left": "M13 21l-3 -3 3 -3 M20 18H10M3 11h.01M8.5 3h0a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1 -2.5 2.5h0a2.5 2.5 0 0 1 -2.5 -2.5v-3a2.5 2.5 0 0 1 2.5 -2.5Z",
  "decimals-arrow-right": "M10 18h10M17 21l3 -3 -3 -3 M3 11h.01M17.5 3h0a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1 -2.5 2.5h0a2.5 2.5 0 0 1 -2.5 -2.5v-3a2.5 2.5 0 0 1 2.5 -2.5ZM8.5 3h0a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1 -2.5 2.5h0a2.5 2.5 0 0 1 -2.5 -2.5v-3a2.5 2.5 0 0 1 2.5 -2.5Z",
  delete: "M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zM12 9l6 6 M18 9l-6 6 ",
  dessert: "M10.162 3.167A10 10 0 0 0 2 13a2 2 0 0 0 4 0v-1a2 2 0 0 1 4 0v4a2 2 0 0 0 4 0v-4a2 2 0 0 1 4 0v1a2 2 0 0 0 4-.006 10 10 0 0 0-8.161-9.826M20.804 14.869a9 9 0 0 1-17.608 0M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  diameter: "M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6.48 3.66a10 10 0 0 1 13.86 13.86M6.41 6.41l11.18 11.18 M3.66 6.48a10 10 0 0 0 13.86 13.86",
  diamond: "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z",
  "diamond-minus": "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0zM8 12h8",
  "diamond-percent": "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0ZM9.2 9.2h.01M14.5 9.5l-5 5 M14.7 14.8h.01",
  "diamond-plus": "M12 8v8M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0zM8 12h8",
  "dice-1": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 12h.01",
  "dice-2": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM15 9h.01M9 15h.01",
  "dice-3": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 8h.01M12 12h.01M8 16h.01",
  "dice-4": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 8h.01M8 8h.01M8 16h.01M16 16h.01",
  "dice-5": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 8h.01M8 8h.01M8 16h.01M16 16h.01M12 12h.01",
  "dice-6": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 8h.01M16 12h.01M16 16h.01M8 8h.01M8 12h.01M8 16h.01",
  dices: "M4 10h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM17.92 14l3.5 -3.5 a 2.24 2.24 0 0 0 0 -3 l -5 -4.92 a 2.24 2.24 0 0 0 -3 0 L 10 6M6 18h.01M10 14h.01M15 6h.01M18 9h.01",
  diff: "M12 3v14M5 10h14M5 21h14",
  disc: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "disc-2": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 12h.01",
  "disc-3": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M6 12c0-1.7.7-3.2 1.8-4.2M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 12c0 1.7-.7 3.2-1.8 4.2",
  "disc-album": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M12 12h.01",
  divide: "M11 6a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M5 12L19 12M11 18a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  dna: "M10 16l1.5 1.5 M14 8l-1.5 -1.5 M15 2c-1.798 1.998-2.518 3.995-2.807 5.993M16.5 10.5l1 1 M17 6l-2.89 -2.89 M2 15c6.667-6 13.333 0 20-6M20 9l0.89 0.89 M3.109 14.109 4 15M6.5 12.5l1 1 M7 18l2.89 2.89 M9 22c1.798-1.998 2.518-3.995 2.807-5.993",
  "dna-off": "M15 2c-1.35 1.5-2.092 3-2.5 4.5L14 8M17 6l-2.89 -2.89 M2 15c3.333-3 6.667-3 10-3M2 2l20 20 M20 9l0.89 0.89 M22 9c-1.5 1.35-3 2.092-4.5 2.5l-1-1M3.109 14.109 4 15M6.5 12.5l1 1 M7 18l2.89 2.89 M9 22c1.35-1.5 2.092-3 2.5-4.5L10 16",
  dock: "M2 8h20M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM6 16h12",
  dog: "M11.25 16.25h1.5L12 17zM16 14v.5M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309M8 14v.5M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5",
  "dollar-sign": "M12 2L12 22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  dome: "M10 21v-3a2 2 0 014 0v3M12 2v2M18 12v9M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2v-6a1 1 0 011-1h18a1 1 0 011 1zM4 12a8 8 0 0116 0M6 12v9",
  donut: "M20.5 10a2.5 2.5 0 0 1-2.4-3H18a2.95 2.95 0 0 1-2.6-4.4 10 10 0 1 0 6.3 7.1c-.3.2-.8.3-1.2.3M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "door-closed": "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16M2 21h20M9 12h.01",
  "door-closed-locked": "M19 8V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16M2 21h8M20 16v-2a2 2 0 00-4 0v2M9 12h.01M15 16h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  "door-closed-package": "M18 13v3M19 9V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16M2 21h8M9 12h.01M15 13h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  "door-open": "M10 21H2M10 3H7a2 2 0 00-2 2v16M14 12h.01M19 21V5a2 2 0 00-1.675-1.974l-6.163-1.013A1 1 0 0010 3v18a1 1 0 001.124.992zM22 21h-3",
  "door-stairwell": "M12 17v-3a1 1 0 011-1h6M19 17h-9a1 1 0 00-1 1v3M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16M19 9h-3a1 1 0 00-1 1v3M22 21H2",
  dot: "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  download: "M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5 -5 ",
  "drafting-compass": "M12.99 6.74l1.93 3.44 M19.136 12a10 10 0 0 1-14.271 0M21 21l-2.16 -3.84 M3 21l8.02 -14.26 M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  drama: "M10 11h.01M14 6h.01M18 6h.01M6.5 13.1h.01M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3M17.4 9.9c-.8.8-2 .8-2.8 0M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4",
  drill: "M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1zM13 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1l-.81 3.242a1 1 0 0 1-.97.758H8M14 4h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3M18 6h4M5 10l-2 8 M7 18l2 -8 ",
  drone: "M10 10 7 7M10 14l-3 3 M14 10l3 -3 M14 14l3 3 M14.205 4.139a4 4 0 1 1 5.439 5.863M19.637 14a4 4 0 1 1-5.432 5.868M4.367 10a4 4 0 1 1 5.438-5.862M9.795 19.862a4 4 0 1 1-5.429-5.873M11 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  droplet: "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
  "droplet-off": "M18.715 13.186C18.29 11.858 17.384 10.607 16 9.5c-2-1.6-3.5-4-4-6.5a10.7 10.7 0 0 1-.884 2.586M2 2l20 20 M8.795 8.797A11 11 0 0 1 8 9.5C6 11.1 5 13 5 15a7 7 0 0 0 13.222 3.208",
  droplets: "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05zM12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97",
  drum: "M2 2l8 8 M22 2l-8 8 M2 9a10 5 0 1 0 20 0a10 5 0 1 0 -20 0M7 13.4v7.9M12 14v8M17 13.4v7.9M2 9v8a10 5 0 0 0 20 0V9",
  drumstick: "M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23M8.29 12.71l-2.6 2.6 a 2.5 2.5 0 1 0 -1.65 4.65 A 2.5 2.5 0 1 0 8.7 18.3 l 2.59 -2.59",
  dumbbell: "M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829zM2.5 21.5l1.4 -1.4 M20.1 3.9l1.4 -1.4 M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829zM9.6 14.4l4.8 -4.8 ",
  ear: "M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4",
  "ear-off": "M6 18.5a3.5 3.5 0 1 0 7 0c0-1.57.92-2.52 2.04-3.46M6 8.5c0-.75.13-1.47.36-2.14M8.8 3.15A6.5 6.5 0 0 1 19 8.5c0 1.63-.44 2.81-1.09 3.76M12.5 6A2.5 2.5 0 0 1 15 8.5M10 13a2 2 0 0 0 1.82-1.18M2 2L22 22",
  earth: "M21.54 15H17a2 2 0 0 0-2 2v4.54M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "earth-lock": "M7 3.34V5a3 3 0 0 0 3 3M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05M21.54 15H17a2 2 0 0 0-2 2v4.54M12 2a10 10 0 1 0 9.54 13M20 6V4a2 2 0 1 0-4 0v2M15 6h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  eclipse: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 2a7 7 0 1 0 10 10",
  egg: "M12 2C8 2 4 8 4 14a8 8 0 0 0 16 0c0-6-4-12-8-12",
  "egg-fried": "M8 12.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M3 8c0-3.5 2.5-6 6.5-6 5 0 4.83 3 7.5 5s5 2 5 6c0 4.5-2.5 6.5-7 6.5-2.5 0-2.5 2.5-6 2.5s-7-2-7-5.5c0-3 1.5-3 1.5-5C3.5 10 3 9 3 8Z",
  "egg-off": "M2 2l20 20 M20 14.347V14c0-6-4-12-8-12-1.078 0-2.157.436-3.157 1.19M6.206 6.21C4.871 8.4 4 11.2 4 14a8 8 0 0 0 14.568 4.568",
  eject: "M4 13a1 1 0 0 1-.72-1.695l7.257-7.668a2 2 0 0 1 2.926 0l7.256 7.668A1 1 0 0 1 20 13zM4 17h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  ellipse: "M2 12a10 6 0 1 0 20 0a10 6 0 1 0 -20 0",
  ellipsis: "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "ellipsis-vertical": "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  engine: "M10 3h6M13 3v4M2 10v6M2 13h4M6 16a2 2 0 002 2h1a2 2 0 011.6.8l.3.4a2 2 0 001.6.8h2.264a2 2 0 001.789-1.106l1.67-3.341a1 1 0 01.895-.553H21a1 1 0 001-1v-4a1 1 0 00-1-1h-3.5a1 1 0 01-.8-.4l-.9-1.2A1 1 0 0015 7h-4a1 1 0 00-.8.4l-.9 1.2a1 1 0 01-.8.4H7a1 1 0 00-1 1z",
  equal: "M5 9L19 9M5 15L19 15",
  "equal-approximately": "M5 15a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0M5 9a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0",
  "equal-approximately-not": "M5 15a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0M5 9a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0M19 5L5 19",
  "equal-not": "M5 9L19 9M5 15L19 15M19 5L5 19",
  eraser: "M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21M5.08 11.09l8.83 8.83 ",
  "ethernet-port": "M10 8v1M14 8v1M18 8v1M19 17a2 2 0 00-1.765 1.059l-.47.882A2 2 0 0115 20H9a2 2 0 01-1.765-1.059l-.47-.882A2 2 0 005 17H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v9a2 2 0 01-2 2zM6 8v1",
  euro: "M4 10h12M4 14h9M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2",
  "ev-charger": "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16M2 21h13M3 7h11M9 11l-2 3 h 3 l -2 3",
  expand: "M15 15l6 6 M15 9l6 -6 M21 16v5h-5M21 8V3h-5M3 16v5h5M3 21l6 -6 M3 8V3h5M9 9 3 3",
  "external-link": "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  eye: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "eye-closed": "M15 18l-0.72 -3.25 M2 8a10.645 10.645 0 0 0 20 0M20 15l-1.73 -2.05 M4 15l1.73 -2.05 M9 18l0.72 -3.25 ",
  "eye-dashed": "M13.054 18.946a11 11 0 0 1-2.11 0M13.054 5.054a11 11 0 0 0-2.11-.001M17.072 6.274a11 11 0 0 1 1.753 1.173M18.825 16.552a11 11 0 0 1-1.753 1.174M2.514 13.303a11 11 0 0 1-.452-.954 1 1 0 0 1 0-.697 11 11 0 0 1 .45-.955M21.485 10.697a11 11 0 0 1 .453.955 1 1 0 0 1 0 .697 11 11 0 0 1-.453.954M5.173 7.448a11 11 0 0 1 1.753-1.174M6.926 17.726a11 11 0 0 1-1.753-1.174M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "eye-off": "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49M14.084 14.158a3 3 0 0 1-4.242-4.242M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143M2 2l20 20 ",
  "face-angry": "M15 12v-1.584M17 10a5 5 0 00-3 1M7 10a5 5 0 013 1M9 12v-1.584M9 17a5 5 0 016.001 0M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "face-expressionless": "M14 10h2M8 10h2M8 16h8M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "face-grinning": "M15 10V9M7.084 14.302a5.12 5.12 0 009.833 0 .24.24 0 00-.235-.302H7.32a.24.24 0 00-.235.302M9 10V9M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "face-neutral": "M15 10V9M8 16h8M9 10V9M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "face-slightly-frowning": "M15 10V9M9 10V9M9 16a5 5 0 016 0M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "face-slightly-smiling": "M15 10V9M16.472 15a6 6 0 01-8.943 0M9 10V9M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  "face-slightly-smiling-plus": "M13.267 2.08a10 10 0 108.653 8.653M15 10V9M16 5h6M16.472 15a6 6 0 01-8.943 0M19 2v6M9 10V9",
  factory: "M12 16h.01M16 16h.01M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2zM8 16h.01",
  fan: "M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412ZM12 12v.01",
  "fast-forward": "M12 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 12 18zM2 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 2 18z",
  faucet: "M10.083 5.428 5.57 4.083a2 2 0 10.001 3.834l4.512-1.345M12 8v3M13.92 5.43l4.51 -1.34 a 2 2 0 110 3.834 l -4.51 -1.345M18 17v-4.006M22 11v8M22 12h-3a1 1 0 00-1 .994h-2.539a4 4 0 00-6.915-.012L7 13a5 5 0 00-5 5v1a1 1 0 001 1h2a1 1 0 001-1v-1a1 1 0 01.995-1l1.552.018a4 4 0 006.907 0L18 17a1 1 0 001 1h3M10 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  feather: "M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49zM16 8 2 22M17.488 15H9",
  fence: "M4 3 2 5v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5ZM6 8h4M6 18h4M12 3l-2 2 v 15 c 0 .6 .4 1 1 1 h 2 c .6 0 1 -.4 1 -1 V 5 ZM14 8h4M14 18h4M20 3l-2 2 v 15 c 0 .6 .4 1 1 1 h 2 c .6 0 1 -.4 1 -1 V 5 Z",
  "ferris-wheel": "M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M12 2v4M6.8 15l-3.5 2 M20.7 7l-3.5 2 M6.8 9 3.3 7M20.7 17l-3.5 -2 M9 22l3 -8 3 8 M8 22h8M18 18.7a9 9 0 1 0-12 0",
  file: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5",
  "file-archive": "M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5M14 2v5a1 1 0 0 0 1 1h5M8 12v-1M8 18v-2M8 7V6M6 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "file-axis-3d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M8 18l4 -4 M8 10v8h8",
  "file-badge": "M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.3M14 2v5a1 1 0 0 0 1 1h5M7.69 16.48l1.29 4.88 a .5 .5 0 0 1 -.698 .591 l -1.843 -.849 a 1 1 0 0 0 -.879 .001 l -1.846 .85 a .5 .5 0 0 1 -.692 -.593 l 1.29 -4.88M3 14a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "file-box": "M14 2v5a1 1 0 001 1h5M14.692 22H18a2 2 0 002-2V8a2.4 2.4 0 00-.706-1.706l-3.588-3.588A2.4 2.4 0 0014 2H6a2 2 0 00-2 2v3.804M2.264 13.752 7 16.5l4.737-2.748M2.995 13.014A2 2 0 002 14.744v3.516a2 2 0 00.996 1.73l3 1.74a2 2 0 002.008 0l3-1.74A2 2 0 0012 18.26v-3.517a2 2 0 00-.995-1.73l-3-1.742a2 2 0 00-1.892-.064zM7 16.5V22",
  "file-braces": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1",
  "file-braces-corner": "M14 22h4a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6M14 2v5a1 1 0 0 0 1 1h5M5 14a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1 1 1 0 0 1 1 1v2a1 1 0 0 0 1 1M9 22a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1",
  "file-chart-column": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M8 18v-1M12 18v-6M16 18v-3",
  "file-chart-column-increasing": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M8 18v-2M12 18v-4M16 18v-6",
  "file-chart-line": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M16 13l-3.5 3.5 -2 -2 L 8 17",
  "file-chart-pie": "M15.941 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.512M14 2v5a1 1 0 0 0 1 1h5M4.017 11.512a6 6 0 1 0 8.466 8.475M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z",
  "file-check": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M9 15l2 2 4 -4 ",
  "file-check-corner": "M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6M14 2v5a1 1 0 0 0 1 1h5M14 20l2 2 4 -4 ",
  "file-clock": "M16 22h2a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v2.85M14 2v5a1 1 0 0 0 1 1h5M8 14v2.2l1.6 1M2 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "file-code": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M10 12.5 8 15l2 2.5M14 12.5l2 2.5 -2 2.5 ",
  "file-code-corner": "M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35M14 2v5a1 1 0 0 0 1 1h5M5 16l-3 3 3 3 M9 22l3 -3 -3 -3 ",
  "file-cog": "M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8zM20 8v12a2 2 0 0 1-2 2h-4.182M3.31 19.53l0.92 -0.38 M4 10.592V4a2 2 0 0 1 2-2h8M4.23 16.85l-0.92 -0.38 M5.85 15.23l-0.38 -0.92 M5.85 20.77l-0.38 0.92 M8.15 15.23l0.38 -0.92 M8.53 21.7l-0.38 -0.92 M9.77 16.85l0.92 -0.38 M9.77 19.15l0.92 0.38 M4 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "file-diff": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM9 10h6M12 13V7M9 17h6",
  "file-digit": "M4 12V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2M14 2v5a1 1 0 0 0 1 1h5M10 16h2v6M10 22h4M4 16h0a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2Z",
  "file-down": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M12 18v-6M9 15l3 3 3 -3 ",
  "file-exclamation-point": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM12 9v4M12 17h.01",
  "file-headphone": "M4 6.835V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-.343M14 2v5a1 1 0 0 0 1 1h5M2 19a2 2 0 0 1 4 0v1a2 2 0 0 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0",
  "file-heart": "M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v7M14 2v5a1 1 0 0 0 1 1h5M3.62 18.8A2.25 2.25 0 1 1 7 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a1 1 0 0 1-1.507 0z",
  "file-image": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M8 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M20 17l-1.3 -1.3 a 2.41 2.41 0 0 0 -3.408 0 L 9 22",
  "file-input": "M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1M14 2v5a1 1 0 0 0 1 1h5M2 15h10M9 18l3 -3 -3 -3 ",
  "file-key": "M14 2v5a1 1 0 0 0 1 1h5M4 12v6M4 14h2M9.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v4M2 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "file-lock": "M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3M14 2v5a1 1 0 0 0 1 1h5M9 17v-2a2 2 0 0 0-4 0v2M4 17h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  "file-minus": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M9 15h6",
  "file-minus-corner": "M20 14V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12M14 2v5a1 1 0 0 0 1 1h5M14 18h6",
  "file-music": "M11.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v10.35M14 2v5a1 1 0 0 0 1 1h5M8 20v-7l3 1.474M4 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "file-output": "M4.226 20.925A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.127M14 2v5a1 1 0 0 0 1 1h5M5 11l-3 3 M5 17l-3 -3 h 10",
  "file-pen": "M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34M14 2v5a1 1 0 0 0 1 1h5M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z",
  "file-pen-line": "M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004zM14.487 7.858A1 1 0 0 1 14 7V2M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516M8 18h1",
  "file-play": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M15.033 13.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56v-4.704a.645.645 0 0 1 .967-.56z",
  "file-plus": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M9 15h6M12 18v-6",
  "file-plus-corner": "M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35M14 2v5a1 1 0 0 0 1 1h5M14 19h6M17 16v6",
  "file-question-mark": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM12 17h.01M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3",
  "file-scan": "M20 10V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4.35M14 2v5a1 1 0 0 0 1 1h5M16 14a2 2 0 0 0-2 2M16 22a2 2 0 0 1-2-2M20 14a2 2 0 0 1 2 2M20 22a2 2 0 0 0 2-2",
  "file-search": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M9 14.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M13.3 16.3 15 18",
  "file-search-corner": "M11.1 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.589 3.588A2.4 2.4 0 0 1 20 8v3.25M14 2v5a1 1 0 0 0 1 1h5M21 22l-2.88 -2.88 M13 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "file-signal": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M8 15h.01M11.5 13.5a2.5 2.5 0 0 1 0 3M15 12a5 5 0 0 1 0 6",
  "file-sliders": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M8 12h8M10 11v2M8 17h8M14 16v2",
  "file-spreadsheet": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M8 13h2M14 13h2M8 17h2M14 17h2",
  "file-stack": "M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z",
  "file-symlink": "M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7M14 2v5a1 1 0 0 0 1 1h5M10 18l3 -3 -3 -3 ",
  "file-terminal": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M8 16l2 -2 -2 -2 M12 18h4",
  "file-text": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M10 9H8M16 13H8M16 17H8",
  "file-type": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M11 18h2M12 12v6M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5",
  "file-type-corner": "M12 22h6a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6M14 2v5a1 1 0 0 0 1 1h5M3 16v-1.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5V16M6 22h2M7 14v8",
  "file-up": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M12 12v6M15 15l-3 -3 -3 3 ",
  "file-user": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M16 22a4 4 0 0 0-8 0M9 15a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "file-video-camera": "M4 12V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2M14 2v5a1 1 0 0 0 1 1h5M10 17.84l3.03 -1.75 a .64 .64 0 0 1 .967 .56 v 4.704 a .65 .65 0 0 1 -.967 .56 L 10 20.157M4 16h5a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1Z",
  "file-volume": "M4 11.55V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-1.95M14 2v5a1 1 0 0 0 1 1h5M12 15a5 5 0 0 1 0 6M8 14.502a.5.5 0 0 0-.826-.381l-1.893 1.631a1 1 0 0 1-.651.243H3.5a.5.5 0 0 0-.5.501v3.006a.5.5 0 0 0 .5.501h1.129a1 1 0 0 1 .652.243l1.893 1.633a.5.5 0 0 0 .826-.38z",
  "file-x": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M14.5 12.5l-5 5 M9.5 12.5l5 5 ",
  "file-x-corner": "M11 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5M14 2v5a1 1 0 0 0 1 1h5M15 17l5 5 M20 17l-5 5 ",
  files: "M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706zM5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1",
  film: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4",
  "fingerprint-pattern": "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M14 13.12c0 2.38 0 6.38-1 8.88M17.29 21.02c.12-.6.43-2.3.5-3.02M2 12a10 10 0 0 1 18-6M2 16h.01M21.8 16c.2-2 .131-5.354 0-6M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2M8.65 22c.21-.66.45-1.32.57-2M9 6.8a6 6 0 0 1 9 5.2v2",
  "fire-extinguisher": "M15 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5M9 18h8M18 3h-3M11 3a6 6 0 0 0-6 6v11M5 13h4M17 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z",
  fish: "M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6ZM18 12v.5M16 17.93a9.77 9.77 0 0 1 0-11.86M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4M16.01 17.93l-0.23 1.4 A 2 2 0 0 1 13.8 21 H 9.5 a 5.96 5.96 0 0 0 1.49 -3.98",
  "fish-off": "M18 12.47v.03m0-.5v.47m-.475 5.056A6.744 6.744 0 0 1 15 18c-3.56 0-7.56-2.53-8.5-6 .348-1.28 1.114-2.433 2.121-3.38m3.444-2.088A8.802 8.802 0 0 1 15 6c3.56 0 6.06 2.54 7 6-.309 1.14-.786 2.177-1.413 3.058M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33m7.48-4.372A9.77 9.77 0 0 1 16 6.07m0 11.86a9.77 9.77 0 0 1-1.728-3.618M16.01 17.93l-0.23 1.4 A 2 2 0 0 1 13.8 21 H 9.5 a 5.96 5.96 0 0 0 1.49 -3.98 M 8.53 3 h 5.27 a 2 2 0 0 1 1.98 1.67 l .23 1.4 M 2 2 l 20 20",
  "fish-symbol": "M2 16s9-15 20-4C11 23 2 8 2 8",
  "fishing-hook": "M17.59 11.41l-5.93 5.93 a 1 1 0 0 1 -8 -8 l 3.137 -3.137 a .707 .707 0 0 1 1.207 .5 V 10M20.414 8.586 22 7M17 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "fishing-rod": "M4 11h1M8 15a2 2 0 0 1-4 0V3a1 1 0 0 1 1-1h.5C14 2 20 9 20 18v4M16 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  flag: "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528",
  "flag-off": "M16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528M2 2l20 20 M4 22V4M7.656 2H8c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10.347",
  "flag-triangle-left": "M18 22V2.8a.8.8 0 0 0-1.17-.71L5.45 7.78a.8.8 0 0 0 0 1.44L18 15.5",
  "flag-triangle-right": "M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5",
  flame: "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",
  "flame-kindling": "M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10a5 5 0 1 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C8 4.5 11 2 12 2ZM5 22l14 -4 M5 18l14 4 ",
  flashlight: "M12 13v1M17 2a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8A4 4 0 0 0 16 12v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V3a1 1 0 0 1 1-1zM6 6h12",
  "flashlight-off": "M11.652 6H18M12 13v1M16 16v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V6M2 2l20 20 M7.649 2H17a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8a4 4 0 0 0-.55 1.007",
  "flask-conical": "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2M6.453 15h11.094M8.5 2h7",
  "flask-conical-off": "M10 2v2.343M14 2v6.343M2 2l20 20 M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-1.755-2.96l5.227-9.563M6.453 15H15M8.5 2h7",
  "flask-round": "M10 2v6.292a7 7 0 1 0 4 0V2M5 15h14M8.5 2h7",
  flower: "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5M12 7.5V9M7.5 12H9M16.5 12H15M12 16.5V15M8 8l1.88 1.88 M14.12 9.88 16 8M8 16l1.88 -1.88 M14.12 14.12 16 16",
  "flower-2": "M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1M10 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M12 10v12M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5ZM12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z",
  focus: "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2",
  "fold-horizontal": "M2 12h6M22 12h-6M12 2v2M12 8v2M12 14v2M12 20v2M19 9l-3 3 3 3 M5 15l3 -3 -3 -3 ",
  "fold-vertical": "M12 22v-6M12 8V2M4 12H2M10 12H8M16 12h-2M22 12h-2M15 19l-3 -3 -3 3 M15 5l-3 3 -3 -3 ",
  folder: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  "folder-archive": "M13 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M20.9 19.8A2 2 0 0 0 22 18V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5.1M15 11v-1M15 17v-2",
  "folder-bookmark": "M12 6v7.751a.25.25 0 00.407.195l2.28-1.834a.5.5 0 01.627 0l2.28 1.834a.25.25 0 00.406-.195V6M20 20a2 2 0 002-2V8a2 2 0 00-2-2h-7.9a2 2 0 01-1.69-.9L9.6 3.9A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z",
  "folder-check": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2ZM9 13l2 2 4 -4 ",
  "folder-clock": "M16 14v2.2l1.6 1M7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2M10 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "folder-closed": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2ZM2 10h20",
  "folder-code": "M10 10.5 8 13l2 2.5M14 10.5l2 2.5 -2 2.5 M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
  "folder-cog": "M10.3 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.98a2 2 0 0 1 1.69.9l.66 1.2A2 2 0 0 0 12 6h8a2 2 0 0 1 2 2v3.3M14.31 19.53l0.92 -0.38 M15.23 16.85l-0.92 -0.38 M16.85 15.23l-0.38 -0.92 M16.85 20.77l-0.38 0.92 M19.15 15.23l0.38 -0.92 M19.53 21.7l-0.38 -0.92 M20.77 16.85l0.92 -0.38 M20.77 19.15l0.92 0.38 M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "folder-dot": "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2ZM11 13a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "folder-down": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2ZM12 10v6M15 13l-3 3 -3 -3 ",
  "folder-git": "M10 13a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2ZM14 13h3M7 13h3",
  "folder-git-2": "M18 19a5 5 0 0 1-5-5v8M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5M11 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "folder-heart": "M10.638 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v3.417M14.62 18.8A2.25 2.25 0 1 1 18 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z",
  "folder-input": "M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1M2 13h10M9 16l3 -3 -3 -3 ",
  "folder-kanban": "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2ZM8 10v4M12 10v2M16 10v6",
  "folder-key": "M13 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v1.36M19 12v6M19 14h2M17 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "folder-lock": "M15 17h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM10 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v2.5M20 17v-2a2 2 0 1 0-4 0v2",
  "folder-minus": "M9 13h6M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  "folder-open": "M6 14l1.5 -2.9 A 2 2 0 0 1 9.24 10 H 20 a 2 2 0 0 1 1.94 2.5 l -1.54 6 a 2 2 0 0 1 -1.95 1.5 H 4 a 2 2 0 0 1 -2 -2 V 5 a 2 2 0 0 1 2 -2 h 3.9 a 2 2 0 0 1 1.69 .9 l .81 1.2 a 2 2 0 0 0 1.67 .9 H 18 a 2 2 0 0 1 2 2 v 2",
  "folder-open-dot": "M6 14l1.45 -2.9 A 2 2 0 0 1 9.24 10 H 20 a 2 2 0 0 1 1.94 2.5 l -1.55 6 a 2 2 0 0 1 -1.94 1.5 H 4 a 2 2 0 0 1 -2 -2 V 5 c 0 -1.1 .9 -2 2 -2 h 3.93 a 2 2 0 0 1 1.66 .9 l .82 1.2 a 2 2 0 0 0 1.66 .9 H 18 a 2 2 0 0 1 2 2 v 2M13 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "folder-output": "M2 7.5V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-1.5M2 13h10M5 10l-3 3 3 3 ",
  "folder-pen": "M2 11.5V5a2 2 0 0 1 2-2h3.9c.7 0 1.3.3 1.7.9l.8 1.2c.4.6 1 .9 1.7.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9.5M11.378 13.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
  "folder-plus": "M12 10v6M9 13h6M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  "folder-root": "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2ZM10 13a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M12 15v5",
  "folder-search": "M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1M21 21l-1.9 -1.9 M14 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "folder-search-2": "M9 12.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2ZM13.3 14.3 15 16",
  "folder-symlink": "M2 9.35V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7M8 16l3 -3 -3 -3 ",
  "folder-sync": "M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v.5M12 10v4h4M12 14l1.54 -1.6 a 5 5 0 0 1 8 1.5M22 22v-4h-4M22 18l-1.53 1.61 a 5 5 0 0 1 -8 -1.5",
  "folder-tree": "M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1ZM20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1ZM3 5a2 2 0 0 0 2 2h3M3 3v13a2 2 0 0 0 2 2h3",
  "folder-up": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2ZM12 10v6M9 13l3 -3 3 3 ",
  "folder-x": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2ZM9.5 10.5l5 5 M14.5 10.5l-5 5 ",
  folders: "M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6zM3 8.268a2 2 0 0 0-1 1.738V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.732-1",
  footprints: "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0ZM20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0ZM16 17h4M4 13h4",
  forklift: "M12 12H5a2 2 0 0 0-2 2v5M15 19h7M16 19V2M6 12V7a2 2 0 0 1 2-2h2.172a2 2 0 0 1 1.414.586l3.828 3.828A2 2 0 0 1 16 10.828M7 19h4M11 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  form: "M4 14h6M4 2h10M5 18h14a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1ZM5 6h14a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  forward: "M15 17l5 -5 -5 -5 M4 18v-2a4 4 0 0 1 4-4h12",
  frame: "M22 6L2 6M22 18L2 18M6 2L6 22M18 2L18 22",
  fuel: "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16M2 21h13M3 9h11",
  fullscreen: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 8h8a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  funnel: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
  "funnel-plus": "M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348M16 6h6M19 3v6",
  "funnel-x": "M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473M16.5 3.5l5 5 M21.5 3.5l-5 5 ",
  galaxy: "M16.005 15.108a5.041 6.52 28.25 00-8.008-6.217 5.041 6.52 28.25 008.008 6.217A11.884 7.288-60.76 014.029 7.001M17 21h.01M7 3h.01M7.997 8.891a11.885 7.288-60.756 0111.977 8.107M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "gallery-horizontal": "M2 3v18M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM22 3v18",
  "gallery-horizontal-end": "M2 7v10M6 5v14M12 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "gallery-thumbnails": "M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM4 21h1M9 21h1M14 21h1M19 21h1",
  "gallery-vertical": "M3 2h18M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM3 22h18",
  "gallery-vertical-end": "M7 2h10M5 6h14M5 10h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  gamepad: "M6 12L10 12M8 10L8 14M15 13L15.01 13M18 11L18.01 11M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "gamepad-2": "M6 11L10 11M8 9L8 13M15 12L15.01 12M18 10L18.01 10M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z",
  "gamepad-directional": "M11.146 15.854a1.207 1.207 0 0 1 1.708 0l1.56 1.56A2 2 0 0 1 15 18.828V21a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2.172a2 2 0 0 1 .586-1.414zM18.828 15a2 2 0 0 1-1.414-.586l-1.56-1.56a1.207 1.207 0 0 1 0-1.708l1.56-1.56A2 2 0 0 1 18.828 9H21a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1zM6.586 14.414A2 2 0 0 1 5.172 15H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2.172a2 2 0 0 1 1.414.586l1.56 1.56a1.207 1.207 0 0 1 0 1.708zM9 3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.172a2 2 0 0 1-.586 1.414l-1.56 1.56a1.207 1.207 0 0 1-1.708 0l-1.56-1.56A2 2 0 0 1 9 5.172z",
  "gap-horizontal": "M12 2v2M12 8v2M12 14v2M12 20v2M21 3h-3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M3 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3",
  "gap-vertical": "M2 12h2M8 12h2M14 12h2M20 12h2M3 21v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3M3 3v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3",
  gauge: "M12 14l4 -4 M3.34 19a10 10 0 1 1 17.32 0",
  gavel: "M14 13l-8.38 8.38 a 1 1 0 0 1 -3.001 -3 l 8.384 -8.381M16 16l6 -6 M21.5 10.5l-8 -8 M8 8l6 -6 M8.5 7.5l8 8 ",
  gem: "M10.5 3 8 9l4 13 4-13-2.5-6M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3zM2 9h20",
  "georgian-lari": "M11.5 21a7.5 7.5 0 1 1 7.35-9M13 12V3M4 21h16M9 12V3",
  germ: "M11 2l0.93 1.85 M13 15h.01M16 21l-1 -2.47 M19 2l-1 1.8 M2 19l2.75 -1.37 M22 16l-2.47 -2.13 M22 5l-1.8 1 M3 10l2 2 M9 16h.01M9 20v2M9.33 7.035c-.51 1.478-1.786 2.93-3.09 3.794A5 5 0 009 20a12.1 12.1 0 0011.902-9.916A6 6 0 009.33 7.035M13 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "germ-off": "M11 2l0.93 1.85 M13 15h.01M13.424 7.768a2 2 0 112.808 2.808M16 21l-1 -2.47 M16.988 16.988A12 12 0 019 20a5 5 0 01-2.759-9.171 8.8 8.8 0 002.307-2.28M19 2l-1 1.8 M2 19l2.75 -1.37 M2 2l20 20 M22 16l-2.47 -2.13 a 12 12 0 001.376 -3.786 6 6 0 00 -10.313 -5.151M22 5l-1.8 1 M3 10l2 2 M9 16h.01M9 20v2",
  ghost: "M15 10v1M7.528 20.472a1.6 1.6 0 012.277 0l1.057 1.056a1.6 1.6 0 002.276 0l1.057-1.056a1.6 1.6 0 012.277 0l1.114 1.114a1.4 1.4 0 002.414-1V10a8 8 0 00-16 0v10.586a1.4 1.4 0 002.414 1zM9 10v1",
  gift: "M12 7v14M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5M4 7h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  "git-branch": "M15 6a9 9 0 0 0-9 9V3M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "git-branch-minus": "M15 6a9 9 0 0 0-9 9V3M21 18h-6M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "git-branch-plus": "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 0-9 9M18 15v6M21 18h-6",
  "git-commit-horizontal": "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 12L9 12M15 12L21 12",
  "git-commit-vertical": "M12 3v6M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M12 15v6",
  "git-compare": "M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M13 6h3a2 2 0 0 1 2 2v7M11 18H8a2 2 0 0 1-2-2V9",
  "git-compare-arrows": "M2 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M12 6h5a2 2 0 0 1 2 2v7M15 9l-3 -3 3 -3 M16 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M12 18H7a2 2 0 0 1-2-2V9M9 15l3 3 -3 3 ",
  "git-fork": "M9 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9M12 12v3",
  "git-graph": "M2 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M5 9v6M2 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M12 3v18M16 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M16 15.7A9 9 0 0 0 19 9",
  "git-merge": "M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M6 21V9a9 9 0 0 0 9 9",
  "git-merge-conflict": "M12 6h4a2 2 0 0 1 2 2v7M6 12v9M8.5 3.5l-5 5 M8.5 8.5l-5 -5 M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "git-pull-request": "M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M13 6h3a2 2 0 0 1 2 2v7M6 9L6 21",
  "git-pull-request-arrow": "M2 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M5 9v12M16 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M15 9l-3 -3 3 -3 M12 6h5a2 2 0 0 1 2 2v7",
  "git-pull-request-closed": "M15.5 3.5l5 5 M15.5 8.5l5 -5 M18 11.62V15M6 9v12M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "git-pull-request-create": "M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M6 9v12M13 6h3a2 2 0 0 1 2 2v3M18 15v6M21 18h-6",
  "git-pull-request-create-arrow": "M2 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M5 9v12M15 9l-3 -3 3 -3 M12 6h5a2 2 0 0 1 2 2v3M19 15v6M22 18h-6",
  "git-pull-request-draft": "M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M18 6V5M18 11v-1M6 9L6 21",
  "glass-water": "M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79zM6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0",
  glasses: "M2 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M14 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2M2.5 13 5 7c.7-1.3 1.4-2 3-2M21.5 13 19 7c-.7-1.3-1.5-2-3-2",
  globe: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20",
  "globe-check": "M15 6l2 2 4 -4 M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10",
  "globe-code": "M15.5 10 13 7.5 15.5 5M15.861 14A14.5 14.5 0 0112 22a14.48 14.48 0 010-20 10 10 0 109.888 11.5M19.5 5 22 7.5 19.5 10M2 12h8.5",
  "globe-lock": "M15.686 15A14.5 14.5 0 0 1 12 22a14.5 14.5 0 0 1 0-20 10 10 0 1 0 9.542 13M2 12h8.5M20 6V4a2 2 0 1 0-4 0v2M15 6h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  "globe-off": "M10.114 4.462A14.5 14.5 0 0 1 12 2a10 10 0 0 1 9.313 13.643M15.557 15.556A14.5 14.5 0 0 1 12 22 10 10 0 0 1 4.929 4.929M15.892 10.234A14.5 14.5 0 0 0 12 2a10 10 0 0 0-3.643.687M17.656 12H22M19.071 19.071A10 10 0 0 1 12 22 14.5 14.5 0 0 1 8.44 8.45M2 12h10M2 2l20 20 ",
  "globe-x": "M16 3l5 5 M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10M21 3l-5 5 ",
  goal: "M12 13V2l8 4-8 4M20.561 10.222a9 9 0 1 1-12.55-5.29M8.002 9.997a5 5 0 1 0 8.9 2.02",
  gpu: "M2 17h18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H2M2 21V3M7 17v3a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-3M14 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "graduation-cap": "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0zM22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5",
  grape: "M22 5V2l-5.89 5.89M13.6 15.89a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M5.11 7.4a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M9.35 11.65a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M10.91 5.85a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M15.15 10.09a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3.56 13.2a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M7.8 17.44a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M2 19a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "grid-2x2": "M12 3v18M3 12h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "grid-2x2-check": "M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3M16 19l2 2 4 -4 ",
  "grid-2x2-plus": "M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3M16 19h6M19 22v-6",
  "grid-2x2-x": "M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3M16.5 16.5l5 5 M16.5 21.5l5 -5 ",
  "grid-3x2": "M15 3v18M3 12h18M9 3v18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "grid-3x3": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M3 15h18M9 3v18M15 3v18",
  grip: "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "grip-horizontal": "M11 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M11 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "grip-vertical": "M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  group: "M3 7V5c0-1.1.9-2 2-2h2M17 3h2c1.1 0 2 .9 2 2v2M21 17v2c0 1.1-.9 2-2 2h-2M7 21H5c-1.1 0-2-.9-2-2v-2M8 7h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM11 12h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  guitar: "M11.9 12.1l4.51 -4.51 M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4zM6 16l2 2 M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z",
  ham: "M13.144 21.144A7.274 10.445 45 1 0 2.856 10.856M13.144 21.144A7.274 4.365 45 0 0 2.856 10.856a7.274 4.365 45 0 0 10.288 10.288M16.565 10.435 18.6 8.4a2.501 2.501 0 1 0 1.65-4.65 2.5 2.5 0 1 0-4.66 1.66l-2.024 2.025M8.5 16.5l-1 -1 ",
  hamburger: "M12 16H4a2 2 0 1 1 0-4h16a2 2 0 1 1 0 4h-4.25M5 12a2 2 0 0 1-2-2 9 7 0 0 1 18 0 2 2 0 0 1-2 2M5 16a2 2 0 0 0-2 2 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 2 2 0 0 0-2-2q0 0 0 0M6.67 12l6.13 4.6 a 2 2 0 0 0 2.8 -.4 l 3.15 -4.2",
  hammer: "M15 12l-9.37 9.37 a 1 1 0 0 1 -3.001 -3 L 12 9M18 15l4 -4 M21.5 11.5l-1.91 -1.91 A 2 2 0 0 1 19 8.172 v -.344 a 2 2 0 0 0 -.586 -1.414 l -1.657 -1.657 A 6 6 0 0 0 12.516 3 H 9 l 1.243 1.243 A 6 6 0 0 1 12 8.485 V 10 l 2 2 h 1.172 a 2 2 0 0 1 1.414 .586 L 18.5 14.5",
  hand: "M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  "hand-coins": "M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17M7 21l1.6 -1.4 c .3 -.4 .8 -.6 1.4 -.6 h 4 c 1.1 0 2.1 -.4 2.8 -1.2 l 4.6 -4.4 a 2 2 0 0 0 -2.75 -2.91 l -4.2 3.9M2 16l6 6 M13.1 9a2.9 2.9 0 1 0 5.8 0a2.9 2.9 0 1 0 -5.8 0M3 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "hand-fist": "M12.035 17.012a3 3 0 0 0-3-3l-.311-.002a.72.72 0 0 1-.505-1.229l1.195-1.195A2 2 0 0 1 10.828 11H12a2 2 0 0 0 0-4H9.243a3 3 0 0 0-2.122.879l-2.707 2.707A4.83 4.83 0 0 0 3 14a8 8 0 0 0 8 8h2a8 8 0 0 0 8-8V7a2 2 0 1 0-4 0v2a2 2 0 1 0 4 0M13.888 9.662A2 2 0 0 0 17 8V5A2 2 0 1 0 13 5M9 5A2 2 0 1 0 5 5V10M9 7V4A2 2 0 1 1 13 4V7.268",
  "hand-grab": "M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0",
  "hand-heart": "M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16M14.45 13.39l5.05 -4.69 C 20.196 8 21 6.85 21 5.75 a 2.75 2.75 0 0 0 -4.797 -1.837 .276 .276 0 0 1 -.406 0 A 2.75 2.75 0 0 0 11 5.75 c 0 1.2 .802 2.248 1.5 2.946 L 16 11.95M2 15l6 6 M7 20l1.6 -1.4 c .3 -.4 .8 -.6 1.4 -.6 h 4 c 1.1 0 2.1 -.4 2.8 -1.2 l 4.6 -4.4 a 1 1 0 0 0 -2.75 -2.91",
  "hand-helping": "M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14M7 18l1.6 -1.4 c .3 -.4 .8 -.6 1.4 -.6 h 4 c 1.1 0 2.1 -.4 2.8 -1.2 l 4.6 -4.4 a 2 2 0 0 0 -2.75 -2.91 l -4.2 3.9M2 13l6 6 ",
  "hand-metal": "M18 12.5V10a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4M14 11V9a2 2 0 1 0-4 0v2M10 10.5V5a2 2 0 1 0-4 0v9M7 15l-1.76 -1.76 a 2 2 0 0 0 -2.83 2.82 l 3.6 3.6 C 7.5 21.14 9.2 22 12 22 h 2 a 8 8 0 0 0 8 -8 V 7 a 2 2 0 1 0 -4 0 v 5",
  "hand-platter": "M12 3V2M15.4 17.4l3.2 -2.8 a 2 2 0 1 1 2.8 2.9 l -3.6 3.3 c -.7 .8 -1.7 1.2 -2.8 1.2 h -4 c -1.1 0 -2.1 -.4 -2.8 -1.2 l -1.302 -1.464 A 1 1 0 0 0 6.151 19 H 5M2 14h12a2 2 0 0 1 0 4h-2M4 10h16M5 10a7 7 0 0 1 14 0M5 14v6a1 1 0 0 1-1 1H2",
  handbag: "M2.048 18.566A2 2 0 0 0 4 21h16a2 2 0 0 0 1.952-2.434l-2-9A2 2 0 0 0 18 8H6a2 2 0 0 0-1.952 1.566zM8 11V6a4 4 0 0 1 8 0v5",
  handshake: "M11 17l2 2 a 1 1 0 1 0 3 -3M14 14l2.5 2.5 a 1 1 0 1 0 3 -3 l -3.88 -3.88 a 3 3 0 0 0 -4.24 0 l -.88 .88 a 1 1 0 1 1 -3 -3 l 2.81 -2.81 a 5.79 5.79 0 0 1 7.06 -.87 l .47 .28 a 2 2 0 0 0 1.42 .25 L 21 4M21 3l1 11 h -2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8",
  "hard-drive": "M10 16h.01M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM21.946 12.013H2.054M6 16h.01",
  "hard-drive-download": "M12 2v8M16 6l-4 4 -4 -4 M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM6 18h.01M10 18h.01",
  "hard-drive-upload": "M16 6l-4 -4 -4 4 M12 2v8M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM6 18h.01M10 18h.01",
  "hard-hat": "M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5M14 6a6 6 0 0 1 6 6v3M4 15v-3a6 6 0 0 1 6-6M3 15h18a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  hash: "M4 9L20 9M4 15L20 15M10 3L8 21M16 3L14 21",
  "hat-glasses": "M14 18a2 2 0 0 0-4 0M19 11l-2.11 -6.66 a 2 2 0 0 0 -2.752 -1.148 l -1.276 .61 A 2 2 0 0 1 12 4 H 8.5 a 2 2 0 0 0 -1.925 1.456 L 5 11M2 11h20M14 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M4 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  haze: "M5.2 6.2l1.4 1.4 M2 13h2M20 13h2M17.4 7.6l1.4 -1.4 M22 17H2M22 21H2M16 13a4 4 0 0 0-8 0M12 5V2.5",
  hd: "M10 12H6M10 15V9M14 14.5a.5.5 0 0 0 .5.5h1a2.5 2.5 0 0 0 2.5-2.5v-1A2.5 2.5 0 0 0 15.5 9h-1a.5.5 0 0 0-.5.5zM6 15V9M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "hdmi-port": "M22 9a1 1 0 00-1-1H3a1 1 0 00-1 1v4a1 1 0 001 1h.5a2 2 0 011.6.8l.3.4A2 2 0 007 16h10a2 2 0 001.6-.8l.3-.4a2 2 0 011.6-.8h.5a1 1 0 001-1zM8 12h8",
  heading: "M6 12h12M6 20V4M18 20V4",
  "heading-1": "M4 12h8M4 18V6M12 18V6M17 12l3 -2 v 8",
  "heading-2": "M4 12h8M4 18V6M12 18V6M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1",
  "heading-3": "M4 12h8M4 18V6M12 18V6M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2",
  "heading-4": "M12 18V6M17 10v3a1 1 0 0 0 1 1h3M21 10v8M4 12h8M4 18V6",
  "heading-5": "M4 12h8M4 18V6M12 18V6M17 13v-3h4M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17",
  "heading-6": "M4 12h8M4 18V6M12 18V6M17 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M20 10c-2 2-3 3.5-3 6",
  "headphone-off": "M21 14h-1.343M9.128 3.47A9 9 0 0 1 21 12v3.343M2 2l20 20 M20.414 20.414A2 2 0 0 1 19 21h-1a2 2 0 0 1-2-2v-3M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 2.636-6.364",
  headphones: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3",
  headset: "M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3ZM21 16v2a4 4 0 0 1-4 4h-5",
  heart: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
  "heart-crack": "M12.409 5.824c-.702.792-1.15 1.496-1.415 2.166l2.153 2.156a.5.5 0 0 1 0 .707l-2.293 2.293a.5.5 0 0 0 0 .707L12 15M13.508 20.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.677.6.6 0 0 0 .818.001A5.5 5.5 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5z",
  "heart-handshake": "M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762",
  "heart-minus": "M14.88 18.99l-1.37 1.32 a 2 2 0 0 1 -3 .019 L 5 15 c -1.5 -1.5 -3 -3.2 -3 -5.5 a 5.5 5.5 0 0 1 9.591 -3.676 .56 .56 0 0 0 .818 0 A 5.49 5.49 0 0 1 22 9.5 a 5.2 5.2 0 0 1 -.244 1.572M15 15h6",
  "heart-off": "M10.5 4.893a5.5 5.5 0 0 1 1.091.931.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 1.872-1.002 3.356-2.187 4.655M16.97 16.97l-3.46 3.35 a 2 2 0 0 1 -3 .019 L 5 15 c -1.5 -1.5 -3 -3.2 -3 -5.5 a 5.5 5.5 0 0 1 2.747 -4.761M2 2l20 20 ",
  "heart-plus": "M14.48 19.37l-0.97 0.94 a 2 2 0 0 1 -3 .019 L 5 15 c -1.5 -1.5 -3 -3.2 -3 -5.5 a 5.5 5.5 0 0 1 9.591 -3.676 .56 .56 0 0 0 .818 0 A 5.49 5.49 0 0 1 22 9.5 a 5.2 5.2 0 0 1 -.219 1.49M15 15h6M18 12v6",
  "heart-pulse": "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27",
  "heart-x": "M15.5 12.5l5 5 M20.5 12.5l-5 5 M21.955 8.774a5.5 5.5 0 0 0-9.546-2.95.6.6 0 0 1-.818 0A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.508 5.332a2 2 0 0 0 2.57.352",
  heater: "M11 8c2-3-2-3 0-6M15.5 8c2-3-2-3 0-6M6 10h.01M6 14h.01M10 16v-4M14 16v-4M18 16v-4M20 6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3M5 20v2M19 20v2",
  helicopter: "M11 17v4M14 3v8a2 2 0 0 0 2 2h5.865M17 17v4M18 17a4 4 0 0 0 4-4 8 6 0 0 0-8-6 6 5 0 0 0-6 5v3a2 2 0 0 0 2 2zM2 10v5M6 3h16M7 21h14M8 13H2",
  hexagon: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  highlighter: "M9 11l-6 6 v 3 h 9 l 3 -3M22 12l-4.6 4.6 a 2 2 0 0 1 -2.8 0 l -5.2 -5.2 a 2 2 0 0 1 0 -2.8 L 14 4",
  hop: "M10.82 16.12c1.69.6 3.91.79 5.18.85.55.03 1-.42.97-.97-.06-1.27-.26-3.5-.85-5.18M11.5 6.5c1.64 0 5-.38 6.71-1.07.52-.2.55-.82.12-1.17A10 10 0 0 0 4.26 18.33c.35.43.96.4 1.17-.12.69-1.71 1.07-5.07 1.07-6.71 1.34.45 3.1.9 4.88.62a.88.88 0 0 0 .73-.74c.3-2.14-.15-3.5-.61-4.88M15.62 16.95c.2.85.62 2.76.5 4.28a.77.77 0 0 1-.9.7 16.64 16.64 0 0 1-4.08-1.36M16.13 21.05c1.65.63 3.68.84 4.87.91a.9.9 0 0 0 .96-.96 17.68 17.68 0 0 0-.9-4.87M16.94 15.62c.86.2 2.77.62 4.29.5a.77.77 0 0 0 .7-.9 16.64 16.64 0 0 0-1.36-4.08M17.99 5.52a20.82 20.82 0 0 1 3.15 4.5.8.8 0 0 1-.68 1.13c-2.33.2-5.3-.32-8.27-1.57M4.93 4.93 3 3a.7.7 0 0 1 0-1M9.58 12.18c1.24 2.98 1.77 5.95 1.57 8.28a.8.8 0 0 1-1.13.68 20.82 20.82 0 0 1-4.5-3.15",
  "hop-off": "M10.82 16.12c1.69.6 3.91.79 5.18.85.28.01.53-.09.7-.27M11.14 20.57c.52.24 2.44 1.12 4.08 1.37.46.06.86-.25.9-.71.12-1.52-.3-3.43-.5-4.28M16.13 21.05c1.65.63 3.68.84 4.87.91a.9.9 0 0 0 .7-.26M17.99 5.52a20.83 20.83 0 0 1 3.15 4.5.8.8 0 0 1-.68 1.13c-1.17.1-2.5.02-3.9-.25M20.57 11.14c.24.52 1.12 2.44 1.37 4.08.04.3-.08.59-.31.75M4.93 4.93a10 10 0 0 0-.67 13.4c.35.43.96.4 1.17-.12.69-1.71 1.07-5.07 1.07-6.71 1.34.45 3.1.9 4.88.62a.85.85 0 0 0 .48-.24M5.52 17.99c1.05.95 2.91 2.42 4.5 3.15a.8.8 0 0 0 1.13-.68c.2-2.34-.33-5.3-1.57-8.28M8.35 2.68a10 10 0 0 1 9.98 1.58c.43.35.4.96-.12 1.17-1.5.6-4.3.98-6.07 1.05M2 2l20 20 ",
  hospital: "M12 7v4M14 21v-3a2 2 0 0 0-4 0v3M14 9h-4M18 11h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2M18 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16",
  hotel: "M10 22v-6.57M12 11h.01M12 7h.01M14 15.43V22M15 16a5 5 0 0 0-6 0M16 11h.01M16 7h.01M8 11h.01M8 7h.01M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
  hourglass: "M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2",
  "hourglass-cog": "M14.31 19.53l0.92 -0.38 M15.23 16.85l-0.92 -0.38 M16.85 15.23l-0.38 -0.92 M16.85 20.77l-0.38 0.92 M17 2v4.172a2 2 0 0 1-.586 1.414l-8.828 8.828A2 2 0 0 0 7 17.828V22M19.15 15.23l0.38 -0.92 M19.53 21.7l-0.38 -0.92 M20.77 16.85l0.92 -0.38 M20.77 19.15l0.92 0.38 M5 22h6.159M5 2h14M7 2v4.172a2 2 0 0 0 .586 1.414l5.188 5.188M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  house: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  "house-heart": "M8.62 13.8A2.25 2.25 0 1 1 12 10.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0zM3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  "house-plug": "M10 12V8.964M14 12V8.964M15 12a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2a1 1 0 0 1 1-1zM8.5 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-2",
  "house-plus": "M12.35 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v2.35M14.8 12.4A1 1 0 0 0 14 12h-4a1 1 0 0 0-1 1v8M15 18h6M18 15v6",
  "house-wifi": "M9.5 13.866a4 4 0 0 1 5 .01M12 17h.01M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 10.754a8 8 0 0 1 10 0",
  houses: "M12.68 4.24l0.83 -0.71 a 1.45 1.45 0 011.88 0 l 5.09 4.364 A 1.45 1.45 0 0121 9 v 6.546 a 1.45 1.45 0 01 -1 1.381M15.485 11.889A1.45 1.45 0 0116 13v6.546A1.454 1.454 0 0114.546 21H4.364a1.454 1.454 0 01-1.454-1.454V13a1.45 1.45 0 01.515-1.111l5.09-4.364a1.45 1.45 0 011.88 0zM7.41 20.546v-4a1 1 0 011-1h2a1 1 0 011 1v4",
  "ice-cream-bowl": "M12 17c5 0 8-2.69 8-6H4c0 3.31 3 6 8 6m-4 4h8m-4-3v3M5.14 11a3.5 3.5 0 1 1 6.71 0M12.14 11a3.5 3.5 0 1 1 6.71 0M15.5 6.5a3.5 3.5 0 1 0-7 0",
  "ice-cream-cone": "M7 11l4.08 10.35 a 1 1 0 0 0 1.84 0 L 17 11M17 7A5 5 0 0 0 7 7M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4",
  "id-card": "M13 19a4 4 0 00-8 0M16 10h2M16 14h2M6 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "id-card-lanyard": "M13.5 8h-3M15 2l-1 2 h 3 a 2 2 0 012 2 v 14 a 2 2 0 01 -2 2 H 7 a 2 2 0 01 -2 -2 V 6 a 2 2 0 012 -2 h 3M16 22a4 4 0 00-8 0M9 2l3 6 M9 15a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M21 15l-3.09 -3.09 a 2 2 0 0 0 -2.828 0 L 6 21",
  "image-down": "M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21M14 19l3 3 v -5.5M17 22l3 -3 M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "image-minus": "M21 9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M16 5L22 5M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M21 15l-3.09 -3.09 a 2 2 0 0 0 -2.828 0 L 6 21",
  "image-off": "M2 2L22 22M10.41 10.41a2 2 0 1 1-2.83-2.83M13.5 13.5L6 21M18 12L21 15M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59M21 15V5a2 2 0 0 0-2-2H9",
  "image-play": "M15 15.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86zM21 12.17V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M6 21l5 -5 M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "image-plus": "M16 5h6M19 2v6M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5M21 15l-3.09 -3.09 a 2 2 0 0 0 -2.828 0 L 6 21M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "image-up": "M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21M14 19.5l3 -3 3 3 M17 22v-5.5M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "image-upscale": "M16 3h5v5M17 21h2a2 2 0 0 0 2-2M21 12v3M21 3l-5 5 M3 7V5a2 2 0 0 1 2-2M5 21l4.14 -4.14 a 1.21 1.21 0 0 1 1.712 0 L 13 19M9 3h3M4 11h8a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1Z",
  images: "M22 11l-1.3 -1.3 a 2.4 2.4 0 0 0 -3.408 0 L 11 16M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2M12 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M10 2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  import: "M12 3v12M8 11l4 4 4 -4 M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4",
  inbox: "M22 12L16 12L14 15L10 15L8 12L2 12M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  "indian-rupee": "M6 3h12M6 8h12M6 13l8.5 8 M6 13h3M9 13c6.667 0 6.667-10 0-10",
  infinity: "M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8",
  info: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 16v-4M12 8h.01",
  "inspection-panel": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 7h.01M17 7h.01M7 17h.01M17 17h.01",
  italic: "M19 4L10 4M14 20L5 20M15 4L9 20",
  "iteration-ccw": "M16 14l4 4 -4 4 M20 10a8 8 0 1 0-8 8h8",
  "iteration-cw": "M4 10a8 8 0 1 1 8 8H4M8 22l-4 -4 4 -4 ",
  "iv-bag": "M12 18v2a2 2 0 002 2h6M6 11c.72.5 1.44 1 3 1 3 0 3-2 6-2 1.56 0 2.28.5 3 1M9.293 3c.453 0 .887-.18 1.207-.5s.754-.5 1.207-.5h.586c.453 0 .887.18 1.207.5s.754.5 1.207.5H16a2 2 0 012 2v11a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2z",
  "japanese-yen": "M12 9.5V21m0-11.5L6 3m6 6.5L18 3M6 15h12M6 11h12",
  joystick: "M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2ZM6 15v-2M12 15V9M9 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  kanban: "M5 3v14M12 3v8M19 3v18",
  kayak: "M18 17a1 1 0 0 0-1 1v1a2 2 0 1 0 2-2zM20.97 3.61a.45.45 0 0 0-.58-.58C10.2 6.6 6.6 10.2 3.03 20.39a.45.45 0 0 0 .58.58C13.8 17.4 17.4 13.8 20.97 3.61M6.71 6.71l10.59 10.59 M7 5a2 2 0 1 0-2 2h1a1 1 0 0 0 1-1z",
  key: "M2 21l9.6 -9.6 M7.5 15.5l2.3 2.3 a 1 1 0 0 1 0 1.4 l -2.1 2.1 a 1 1 0 0 1 -1.4 0 L 4 19M10 7.5a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0",
  "key-round": "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4zM16 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
  "key-square": "M12.4 2.7a2.5 2.5 0 0 1 3.4 0l5.5 5.5a2.5 2.5 0 0 1 0 3.4l-3.7 3.7a2.5 2.5 0 0 1-3.4 0L8.7 9.8a2.5 2.5 0 0 1 0-3.4zM14 7l3 3 M9.4 10.6l-6.81 6.81 A 2 2 0 0 0 2 18.828 V 21 a 1 1 0 0 0 1 1 h 3 a 1 1 0 0 0 1 -1 v -1 a 1 1 0 0 1 1 -1 h 1 a 1 1 0 0 0 1 -1 v -1 a 1 1 0 0 1 1 -1 h .172 a 2 2 0 0 0 1.414 -.586 l .814 -.814",
  keyboard: "M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2Z",
  "keyboard-music": "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM6 8h4M14 8h.01M18 8h.01M2 12h20M6 12v4M10 12v4M14 12v4M18 12v4",
  "keyboard-off": "M 20 4 A2 2 0 0 1 22 6M 22 6 L 22 16.41M 7 16 L 16 16M 9.69 4 L 20 4M14 8h.01M18 8h.01M2 2l20 20 M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M6 8h.01M8 12h.01",
  lambda: "M11.38 10 5 20M19 18a2 2 0 01-2 2c-4.87-.003-5.052-16-10-16a2 2 0 00-2 2",
  lamp: "M12 12v6M4.077 10.615A1 1 0 0 0 5 12h14a1 1 0 0 0 .923-1.385l-3.077-7.384A2 2 0 0 0 15 2H9a2 2 0 0 0-1.846 1.23ZM8 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z",
  "lamp-ceiling": "M12 2v5M14.829 15.998a3 3 0 1 1-5.658 0M20.92 14.606A1 1 0 0 1 20 16H4a1 1 0 0 1-.92-1.394l3-7A1 1 0 0 1 7 7h10a1 1 0 0 1 .92.606z",
  "lamp-desk": "M10.293 2.293a1 1 0 0 1 1.414 0l2.5 2.5 5.994 1.227a1 1 0 0 1 .506 1.687l-7 7a1 1 0 0 1-1.687-.506l-1.227-5.994-2.5-2.5a1 1 0 0 1 0-1.414zM14.21 4.79l-3.41 3.41 M3 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9.09 6.5l-4.79 4.79 a 1 1 0 0 0 -.18 1.17 L 7 18",
  "lamp-floor": "M12 10v12M17.929 7.629A1 1 0 0 1 17 9H7a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 9 2h6a1 1 0 0 1 .928.629zM9 22h6",
  "lamp-wall-down": "M19.929 18.629A1 1 0 0 1 19 20H9a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 11 13h6a1 1 0 0 1 .928.629zM6 3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 6h4a2 2 0 0 1 2 2v5",
  "lamp-wall-up": "M19.929 9.629A1 1 0 0 1 19 11H9a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 11 4h6a1 1 0 0 1 .928.629zM6 15a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM8 18h4a2 2 0 0 0 2-2v-5",
  "land-plot": "M12 8l6 -3 -6 -3 v 10M8 11.99l-5.5 3.14 a 1 1 0 0 0 0 1.74 l 8.5 4.86 a 2 2 0 0 0 2 0 l 8.5 -4.86 a 1 1 0 0 0 0 -1.74 L 16 12M6.49 12.85l11.02 6.3 M17.51 12.85 6.5 19.15",
  landmark: "M10 18v-7M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949zM14 18v-7M18 18v-7M3 22h18M6 18v-7",
  languages: "M5 8l6 6 M4 14l6 -6 2 -3 M2 5h12M7 2h1M22 22l-5 -10 -5 10 M14 18h6",
  laptop: "M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2zM20.054 15.987H3.946",
  "laptop-minimal": "M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM2 20L22 20",
  "laptop-minimal-check": "M2 20h20M9 10l2 2 4 -4 M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  lasso: "M3.704 14.467a10 8 0 1 1 3.115 2.375M7 22a5 5 0 0 1-2-3.994M3 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "lasso-select": "M7 22a5 5 0 0 1-2-4M7 16.93c.96.43 1.96.74 2.99.91M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z",
  "layer-arrow-down": "M12 10v10M22 10a1 1 0 01-.59.92l-5.077 2.308M22.017 10.005a1 1 0 00-.597-.916l-8.59-3.91a2 2 0 00-1.66.001L2.6 9.08a1 1 0 00-.02 1.831l5.093 2.316M9 17l3 3 3 -3 ",
  "layer-arrow-up": "M12 14V4M7.674 10.774 2.58 13.09a1 1 0 000 1.822l8.6 3.91a2 2 0 001.65 0l8.58-3.9a1 1 0 00.59-.92 1 1 0 00-.59-.922l-5.078-2.308M9 7l3 -3 3 3 ",
  layers: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83zM2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
  "layers-2": "M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74zM20 14.29l1.5 0.85 a 1 1 0 0 1 0 1.74 L 13 21.74 a 2 2 0 0 1 -2 0 l -8.5 -4.87 a 1 1 0 0 1 0 -1.74 l 1.5 -.845",
  "layers-arrow-down": "M12 7v15M2 12a1 1 0 00.58.91l5.093 2.316M22 12a1 1 0 01-.59.92l-5.077 2.308M8 10.37 2.6 7.91a1 1 0 010-1.831l8.57-3.9a2 2 0 011.66.001l8.59 3.91a1 1 0 010 1.831l-5.392 2.45M9 19l3 3 3 -3 ",
  "layers-arrow-up": "M12 12V2M2 17.002a1 1 0 00.58.91l8.6 3.91a2 2 0 001.65 0l8.58-3.9a1 1 0 00.59-.92M7.674 8.774 2.58 11.09a1 1 0 000 1.822l8.6 3.91a2 2 0 001.65 0l8.58-3.9a1 1 0 00.59-.92 1 1 0 00-.59-.922l-5.078-2.308M9 5l3 -3 3 3 ",
  "layers-minus": "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l8.58-3.9a1 1 0 0 0 0-1.832zM16 17h6M2.003 11.995a1 1 0 0 0 .597.915l8.58 3.91a2 2 0 0 0 .83.18M2.003 16.995a1 1 0 0 0 .597.915l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l2.11-.96M22.018 12.004a1 1 0 0 1-.598.916l-.177.08",
  "layers-plus": "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l8.58-3.9a1 1 0 0 0 0-1.831zM16 17h6M19 14v6M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 .825.178M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l2.116-.962",
  "layout-arrow-down": "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM18 3v18M21 18l-3 3 -3 -3 ",
  "layout-arrow-right": "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM3 18h18M18 21l3 -3 -3 -3 ",
  "layout-dashboard": "M4 3h5a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1ZM15 3h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM15 12h5a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1ZM4 16h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  "layout-freeform": "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM15 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM5 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  "layout-grid": "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  "layout-list": "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM14 4h7M14 9h7M14 15h7M14 20h7",
  "layout-panel-left": "M4 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1ZM15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  "layout-panel-top": "M4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  "layout-template": "M4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM4 14h7a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-7a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM17 14h3a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  leaf: "M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13",
  "leafy-green": "M2 22c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 4 4 0 0 0 6.187-2.353 3.5 3.5 0 0 0 3.69-5.116A3.5 3.5 0 0 0 20.95 8 3.5 3.5 0 1 0 16 3.05a3.5 3.5 0 0 0-5.831 1.373 3.5 3.5 0 0 0-5.116 3.69 4 4 0 0 0-2.348 6.155C3.499 15.42 4.409 16.712 4.2 18.1 3.926 19.743 3.014 20.732 2 22M2 22 17 7",
  lectern: "M15 13h4a2 2 0 001.901-1.38l1.057-4.333A1 1 0 0021 6H3a1 1 0 00-.958 1.287L3.1 11.621A2 2 0 005.001 13h4M15 22V11a1 1 0 00-1-1h-4a1 1 0 00-1 1v11M18 22H6M18 6V3a1 1 0 00-1-1h-3",
  "lens-concave": "M7 2a1 1 0 0 0-.8 1.6 14 14 0 0 1 0 16.8A1 1 0 0 0 7 22h10a1 1 0 0 0 .8-1.6 14 14 0 0 1 0-16.8A1 1 0 0 0 17 2z",
  "lens-convex": "M13.433 2a1 1 0 0 1 .824.448 18 18 0 0 1 0 19.104 1 1 0 0 1-.824.448h-2.866a1 1 0 0 1-.824-.448 18 18 0 0 1 0-19.104A1 1 0 0 1 10.567 2z",
  library: "M16 6l4 14 M12 6v14M8 8v12M4 4v16",
  "library-big": "M4 3h6a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1ZM7 3v18M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z",
  "life-buoy": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M4.93 4.93l4.24 4.24 M14.83 9.17l4.24 -4.24 M14.83 14.83l4.24 4.24 M9.17 14.83l-4.24 4.24 M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  ligature: "M14 12h2v8M14 20h4M6 12h4M6 20h4M8 20V8a4 4 0 0 1 7.464-2",
  lightbulb: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4",
  "lightbulb-off": "M16.8 11.2c.8-.9 1.2-2 1.2-3.2a6 6 0 0 0-9.3-5M2 2l20 20 M6.3 6.3a4.67 4.67 0 0 0 1.2 5.2c.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4",
  lighthouse: "M12 3V2M16.066 16.865 7 22l2-11V6a3 3 0 016 0v5l2 11M19.79 4.5l0.87 -0.5 M19.8 13.5l0.87 0.5 M21 9h1M3 9H2M4.2 13.5l-0.87 0.5 M4.208 4.5 3.342 4M5.5 22h13M7.93 16.88l7.38 -4.18 M8 11h8M8 7h8",
  "line-dot-right-horizontal": "M 3 12 L 15 12M15 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "line-squiggle": "M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2",
  "line-style": "M11 5h2M15 12h6M19 5h2M3 12h6M3 19h18M3 5h2",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  "link-2": "M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12L16 12",
  "link-2-off": "M9 17H7A5 5 0 0 1 7 7M15 7h2a5 5 0 0 1 4 8M8 12L12 12M2 2L22 22",
  list: "M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13",
  "list-check": "M16 5H3M16 12H3M11 19H3M15 18l2 2 4 -4 ",
  "list-checks": "M13 5h8M13 12h8M13 19h8M3 17l2 2 4 -4 M3 7l2 2 4 -4 ",
  "list-chevrons-down-up": "M3 5h8M3 12h8M3 19h8M15 5l3 3 3 -3 M15 19l3 -3 3 3 ",
  "list-chevrons-up-down": "M3 5h8M3 12h8M3 19h8M15 8l3 -3 3 3 M15 16l3 3 3 -3 ",
  "list-clock": "M16 13v2.2l1.6 1M3 12h3.458M3 19h3.832M3 5h18M10 15a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "list-collapse": "M10 5h11M10 12h11M10 19h11M3 10l3 -3 -3 -3 M3 20l3 -3 -3 -3 ",
  "list-end": "M16 5H3M16 12H3M9 19H3M16 16l-3 3 3 3 M21 5v12a2 2 0 0 1-2 2h-6",
  "list-filter": "M2 5h20M6 12h12M9 19h6",
  "list-filter-plus": "M12 5H2M6 12h12M9 19h6M16 5h6M19 8V2",
  "list-indent-decrease": "M21 5H11M21 12H11M21 19H11M7 8l-4 4 4 4 ",
  "list-indent-increase": "M21 5H11M21 12H11M21 19H11M3 8l4 4 -4 4 ",
  "list-minus": "M16 5H3M11 12H3M16 19H3M21 12h-6",
  "list-music": "M16 5H3M11 12H3M11 19H3M21 16V5M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "list-ordered": "M11 5h10M11 12h10M11 19h10M4 4h1v5M4 9h2M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02",
  "list-plus": "M16 5H3M11 12H3M16 19H3M18 9v6M21 12h-6",
  "list-restart": "M21 5H3M7 12H3M7 19H3M12 18a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L11 14M11 10v4h4",
  "list-sort-ascending": "M3 19h18M15 12H3M9 5H3",
  "list-sort-descending": "M15 12H3M3 5h18M9 19H3",
  "list-start": "M3 5h6M3 12h13M3 19h13M16 8l-3 -3 3 -3 M21 19V7a2 2 0 0 0-2-2h-6",
  "list-todo": "M13 5h8M13 12h8M13 19h8M3 17l2 2 4 -4 M4 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1Z",
  "list-tree": "M8 5h13M13 12h8M13 19h8M3 10a2 2 0 0 0 2 2h3M3 5v12a2 2 0 0 0 2 2h3",
  "list-video": "M21 5H3M10 12H3M10 19H3M15 12.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z",
  "list-x": "M16 5H3M11 12H3M16 19H3M15.5 9.5l5 5 M20.5 9.5l-5 5 ",
  loader: "M12 2v4M16.2 7.8l2.9 -2.9 M18 12h4M16.2 16.2l2.9 2.9 M12 18v4M4.9 19.1l2.9 -2.9 M2 12h4M4.9 4.9l2.9 2.9 ",
  "loader-circle": "M21 12a9 9 0 1 1-6.219-8.56",
  "loader-pinwheel": "M22 12a1 1 0 0 1-10 0 1 1 0 0 0-10 0M7 20.7a1 1 0 1 1 5-8.7 1 1 0 1 0 5-8.6M7 3.3a1 1 0 1 1 5 8.6 1 1 0 1 0 5 8.6M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  locate: "M2 12L5 12M19 12L22 12M12 2L12 5M12 19L12 22M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0",
  "locate-fixed": "M2 12L5 12M19 12L22 12M12 2L12 5M12 19L12 22M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "locate-off": "M12 19v3M12 2v3M18.89 13.24a7 7 0 0 0-8.13-8.13M19 12h3M2 12h3M2 2l20 20 M7.05 7.05a7 7 0 0 0 9.9 9.9",
  lock: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2ZM7 11V7a5 5 0 0 1 10 0v4",
  "lock-keyhole": "M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M5 10h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM7 10V7a5 5 0 0 1 10 0v3",
  "lock-keyhole-open": "M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M5 10h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM7 10V7a5 5 0 0 1 9.33-2.5",
  "lock-open": "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2ZM7 11V7a5 5 0 0 1 9.9-1",
  "log-in": "M10 17l5 -5 -5 -5 M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4",
  "log-out": "M16 17l5 -5 -5 -5 M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
  logs: "M3 5h1M3 12h1M3 19h1M8 5h1M8 12h1M8 19h1M13 5h8M13 12h8M13 19h8",
  lollipop: "M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M21 21l-4.3 -4.3 M11 11a2 2 0 0 0 4 0 4 4 0 0 0-8 0 6 6 0 0 0 12 0",
  luggage: "M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14M10 20h4M14 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  magnet: "M12 15l4 4 M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282zM5 8l4 4 ",
  mail: "M22 7l-8.99 5.73 a 2 2 0 0 1 -2.009 0 L 2 7M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2Z",
  "mail-badge": "M22 7.7V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8.25M12 12.996a1.94 1.94 0 0 1-1.03-.296L2 7M20.69 16.48l1.29 4.88 a .5 .5 0 0 1 -.698 .591 l -1.843 -.849 a 1 1 0 0 0 -.879 .001 l -1.846 .85 a .5 .5 0 0 1 -.692 -.593 l 1.29 -4.88M16 14a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "mail-check": "M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8M22 7l-8.97 5.7 a 1.94 1.94 0 0 1 -2.06 0 L 2 7M16 19l2 2 4 -4 ",
  "mail-clock": "M16 14v2.2l1.6 1M22 7l-0.76 0.48 M6.835 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v2M7.605 10.567 2 7M10 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "mail-minus": "M22 15V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8M22 7l-8.97 5.7 a 1.94 1.94 0 0 1 -2.06 0 L 2 7M16 19h6",
  "mail-open": "M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6ZM22 10l-8.97 5.7 a 1.94 1.94 0 0 1 -2.06 0 L 2 10",
  "mail-pen": "M15.506 17.646A2 2 0 0015 18.5l-.837 2.87a.5.5 0 00.62.62l2.87-.837a2 2 0 00.854-.506l3.013-3.009a1 1 0 00-3.004-3.004zM22 10.346V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h6.396M22 7l-8.99 5.73 a 2 2 0 01 -2.009 0 L 2 7",
  "mail-plus": "M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8M22 7l-8.97 5.7 a 1.94 1.94 0 0 1 -2.06 0 L 2 7M19 16v6M16 19h6",
  "mail-question-mark": "M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5M22 7l-8.97 5.7 a 1.94 1.94 0 0 1 -2.06 0 L 2 7M18 15.28c.2-.4.5-.8.9-1a2.1 2.1 0 0 1 2.6.4c.3.4.5.8.5 1.3 0 1.3-2 2-2 2M20 22v.01",
  "mail-search": "M22 12.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h7.5M22 7l-8.97 5.7 a 1.94 1.94 0 0 1 -2.06 0 L 2 7M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M22 22l-1.5 -1.5 ",
  "mail-warning": "M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5M22 7l-8.97 5.7 a 1.94 1.94 0 0 1 -2.06 0 L 2 7M20 14v4M20 22v.01",
  "mail-x": "M22 12.532V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8.792M22 7l-8.99 5.73 a 2 2 0 0 1 -2.009 0 L 2 7M16.5 16.5l5 5 M21.5 16.5l-5 5 ",
  mailbox: "M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c2.2 0 4 1.8 4 4v8ZM15 9L18 9L18 11M6.5 5C9 5 11 7 11 9.5V17a2 2 0 0 1-2 2M6 10L7 10",
  mails: "M17 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 1-1.732M22 5.5l-6.42 4.18 a 2 2 0 0 1 -2.162 0 L 7 5.5M9 3h11a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-11a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  map: "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zM15 5.764v15M9 3.236v15",
  "map-minus": "M11 19l-1.11 -0.55 a 2 2 0 0 0 -1.788 0 l -3.659 1.83 A 1 1 0 0 1 3 19.381 V 6.618 a 1 1 0 0 1 .553 -.894 l 4.553 -2.277 a 2 2 0 0 1 1.788 0 l 4.212 2.106 a 2 2 0 0 0 1.788 0 l 3.659 -1.83 A 1 1 0 0 1 21 4.619 V 14M15 5.764V14M21 18h-6M9 3.236v15",
  "map-pin": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "map-pin-check": "M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M16 18l2 2 4 -4 ",
  "map-pin-check-inside": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M9 10l2 2 4 -4 ",
  "map-pin-house": "M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1zM18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2M18 22v-3M7 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "map-pin-minus": "M18.977 14C19.6 12.701 20 11.343 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M16 18h6",
  "map-pin-minus-inside": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M9 10h6",
  "map-pin-off": "M12.75 7.09a3 3 0 0 1 2.16 2.16M17.072 17.072c-1.634 2.17-3.527 3.912-4.471 4.727a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 1.432-4.568M2 2l20 20 M8.475 2.818A8 8 0 0 1 20 10c0 1.183-.31 2.377-.81 3.533M9.13 9.13a3 3 0 0 0 3.74 3.74",
  "map-pin-pen": "M17.97 9.304A8 8 0 0 0 2 10c0 4.69 4.887 9.562 7.022 11.468M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506zM7 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "map-pin-plus": "M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M16 18h6M19 15v6",
  "map-pin-plus-inside": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M12 7v6M9 10h6",
  "map-pin-search": "M 12.248 21.969 a 1 1 0 0 1 -0.849 -0.17 C 9.539 20.193 4 14.993 4 10 a 8 8 0 0 1 16 0 C 20 10.42 19.961 10.841 19.888 11.262M22 22l-1.88 -1.88 M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "map-pin-x": "M19.752 11.901A7.78 7.78 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 19 19 0 0 0 .09-.077M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M21.5 15.5l-5 5 M21.5 20.5l-5 -5 ",
  "map-pin-x-inside": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M14.5 7.5l-5 5 M9.5 7.5l5 5 ",
  "map-pinned": "M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0M10 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712",
  "map-plus": "M11 19l-1.11 -0.55 a 2 2 0 0 0 -1.788 0 l -3.659 1.83 A 1 1 0 0 1 3 19.381 V 6.618 a 1 1 0 0 1 .553 -.894 l 4.553 -2.277 a 2 2 0 0 1 1.788 0 l 4.212 2.106 a 2 2 0 0 0 1.788 0 l 3.659 -1.83 A 1 1 0 0 1 21 4.619 V 12M15 5.764V12M18 15v6M21 18h-6M9 3.236v15",
  mars: "M16 3h5v5M21 3l-6.75 6.75 M4 14a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "mars-stroke": "M14 6l4 4 M17 3h4v4M21 3l-7.75 7.75 M3 15a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  martini: "M12 12 4.207 4.207A.707.707 0 0 1 4.707 3h14.586a.707.707 0 0 1 .5 1.207zM12 12v10M7 22h10",
  maximize: "M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3",
  "maximize-2": "M15 3h6v6M21 3l-7 7 M3 21l7 -7 M9 21H3v-6",
  medal: "M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15M11 12 5.12 2.2M13 12l5.88 -9.8 M8 7h8M7 17a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M12 18v-2h-.5",
  megaphone: "M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14M8 6v8",
  "megaphone-off": "M11.636 6A13 13 0 0 0 19.4 3.2 1 1 0 0 1 21 4v11.344M14.378 14.357A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1M2 2l20 20 M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14M8 8v6",
  "memory-stick": "M12 12v-2M12 18v-2M16 12v-2M16 18v-2M2 11h1.5M20 18v-2M20.5 11H22M4 18v-2M8 12v-2M8 18v-2M4 6h16a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2Z",
  menu: "M4 5h16M4 12h16M4 19h16",
  merge: "M8 6l4 -4 4 4 M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22M20 22l-5 -5 ",
  "message-circle": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
  "message-circle-check": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M16 9l-5.5 5.5 L 8 12",
  "message-circle-code": "M10 9l-3 3 3 3 M14 15l3 -3 -3 -3 M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
  "message-circle-dashed": "M10.1 2.182a10 10 0 0 1 3.8 0M13.9 21.818a10 10 0 0 1-3.8 0M17.609 3.72a10 10 0 0 1 2.69 2.7M2.182 13.9a10 10 0 0 1 0-3.8M20.28 17.61a10 10 0 0 1-2.7 2.69M21.818 10.1a10 10 0 0 1 0 3.8M3.721 6.391a10 10 0 0 1 2.7-2.69M6.16 21.12l-2.91 0.85 a 1 1 0 0 1 -1.236 -1.169 l .965 -2.98",
  "message-circle-dashed-check": "M10.1 2.182a10 10 0 013.8 0M13.9 21.818a10 10 0 01-3.8 0M17.609 3.72a10 10 0 012.69 2.7M2.182 13.9a10 10 0 010-3.8M20.28 17.61a10 10 0 01-2.7 2.69M21.818 10.1a10 10 0 010 3.8M3.721 6.391a10 10 0 012.7-2.69M6.16 21.12l-2.91 0.85 a 1 1 0 01 -1.236 -1.169 l .965 -2.98M16 9l-5.5 5.5 L 8 12",
  "message-circle-heart": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M7.828 13.07A3 3 0 0 1 12 8.764a3 3 0 0 1 5.004 2.224 3 3 0 0 1-.832 2.083l-3.447 3.62a1 1 0 0 1-1.45-.001z",
  "message-circle-more": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M8 12h.01M12 12h.01M16 12h.01",
  "message-circle-off": "M2 2l20 20 M4.93 4.929a10 10 0 0 0-1.938 11.412 2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 0 0 11.302-1.989M8.35 2.69A10 10 0 0 1 21.3 15.65",
  "message-circle-plus": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M8 12h8M12 8v8",
  "message-circle-question-mark": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
  "message-circle-reply": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M10 15l-3 -3 3 -3 M7 12h8a2 2 0 0 1 2 2v1",
  "message-circle-warning": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M12 8v4M12 16h.01",
  "message-circle-x": "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M15 9l-6 6 M9 9l6 6 ",
  "message-square": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
  "message-square-check": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.7.7 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM9 11l2 2 4 -4 ",
  "message-square-code": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM10 8l-3 3 3 3 M14 14l3 -3 -3 -3 ",
  "message-square-dashed": "M14 3h2M16 19h-2M2 12v-2M2 16v5.286a.71.71 0 0 0 1.212.502l1.149-1.149M20 19a2 2 0 0 0 2-2v-1M22 10v2M22 6V5a2 2 0 0 0-2-2M4 3a2 2 0 0 0-2 2v1M8 19h2M8 3h2",
  "message-square-diff": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM10 15h4M10 9h4M12 7v4",
  "message-square-dot": "M12.7 3H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H20a2 2 0 0 0 2-2v-4.7M16 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "message-square-heart": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM7.5 9.5c0 .687.265 1.383.697 1.844l3.009 3.264a1.14 1.14 0 0 0 .407.314 1 1 0 0 0 .783-.004 1.14 1.14 0 0 0 .398-.31l3.008-3.264A2.77 2.77 0 0 0 16.5 9.5 2.5 2.5 0 0 0 12 8a2.5 2.5 0 0 0-4.5 1.5",
  "message-square-lock": "M22 8.5V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H10M20 15v-2a2 2 0 0 0-4 0v2M15 15h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  "message-square-more": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM12 11h.01M16 11h.01M8 11h.01",
  "message-square-off": "M19 19H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.7.7 0 0 1 2 21.286V5a2 2 0 0 1 1.184-1.826M2 2l20 20 M8.656 3H20a2 2 0 0 1 2 2v11.344",
  "message-square-plus": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM12 8v6M9 11h6",
  "message-square-quote": "M14 14a2 2 0 0 0 2-2V8h-2M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM8 14a2 2 0 0 0 2-2V8H8",
  "message-square-reply": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM10 8l-3 3 3 3 M17 14v-1a2 2 0 0 0-2-2H7",
  "message-square-share": "M12 3H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H20a2 2 0 0 0 2-2v-4M16 3h6v6M16 9l6 -6 ",
  "message-square-text": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM7 11h10M7 15h6M7 7h8",
  "message-square-warning": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM12 15h.01M12 7v4",
  "message-square-x": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM14.5 8.5l-5 5 M9.5 8.5l5 5 ",
  "messages-circle": "M19.95 10.05a7 7 0 011.412 7.872 1 1 0 00-.058.787l.675 2.089a1 1 0 01-1.236 1.168l-2.155-.631a1 1 0 00-.745.06 7 7 0 01-7.793-1.445M2.696 12.708a1 1 0 00-.058-.785 7 7 0 113.518 3.473 1 1 0 00-.744-.061l-2.155.63a1 1 0 01-1.236-1.167z",
  "messages-square": "M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2zM20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1",
  metronome: "M12 11.4V9.1M12 17l6.59 -6.59 M15.05 5.7l-0.22 -0.69 a 3 3 0 0 0 -5.663 0 L 4.418 19.695 A 1 1 0 0 0 5.37 21 h 13.253 a 1 1 0 0 0 .951 -1.31 L 18.45 16.2M18 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  mic: "M12 19v3M19 10v2a7 7 0 0 1-14 0v-2M12 2h0a3 3 0 0 1 3 3v7a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3v-7a3 3 0 0 1 3 -3Z",
  "mic-audio-lines": "M10 3v2.341M12 17v4M14 5v.341M18 5v13M2 10v3M22 10v3M6 6v11M9 21h6M12 9h0a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z",
  "mic-off": "M12 19v3M15 9.34V5a3 3 0 0 0-5.68-1.33M16.95 16.95A7 7 0 0 1 5 12v-2M18.89 13.23A7 7 0 0 0 19 12v-2M2 2l20 20 M9 9v3a3 3 0 0 0 5.12 2.12",
  "mic-signal": "M12 17v4M18 11a6 6 0 00-3-5.197M2 11a10 10 0 015-8.662M22 11a10 10 0 00-5-8.662M6 11a6 6 0 013-5.197M9 21h6M12 9h0a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z",
  "mic-vocal": "M11 7.6l-5.99 8.19 a 1 1 0 0 0 .1 1.298 l .817 .818 a 1 1 0 0 0 1.314 .087 L 15.09 12M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5M11 7a5 5 0 1 0 10 0a5 5 0 1 0 -10 0",
  microchip: "M10 12h4M10 17h4M10 7h4M18 12h2M18 18h2M18 6h2M4 12h2M4 18h2M4 6h2M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
  microscope: "M6 18h8M3 22h18M14 22a7 7 0 1 0 0-14h-1M9 14h2M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2ZM12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3",
  microwave: "M4 4h16a2 2 0 0 1 2 2v11a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2ZM7 8h6a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM18 8v7M6 19v2M18 19v2",
  "midi-port": "M12 18h.01M15 2.458V5a1 1 0 01-1 1h-4a1 1 0 01-1-1V2.458M16 16h.01M18 12h.01M6 12h.01M8 16h.01M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  milestone: "M12 13v8M12 3v3M18.172 6a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  milk: "M8 2h8M9 2v2.789a4 4 0 0 1-.672 2.219l-.656.984A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.789a4 4 0 0 0-.672-2.219l-.656-.984A4 4 0 0 1 15 4.788V2M7 15a6.472 6.472 0 0 1 5 0 6.47 6.47 0 0 0 5 0",
  "milk-off": "M8 2h8M9 2v1.343M15 2v2.789a4 4 0 0 0 .672 2.219l.656.984a4 4 0 0 1 .672 2.22v1.131M7.8 7.8l-.128.192A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3M7 15a6.47 6.47 0 0 1 5 0 6.472 6.472 0 0 0 3.435.435M2 2L22 22",
  minimize: "M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3",
  "minimize-2": "M14 10l7 -7 M20 10h-6V4M3 21l7 -7 M4 14h6v6",
  minus: "M5 12h14",
  "mirror-rectangular": "M11 6 8 9M16 7l-8 8 M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
  "mirror-round": "M10 6.6 8.6 8M12 18v4M15 7.5 9.5 13M7 22h10M4 10a8 8 0 1 0 16 0a8 8 0 1 0 -16 0",
  monitor: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM8 21L16 21M12 17L12 21",
  "monitor-check": "M9 10l2 2 4 -4 M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM12 17v4M8 21h8",
  "monitor-cloud": "M11 13a3 3 0 1 1 2.83-4H14a2 2 0 0 1 0 4zM12 17v4M8 21h8M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "monitor-cog": "M12 17v4M14.31 7.53l0.92 -0.38 M15.23 4.85l-0.92 -0.38 M16.85 3.23l-0.38 -0.92 M16.85 8.77l-0.38 0.92 M19.15 3.23l0.38 -0.92 M19.53 9.7l-0.38 -0.92 M20.77 4.85l0.92 -0.38 M20.77 7.15l0.92 0.38 M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M8 21h8M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "monitor-dot": "M12 17v4M22 12.307V15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.693M8 21h8M16 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "monitor-down": "M12 13V7M15 10l-3 3 -3 -3 M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM12 17v4M8 21h8",
  "monitor-off": "M12 17v4M17 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 1.184-1.826M2 2l20 20 M8 21h8M8.656 3H20a2 2 0 0 1 2 2v10a2 2 0 0 1-.293 1.042",
  "monitor-pause": "M10 13V7M14 13V7M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM12 17v4M8 21h8",
  "monitor-pc": "M10 15H4a2 2 0 01-2-2V7a2 2 0 012-2h6M10 19H5M14 11h8M14 7h8M18 17h.01M9 19v-4M15 3h6a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1Z",
  "monitor-play": "M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56zM12 17v4M8 21h8M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "monitor-smartphone": "M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8M10 19v-3.96 3.15M7 19h5M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2Z",
  "monitor-speaker": "M5.5 20H8M17 9h.01M14 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM8 6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4M16 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "monitor-stop": "M12 17v4M8 21h8M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM10 7h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1Z",
  "monitor-up": "M9 10l3 -3 3 3 M12 13V7M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM12 17v4M8 21h8",
  "monitor-x": "M14.5 12.5l-5 -5 M9.5 12.5l5 -5 M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM12 17v4M8 21h8",
  moon: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
  "moon-star": "M18 5h4M20 3v4M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
  mop: "M10 22c2.761 0 5-1.79 5-4-4.42 0-4.08-5-8.5-5a1 1 0 100 9za3 3 0 01-3-3M12.5 11.5 22 2M6.98 13.02l2.67 -2.66 a 1.21 1.21 0 011.71 0 l 2.29 2.288 a 1.21 1.21 0 010 1.712 l -2.088 2.087",
  "mop-sparkles": "M10 22a3 3 0 01-3-3M10 22c2.761 0 5-1.79 5-4-4.42 0-4.08-5-8.5-5a4.501 4.501 0 000 9zM10 3H8M12.5 11.5 22 2M20 13v4M22 15h-4M4 5v4M6 7H2M6.98 13.02l2.67 -2.66 a 1.21 1.21 0 011.71 0 l 2.29 2.288 a 1.21 1.21 0 010 1.712 l -2.088 2.087M9 2v2",
  mosque: "M12.268 2a2 2 0 003.465 2M14 5 L14 8M16 22v-3a2 2 0 00-4 0v3M21 13c-.662-1.497-1.666-2.753-2.9-3.63C16.825 8.47 15.422 8 14 8s-2.826.47-4.1 1.37C8.668 10.248 7.663 11.504 7 13zM3 9h4M7 22V6a5 5 0 00-2-4 5 5 0 00-2 4v14a2 2 0 002 2h14a2 2 0 002-2v-7",
  motorbike: "M18 14l-1 -3 M3 9l6 2 a 2 2 0 0 1 2 -2 h 2 a 2 2 0 0 1 1.99 1.81M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5M16 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M2 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  mountain: "M8 3l4 8 5 -5 5 15 H 2 L 8 3 z",
  "mountain-snow": "M8 3l4 8 5 -5 5 15 H 2 L 8 3 zM4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19",
  mouse: "M12 2h0a7 7 0 0 1 7 7v6a7 7 0 0 1 -7 7h0a7 7 0 0 1 -7 -7v-6a7 7 0 0 1 7 -7ZM12 6v4",
  "mouse-left": "M12 7.318V10M5 10v5a7 7 0 0 0 14 0V9c0-3.527-2.608-6.515-6-7M5 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "mouse-off": "M12 6v.343M18.218 18.218A7 7 0 0 1 5 15V9a7 7 0 0 1 .782-3.218M19 13.343V9A7 7 0 0 0 8.56 2.902M22 22 2 2",
  "mouse-pointer": "M12.586 12.586 19 19M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z",
  "mouse-pointer-2": "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",
  "mouse-pointer-2-off": "M15.55 8.45l5.14 2.09 a .5 .5 0 0 1 -.063 .947 l -6.124 1.58 a 2 2 0 0 0 -1.438 1.435 l -1.579 6.126 a .5 .5 0 0 1 -.947 .063 L 8.45 15.551M22 2 2 22M6.82 11.53l-2.78 -6.84 a .495 .495 0 0 1 .651 -.651 l 6.84 2.779",
  "mouse-pointer-ban": "M2.034 2.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.944L8.204 7.545a1 1 0 0 0-.66.66l-1.066 3.443a.5.5 0 0 1-.944.033zM10 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M11.8 11.8l8.4 8.4 ",
  "mouse-pointer-click": "M14 4.1 12 6M5.1 8l-2.9 -0.8 M6 12l-1.9 2 M7.2 2.2 8 5.1M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
  "mouse-right": "M12 7.318V10M19 10v5a7 7 0 0 1-14 0V9c0-3.527 2.608-6.515 6-7M15 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  mouth: "M2 12a50.5 50.5 0 0020 0 1 1 0 00-1-1M2.457 11.159a1 1 0 00-.307 1.369 11.59 11.59 0 0019.7 0 1 1 0 00-.308-1.368c-2.426-1.568-3.65-2.284-5.479-3.644a2.6 2.6 0 00-3.373.208 1 1 0 01-1.38 0 2.62 2.62 0 00-3.373-.208c-1.83 1.36-3.053 2.076-5.48 3.643",
  "mouth-off": "M13.074 7.417a2.6 2.6 0 012.989.099c1.829 1.36 3.053 2.076 5.479 3.644a1 1 0 01.308 1.368 11.6 11.6 0 01-1.617 2.05M2 12a50.5 50.5 0 0010.99.99M2 2l20 20 M21 11a1 1 0 011 1 51 51 0 01-3.734.61M7.695 7.695c-1.7 1.247-2.92 1.967-5.238 3.464a1 1 0 00-.307 1.369 11.6 11.6 0 0014.766 4.388",
  move: "M12 2v20M15 19l-3 3 -3 -3 M19 9l3 3 -3 3 M2 12h20M5 9l-3 3 3 3 M9 5l3 -3 3 3 ",
  "move-3d": "M5 3v16h16M5 19l6 -6 M2 6l3 -3 3 3 M18 16l3 3 -3 3 ",
  "move-diagonal": "M11 19H5v-6M13 5h6v6M19 5 5 19",
  "move-diagonal-2": "M19 13v6h-6M5 11V5h6M5 5l14 14 ",
  "move-down": "M8 18L12 22L16 18M12 2V22",
  "move-down-left": "M11 19H5V13M19 5L5 19",
  "move-down-right": "M19 13V19H13M5 5L19 19",
  "move-horizontal": "M18 8l4 4 -4 4 M2 12h20M6 8l-4 4 4 4 ",
  "move-left": "M6 8L2 12L6 16M2 12H22",
  "move-right": "M18 8L22 12L18 16M2 12H22",
  "move-up": "M8 6L12 2L16 6M12 2V22",
  "move-up-left": "M5 11V5H11M5 5L19 19",
  "move-up-right": "M13 5H19V11M19 5L5 19",
  "move-vertical": "M12 2v20M8 18l4 4 4 -4 M8 6l4 -4 4 4 ",
  music: "M9 18V5l12-2v13M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "music-2": "M4 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 18V2l7 4",
  "music-3": "M8 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M16 18V2",
  "music-4": "M9 18V5l12-2v13M9 9l12 -2 M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  navigation: "M3 11L22 2L13 21L11 13L3 11Z",
  "navigation-2": "M12 2L19 21L12 17L5 21L12 2Z",
  "navigation-2-off": "M9.31 9.31 5 21l7-4 7 4-1.17-3.17M14.53 8.88 12 2l-1.17 3.17M2 2L22 22",
  "navigation-off": "M8.43 8.43 3 11l8 2 2 8 2.57-5.43M17.39 11.73 22 2l-9.73 4.61M2 2L22 22",
  "nepali-rupee": "M18 16.173 A4.74 4.74 0 0 0 13.496 8.005M4 3 L20 3M5 13 L13.5 21M5 13 L9 13M8 13 C15.5 13 14.667 3 8 3",
  network: "M17 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1ZM3 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1ZM10 2h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1ZM5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8",
  newspaper: "M15 18h-5M18 14h-8M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2M11 6h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  nfc: "M6 8.32a7.43 7.43 0 0 1 0 7.36M9.46 6.21a11.76 11.76 0 0 1 0 11.58M12.91 4.1a15.91 15.91 0 0 1 .01 15.8M16.37 2a20.16 20.16 0 0 1 0 20",
  "non-binary": "M12 2v10M8.5 4l7 4 M8.5 8l7 -4 M7 17a5 5 0 1 0 10 0a5 5 0 1 0 -10 0",
  notebook: "M2 6h4M2 10h4M2 14h4M2 18h4M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM16 2v20",
  "notebook-dot": "M16 11.75V22M2 10h4M2 14h4M2 18h4M2 6h4M20 11.75V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5.65M15 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "notebook-pen": "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
  "notebook-tabs": "M2 6h4M2 10h4M2 14h4M2 18h4M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM15 2v20M15 7h5M15 12h5M15 17h5",
  "notebook-text": "M2 6h4M2 10h4M2 14h4M2 18h4M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM9.5 8h5M9.5 12H16M9.5 16H14",
  "notepad-text": "M8 2v4M12 2v4M16 2v4M6 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM8 10h6M8 14h8M8 18h5",
  "notepad-text-dashed": "M8 2v4M12 2v4M16 2v4M16 4h2a2 2 0 0 1 2 2v2M20 12v2M20 18v2a2 2 0 0 1-2 2h-1M13 22h-2M7 22H6a2 2 0 0 1-2-2v-2M4 14v-2M4 8V6a2 2 0 0 1 2-2h2M8 10h6M8 14h8M8 18h5",
  nut: "M12 4V2M5 10v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592A7.003 7.003 0 0 0 19 14v-4M12 4C8 4 4.5 6 4 8c-.243.97-.919 1.952-2 3 1.31-.082 1.972-.29 3-1 .54.92.982 1.356 2 2 1.452-.647 1.954-1.098 2.5-2 .595.995 1.151 1.427 2.5 2 1.31-.621 1.862-1.058 2.5-2 .629.977 1.162 1.423 2.5 2 1.209-.548 1.68-.967 2-2 1.032.916 1.683 1.157 3 1-1.297-1.036-1.758-2.03-2-3-.5-2-4-4-8-4Z",
  "nut-off": "M12 4V2M5 10v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592a7.01 7.01 0 0 0 4.125-2.939M19 10v3.343M12 12c-1.349-.573-1.905-1.005-2.5-2-.546.902-1.048 1.353-2.5 2-1.018-.644-1.46-1.08-2-2-1.028.71-1.69.918-3 1 1.081-1.048 1.757-2.03 2-3 .194-.776.84-1.551 1.79-2.21m11.654 5.997c.887-.457 1.28-.891 1.556-1.787 1.032.916 1.683 1.157 3 1-1.297-1.036-1.758-2.03-2-3-.5-2-4-4-8-4-.74 0-1.461.068-2.15.192M2 2L22 22",
  octagon: "M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",
  "octagon-alert": "M12 16h.01M12 8v4M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",
  "octagon-minus": "M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586zM8 12h8",
  "octagon-pause": "M10 15V9M14 15V9M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",
  "octagon-x": "M15 9l-6 6 M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586zM9 9l6 6 ",
  omega: "M3 20h4.5a.5.5 0 0 0 .5-.5v-.282a.52.52 0 0 0-.247-.437 8 8 0 1 1 8.494-.001.52.52 0 0 0-.247.438v.282a.5.5 0 0 0 .5.5H21",
  option: "M14 3h7M3 3h5.28a1 1 0 0 1 .948.684l5.544 16.632a1 1 0 0 0 .949.684H21",
  orbit: "M20.341 6.484A10 10 0 0 1 10.266 21.85M3.659 17.516A10 10 0 0 1 13.74 2.152M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M17 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  origami: "M12 12V4a1 1 0 0 1 1-1h6.297a1 1 0 0 1 .651 1.759l-4.696 4.025M12 21l-7.41 -7.41 A 2 2 0 0 1 4 12.172 V 6.415 a 1.002 1.002 0 0 1 1.707 -.707 L 20 20.009M12.21 3.38l8.41 14.97 a 1 1 0 0 1 -.167 1.199 l -1.168 1.163 a 1 1 0 0 1 -.706 .291 H 6.351 a 1 1 0 0 1 -.625 -.219 L 3.25 18.8 a 1 1 0 0 1 .631 -1.781 l 4.165 .027",
  package: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73zM12 22V12M3.29 7L12 12L20.71 7M7.5 4.27l9 5.15 ",
  "package-2": "M12 3v6M16.76 3a2 2 0 0 1 1.8 1.1l2.23 4.479a2 2 0 0 1 .21.891V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.472a2 2 0 0 1 .211-.894L5.45 4.1A2 2 0 0 1 7.24 3zM3.054 9.013h17.893",
  "package-check": "M12 22V12M16 17l2 2 4 -4 M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753M3.29 7 12 12l8.71-5M7.5 4.27l9 5.15 ",
  "package-minus": "M12 22V12M16 17h6M21 13V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955M3.29 7 12 12l8.71-5M7.5 4.27l9 5.15 ",
  "package-open": "M12 22v-9M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36zM20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z",
  "package-plus": "M12 22V12M16 17h6M19 14v6M21 10.535V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955M3.29 7 12 12l8.71-5M7.5 4.27l9 5.15 ",
  "package-search": "M12 22V12M20.27 18.27 22 20M21 10.498V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.98-.559M3.29 7 12 12l8.71-5M7.5 4.27l9 5.15 M16 16.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  "package-x": "M12 22V12M16.5 14.5l5 5 M16.5 19.5l5 -5 M21 10.5V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.13-.074M3.29 7 12 12l8.71-5M7.5 4.27l9 5.15 ",
  "paint-bucket": "M11 7 6 2M18.992 12H2.041M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595M8.5 4.5l2.15 -2.15 a 1.205 1.205 0 0 1 1.704 0 l 7.296 7.296 a 1.205 1.205 0 0 1 0 1.704 l -7.592 7.592 a 3.615 3.615 0 0 1 -5.112 0 l -3.888 -3.888 a 3.615 3.615 0 0 1 0 -5.112 L 5.67 7.33",
  "paint-roller": "M4 2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 16h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1Z",
  paintbrush: "M14.62 17.9l-10.68 -2.91 M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0zM9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15",
  "paintbrush-vertical": "M10 2v2M14 2v4M17 2a1 1 0 0 1 1 1v9H6V3a1 1 0 0 1 1-1zM6 12a1 1 0 0 0-1 1v1a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v2.9a2 2 0 1 0 4 0V17a1 1 0 0 1 1-1h2a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1",
  palette: "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8zM13 6.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M17 10.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M6 12.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M8 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
  panda: "M11.25 17.25h1.5L12 18zM15 12l2 2 M17.902 6.599a8 8 0 0 0-.5-.5M2 14.5C2 19.47 6.48 22 12 22s10-2.53 10-7.5a10 10 0 0 0-1.3-4.83 4.5 4.5 0 1 0-7.05-5.5 8 8 0 0 0-3.3 0 4.5 4.5 0 1 0-7.04 5.5A10 10 0 0 0 2 14.5M6.099 6.599a8 8 0 0 1 .5-.5M9 12l-2 2 ",
  "panel-bottom": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 15h18",
  "panel-bottom-close": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 15h18M15 8l-3 3 -3 -3 ",
  "panel-bottom-dashed": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM14 15h1M19 15h2M3 15h2M9 15h1",
  "panel-bottom-open": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 15h18M9 10l3 -3 3 3 ",
  "panel-left": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 3v18",
  "panel-left-close": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 3v18M16 15l-3 -3 3 -3 ",
  "panel-left-dashed": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 14v1M9 19v2M9 3v2M9 9v1",
  "panel-left-open": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 3v18M14 9l3 3 -3 3 ",
  "panel-left-right-dashed": "M15 10V9M15 15v-1M15 21v-2M15 5V3M9 10V9M9 15v-1M9 21v-2M9 5V3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "panel-right": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM15 3v18",
  "panel-right-close": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM15 3v18M8 9l3 3 -3 3 ",
  "panel-right-dashed": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM15 14v1M15 19v2M15 3v2M15 9v1",
  "panel-right-open": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM15 3v18M10 15l-3 -3 3 -3 ",
  "panel-top": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18",
  "panel-top-bottom-dashed": "M14 15h1M14 9h1M19 15h2M19 9h2M3 15h2M3 9h2M9 15h1M9 9h1M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "panel-top-close": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M9 16l3 -3 3 3 ",
  "panel-top-dashed": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM14 9h1M19 9h2M3 9h2M9 9h1",
  "panel-top-open": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M15 14l-3 3 -3 -3 ",
  "panels-left-bottom": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 3v18M9 15h12",
  "panels-right-bottom": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 15h12M15 3v18",
  "panels-top-left": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M9 21V9",
  "paper-bag": "M5.364 3.848C4 6 3 9.652 3 12.652V19a2 2 0 002 2h14a2 2 0 002-2v-5c0-2.334-1.816-4.668-2.622-7.002M7 3h11.379a2 2 0 011.789 1.106l.723 1.447A1 1 0 0119.997 7h-8.525a2 2 0 01-1.789-1.106L8.79 4.105a2 2 0 10-3.579 1.789l2.261 4.522A5 5 0 018 12.652V21",
  paperclip: "M16 6l-8.41 8.59 a 2 2 0 0 0 2.829 2.829 l 8.414 -8.586 a 4 4 0 1 0 -5.657 -5.657 l -8.379 8.551 a 6 6 0 1 0 8.485 8.485 l 8.379 -8.551",
  parasol: "M12.5 11.134 18.196 21M20.425 5.299a10 10 0 0 0-16.941 9.78c.183.563.843.774 1.355.478L20.16 6.711c.512-.296.66-.973.264-1.413M21 21H3",
  parentheses: "M8 21s-4-3-4-9 4-9 4-9M16 3s4 3 4 9-4 9-4 9",
  park: "M12 18h10M13.248 9.998A4.5 4.5 0 0 0 11.75 8.6V8a1 1 0 0 0-7.5 0 4.9 4.9 0 0 0 2.25 9H8M15 14l-2 6 M19 14l2 6 M21 14h-8M8 20v-5.922a2 2 0 0 0-.586-1.414L6.5 11.75M9.205 12.795 8 14M17 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "parking-meter": "M11 15h2M12 12v3M12 19v3M15.282 19a1 1 0 0 0 .948-.68l2.37-6.988a7 7 0 1 0-13.2 0l2.37 6.988a1 1 0 0 0 .948.68zM9 9a3 3 0 1 1 6 0",
  "party-popper": "M5.8 11.3 2 22l10.7-3.79M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.24 0.75 a 2.9 2.9 0 0 0 -1.96 3.12 c .1 .86 -.57 1.63 -1.45 1.63 h -.38 c -.86 0 -1.6 .6 -1.76 1.44 L 14 10M22 13l-0.82 -0.33 c -.86 -.34 -1.82 .2 -1.98 1.11 c -.11 .7 -.72 1.22 -1.43 1.22 H 17M11 2l0.33 0.82 c .34 .86 -.2 1.82 -1.11 1.98 C 9.52 4.9 9 5.52 9 6.23 V 7M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z",
  pause: "M15 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1ZM6 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1Z",
  "paw-print": "M9 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M16 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z",
  "pc-case": "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM15 14h.01M9 6h6M9 10h6",
  pen: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
  "pen-line": "M13 21h8M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
  "pen-off": "M10 10l-6.16 6.16 a 2 2 0 0 0 -.5 .833 l -1.322 4.36 a .5 .5 0 0 0 .622 .624 l 4.358 -1.323 a 2 2 0 0 0 .83 -.5 L 14 13.982M12.83 7.17l4.36 -4.35 a 1 1 0 1 1 3.986 3.986 l -4.353 4.353M2 2l20 20 ",
  "pen-tool": "M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414zM18 13l-1.37 -6.87 a 1 1 0 0 0 -.746 -.776 L 3.235 2.028 a 1 1 0 0 0 -1.207 1.207 L 5.35 15.879 a 1 1 0 0 0 .776 .746 L 13 18M2.3 2.3l7.29 7.29 M9 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  pencil: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4 ",
  "pencil-line": "M13 21h8M15 5l4 4 M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
  "pencil-off": "M10 10l-6.16 6.16 a 2 2 0 0 0 -.5 .833 l -1.322 4.36 a .5 .5 0 0 0 .622 .624 l 4.358 -1.323 a 2 2 0 0 0 .83 -.5 L 14 13.982M12.83 7.17l4.36 -4.35 a 1 1 0 1 1 3.986 3.986 l -4.353 4.353M15 5l4 4 M2 2l20 20 ",
  "pencil-ruler": "M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13M8 6l2 -2 M18 16l2 -2 M17 11l4.3 4.3 c .94 .94 .94 2.46 0 3.4 l -2.6 2.6 c -.94 .94 -2.46 .94 -3.4 0 L 11 17M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4 ",
  "pencil-sparkles": "M10 3H8M15.01 5.01l3.99 3.99 M20 15v4M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM22 17h-4M4 5v4M6 7H2M9 2v2",
  pentagon: "M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2 2 0 0 1-1.9 1.37H7.04a2 2 0 0 1-1.9-1.37L2.1 10.37a2 2 0 0 1 .73-2.25z",
  percent: "M19 5L5 19M4 6.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M15 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  "person-standing": "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M9 20l3 -6 3 6 M6 8l6 2 6 -2 M12 10v4",
  phi: "M12 2v20M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0",
  "philippine-peso": "M20 11H4M20 7H4M7 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 0 12H7",
  phone: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  "phone-call": "M13 2a9 9 0 0 1 9 9M13 6a5 5 0 0 1 5 5M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  "phone-forwarded": "M14 6h8M18 2l4 4 -4 4 M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  "phone-incoming": "M16 2v6h6M22 2l-6 6 M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  "phone-missed": "M16 2l6 6 M22 2l-6 6 M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  "phone-off": "M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272M22 2 2 22M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473",
  "phone-outgoing": "M16 8l6 -6 M22 8V2h-6M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  pi: "M9 4L9 20M4 7c0-1.7 1.3-3 3-3h13M18 20c-1.7 0-3-1.3-3-3V4",
  piano: "M10 13v4M14 13v4M18 13v4M2 13h20M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2zM6 13v4",
  pickaxe: "M14 13l-8.38 8.38 a 1 1 0 0 1 -3.001 -3 L 11 9.999M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z",
  "picture-in-picture": "M2 10h6V4M2 4l6 6 M21 10V7a2 2 0 0 0-2-2h-7M3 14v2a2 2 0 0 0 2 2h3M13 14h8a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  "picture-in-picture-2": "M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4M14 13h6a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2Z",
  "piggy-bank": "M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zM16 10h.01M2 8v1a2 2 0 0 0 2 2h1",
  pilcrow: "M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13",
  "pilcrow-left": "M14 3v11M14 9h-3a3 3 0 0 1 0-6h9M18 3v11M22 18H2l4-4M6 22l-4 -4 ",
  "pilcrow-right": "M10 3v11M10 9H7a1 1 0 0 1 0-6h8M14 3v11M18 14l4 4 H 2M22 18l-4 4 ",
  pill: "M10.5 20.5l10 -10 a 4.95 4.95 0 1 0 -7 -7 l -10 10 a 4.95 4.95 0 1 0 7 7 ZM8.5 8.5l7 7 ",
  "pill-bottle": "M18 11h-4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h4M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M5 2h14a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  pin: "M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
  "pin-off": "M12 17v5M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89M2 2l20 20 M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",
  pipette: "M12 9l-8.41 8.41 A 2 2 0 0 0 3 18.828 v 1.344 a 2 2 0 0 1 -.586 1.414 A 2 2 0 0 1 3.828 21 h 1.344 a 2 2 0 0 0 1.414 -.586 L 15 12M18 9l0.4 0.4 a 1 1 0 1 1 -3 3 l -3.8 -3.8 a 1 1 0 1 1 3 -3 l .4 .4 3.4 -3.4 a 1 1 0 1 1 3 3 zM2 22l0.41 -0.41 ",
  pizza: "M12 14l-1 1 M13.75 18.25l-1.25 1.42 M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12M18.8 9.3a1 1 0 0 0 2.1 7.7M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z",
  plane: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  "plane-landing": "M2 22h20M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z",
  "plane-takeoff": "M2 22h20M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z",
  "plant-pot": "M14 8.536V6a4 4 0 014-4h1.5a.5.5 0 01.5.5V4a4 4 0 01-4 4 4 4 0 00-4 4 5 5 0 01-8-4 5 5 0 018 4c0 2 1 3 1 5M18 17l-1.08 3.58 A 2 2 0 0115 22 H 9.002 a 2 2 0 01 -1.913 -1.418 L 6 17M5 17h14",
  play: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
  "play-off": "M10.22 4.56l9.79 5.71 a 2 2 0 0 1 .003 3.458 l -.393 .23M16.04 16.04l-8.03 4.69 A 2 2 0 0 1 5 19 V 5M2 2l20 20 ",
  "playing-card": "M12.832 8.445a1 1 0 00-1.589-.098l-2.075 3.098a1 1 0 000 1.11l2 3a1 1 0 001.664 0l2-3a1 1 0 000-1.11zM7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
  "playing-cards": "M14.832 8.445a1 1 0 00-1.589-.098l-2.075 3.098a1 1 0 000 1.11l2 3a1 1 0 001.664 0l2-3a1 1 0 000-1.11zM7.18 20.83l-5 -11 a 2 2 0 01.993 -2.647 L 7 5.44M9 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
  "playing-cards-fan": "M12.65 7.65a2 2 0 012.629-1.046l5.51 2.374a2 2 0 011.046 2.628l-3.957 9.184a2 2 0 01-2.628 1.046l-5.51-2.374a2 2 0 01-1.046-2.628zM18 7.777V4a2 2 0 00-2-2h-6a2 2 0 00-2 2v10a2 2 0 001.137 1.805M8 4.39l-4.36 0.81 a 2 2 0 00 -1.602 2.33 l 1.822 9.833 a 2 2 0 002.331 1.602 l 2.542 -.47",
  plug: "M12 22v-5M15 8V2M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1zM9 8V2",
  "plug-2": "M9 2v6M15 2v6M12 17v5M5 8h14M6 11V8h12v3a6 6 0 1 1-12 0Z",
  "plug-zap": "M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4ZM2 22l3 -3 M7.5 13.5 10 11M10.5 16.5 13 14M18 3l-4 4 h 6 l -4 4",
  plus: "M5 12h14M12 5v14",
  "pocket-knife": "M3 2v1c0 1 2 1 2 2S3 6 3 7s2 1 2 2-2 1-2 2 2 1 2 2M18 6h.01M6 18h.01M20.83 8.83a4 4 0 0 0-5.66-5.66l-12 12a4 4 0 1 0 5.66 5.66ZM18 11.66V22a4 4 0 0 0 4-4V6",
  podium: "M12 6V2h-1M9 15a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1M9 21V11a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10",
  pointer: "M22 14a8 8 0 0 1-8 8M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  "pointer-off": "M10 4.5V4a2 2 0 0 0-2.41-1.957M13.9 8.4a2 2 0 0 0-1.26-1.295M21.7 16.2A8 8 0 0 0 22 14v-3a2 2 0 1 0-4 0v-1a2 2 0 0 0-3.63-1.158M7 15l-1.8 -1.8 a 2 2 0 0 0 -2.79 2.86 L 6 19.7 a 7.74 7.74 0 0 0 6 2.3 h 2 a 8 8 0 0 0 5.657 -2.343M6 6v8M2 2l20 20 ",
  popcorn: "M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4M10 22 9 8M14 22l1 -14 M20 8c.5 0 .9.4.8 1l-2.6 12c-.1.5-.7 1-1.2 1H7c-.6 0-1.1-.4-1.2-1L3.2 9c-.1-.6.3-1 .8-1Z",
  popsicle: "M18.6 14.4c.8-.8.8-2 0-2.8l-8.1-8.1a4.95 4.95 0 1 0-7.1 7.1l8.1 8.1c.9.7 2.1.7 2.9-.1ZM22 22l-5.5 -5.5 ",
  "pound-sterling": "M18 7c0-5.333-8-5.333-8 0M10 7v14M6 21h12M6 13h10",
  power: "M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04",
  "power-off": "M18.36 6.64A9 9 0 0 1 20.77 15M6.16 6.16a9 9 0 1 0 12.68 12.68M12 2v4M2 2l20 20 ",
  presentation: "M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M7 21l5 -5 5 5 ",
  printer: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6M7 14h10a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  "printer-check": "M13.5 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v.5M16 19l2 2 4 -4 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
  "printer-x": "M12.531 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6.377M16.5 16.5l5 5 M16.5 21.5l5 -5 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.5M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
  projector: "M5 7 3 5M9 6V3M13 7l2 -2 M6 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M11.83 12H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2.17M16 16h2",
  proportions: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM12 9v11M2 9h13a2 2 0 0 1 2 2v9",
  puzzle: "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z",
  pyramid: "M2.5 16.88a1 1 0 0 1-.32-1.43l9-13.02a1 1 0 0 1 1.64 0l9 13.01a1 1 0 0 1-.32 1.44l-8.51 4.86a2 2 0 0 1-1.98 0ZM12 2v20",
  "qr-code": "M4 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM17 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM4 16h3a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1",
  quote: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2zM5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
  rabbit: "M13 16a3 3 0 0 1 2.24 5M18 12h.01M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3M20 8.54V4a2 2 0 1 0-4 0v3M7.612 12.524a3 3 0 1 0-1.6 4.3",
  radar: "M19.07 4.93A10 10 0 0 0 6.99 3.34M4 6h.01M2.29 9.62A10 10 0 1 0 21.31 8.35M16.24 7.76A6 6 0 1 0 8.23 16.67M12 18h.01M17.99 11.66A6 6 0 0 1 15.77 16.67M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M13.41 10.59l5.66 -5.66 ",
  radiation: "M12 12h.01M14 15.4641a4 4 0 0 1-4 0L7.52786 19.74597 A 1 1 0 0 0 7.99303 21.16211 10 10 0 0 0 16.00697 21.16211 1 1 0 0 0 16.47214 19.74597zM16 12a4 4 0 0 0-2-3.464l2.472-4.282a1 1 0 0 1 1.46-.305 10 10 0 0 1 4.006 6.94A1 1 0 0 1 21 12zM8 12a4 4 0 0 1 2-3.464L7.528 4.254a1 1 0 0 0-1.46-.305 10 10 0 0 0-4.006 6.94A1 1 0 0 0 3 12z",
  radical: "M3 12h3.28a1 1 0 0 1 .948.684l2.298 7.934a.5.5 0 0 0 .96-.044L13.82 4.771A1 1 0 0 1 14.792 4H21",
  radio: "M16.247 7.761a6 6 0 0 1 0 8.478M19.075 4.933a10 10 0 0 1 0 14.134M4.925 19.067a10 10 0 0 1 0-14.134M7.753 16.239a6 6 0 0 1 0-8.478M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "radio-off": "M13.414 13.414a2 2 0 1 1-2.828-2.828M16.247 7.761a6 6 0 0 1 1.744 4.572M19.075 4.933a10 10 0 0 1 2.234 10.72M2 2l20 20 M4.925 19.067a10 10 0 0 1 0-14.134M7.753 16.239a6 6 0 0 1 0-8.478",
  "radio-receiver": "M5 16v2M19 16v2M4 8h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM18 12h.01",
  "radio-tower": "M4.9 16.1C1 12.2 1 5.8 4.9 1.9M7.8 4.7a6.14 6.14 0 0 0-.8 7.5M10 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M16.2 4.8c2 2 2.26 5.11.8 7.47M19.1 1.9a9.96 9.96 0 0 1 0 14.1M9.5 18h5M8 22l4 -11 4 11 ",
  radius: "M20.34 17.52a10 10 0 1 0-2.82 2.82M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M13.41 13.41l4.18 4.18 M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  rainbow: "M22 17a10 10 0 0 0-20 0M6 17a6 6 0 0 1 12 0M10 17a2 2 0 0 1 4 0",
  rat: "M13 22H4a2 2 0 0 1 0-4h12M13.236 18a3 3 0 0 0-2.2-5M16 9h.01M16.82 3.94a3 3 0 1 1 3.237 4.868l1.815 2.587a1.5 1.5 0 0 1-1.5 2.1l-2.872-.453a3 3 0 0 0-3.5 3M17 4.988a3 3 0 1 0-5.2 2.052A7 7 0 0 0 4 14.015 4 4 0 0 0 8 18",
  ratio: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  receipt: "M12 17V7M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
  "receipt-cent": "M12 7v10M14.828 14.829a4 4 0 0 1-5.656 0 4 4 0 0 1 0-5.657 4 4 0 0 1 5.656 0M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
  "receipt-euro": "M15.828 14.829a4 4 0 0 1-5.656 0 4 4 0 0 1 0-5.657 4 4 0 0 1 5.656 0M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1zM8 12h5",
  "receipt-indian-rupee": "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1zM8 11h8M8 7h8M9 7a4 4 0 0 1 0 8H8l3 2",
  "receipt-japanese-yen": "M12 10l3 -3 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1zM9 11h6M9 15h6M9 7l3 3 v 7",
  "receipt-pound-sterling": "M10 17V9.5a1 1 0 0 1 5 0M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1zM8 13h5M8 17h7",
  "receipt-russian-ruble": "M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1zM8 11h5a2 2 0 0 0 0-4h-3v10M8 15h5",
  "receipt-swiss-franc": "M10 11h4M10 17V7h5M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1zM8 15h5",
  "receipt-text": "M13 16H8M14 8H8M16 12H8M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
  "receipt-turkish-lira": "M10 7v10a5 5 0 0 0 5-5M14 8l-6 3 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
  "rectangle-circle": "M14 4v16H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM6 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0",
  "rectangle-ellipsis": "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM12 12h.01M17 12h.01M7 12h.01",
  "rectangle-goggles": "M20 6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-1.6-.8l-1.6-2.13a1 1 0 0 0-1.6 0L9.6 17.2A2 2 0 0 1 8 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  "rectangle-horizontal": "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "rectangle-vertical": "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
  recycle: "M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12M14 16l-3 3 3 3 M8.293 13.596 7.196 9.5 3.1 10.598M9.34 5.81l1.09 -1.89 A 1.83 1.83 0 0 1 11.985 3 a 1.784 1.784 0 0 1 1.546 .888 l 3.943 6.843M13.38 9.63l4.1 1.1 1.1 -4.1 ",
  redo: "M21 7v6h-6M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7",
  "redo-2": "M15 14l5 -5 -5 -5 M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13",
  "redo-dot": "M11 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M21 7v6h-6M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7",
  "refresh-ccw": "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5",
  "refresh-ccw-dot": "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "refresh-cw": "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5",
  "refresh-cw-off": "M21 8L18.74 5.74A9.75 9.75 0 0 0 12 3C11 3 10.03 3.16 9.13 3.47M8 16H3v5M3 12C3 9.51 4 7.26 5.64 5.64M3 16l2.26 2.26 A 9.75 9.75 0 0 0 12 21 c 2.49 0 4.74 -1 6.36 -2.64M21 12c0 1-.16 1.97-.47 2.87M21 3v5h-5M22 22 2 2",
  refrigerator: "M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6ZM5 10h14M15 7v6",
  regex: "M17 3v10M12.67 5.5l8.66 5 M12.67 10.5l8.66 -5 M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2z",
  "remove-formatting": "M4 7V4h16v3M5 20h6M13 4 8 20M15 15l5 5 M20 15l-5 5 ",
  repeat: "M17 2l4 4 -4 4 M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4 -4 4 -4 M21 13v1a4 4 0 0 1-4 4H3",
  "repeat-1": "M17 2l4 4 -4 4 M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4 -4 4 -4 M21 13v1a4 4 0 0 1-4 4H3M11 10h1v4",
  "repeat-2": "M2 9l3 -3 3 3 M13 18H7a2 2 0 0 1-2-2V6M22 15l-3 3 -3 -3 M11 6h6a2 2 0 0 1 2 2v10",
  "repeat-off": "M11.656 6H21l-4-4M17.898 17.898A4 4 0 0 1 17 18H3l4-4M2 2l20 20 M21 13v1a4 4 0 0 1-.171 1.159M21 6l-4 4 M3 11v-1a4 4 0 0 1 3.102-3.898M7 22l-4 -4 ",
  replace: "M14 4a1 1 0 0 1 1-1M15 10a1 1 0 0 1-1-1M21 4a1 1 0 0 0-1-1M21 9a1 1 0 0 1-1 1M3 7l3 3 3 -3 M6 10V5a2 2 0 0 1 2-2h2M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  "replace-all": "M14 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1M14 4a1 1 0 0 1 1-1M15 10a1 1 0 0 1-1-1M19 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1M21 4a1 1 0 0 0-1-1M21 9a1 1 0 0 1-1 1M3 7l3 3 3 -3 M6 10V5a2 2 0 0 1 2-2h2M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
  reply: "M20 18v-2a4 4 0 0 0-4-4H4M9 17l-5 -5 5 -5 ",
  "reply-all": "M12 17l-5 -5 5 -5 M22 18v-2a4 4 0 0 0-4-4H7M7 17l-5 -5 5 -5 ",
  rewind: "M12 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 12 18zM22 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 22 18z",
  ribbon: "M12 11.22C11 9.997 10 9 10 8a2 2 0 0 1 4 0c0 1-.998 2.002-2.01 3.22M12 18l2.57 -3.5 M6.243 9.016a7 7 0 0 1 11.507-.009M9.35 14.53 12 11.22M9.35 14.53C7.728 12.246 6 10.221 6 7a6 5 0 0 1 12 0c-.005 3.22-1.778 5.235-3.43 7.5l3.557 4.527a1 1 0 0 1-.203 1.43l-1.894 1.36a1 1 0 0 1-1.384-.215L12 18l-2.679 3.593a1 1 0 0 1-1.39.213l-1.865-1.353a1 1 0 0 1-.203-1.422z",
  road: "M12 17v4M12 5V3M12 9v3M2.077 18.449A2 2 0 0 0 4 21h16a2 2 0 0 0 1.924-2.55l-4-14A2 2 0 0 0 16 3H8a2 2 0 0 0-1.924 1.45z",
  "robot-arm": "M12 21 7.5 8.322M14 7l1.75 -3.77 a .5 .5 0 0 1 .662 -.172 L 20 5.005M20 9l-3.59 1.94 a .5 .5 0 0 1 -.662 -.172 L 14 7 H 8M3.486 21h10M5 21V8.732M4 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "robot-vacuum": "M11 17h2M12 12h.01M17 12a5 5 0 00-10 0M19 2v2.8M2 5h2.8M22 5h-2.8M5 2v2.8M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  rocket: "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05",
  "rocking-chair": "M15 13l3.71 7.42 M3 19a15 15 0 0 0 18 0M3 2l3.21 9.63 A 2 2 0 0 0 8.109 13 H 18M9 13l-3.71 7.42 ",
  "roller-coaster": "M6 19V5M10 19V6.8M14 19v-7.8M18 5v4M18 19v-6M22 19V9M2 19V9a4 4 0 0 1 4-4c2 0 4 1.33 6 4s4 4 6 4a4 4 0 1 0-3-6.65",
  rose: "M17 10h-1a4 4 0 1 1 4-4v.534M17 6h1a4 4 0 0 1 1.42 7.74l-2.29.87a6 6 0 0 1-5.339-10.68l2.069-1.31M4.5 17c2.8-.5 4.4 0 5.5.8s1.8 2.2 2.3 3.7c-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2M9.77 12C4 15 2 22 2 22M15 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "rotate-3d": "M15.19 13.71l3.81 1.86 -1.86 3.81 M16.47214 7.52786 A 5 10 0 1 0 13 21.79796M21.79796 11 A 10 5 0 1 0 19 15.57071",
  "rotate-ccw": "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5",
  "rotate-ccw-clock": "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
  "rotate-ccw-key": "M12 7v6M12 9h2M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8M3 3v5h5M10 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "rotate-ccw-square": "M20 9V7a2 2 0 0 0-2-2h-6M15 2l-3 3 3 3 M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2",
  "rotate-cw": "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5",
  "rotate-cw-clock": "M12 7v5l4 2M16 8h5V3M21 8l-2.3 -2.3 A 9.7 9.7 0 0012 3 a 9 9 0 109 9",
  "rotate-cw-fading-clock": "M12 3a9.75 9.75 0 0 1 6.74 2.74M18.74 5.74 21 8M21 8V3M7.5 19.794c-6-3.464-6-12.124 0-15.588M7.5 4.206A9 9 0 0 1 12 3M12 7v5l4 2M14 20.775A9 9 0 0 1 12 21M19 17.656a9 9 0 0 1-1.5 1.456M21 12a9 9 0 0 1-.228 2M21 8h-5",
  "rotate-cw-square": "M12 5H6a2 2 0 0 0-2 2v3M9 8l3 -3 -3 -3 M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
  route: "M3 19a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15M15 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "route-off": "M3 19a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M9 19h8.5c.4 0 .9-.1 1.3-.2M5.2 5.2A3.5 3.53 0 0 0 6.5 12H12M2 2l20 20 M21 15.3a3.5 3.5 0 0 0-3.3-3.3M15 5h-4.3M15 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  router: "M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM6.01 18H6M10.01 18H10M15 10v4M17.84 7.17a4 4 0 0 0-5.66 0M20.66 4.34a8 8 0 0 0-11.31 0",
  "rows-2": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 12h18",
  "rows-3": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM21 9H3M21 15H3",
  "rows-4": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM21 7.5H3M21 12H3M21 16.5H3",
  rss: "M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M4 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  ruler: "M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0ZM14.5 12.5l2 -2 M11.5 9.5l2 -2 M8.5 6.5l2 -2 M17.5 15.5l2 -2 ",
  "ruler-dimension-line": "M10 15v-3M14 15v-3M18 15v-3M2 8V4M22 6H2M22 8V4M6 15v-3M4 12h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z",
  "russian-ruble": "M6 11h8a4 4 0 0 0 0-8H9v18M6 15h8",
  sailboat: "M10 2v15M7 22a4 4 0 0 1-4-4 1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 4 4 0 0 1-4 4zM9.159 2.46a1 1 0 0 1 1.521-.193l9.977 8.98A1 1 0 0 1 20 13H4a1 1 0 0 1-.824-1.567z",
  salad: "M7 21h10M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9ZM11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1M13 12l4 -4 M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2",
  sandwich: "M2.37 11.22l8.37 -6.78 a 2 2 0 0 1 2.516 0 l 8.371 6.777M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9M6.67 15l6.13 4.6 a 2 2 0 0 0 2.8 -.4 l 3.15 -4.2M3 11h18a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  satellite: "M13.5 6.5l-3.15 -3.15 a 1.205 1.205 0 0 0 -1.704 0 L 6.352 5.648 a 1.205 1.205 0 0 0 0 1.704 L 9.5 10.5M16.5 7.5 19 5M17.5 10.5l3.15 3.15 a 1.205 1.205 0 0 1 0 1.704 l -2.296 2.296 a 1.205 1.205 0 0 1 -1.704 0 L 13.5 14.5M9 21a6 6 0 0 0-6-6M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z",
  "satellite-dish": "M18 12a6 6 0 00-6-6M2.824 10.459a8 8 0 0010.717 10.717c.558-.276.623-1.012.183-1.452l-9.448-9.448c-.44-.44-1.176-.375-1.452.183M22 12A10 10 0 0012 2M9 15l4 -4 ",
  "saudi-riyal": "M20 19.5l-5.5 1.2 M14.5 4v11.22a1 1 0 0 0 1.242.97L20 15.2M2.98 19.35l5.55 -1.36 A 2 2 0 0 0 10 16 V 2M20 10 4 13.5",
  save: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7",
  "save-all": "M10 2v3a1 1 0 0 0 1 1h5M18 18v-6a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6M18 22H4a2 2 0 0 1-2-2V6M8 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 22 6.828V16a2 2 0 0 1-2.01 2z",
  "save-check": "M12.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4v4.35M16 19l2 2 4 -4 M17 15.13V14a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7",
  "save-off": "M13 13H8a1 1 0 0 0-1 1v7M14 8h1M17 21v-4M2 2l20 20 M20.41 20.41A2 2 0 0 1 19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 .59-1.41M9 3h6.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V15",
  "save-pen": "M13.33 13H8a1 1 0 00-1 1v7M14.363 17.634a2 2 0 00-.506.854l-.837 2.87a.5.5 0 00.62.62l2.87-.837a2 2 0 00.854-.506l4.013-4.009a1 1 0 10-3.004-3.004zM7 3v4a1 1 0 001 1h7M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h10.2a2 2 0 011.4.6l3.8 3.8a2 2 0 01.6 1.4v.3",
  "save-plus": "M12.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V12M16 13H8a1 1 0 0 0-1 1v7M19 22v-6M22 19h-6M7 3v4a1 1 0 0 0 1 1h7",
  scale: "M12 3v18M19 8l3 8 a 5 5 0 0 1 -6 0 z V 7M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1M5 8l3 8 a 5 5 0 0 1 -6 0 z V 7M7 21h10",
  "scale-3d": "M5 7v11a1 1 0 0 0 1 1h11M5.293 18.707 11 13M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  scaling: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M14 15H9v-5M16 3h5v5M21 3 9 15",
  scan: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2",
  "scan-barcode": "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 7v10M12 7v10M17 7v10",
  "scan-box": "M12 12v5.5M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M3 7V5a2 2 0 012-2h2M7 21H5a2 2 0 01-2-2v-2M7.264 9.252 12 12l4.737-2.748M7.995 8.514A2 2 0 007 10.244v3.516a2 2 0 00.996 1.73l3 1.74a2 2 0 002.008 0l3-1.74A2 2 0 0017 13.76v-3.517a2 2 0 00-.995-1.73l-3-1.742a2 2 0 00-1.892-.064z",
  "scan-eye": "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0",
  "scan-face": "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01",
  "scan-heart": "M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M3 7V5a2 2 0 0 1 2-2h2M7 21H5a2 2 0 0 1-2-2v-2M7.828 13.07A3 3 0 0 1 12 8.764a3 3 0 0 1 4.172 4.306l-3.447 3.62a1 1 0 0 1-1.449 0z",
  "scan-line": "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10",
  "scan-qr-code": "M17 12v4a1 1 0 0 1-1 1h-4M17 3h2a2 2 0 0 1 2 2v2M17 8V7M21 17v2a2 2 0 0 1-2 2h-2M3 7V5a2 2 0 0 1 2-2h2M7 17h.01M7 21H5a2 2 0 0 1-2-2v-2M8 7h3a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  "scan-search": "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M16 16l-1.9 -1.9 ",
  "scan-square": "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M9 8h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  "scan-text": "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8h8M7 12h10M7 16h6",
  school: "M14 21v-3a2 2 0 0 0-4 0v3M18 4.933V21M4 6l7.11 -3.79 a 2 2 0 0 1 1.788 0 L 20 6M6 11l-3.52 2.15 a 1 1 0 0 0 -.48 .854 V 19 a 2 2 0 0 0 2 2 h 16 a 2 2 0 0 0 2 -2 v -5 a 1 1 0 0 0 -.48 -.853 L 18 11M6 4.933V21M10 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  scissors: "M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M8.12 8.12 12 12M20 4 8.12 15.88M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M14.8 14.8 20 20",
  "scissors-line-dashed": "M5.42 9.42 8 12M2 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M14 6l-8.58 8.58 M2 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M10.8 14.8 14 18M16 12h-2M22 12h-2",
  scooter: "M21 4h-3.5l2 11.05M6.95 17h5.142c.523 0 .95-.406 1.063-.916a6.5 6.5 0 0 1 5.345-5.009M17 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M2 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  "screen-share": "M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3M8 21h8M12 17v4M17 8l5 -5 M17 3h5v5",
  "screen-share-off": "M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3M8 21h8M12 17v4M22 3l-5 5 M17 3l5 5 ",
  scroll: "M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
  "scroll-text": "M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
  search: "M21 21l-4.34 -4.34 M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0",
  "search-alert": "M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M21 21l-4.3 -4.3 M11 7v4M11 15h.01",
  "search-check": "M8 11l2 2 4 -4 M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M21 21l-4.3 -4.3 ",
  "search-code": "M13 13.5l2 -2.5 -2 -2.5 M21 21l-4.3 -4.3 M9 8.5 7 11l2 2.5M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0",
  "search-slash": "M13.5 8.5l-5 5 M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M21 21l-4.3 -4.3 ",
  "search-x": "M13.5 8.5l-5 5 M8.5 8.5l5 5 M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M21 21l-4.3 -4.3 ",
  section: "M16 5a4 3 0 0 0-8 0c0 4 8 3 8 7a4 3 0 0 1-8 0M8 19a4 3 0 0 0 8 0c0-4-8-3-8-7a4 3 0 0 1 8 0",
  send: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11zM21.85 2.15l-10.94 10.94 ",
  "send-horizontal": "M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904zM6 12h16",
  "send-to-back": "M16 14h4a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM4 2h4a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM7 14v1a2 2 0 0 0 2 2h1M14 7h1a2 2 0 0 1 2 2v1",
  "separator-horizontal": "M16 16l-4 4 -4 -4 M3 12h18M8 8l4 -4 4 4 ",
  "separator-vertical": "M12 3v18M16 16l4 -4 -4 -4 M8 8l-4 4 4 4 ",
  server: "M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM6 6L6.01 6M6 18L6.01 18",
  "server-cog": "M10.85 14.77l-0.38 0.92 M13.148 14.772a3 3 0 1 0-2.296-5.544l-.383-.923M13.15 9.23l0.38 -0.92 M13.53 15.7l-0.38 -0.92 a 3 3 0 1 1 -2.296 -5.544M14.77 10.85l0.92 -0.38 M14.77 13.15l0.92 0.38 M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5M4.5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-.5M6 18h.01M6 6h.01M9.23 10.85l-0.92 -0.38 M9.23 13.15l-0.92 0.38 ",
  "server-crash": "M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2M6 6h.01M6 18h.01M13 6l-4 6 h 6 l -4 6",
  "server-off": "M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6zM22 17v-1a2 2 0 0 0-2-2h-1M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4zM6 18h.01M2 2l20 20 ",
  "server-plus": "M12.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2M16 12h6M19 9v6M22 18v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h8.5M6 18h.01M6 6h.01",
  settings: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "settings-2": "M14 17H5M19 7h-9M14 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M4 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  shapes: "M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1ZM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1ZM14 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
  share: "M12 2v13M16 6l-4 -4 -4 4 M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
  "share-2": "M15 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M15 19a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M8.59 13.51L15.42 17.49M15.41 6.51L8.59 10.49",
  sheet: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9L21 9M3 15L21 15M9 9L9 21M15 9L15 21",
  shell: "M14 11a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44",
  "shelving-unit": "M12 12V9a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3M16 20v-3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3M20 22V2M4 12h16M4 20h16M4 2v20M4 4h16",
  shield: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  "shield-alert": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM12 8v4M12 16h.01",
  "shield-ban": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM4.24 5.21l14.39 12.47 ",
  "shield-check": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4 -4 ",
  "shield-cog": "M10.93 14.47l-0.38 0.92 M10.929 8.923 10.546 8M13.225 8.923 13.608 8M13.61 15.39l-0.38 -0.92 M14.85 10.55l0.92 -0.38 M14.85 12.84l0.92 0.38 M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9.31 10.55l-0.92 -0.38 M9.31 12.84l-0.92 0.38 M9.08 11.7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "shield-cog-corner": "M11 22c-3.806-1.45-7-3.966-7-9V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v4M14.923 16.547 14 16.164M14.92 18.84l-0.92 0.38 M16.547 14.923 16.164 14M16.55 20.47l-0.38 0.92 M18.84 14.92l0.38 -0.92 M19.23 21.39l-0.38 -0.92 M20.47 16.55l0.92 -0.38 M20.47 18.84l0.92 0.38 M14.7 17.7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "shield-ellipsis": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM8 12h.01M12 12h.01M16 12h.01",
  "shield-half": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM12 22V2",
  "shield-keyhole": "M12 13v3M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 01-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 011-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 011.52 0C14.51 3.81 17 5 19 5a1 1 0 011 1zM10 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "shield-lock": "M20 9.807V6a1 1 0 00-1-1c-2 0-4.49-1.19-6.24-2.72a1.17 1.17 0 00-1.52 0C9.5 3.8 7 5 5 5a1 1 0 00-1 1v7c0 3.88 2.107 6.254 5 7.796M19 17v-2a2 2 0 00-4 0v2M14 17h6a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z",
  "shield-minus": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12h6",
  "shield-off": "M2 2l20 20 M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264",
  "shield-plus": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12h6M12 9v6",
  "shield-question-mark": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3M12 17h.01",
  "shield-user": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM6.376 18.91a6 6 0 0 1 11.249.003M8 11a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "shield-x": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM14.5 9.5l-5 5 M9.5 9.5l5 5 ",
  ship: "M12 2v2M12 9.189V13M19 12V6a2 2 0 00-2-2H7a2 2 0 00-2 2v6M19.38 19A11.6 11.6 0 0021 13l-8.188-3.639a2 2 0 00-1.624 0L3 13.001a11.6 11.6 0 002.81 7.76M2 20c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
  "ship-cargo": "M12 15v-3M12 2v2M16.5 12V9a1 1 0 011-1h1a1 1 0 001-1V5a1 1 0 00-1-1h-13a1 1 0 00-1 1v2a1 1 0 001 1h1a1 1 0 011 1v3M19.38 19c1.076-1.815 1.636-4.89 1.628-6.008a1 1 0 00-1-.992H3.984a1 1 0 00-1 .984c-.03 1.86.97 5.621 2.826 7.776M2 20c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
  "ship-wheel": "M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M12 2v7.5M19 5l-5.23 5.23 M22 12h-7.5M19 19l-5.23 -5.23 M12 14.5V22M10.23 13.77 5 19M9.5 12H2M10.23 10.23 5 5M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  shirt: "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
  "shopping-bag": "M16 10a4 4 0 0 1-8 0M3.103 6.034h17.794M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z",
  "shopping-basket": "M15 11l-1 9 M19 11l-4 -7 M2 11h20M3.5 11l1.6 7.4 a 2 2 0 0 0 2 1.6 h 9.8 a 2 2 0 0 0 2 -1.6 l 1.7 -7.4M4.5 15.5h15M5 11l4 -7 M9 11l1 9 ",
  "shopping-cart": "M2.05 2.05l1.1 -0.03 a 1 1 0 0 1 1.008 .815 l 2.69 14.347 A 1 1 0 0 0 7.83 18 H 18M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25M16 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "shopping-cart-minus": "M16 5h6M2.05 2.05l1.1 -0.03 a 1 1 0 011.008 .815 l 2.69 14.347 A 1 1 0 007.83 18 H 18M4.564 5H12M6.25 14h12.712a2 2 0 001.991-1.57l.514-3.113M16 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "shopping-cart-plus": "M16 5h6M19 2v6M2.05 2.05l1.1 -0.03 a 1 1 0 011.008 .815 l 2.69 14.347 A 1 1 0 007.83 18 H 18M4.564 5H12M6.25 14h12.712a2 2 0 001.991-1.57l.172-1.041M16 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  shovel: "M21.56 4.56a1.5 1.5 0 0 1 0 2.122l-.47.47a3 3 0 0 1-4.212-.03 3 3 0 0 1 0-4.243l.44-.44a1.5 1.5 0 0 1 2.121 0zM3 22a1 1 0 0 1-1-1v-3.586a1 1 0 0 1 .293-.707l3.355-3.355a1.205 1.205 0 0 1 1.704 0l3.296 3.296a1.205 1.205 0 0 1 0 1.704l-3.355 3.355a1 1 0 0 1-.707.293zM9 15l7.88 -7.88 ",
  "shower-head": "M4 4l2.5 2.5 M13.5 6.5a4.95 4.95 0 0 0-7 7M15 5 5 15M14 17v.01M10 16v.01M13 13v.01M16 10v.01M11 20v.01M17 14v.01M20 11v.01",
  shredder: "M4 13V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5M14 2v5a1 1 0 0 0 1 1h5M10 22v-5M14 19v-2M18 20v-3M2 13h20M6 20v-3",
  shrimp: "M10 2a3.28 3.28 0 003.227 1.798l6.17-.561A1 1 0 1119.614 8H8.5a6.44 6.44 0 00-5.63 9.75A6.5 6.5 0 008.5 21c1.38 0 2-.5 2.5-1M10 8a8.5 8.5 0 000 8M11 22c-.5-.5-1.12-1-2.5-1a1 1 0 010-5H12a7 7 0 007-7V8M13 12h.01M8 16c-2 0-4.5-4-4-6",
  "shrimp-off": "M10 2a3.28 3.28 0 003.227 1.798l6.17-.561A1 1 0 1119.614 8H13.5M11 20c-.5.5-1.12 1-2.5 1a1 1 0 010-5H12a7 7 0 003.283-.817M11 22c-.5-.5-1.12-1-2.5-1a6.5 6.5 0 01-5.63-3.25 6.44 6.44 0 015.236-9.744M18.04 12.54A7 7 0 0019 9V8M2 2l20 20 M8 16c-2 0-4.5-4-4-6M9.43 9.33A8.5 8.5 0 0010 16",
  shrink: "M15 15l6 6 m -6 -6 v 4.8 m 0 -4.8 h 4.8M9 19.8V15m0 0H4.2M9 15l-6 6M15 4.2V9m0 0h4.8M15 9l6-6M9 4.2V9m0 0H4.2M9 9 3 3",
  shrub: "M12 22v-5.172a2 2 0 0 0-.586-1.414L9.5 13.5M14.5 14.5 12 17M17 8.8A6 6 0 0 1 13.8 20H10A6.5 6.5 0 0 1 7 8a5 5 0 0 1 10 0z",
  shuffle: "M18 14l4 4 -4 4 M18 2l4 4 -4 4 M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22M2 6h1.972a4 4 0 0 1 3.6 2.2M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45",
  sigma: "M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2",
  signal: "M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16",
  "signal-high": "M2 20h.01M7 20v-4M12 20v-8M17 20V8",
  "signal-low": "M2 20h.01M7 20v-4",
  "signal-medium": "M2 20h.01M7 20v-4M12 20v-8",
  "signal-zero": "M2 20h.01",
  signature: "M21 17l-2.16 -1.87 A .5 .5 0 0 0 18 15.5 v .5 a 1 1 0 0 1 -1 1 h -2 a 1 1 0 0 1 -1 -1 c 0 -2.545 -3.991 -3.97 -8.5 -4 a 1 1 0 0 0 0 5 c 4.153 0 4.745 -11.295 5.708 -13.5 a 2.5 2.5 0 1 1 3.31 3.284M3 21h18",
  signpost: "M12 13v8M12 3v3M2.354 10.354a1.207 1.207 0 0 1 0-1.708l2.06-2.06A2 2 0 0 1 5.828 6h12.344a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H5.828a2 2 0 0 1-1.414-.586z",
  "signpost-big": "M10 9H4L2 7l2-2h6M14 5h6l2 2-2 2h-6M10 22V4a2 2 0 1 1 4 0v18M8 22h8",
  siren: "M7 18v-6a5 5 0 1 1 10 0v6M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2zM21 12h1M18.5 4.5 18 5M2 12h1M12 2v1M4.93 4.93l0.71 0.71 M12 12v6",
  "skip-back": "M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432zM3 20V4",
  "skip-forward": "M21 4v16M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z",
  skull: "M12.5 17l-0.5 -1 -0.5 1 h 1 zM15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1zM14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  slash: "M22 2 2 22",
  slice: "M11 16.586V19a1 1 0 0 1-1 1H2L18.37 3.63a1 1 0 1 1 3 3l-9.663 9.663a1 1 0 0 1-1.414 0L8 14",
  "sliders-horizontal": "M10 5H3M12 19H3M14 3v4M16 17v4M21 12h-9M21 19h-5M21 5h-7M8 10v4M8 12H3",
  "sliders-vertical": "M10 8h4M12 21v-9M12 8V3M17 16h4M19 12V3M19 21v-5M3 14h4M5 10V3M5 21v-7",
  smartphone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM12 18h.01",
  "smartphone-charging": "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM12.667 8 10 12h4l-2.667 4",
  "smartphone-nfc": "M3 6h5a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1ZM13 8.32a7.43 7.43 0 0 1 0 7.36M16.46 6.21a11.76 11.76 0 0 1 0 11.58M19.91 4.1a15.91 15.91 0 0 1 .01 15.8",
  snail: "M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0M2 13a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6M18 3 19.1 5.2M22 3 20.9 5.2",
  snowflake: "M10 20l-1.25 -2.5 L 6 18M10 4 8.75 6.5 6 6M14 20l1.25 -2.5 L 18 18M14 4l1.25 2.5 L 18 6M17 21l-3 -6 h -4M17 3l-3 6 1.5 3 M2 12h6.5L10 9M20 10l-1.5 2 1.5 2 M22 12h-6.5L14 15M4 10l1.5 2 L 4 14M7 21l3 -6 -1.5 -3 M7 3l3 6 h 4",
  "soap-dispenser-droplet": "M10.5 2v4M14 2H7a2 2 0 0 0-2 2M19.29 14.76A6.67 6.67 0 0 1 17 11a6.6 6.6 0 0 1-2.29 3.76c-1.15.92-1.71 2.04-1.71 3.19 0 2.22 1.8 4.05 4 4.05s4-1.83 4-4.05c0-1.16-.57-2.26-1.71-3.19M9.607 21H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h7V7a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3",
  sofa: "M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0zM4 18v2M20 18v2M12 4v9",
  "solar-panel": "M11 2h2M14.28 14l-4.56 8 M21 22l-1.56 -4 H 4.558M3 10v2M6.245 15.04A2 2 0 0 1 8 14h12a1 1 0 0 1 .864 1.505l-3.11 5.457A2 2 0 0 1 16 22H4a1 1 0 0 1-.863-1.506zM7 2a4 4 0 0 1-4 4M8.66 7.66l1.41 1.41 ",
  soup: "M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9ZM7 21h10M19.5 12 22 6M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62",
  space: "M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1",
  spade: "M12 18v4M2 14.499a5.5 5.5 0 0 0 9.591 3.675.6.6 0 0 1 .818.001A5.5 5.5 0 0 0 22 14.5c0-2.29-1.5-4-3-5.5l-5.492-5.312a2 2 0 0 0-3-.02L5 8.999c-1.5 1.5-3 3.2-3 5.5",
  sparkle: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
  sparkles: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4M22 4h-4M2 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  speaker: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM12 6h.01M8 14a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 14h.01",
  speech: "M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20M19.8 17.8a7.5 7.5 0 0 0 .003-10.603M17 15a3.5 3.5 0 0 0-.025-4.975",
  "spell-check": "M20 15l-5.5 5.5 L 12 18M4 16l6 -12 5.12 10.23 M6 12h8",
  "spell-check-2": "M6 16l6 -12 6 12 M8 12h8M4 21c1.1 0 1.1-1 2.3-1s1.1 1 2.3 1c1.1 0 1.1-1 2.3-1 1.1 0 1.1 1 2.3 1 1.1 0 1.1-1 2.3-1 1.1 0 1.1 1 2.3 1 1.1 0 1.1-1 2.3-1",
  spline: "M17 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 17A12 12 0 0 1 17 5",
  "spline-pointer": "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033zM5 17A12 12 0 0 1 17 5M17 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  split: "M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3M15 9l6 -6 ",
  spool: "M17 13.44 4.442 17.082A2 2 0 0 0 4.982 21H19a2 2 0 0 0 .558-3.921l-1.115-.32A2 2 0 0 1 17 14.837V7.66M7 10.56l12.56 -3.64 A 2 2 0 0 0 19.018 3 H 5 a 2 2 0 0 0 -.558 3.921 l 1.115 .32 A 2 2 0 0 1 7 9.163 v 7.178",
  "sport-shoe": "M15 10.42l4.8 -5.07 M19 18h3M9.5 22 21.414 9.415A2 2 0 0 0 21.2 6.4l-5.61-4.208A1 1 0 0 0 14 3v2a2 2 0 0 1-1.394 1.906L8.677 8.053A1 1 0 0 0 8 9c-.155 6.393-2.082 9-4 9a2 2 0 0 0 0 4h14",
  spotlight: "M15.295 19.562 16 22M17 16l3.76 2.1 M19 12.5l3.03 -0.6 M7.61 6.3a3 3 0 0 0-3.92 1.3l-1.38 2.79a3 3 0 0 0 1.3 3.91l6.89 3.597a1 1 0 0 0 1.342-.447l3.106-6.211a1 1 0 0 0-.447-1.341zM8 9V2",
  "spray-can": "M3 3h.01M7 5h.01M11 7h.01M3 7h.01M7 9h.01M3 11h.01M15 5h4v4h-4ZM19 9l2 2 v 10 c 0 .6 -.4 1 -1 1 h -6 c -.6 0 -1 -.4 -1 -1 V 11 l 2 -2M13 14l8 -2 M13 19l8 -2 ",
  sprout: "M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4M5 21h14",
  square: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-activity": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM17 12h-2l-2 5-2-10-2 5H7",
  "square-arrow-down": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 8v8M8 12l4 4 4 -4 ",
  "square-arrow-down-left": "M15 15H9l6-6M9 15V9M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-arrow-down-right": "M15 15 9 9M9 15h6V9M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-arrow-left": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 8l-4 4 4 4 M16 12H8",
  "square-arrow-out-down-left": "M13 21h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6M3 21l9 -9 M9 21H3v-6",
  "square-arrow-out-down-right": "M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M21 21l-9 -9 M21 15v6h-6",
  "square-arrow-out-up-left": "M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6M3 3l9 9 M3 9V3h6",
  "square-arrow-out-up-right": "M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6M21 3l-9 9 M15 3h6v6",
  "square-arrow-right": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM8 12h8M12 16l4 -4 -4 -4 ",
  "square-arrow-right-enter": "M10 16l4 -4 -4 -4 M3 12h11M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3",
  "square-arrow-right-exit": "M10 12h11M17 16l4 -4 -4 -4 M21 6.344V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.344",
  "square-arrow-up": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 12l-4 -4 -4 4 M12 16V8",
  "square-arrow-up-left": "M15 15 9 9M9 15V9h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-arrow-up-right": "M15 15V9H9M9 15l6 -6 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-asterisk": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 8v8M8.5 14l7 -4 M8.5 10l7 4 ",
  "square-bookmark": "M11 3v7.751a.25.25 0 00.407.195l2.28-1.834a.5.5 0 01.627 0l2.28 1.834a.25.25 0 00.406-.195V3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-bottom-dashed-scissors": "M14 21h1M17 17l-2.18 -2.18 M5 21a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2M9 21h1M9.56 14.44 17 7M9.56 9.56 12 12M7 15.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M7 8.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
  "square-centerline-dashed-horizontal": "M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 20v2M12 14v2M12 8v2M12 2v2",
  "square-centerline-dashed-vertical": "M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3M4 12H2M10 12H8M16 12h-2M22 12h-2",
  "square-chart-gantt": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 8h7M8 12h6M11 16h5",
  "square-check": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 9l-5.5 5.5 L 8 12",
  "square-check-big": "M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344M9 11l3 3 L 22 4",
  "square-chevron-down": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 10l-4 4 -4 -4 ",
  "square-chevron-left": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM14 16l-4 -4 4 -4 ",
  "square-chevron-right": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM10 8l4 4 -4 4 ",
  "square-chevron-up": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM8 14l4 -4 4 4 ",
  "square-code": "M10 9l-3 3 3 3 M14 15l3 -3 -3 -3 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-dashed": "M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M21 19a2 2 0 0 1-2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h1M14 3h1M14 21h1M3 9v1M21 9v1M3 14v1M21 14v1",
  "square-dashed-bottom": "M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2M9 21h1M14 21h1",
  "square-dashed-bottom-code": "M10 9.5 8 12l2 2.5M14 21h1M14 9.5l2 2.5 -2 2.5 M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2M9 21h1",
  "square-dashed-kanban": "M8 7v7M12 7v4M16 7v9M5 3a2 2 0 0 0-2 2M9 3h1M14 3h1M19 3a2 2 0 0 1 2 2M21 9v1M21 14v1M21 19a2 2 0 0 1-2 2M14 21h1M9 21h1M5 21a2 2 0 0 1-2-2M3 14v1M3 9v1",
  "square-dashed-mouse-pointer": "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033zM5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h2M14 3h1M3 9v1M21 9v2M3 14v1",
  "square-dashed-plus": "M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M21 19a2 2 0 0 1-2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h1M14 3h1M14 21h1M3 9v1M21 9v1M3 14v1M21 14v1M8 12h8M12 8v8",
  "square-dashed-text": "M14 21h1M14 3h1M19 3a2 2 0 0 1 2 2M21 14v1M21 19a2 2 0 0 1-2 2M21 9v1M3 14v1M3 9v1M5 21a2 2 0 0 1-2-2M5 3a2 2 0 0 0-2 2M7 12h10M7 16h6M7 8h8M9 21h1M9 3h1",
  "square-dashed-top-solid": "M14 21h1M21 14v1M21 19a2 2 0 0 1-2 2M21 9v1M3 14v1M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2M3 9v1M5 21a2 2 0 0 1-2-2M9 21h1",
  "square-dashed-x": "M14 21h1M14 3h1M19 3a2 2 0 012 2M21 14v1M21 19a2 2 0 01-2 2M21 9v1M3 14v1M3 9v1M5 21a2 2 0 01-2-2M5 3a2 2 0 00-2 2M9 15l6 -6 M9 21h1M9 3h1M9 9l6 6 ",
  "square-dashed-x-corner": "M14 3h1M16 16l5 5 M19 3a2 2 0 012 2M21 16l-5 5 M21 9v1M3 14v1M3 9v1M5 21a2 2 0 01-2-2M5 3a2 2 0 00-2 2M9 21h1M9 3h1",
  "square-dimensions": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 7H7v5M12 17h5v-5",
  "square-divide": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM8 12L16 12M12 16L12 16M12 8L12 8",
  "square-dot": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "square-equal": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 10h10M7 14h10",
  "square-exclamation-point": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 8L12 12M12 16L12.01 16",
  "square-function": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3M9 11.2h5.7",
  "square-kanban": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM8 7v7M12 7v4M16 7v9",
  "square-library": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 7v10M11 7v10M15 7l2 10 ",
  "square-m": "M8 16V8.5a.5.5 0 0 1 .9-.3l2.7 3.599a.5.5 0 0 0 .8 0l2.7-3.6a.5.5 0 0 1 .9.3V16M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-menu": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 8h10M7 12h10M7 16h10",
  "square-minus": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM8 12h8",
  "square-mouse-pointer": "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033zM21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6",
  "square-off": "M20.4 20.4a2 2 0 01-1.4.6H5a2 2 0 01-2-2V5a2 2 0 01.59-1.41M21 15.3V5a2 2 0 00-2-2H8.7M22 22 2 2",
  "square-parking": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 17V7h4a3 3 0 0 1 0 6H9",
  "square-parking-off": "M3.6 3.6A2 2 0 0 1 5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-.59 1.41M3 8.7V19a2 2 0 0 0 2 2h10.3M2 2l20 20 M13 13a3 3 0 1 0 0-6H9v2M9 17v-2.3",
  "square-pause": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM10 15L10 9M14 15L14 9",
  "square-pen": "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
  "square-percent": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM15 9l-6 6 M9 9h.01M15 15h.01",
  "square-pi": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 7h10M10 7v10M16 17a2 2 0 0 1-2-2V7",
  "square-pilcrow": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM12 12H9.5a2.5 2.5 0 0 1 0-5H17M12 7v10M16 7v10",
  "square-play": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z",
  "square-plus": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM8 12h8M12 8v8",
  "square-power": "M12 7v4M7.998 9.003a5 5 0 1 0 8-.005M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-radical": "M7 12h2l2 5 2-10h4M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-round-corner": "M21 11a8 8 0 0 0-8-8M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
  "square-scissors": "M17 17l-2.18 -2.18 M9.56 14.44 17 7M9.56 9.56 12 12M7 15.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M7 8.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-sigma": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM16 8.9V7H8l4 5-4 5h8v-1.9",
  "square-slash": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 15L15 9",
  "square-split-horizontal": "M12 2v20M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3",
  "square-split-vertical": "M2 12h20M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3",
  "square-square": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 8h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  "square-stack": "M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2M16 14h4a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z",
  "square-star": "M11.035 7.69a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.866l-1.156-1.153a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535zM5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-stop": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM10 9h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1Z",
  "square-terminal": "M7 11l2 -2 -2 -2 M11 13h4M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-text": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 8h8M7 12h10M7 16h6",
  "square-user": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M7 21v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2",
  "square-user-round": "M18 21a6 6 0 0 0-12 0M8 11a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "square-x": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM15 9l-6 6 M9 9l6 6 ",
  "squares-exclude": "M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2",
  "squares-intersect": "M10 22a2 2 0 0 1-2-2M14 2a2 2 0 0 1 2 2M16 22h-2M2 10V8M2 4a2 2 0 0 1 2-2M20 8a2 2 0 0 1 2 2M22 14v2M22 20a2 2 0 0 1-2 2M4 16a2 2 0 0 1-2-2M8 10a2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H9a1 1 0 0 1-1-1zM8 2h2",
  "squares-subtract": "M10 22a2 2 0 0 1-2-2M16 22h-2M16 4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1v-5a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1zM20 8a2 2 0 0 1 2 2M22 14v2M22 20a2 2 0 0 1-2 2",
  "squares-unite": "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3a1 1 0 0 0-1-1z",
  squircle: "M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9",
  "squircle-dashed": "M13.77 3.043a34 34 0 0 0-3.54 0M13.771 20.956a33 33 0 0 1-3.541.001M20.18 17.74c-.51 1.15-1.29 1.93-2.439 2.44M20.18 6.259c-.51-1.148-1.291-1.929-2.44-2.438M20.957 10.23a33 33 0 0 1 0 3.54M3.043 10.23a34 34 0 0 0 .001 3.541M6.26 20.179c-1.15-.508-1.93-1.29-2.44-2.438M6.26 3.82c-1.149.51-1.93 1.291-2.44 2.44",
  squirrel: "M15.236 22a3 3 0 0 0-2.2-5M16 20a3 3 0 0 1 3-3h1a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4V4M18 13h.01M18 6a4 4 0 0 0-4 4 7 7 0 0 0-7 7c0-5 4-5 4-10.5a4.5 4.5 0 1 0-9 0 2.5 2.5 0 0 0 5 0C7 10 3 11 3 17c0 2.8 2.2 5 5 5h10",
  stamp: "M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1zM5 22h14",
  star: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
  "star-check": "M19.06 12.5l2.78 -2.71 a .53 .53 0 0 0 -.294 -.905 l -5.166 -.755 a 2.1 2.1 0 0 1 -1.595 -1.16 l -2.31 -4.68 a .53 .53 0 0 0 -.95 .001 L 9.216 6.974 a 2.1 2.1 0 0 1 -1.597 1.16 l -5.165 .755 a .53 .53 0 0 0 -.294 .906 l 3.736 3.637 a 2.1 2.1 0 0 1 .611 1.879 l -.88 5.139 a .53 .53 0 0 0 .769 .56 l 4.617 -2.428 .027 -.014M15 18l2 2 4 -4 ",
  "star-half": "M12 18.338a2.1 2.1 0 0 0-.987.244L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16l2.309-4.679A.53.53 0 0 1 12 2",
  "star-minus": "M15 18h6M17.688 14a2.1 2.1 0 0 1 .416-.568l3.736-3.638a.53.53 0 0 0-.294-.905l-5.166-.755a2.1 2.1 0 0 1-1.595-1.16l-2.31-4.68a.53.53 0 0 0-.95.001L9.216 6.974a2.1 2.1 0 0 1-1.597 1.16l-5.165.755a.53.53 0 0 0-.294.906l3.736 3.637a2.1 2.1 0 0 1 .611 1.879l-.88 5.139a.53.53 0 0 0 .769.56l4.617-2.428.027-.014",
  "star-off": "M10.34 4.69l1.18 -2.39 a .53 .53 0 0 1 .95 0 l 2.31 4.679 a 2.12 2.12 0 0 0 1.595 1.16 l 5.166 .756 a .53 .53 0 0 1 .294 .904 l -3.237 3.152M17.95 17.95l0.43 2.51 a .53 .53 0 0 1 -.771 .56 l -4.618 -2.428 a 2.12 2.12 0 0 0 -1.973 0 L 6.396 21.01 a .53 .53 0 0 1 -.77 -.56 l .881 -5.139 a 2.12 2.12 0 0 0 -.611 -1.879 L 2.16 9.795 a .53 .53 0 0 1 .294 -.906 l 5.165 -.755 a 8 8 0 0 0 .4 -.099M2 2l20 20 ",
  "star-plus": "M11.013 18.582 6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16l2.309-4.679a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904L20 11.5M15 18h6M18 15v6",
  "star-x": "M15.5 15.5l5 5 M20.06 11.53l1.78 -1.73 a .53 .53 0 0 0 -.294 -.905 l -5.166 -.755 a 2.1 2.1 0 0 1 -1.595 -1.16 l -2.31 -4.68 a .53 .53 0 0 0 -.95 .001 L 9.216 6.974 a 2.1 2.1 0 0 1 -1.597 1.16 l -5.165 .755 a .53 .53 0 0 0 -.294 .906 l 3.736 3.637 a 2.1 2.1 0 0 1 .611 1.879 l -.88 5.139 a .53 .53 0 0 0 .769 .56 l 4.617 -2.428 a 2.1 2.1 0 0 1 .987 -.243 2 2 0 0 1 .132 .004M20.5 15.5l-5 5 ",
  "step-back": "M13.971 4.285A2 2 0 0 1 17 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432zM21 20V4",
  "step-forward": "M10.029 4.285A2 2 0 0 0 7 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432zM3 4v16",
  stethoscope: "M11 2v2M5 2v2M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1M8 15a6 6 0 0 0 12 0v-3M18 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  sticker: "M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM15 3v5a1 1 0 0 0 1 1h5M8 13h.01M16 13h.01M10 16s.8 1 2 1c1.3 0 2-1 2-1",
  "sticky-note": "M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM15 3v5a1 1 0 0 0 1 1h5",
  "sticky-note-check": "M15 19l2 2 4 -4 M15 3v5a1 1 0 0 0 1 1h5M21 13V9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6.5",
  "sticky-note-minus": "M15 3v5a1 1 0 0 0 1 1h5M21 14V9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.35M21 18h-6",
  "sticky-note-off": "M15 3v5a1 1 0 0 0 1 1h5M2 2l20 20 M3.586 3.586A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.414-.586M8.656 3H15a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 21 9v6.344",
  "sticky-note-plus": "M15 3v5a1 1 0 0 0 1 1h5M18 15v6M21 12.356V9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.355M21 18h-6",
  "sticky-note-x": "M15 3v5a1 1 0 0 0 1 1h5M16 16l5 5 M21 12V9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7M21 16l-5 5 ",
  "sticky-notes": "M10 8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 16 14v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2zM10 8v5a1 1 0 0 0 1 1h5M8 4a2 2 0 0 1 2-2h6a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 22 8v6a2 2 0 0 1-2 2M16 2v5a1 1 0 0 0 1 1h5",
  stone: "M11.264 2.205A4 4 0 0 0 6.42 4.211l-4 8a4 4 0 0 0 1.359 5.117l6 4a4 4 0 0 0 4.438 0l6-4a4 4 0 0 0 1.576-4.592l-2-6a4 4 0 0 0-2.53-2.53zM11.99 22 14 12l7.822 3.184M14 12 8.47 2.302",
  store: "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
  "stretch-horizontal": "M4 4h16a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM4 14h16a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2Z",
  "stretch-vertical": "M6 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM16 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
  strikethrough: "M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12L20 12",
  subscript: "M4 5l8 8 M12 5l-8 8 M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07",
  summary: "M15 4H7M18 16l3 3 -3 3 M3 4v13a2 2 0 0 0 2 2h16M7 14h7M7 9h12",
  sun: "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 2v2M12 20v2M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2M20 12h2M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41 ",
  "sun-dim": "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 4h.01M20 12h.01M12 20h.01M4 12h.01M17.657 6.343h.01M17.657 17.657h.01M6.343 17.657h.01M6.343 6.343h.01",
  "sun-medium": "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 3v1M12 20v1M3 12h1M20 12h1M18.36 5.64l-0.71 0.71 M6.34 17.66l-0.71 0.71 M5.64 5.64l0.71 0.71 M17.66 17.66l0.71 0.71 ",
  "sun-moon": "M12 2v2M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715M16 12a4 4 0 0 0-4-4M19 5l-1.26 1.26 M20 12h2",
  "sun-snow": "M10 21v-1M10 4V3M10 9a3 3 0 0 0 0 6M14 20l1.25 -2.5 L 18 18M14 4l1.25 2.5 L 18 6M17 21l-3 -6 1.5 -3 H 22M17 3l-3 6 1.5 3 M2 12h1M20 10l-1.5 2 1.5 2 M3.64 18.36l0.7 -0.7 M4.34 6.34l-0.7 -0.7 ",
  sunrise: "M12 2v8M4.93 10.93l1.41 1.41 M2 18h2M20 18h2M19.07 10.93l-1.41 1.41 M22 22H2M8 6l4 -4 4 4 M16 18a4 4 0 0 0-8 0",
  sunset: "M12 10V2M4.93 10.93l1.41 1.41 M2 18h2M20 18h2M19.07 10.93l-1.41 1.41 M22 22H2M16 6l-4 4 -4 -4 M16 18a4 4 0 0 0-8 0",
  superscript: "M4 19l8 -8 M12 19l-8 -8 M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06",
  "swatch-book": "M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2ZM16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7M 7 17h.01M11 8l2.3 -2.3 a 2.4 2.4 0 0 1 3.404 .004 L 18.6 7.6 a 2.4 2.4 0 0 1 .026 3.434 L 9.9 19.8",
  "swiss-franc": "M10 21V3h8M6 16h9M10 9.5h7",
  "switch-camera": "M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M18 22l-3 -3 3 -3 M6 2l3 3 -3 3 ",
  sword: "M11 19l-6 -6 M5 21l-2 -2 M8 16l-4 4 M9.5 17.5 20.414 6.586A2 2 0 0021 5.172V3h-2.172a2 2 0 00-1.414.586L6.5 14.5",
  swords: "M13 19l6 -6 M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5M14.83 6.17l2.59 -2.59 A 2 2 0 0118.828 3 H 21 v 2.172 a 2 2 0 01 -.586 1.414 l -2.586 2.586M16 16l4 4 M19 21l2 -2 M5 14l4 4 M5 21l-2 -2 M7.5 16.5 4 20",
  syringe: "M18 2l4 4 M17 7l3 -3 M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5M9 11l4 4 M5 19l-3 3 M14 4l6 6 ",
  table: "M12 3v18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M3 15h18",
  "table-2": "M3 9h18M9 3v18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "table-cells-merge": "M12 21v-6M12 9V3M3 15h18M3 9h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "table-cells-split": "M12 15V9M3 15h18M3 9h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "table-columns-split": "M14 14v2M14 20v2M14 2v2M14 8v2M2 15h8M2 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H2M2 9h8M22 15h-4M22 3h-2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2M22 9h-4M5 3v18",
  "table-of-contents": "M16 5H3M16 12H3M16 19H3M21 5h.01M21 12h.01M21 19h.01",
  "table-properties": "M15 3v18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM21 9H3M21 15H3",
  "table-rows-split": "M14 10h2M15 22v-8M15 2v4M2 10h2M20 10h2M3 19h18M3 22v-6a2 2 135 0 1 2-2h14a2 2 45 0 1 2 2v6M3 2v2a2 2 45 0 0 2 2h14a2 2 135 0 0 2-2V2M8 10h2M9 22v-8M9 2v4",
  tablet: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM12 18L12.01 18",
  "tablet-smartphone": "M5 8h6a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2ZM5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.4M8 18h.01",
  tablets: "M2 7a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M12 17a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M12 17h10M3.46 10.54l7.08 -7.08 ",
  tag: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42zM7 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
  "tag-plus": "M16 13h6M16.5 6.5l-3.91 -3.91 A 2 2 0 0 0 11.172 2 H 4 a 2 2 0 0 0 -2 2 v 7.172 a 2 2 0 0 0 .586 1.414 l 8.704 8.704 a 2.426 2.426 0 0 0 3.42 0 l 1.79 -1.79M19 10v6M7 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
  "tag-x": "M16.5 6.5l-3.91 -3.91 A 2 2 0 0 0 11.172 2 H 4 a 2 2 0 0 0 -2 2 v 7.172 a 2 2 0 0 0 .586 1.414 l 8.704 8.704 a 2.43 2.43 0 0 0 3.42 0 l 1.79 -1.79M16.5 10.5l5 5 M21.5 10.5l-5 5 M7 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
  tags: "M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1zM2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193M10 6.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
  "tally-1": "M4 4v16",
  "tally-2": "M4 4v16M9 4v16",
  "tally-3": "M4 4v16M9 4v16M14 4v16",
  "tally-4": "M4 4v16M9 4v16M14 4v16M19 4v16",
  "tally-5": "M4 4v16M9 4v16M14 4v16M19 4v16M22 6 2 18",
  tangent: "M15 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M15.59 5.41 5.41 15.59M2 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M12 22s-4-9-1.5-11.5S22 12 22 12",
  target: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  telescope: "M10.07 12.49l-6.18 1.32 a .934 .934 0 0 1 -1.108 -.702 l -.537 -2.15 a 1.07 1.07 0 0 1 .691 -1.265 l 13.504 -4.44M13.56 11.75l4.33 -0.92 M16 21l-3.1 -6.21 M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455zM6.16 8.63l1.11 4.46 M8 21l3.11 -6.21 M10 13a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  tent: "M3.5 21 14 3M20.5 21 10 3M15.5 21 12 15l-3.5 6M2 21h20",
  "tent-tree": "M2 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M14 5l3 -3 3 3 M14 10l3 -3 3 3 M17 14V2M17 14H7l-5 8h20ZM8 14v8M9 14l5 8 ",
  terminal: "M12 19h8M4 17l6 -6 -6 -6 ",
  "test-tube": "M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2M8.5 2h7M14.5 16h-5",
  "test-tube-diagonal": "M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3M16 2l6 6 M12 16H4",
  "test-tubes": "M9 2v17.5A2.5 2.5 0 0 1 6.5 22A2.5 2.5 0 0 1 4 19.5V2M20 2v17.5a2.5 2.5 0 0 1-2.5 2.5a2.5 2.5 0 0 1-2.5-2.5V2M3 2h7M14 2h7M9 16H4M20 16h-5",
  "text-align-center": "M21 5H3M17 12H7M19 19H5",
  "text-align-end": "M21 5H3M21 12H9M21 19H7",
  "text-align-justify": "M3 5h18M3 12h18M3 19h18",
  "text-align-start": "M21 5H3M15 12H3M17 19H3",
  "text-cursor": "M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1M7 22h1a4 4 0 0 0 4-4M7 2h1a4 4 0 0 1 4 4",
  "text-cursor-input": "M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1M9 6v12",
  "text-initial": "M15 5h6M15 12h6M3 19h18M3 12l3.55 -7.72 a .5 .5 0 0 1 .894 0 L 11 12M3.92 10h6.16",
  "text-quote": "M17 5H3M21 12H8M21 19H8M3 12v7",
  "text-search": "M21 5H3M10 12H3M10 19H3M14 15a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M21 19l-1.9 -1.9 ",
  "text-wrap": "M16 16l-3 3 3 3 M3 12h14.5a1 1 0 0 1 0 7H13M3 19h6M3 5h18",
  theater: "M2 10s3-3 3-8M22 10s-3-3-3-8M10 2c0 4.4-3.6 8-8 8M14 2c0 4.4 3.6 8 8 8M2 10s2 2 2 5M22 10s-2 2-2 5M8 15h8M2 22v-1a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1M14 22v-1a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1",
  thermometer: "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z",
  "thermometer-snowflake": "M10 20l-1.25 -2.5 L 6 18M10 4 8.75 6.5 6 6M10.585 15H10M2 12h6.5L10 9M20 14.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0zM4 10l1.5 2 L 4 14M7 21l3 -6 -1.5 -3 M7 3l3 6 h 2",
  "thermometer-sun": "M12 2v2M12 8a4 4 0 0 0-1.645 7.647M2 12h2M20 14.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0zM4.93 4.93l1.41 1.41 M6.34 17.66l-1.41 1.41 ",
  "thumbs-down": "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88ZM17 14V2",
  "thumbs-up": "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88ZM7 10v12",
  "tic-tac-toe": "M12 2v20M21 16l-5 5 M21 21l-5 -5 M22 12H2M8 3 3 8M8 8 3 3M16 5.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M3 18.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  ticket: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 17v2M13 11v2",
  "ticket-check": "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM9 12l2 2 4 -4 ",
  "ticket-minus": "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM9 12h6",
  "ticket-percent": "M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM9 9h.01M15 9l-6 6 M15 15h.01",
  "ticket-plus": "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM9 12h6M12 9v6",
  "ticket-slash": "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM9.5 14.5l5 -5 ",
  "ticket-x": "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM9.5 14.5l5 -5 M9.5 9.5l5 5 ",
  tickets: "M3.17 8.18l11 -5 a 2 2 0 0 1 2.647 .993 L 18.56 8M6 10V8M6 14v1M6 19v2M4 8h16a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2Z",
  "tickets-plane": "M10.5 17h1.227a2 2 0 0 0 1.345-.52L18 12M12 13.5l3.79 0.51 M3.17 8.18l11 -5 a 2 2 0 0 1 2.647 .993 L 18.56 8M6 10V8M6 14v1M6 19v2M4 8h16a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2Z",
  timeline: "M4 12h.01M4 16h.01M4 20h.01M4 4h.01M4 8h.01M9.414 13.414a2 2 0 0 0 1.414.586H19a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-8.172a2 2 0 0 0-1.414.586L8 12zM9.414 21.414a2 2 0 0 0 1.414.586H19a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-8.172a2 2 0 0 0-1.414.586L8 20zM9.414 5.414A2 2 0 0 0 10.828 6H19a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-8.172a2 2 0 0 0-1.414.586L8 4z",
  timer: "M10 2L14 2M12 14L15 11M4 14a8 8 0 1 0 16 0a8 8 0 1 0 -16 0",
  "timer-off": "M10 2h4M4.6 11a8 8 0 0 0 1.7 8.7 8 8 0 0 0 8.7 1.7M7.4 7.4a8 8 0 0 1 10.3 1 8 8 0 0 1 .9 10.2M2 2l20 20 M12 12v-2",
  "timer-reset": "M10 2h4M12 14v-4M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6M9 17H4v5",
  "toggle-left": "M6 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M9 5h6a7 7 0 0 1 7 7v0a7 7 0 0 1 -7 7h-6a7 7 0 0 1 -7 -7v0a7 7 0 0 1 7 -7Z",
  "toggle-right": "M12 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M9 5h6a7 7 0 0 1 7 7v0a7 7 0 0 1 -7 7h-6a7 7 0 0 1 -7 -7v0a7 7 0 0 1 7 -7Z",
  toilet: "M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8",
  "tool-case": "M10 15h4M14.82 11l-0.97 -1.45 1.03 -1.23 a 2 2 0 0 0 -2.025 -3.238 l -1.82 .364 L 9.91 3.885 a 2 2 0 0 0 -3.625 .748 L 6.141 6.55 l -1.725 .426 a 2 2 0 0 0 -.19 3.756 l .657 .27M18.82 11l2.26 -5.38 a 1 1 0 0 0 -.557 -1.318 L 16.954 2.9 a 1 1 0 0 0 -1.281 .533 l -.924 2.122M4 12.006A1 1 0 0 1 4.994 11H19a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
  toolbox: "M16 12v4M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M17 6a2 2 0 011.414.586l3 3A2 2 0 0122 11v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 01.586-1.414l3-3A2 2 0 017 6zM2 14h20M8 12v4",
  toothbrush: "M15 11c-2 2-4 2-6 4l-7 7M22 4l-7.41 7.41 -2 -2 A 2 2 0 0114 6 c 0 -.512 .196 -1.024 .586 -1.414 A 2 2 0 0116 4 a 2 2 0 013.262 -1.552 l 2.152 2.138",
  "toothbrush-sparkles": "M10 3H8M14.586 11.414 22 4M15 11a8 8 0 01-.429.4M2 22l7 -7 c 1.857 -1.857 3.714 -1.99 5.571 -3.6 l -1.985 -1.986 A 2 2 0 0114 6 a 2 2 0 012 -2 2 2 0 013.262 -1.552 l 2.152 2.138M20 15v4M22 17h-4M4 5v4M6 7H2M9 2v2",
  tornado: "M21 4H3M18 8H6M19 12H9M16 16h-6M11 20H9",
  torus: "M9 11a3 2 0 1 0 6 0a3 2 0 1 0 -6 0M2 12.5a10 8.5 0 1 0 20 0a10 8.5 0 1 0 -20 0",
  touchpad: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM2 14h20M12 20v-6",
  "touchpad-off": "M12 20v-6M19.656 14H22M2 14h12M2 2l20 20 M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M9.656 4H20a2 2 0 0 1 2 2v10.344",
  "towel-rack": "M22 7h-2M6.5 3h11A2.5 2.5 0 0 1 20 5.5V20a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V5.5a1 1 0 0 0-5 0V17a1 1 0 0 0 1 1h4M9 7H2",
  "tower-control": "M18.2 12.27 20 6H4l1.8 6.27a1 1 0 0 0 .95.73h10.5a1 1 0 0 0 .96-.73ZM8 13v9M16 22v-9M9 6l1 7 M15 6l-1 7 M12 6V2M13 2h-2",
  "toy-brick": "M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1ZM10 8V5c0-.6-.4-1-1-1H6a1 1 0 0 0-1 1v3M19 8V5c0-.6-.4-1-1-1h-3a1 1 0 0 0-1 1v3",
  tractor: "M10 11l11 0.9 a 1 1 0 0 1 .8 1.1 l -.665 4.158 a 1 1 0 0 1 -.988 .842 H 20M16 18h-5M18 5a1 1 0 0 0-1 1v5.573M3 4h8.129a1 1 0 0 1 .99.863L13 11.246M4 11V4M7 15h.01M8 10.1V4M16 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M2 15a5 5 0 1 0 10 0a5 5 0 1 0 -10 0",
  "traffic-cone": "M16.05 10.966a5 2.5 0 0 1-8.1 0M16.92 14.05l4.48 2.04 a 1 1 0 0 1 .001 1.831 l -8.574 3.9 a 2 2 0 0 1 -1.66 0 l -8.574 -3.91 a 1 1 0 0 1 0 -1.83 l 4.484 -2.04M16.949 14.14a5 2.5 0 1 1-9.9 0L10.063 3.5a2 2 0 0 1 3.874 0zM9.194 6.57a5 2.5 0 0 0 5.61 0",
  trailer: "M10 11.341V10M14 13v-3M18 17V8a2 2 0 00-2-2H4a2 2 0 00-2 2v7a2 2 0 002 2h2M22 15v1a1 1 0 01-1 1H10M6 11.341V10M6 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "train-front": "M8 3.1V7a4 4 0 0 0 8 0V3.1M9 15l-1 -1 M15 15l1 -1 M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5ZM8 19l-2 3 M16 19l2 3 ",
  "train-front-tunnel": "M2 22V12a10 10 0 1 1 20 0v10M15 6.8v1.4a3 2.8 0 1 1-6 0V6.8M10 15h.01M14 15h.01M10 19a4 4 0 0 1-4-4v-3a6 6 0 1 1 12 0v3a4 4 0 0 1-4 4ZM9 19l-2 3 M15 19l2 3 ",
  "train-track": "M2 17 17 2M2 14l8 8 M5 11l8 8 M8 8l8 8 M11 5l8 8 M14 2l8 8 M7 22 22 7",
  "tram-front": "M6 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM4 11h16M12 3v8M8 19l-2 3 M18 22l-2 -3 M8 15h.01M16 15h.01",
  transgender: "M12 16v6M14 20h-4M18 2h4v4M2 2l7.17 7.17 M2 5.355V2h3.357M22 2l-7.17 7.17 M8 5 5 8M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  trash: "M10 11v6M14 11v6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  "trash-off": "M10 11v6M14 17v-3M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-1.576.768M19 6v7.344M2 2l20 20 M21 6h-9.344M3 6h3M5 6v14a2 2 0 002 2h10a2 2 0 002-2v-1",
  "tree-deciduous": "M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19ZM12 19v3",
  "tree-palm": "M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14",
  "tree-pine": "M17 14l3 3.3 a 1 1 0 0 1 -.7 1.7 H 4.7 a 1 1 0 0 1 -.7 -1.7 L 7 14 h -.3 a 1 1 0 0 1 -.7 -1.7 L 9 9 h -.2 A 1 1 0 0 1 8 7.3 L 12 3 l 4 4.3 a 1 1 0 0 1 -.8 1.7 H 15 l 3 3.3 a 1 1 0 0 1 -.7 1.7 H 17 ZM12 22v-3",
  trees: "M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0ZM7 16v6M13 19v3M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5",
  "trending-down": "M16 17h6v-6M22 17l-8.5 -8.5 -5 5 L 2 7",
  "trending-up": "M16 7h6v6M22 7l-8.5 8.5 -5 -5 L 2 17",
  "trending-up-down": "M14.828 14.828 21 21M21 16v5h-5M21 3l-9 9 -4 -4 -6 6 M21 8V3h-5",
  triangle: "M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z",
  "triangle-alert": "M21.73 18l-8 -14 a 2 2 0 0 0 -3.48 0 l -8 14 A 2 2 0 0 0 4 21 h 16 a 2 2 0 0 0 1.73 -3M12 9v4M12 17h.01",
  "triangle-dashed": "M10.17 4.193a2 2 0 0 1 3.666.013M14 21h2M15.87 7.74l1 1.73 M18.85 12.95l1 1.73 M21.824 18.18a2 2 0 0 1-1.835 2.824M4.024 21a2 2 0 0 1-1.839-2.839M5.14 12.95l-1 1.73 M8 21h2M8.1 7.74l-1 1.73 ",
  "triangle-right": "M22 18a2 2 0 0 1-2 2H3c-1.1 0-1.3-.6-.4-1.3L20.4 4.3c.9-.7 1.6-.4 1.6.7Z",
  "triangles-centerline-dashed-horizontal": "M10 12H8M16 12h-2M22 12h-2M4 12H2M7.298 20.288A1 1 0 008 22h8a1 1 0 00.703-1.712l-3.991-3.99a1 1 0 00-1.424-.001zM7.298 3.712A1 1 0 018 2h8a1 1 0 01.703 1.712l-3.991 3.99a1 1 0 01-1.424.001z",
  "triangles-centerline-dashed-vertical": "M12 14v2M12 20v2M12 2v2M12 8v2M20.288 16.703A1 1 0 0022 16V8a1 1 0 00-1.712-.703l-3.99 3.991a1 1 0 00-.001 1.424zM3.712 16.703A1 1 0 012 16V8a1 1 0 011.712-.703l3.99 3.991a1 1 0 01.001 1.424z",
  trophy: "M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3",
  truck: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "truck-electric": "M14 19V7a2 2 0 0 0-2-2H9M15 19H9M19 19h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14M2 13v5a1 1 0 0 0 1 1h2M4 3 2.15 5.15a.495.495 0 0 0 .35.86h2.15a.47.47 0 0 1 .35.86L3 9.02M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "tube-lotion": "M15 18v3a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-3M17 2a2 2 0 0 1 1.6 3.2A8 8 0 0 0 17 10v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6a8 8 0 0 0-1.6-4.8A2 2 0 0 1 7 2zM7 10a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0",
  "turkish-lira": "M15 4 5 9M15 8.5l-10 5 M18 12a9 9 0 0 1-9 9V3",
  turntable: "M10 12.01h.01M18 8v4a8 8 0 0 1-1.07 4M6 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2Z",
  turtle: "M12 10l2 4 v 3 a 1 1 0 0 0 1 1 h 2 a 1 1 0 0 0 1 -1 v -3 a 8 8 0 1 0 -16 0 v 3 a 1 1 0 0 0 1 1 h 2 a 1 1 0 0 0 1 -1 v -3 l 2 -4 h 4 ZM4.82 7.9 8 10M15.18 7.9 12 10M16.93 10H20a2 2 0 0 1 0 4H2",
  tv: "M17 2l-5 5 -5 -5 M4 7h16a2 2 0 0 1 2 2v11a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2Z",
  "tv-minimal": "M7 21h10M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  "tv-minimal-play": "M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56zM7 21h10M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  type: "M12 4v16M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2M9 20h6",
  "type-outline": "M14 16.5a.5.5 0 0 0 .5.5h.5a2 2 0 0 1 0 4H9a2 2 0 0 1 0-4h.5a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V8a2 2 0 0 1-4 0V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5Z",
  umbrella: "M12 13v7a2 2 0 0 0 4 0M12 2v2M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z",
  "umbrella-off": "M12 13v7a2 2 0 0 0 4 0M12 2v2M18.656 13h2.336a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-12.07-7.51M2 2l20 20 M5.961 5.957a10.28 10.28 0 0 0-3.922 5.769A1 1 0 0 0 3 13h10",
  underline: "M6 4v6a6 6 0 0 0 12 0V4M4 20L20 20",
  undo: "M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13",
  "undo-2": "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11",
  "undo-dot": "M21 17a9 9 0 0 0-15-6.7L3 13M3 7v6h6M11 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "unfold-horizontal": "M16 12h6M8 12H2M12 2v2M12 8v2M12 14v2M12 20v2M19 15l3 -3 -3 -3 M5 9l-3 3 3 3 ",
  "unfold-vertical": "M12 22v-6M12 8V2M4 12H2M10 12H8M16 12h-2M22 12h-2M15 19l-3 3 -3 -3 M15 5l-3 -3 -3 3 ",
  ungroup: "M13 14h6a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2ZM5 3h6a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2Z",
  university: "M14 21v-3a2 2 0 0 0-4 0v3M18 12h.01M18 16h.01M22 7a1 1 0 0 0-1-1h-2a2 2 0 0 1-1.143-.359L13.143 2.36a2 2 0 0 0-2.286-.001L6.143 5.64A2 2 0 0 1 5 6H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2zM6 12h.01M6 16h.01M10 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  unlink: "M18.84 12.25l1.72 -1.71 h -.02 a 5.004 5.004 0 0 0 -.12 -7.07 5.006 5.006 0 0 0 -6.95 0 l -1.72 1.71M5.17 11.75l-1.71 1.71 a 5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0 l 1.71 -1.71M8 2L8 5M2 8L5 8M16 19L16 22M19 16L22 16",
  "unlink-2": "M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2",
  unplug: "M19 5l3 -3 M2 22l3 -3 M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4ZM7.5 13.5 10 11M10.5 16.5 13 14M12 6l6 6 2.3 -2.3 a 2.4 2.4 0 0 0 0 -3.4 l -2.6 -2.6 a 2.4 2.4 0 0 0 -3.4 0 Z",
  upload: "M12 3v12M17 8l-5 -5 -5 5 M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
  usb: "M9 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M3 20a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4.7 19.3 19 5M21 3l-3 1 2 2 ZM9.26 7.68 5 12l2 5M10 14l5 2 3.5 -3.5 M18 12l1 -1 1 1 -1 1 Z",
  "usb-c-port": "M6 12h12M6 8h12a4 4 0 0 1 4 4v0a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v0a4 4 0 0 1 4 -4Z",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "user-check": "M16 11l2 2 4 -4 M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "user-cog": "M10 15H6a4 4 0 0 0-4 4v2M14.31 16.53l0.92 -0.38 M15.23 13.85l-0.92 -0.38 M16.85 12.23l-0.38 -0.92 M16.85 17.77l-0.38 0.92 M19.15 12.23l0.38 -0.92 M19.53 18.7l-0.38 -0.92 M20.77 13.85l0.92 -0.38 M20.77 16.15l0.92 0.38 M15 15a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "user-group": "M17 21v-1a2 2 0 00-2-2H9a2 2 0 00-2 2v1M19 10h1a2 2 0 012 2v1M5 10H4a2 2 0 00-2 2v1M9 11a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M16 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "user-key": "M20 11v6M20 13h2M3 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 2.072.578M6 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M18 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "user-lock": "M19 16v-2a2 2 0 0 0-4 0v2M9.5 15H7a4 4 0 0 0-4 4v2M6 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M13.9 16h6.2a0.899 0.899 0 0 1 0.899 0.899v3.2a0.899 0.899 0 0 1 -0.899 0.899h-6.2a0.899 0.899 0 0 1 -0.899 -0.899v-3.2a0.899 0.899 0 0 1 0.899 -0.899Z",
  "user-minus": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M22 11L16 11",
  "user-pen": "M11.5 15H7a4 4 0 0 0-4 4v2M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506zM6 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "user-plus": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M19 8L19 14M22 11L16 11",
  "user-round": "M7 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M20 21a8 8 0 0 0-16 0",
  "user-round-arrow-left": "M19 16l-3 3 M2 21a8 8 0 0 1 12.664-6.5M22 19h-6l3 3M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0",
  "user-round-check": "M2 21a8 8 0 0 1 13.292-6M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M16 19l2 2 4 -4 ",
  "user-round-cog": "M14.31 19.53l0.92 -0.38 M15.23 16.85l-0.92 -0.38 M16.85 15.23l-0.38 -0.92 M16.85 20.77l-0.38 0.92 M19.15 15.23l0.38 -0.92 M19.53 21.7l-0.38 -0.92 M2 21a8 8 0 0 1 10.434-7.62M20.77 16.85l0.92 -0.38 M20.77 19.15l0.92 0.38 M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "user-round-group": "M17 21a5 5 0 00-10 0M22 10.5a3.5 3.5 0 00-5.507-2.868M7.507 7.632A3.5 3.5 0 002 10.5M9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M16 4.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M3 4.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  "user-round-key": "M19 11v6M19 13h2M2 21a8 8 0 0 1 12.868-6.349M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "user-round-minus": "M2 21a8 8 0 0 1 13.292-6M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M22 19h-6",
  "user-round-pen": "M2 21a8 8 0 0 1 10.821-7.487M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506zM5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0",
  "user-round-plus": "M2 21a8 8 0 0 1 13.292-6M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M19 16v6M22 19h-6",
  "user-round-search": "M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M2 21a8 8 0 0 1 10.434-7.62M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M22 22l-1.9 -1.9 ",
  "user-round-x": "M16.5 16.5l5 5 M2 21a8 8 0 0 1 11.531-7.18M21.5 16.5l-5 5 M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0",
  "user-search": "M6 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M10.3 15H7a4 4 0 0 0-4 4v2M14 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M21 21l-1.9 -1.9 ",
  "user-shield": "M10 15H6a4 4 0 0 0-4 4v2M22 17.5c0 2.499-1.75 3.749-3.83 4.474a.5.5 0 0 1-.335-.005c-2.085-.72-3.835-1.97-3.835-4.47V14a.5.5 0 0 1 .5-.499c1 0 2.25-.6 3.12-1.36a.6.6 0 0 1 .76-.001c.875.765 2.12 1.36 3.12 1.36a.5.5 0 0 1 .5.5zM5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "user-star": "M16.051 12.616a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.866l-1.156-1.153a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535zM8 15H7a4 4 0 0 0-4 4v2M6 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "user-x": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M17 8L22 13M22 8L17 13",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "users-round": "M18 21a8 8 0 0 0-16 0M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3",
  utensils: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  "utensils-crossed": "M16 2l-2.3 2.3 a 3 3 0 0 0 0 4.2 l 1.8 1.8 a 3 3 0 0 0 4.2 0 L 22 8M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7M2.1 21.8l6.4 -6.3 M19 5l-7 7 ",
  "utility-pole": "M12 2v20M2 5h20M3 3v2M7 3v2M17 3v2M21 3v2M19 5l-7 7 -7 -7 ",
  van: "M13 6v5a1 1 0 0 0 1 1h6.102a1 1 0 0 1 .712.298l.898.91a1 1 0 0 1 .288.702V17a1 1 0 0 1-1 1h-3M5 18H3a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2h12c1.1 0 2.1.8 2.4 1.8l1.176 4.2M9 18h5M14 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  variable: "M8 21s-4-3-4-9 4-9 4-9M16 3s4 3 4 9-4 9-4 9M15 9L9 15M9 9L15 15",
  vault: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM7 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M7.9 7.9l2.7 2.7 M16 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M13.4 10.6l2.7 -2.7 M7 16.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M7.9 16.1l2.7 -2.7 M16 16.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0M13.4 13.4l2.7 2.7 M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "vector-polygon": "M12.83 4.81l5.34 2.38 M15.77 18.15l3.46 -8.31 M5.69 14.07l7.63 4.85 M9.772 5.579 5.228 11.42M9 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M13 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M2 13a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "vector-square": "M17.055 4.533a24 24 0 00-10.11 0M19.467 17.055a24 24 0 000-10.11M4.533 6.945a24 24 0 000 10.11M6.945 19.467a24 24 0 0010.11 0M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M17 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  vegan: "M16 8q6 0 6-6-6 0-6 6M17.41 3.59a10 10 0 1 0 3 3M2 2a26.6 26.6 0 0 1 10 20c.9-6.82 1.5-9.5 4-14",
  "venetian-mask": "M18 11c-1.5 0-2.5.5-3 2M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2zM6 11c1.5 0 2.5.5 3 2",
  venus: "M12 15v7M9 19h6M6 9a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "venus-and-mars": "M10 20h4M12 16v6M17 2h4v4M21 2l-5.46 5.46 M7 11a5 5 0 1 0 10 0a5 5 0 1 0 -10 0",
  vibrate: "M2 8l2 2 -2 2 2 2 -2 2 M22 8l-2 2 2 2 -2 2 2 2 M9 5h6a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-12a1 1 0 0 1 1 -1Z",
  "vibrate-off": "M2 8l2 2 -2 2 2 2 -2 2 M22 8l-2 2 2 2 -2 2 2 2 M8 8v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2M16 10.34V6c0-.55-.45-1-1-1h-4.34M2 2L22 22",
  video: "M16 13l5.22 3.48 a .5 .5 0 0 0 .777 -.416 V 7.87 a .5 .5 0 0 0 -.752 -.432 L 16 10.5M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
  "video-off": "M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2M2 2l20 20 ",
  videotape: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2ZM2 8h20M6 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M8 12h8M14 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  view: "M21 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2M21 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0",
  virus: "M12 14.991h.01M12 22v-3M12 2v3M13 22h-2M13 2h-2M13.99 10H14M16.5 19.79l-1 -1.73 M16.5 4.21l-1 1.73 M19.79 16.5l-1.73 -1 M19.79 7.5l-1.73 1 M2 12h3M2 13v-2M22 12h-3M22 13v-2M4.21 16.5l1.73 -1 M4.21 7.5l1.73 1 M7.5 19.79l1 -1.73 M7.5 4.21l1 1.73 M9 12h.01M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0",
  "virus-off": "M10.01 10h.01M12 14.991h.01M12 22v-3M12 2v3M13 22h-2M13 2h-2M16.5 19.79l-1 -1.73 M16.5 4.21l-1 1.73 M18.891 13.235a7 7 0 00-8.126-8.126M19.79 7.5l-1.73 1 M2 12h3M2 13v-2M2 2l20 20 M22 12h-3M22 13v-2M4.21 16.5l1.73 -1 M4.21 7.5l1.73 1 M7.05 7.05a7 7 0 009.9 9.9M7.5 19.79l1 -1.73 M9 12h.01",
  voicemail: "M2 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M14 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M6 16L18 16",
  volleyball: "M11 7a16 16 20 0 1 10.98 4.362M12 12a13 13 0 0 1-8.66 5M16.83 13.634a16 16 0 0 1-9.267 7.328M20.66 17A13 13 0 0 0 12 12a13 13 0 0 1 0-10M8.17 15.366a16 16 0 0 1-1.713-11.69M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
  volume: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
  "volume-1": "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298zM16 9a5 5 0 0 1 0 6",
  "volume-2": "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298zM16 9a5 5 0 0 1 0 6M19.364 18.364a9 9 0 0 0 0-12.728",
  "volume-off": "M16 9a5 5 0 0 1 .95 2.293M19.364 5.636a9 9 0 0 1 1.889 9.96M2 2l20 20 M7 7l-0.59 0.59 A 1.4 1.4 0 0 1 5.416 8 H 3 a 1 1 0 0 0 -1 1 v 6 a 1 1 0 0 0 1 1 h 2.416 a 1.4 1.4 0 0 1 .997 .413 l 3.383 3.384 A .705 .705 0 0 0 11 19.298 V 11M9.828 4.172A.686.686 0 0 1 11 4.657v.686",
  "volume-x": "M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298zM16.5 14.5l5 -5 M16.5 9.5l5 5 ",
  vote: "M9 12l2 2 4 -4 M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7ZM22 19H2",
  wallet: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
  "wallet-cards": "M3 11h3.75a2 2 0 0 1 1.6.8l.45.6a4 4 0 0 0 6.4 0l.45-.6a2 2 0 0 1 1.6-.8H21M3 7h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
  "wallet-minimal": "M17 14h.01M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14",
  wallpaper: "M12 17v4M8 21h8M9 17l6.1 -6.1 a 2 2 0 0 1 2.81 .01 L 22 15M6 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  wand: "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9 -9 M12.2 6.2 11 5",
  "wand-sparkles": "M21.64 3.64l-1.28 -1.28 a 1.21 1.21 0 0 0 -1.72 0 L 2.36 18.64 a 1.21 1.21 0 0 0 0 1.72 l 1.28 1.28 a 1.2 1.2 0 0 0 1.72 0 L 21.64 5.36 a 1.2 1.2 0 0 0 0 -1.72M14 7l3 3 M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9",
  warehouse: "M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8zM6 13h12M6 17h12",
  "washing-machine": "M3 6h3M17 6h.01M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM7 13a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5",
  watch: "M12 10v2.2l1.6 1M16.13 7.66l-0.81 -4.05 a 2 2 0 0 0 -2 -1.61 h -2.68 a 2 2 0 0 0 -2 1.61 l -.78 4.05M7.88 16.36l0.8 4 a 2 2 0 0 0 2 1.61 h 2.72 a 2 2 0 0 0 2 -1.61 l .81 -4.05M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0",
  "waves-arrow-down": "M12 10L12 2M16 6L12 10L8 6M2 15C2.6 15.5 3.2 16 4.5 16C7 16 7 14 9.5 14C12.1 14 11.9 16 14.5 16C17 16 17 14 19.5 14C20.8 14 21.4 14.5 22 15M2 21C2.6 21.5 3.2 22 4.5 22C7 22 7 20 9.5 20C12.1 20 11.9 22 14.5 22C17 22 17 20 19.5 20C20.8 20 21.4 20.5 22 21",
  "waves-arrow-up": "M12 2v8M2 15c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M8 6l4 -4 4 4 ",
  "waves-horizontal": "M2 12q2.5 2 5 0t5 0 5 0 5 0M2 19q2.5 2 5 0t5 0 5 0 5 0M2 5q2.5 2 5 0t5 0 5 0 5 0",
  "waves-ladder": "M19 5a2 2 0 0 0-2 2v11M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M7 13h10M7 9h10M9 5a2 2 0 0 0-2 2v11",
  "waves-vertical": "M12 2q2 2.5 0 5t0 5 0 5 0 5M19 2q2 2.5 0 5t0 5 0 5 0 5M5 2q2 2.5 0 5t0 5 0 5 0 5",
  waypoints: "M10.59 5.41l-5.17 5.17 M18.59 13.41l-5.17 5.17 M6 12h12M10 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M2 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  webcam: "M4 10a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M7 22h10M12 22v-4",
  "webcam-off": "M12 22v-4M12.754 7.096a3 3 0 0 1 2.15 2.15M12.863 12.873a3 3 0 0 1-3.736-3.735M16.566 16.57A8 8 0 0 1 5.43 5.433M2 2l20 20 M7 22h10M8.478 2.817a8 8 0 0 1 10.705 10.705",
  webhook: "M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13 -5.78 c .53 -.97 .1 -2.18 -.5 -3.1 a 4 4 0 1 1 6.89 -4.06M12 6l3.13 5.73 C 15.66 12.7 16.9 13 18 13 a 4 4 0 0 1 0 8",
  "webhook-off": "M17 17h-5c-1.09-.02-1.94.92-2.5 1.9A3 3 0 1 1 2.57 15M9 3.4a4 4 0 0 1 6.52.66M6 17l3.1 -5.8 a 2.5 2.5 0 0 0 .057 -2.05M20.3 20.3a4 4 0 0 1-2.3.7M18.6 13a4 4 0 0 1 3.357 3.414M12 6l0.6 1 M2 2l20 20 ",
  weight: "M9 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z",
  "weight-tilde": "M6.5 8a2 2 0 0 0-1.906 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8zM7.999 15a2.5 2.5 0 0 1 4 0 2.5 2.5 0 0 0 4 0M9 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  wheat: "M2 22 16 8M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94ZM7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94ZM11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94ZM20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4ZM11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0ZM15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0ZM19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z",
  "wheat-off": "M2 22l10 -10 M16 8l-1.17 1.17 M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94ZM8 8l-0.53 0.53 a 3.5 3.5 0 0 0 0 4.94 L 9 15 l 1.53 -1.53 c .55 -.55 .88 -1.25 .98 -1.97M10.91 5.26c.15-.26.34-.51.56-.73L13 3l1.53 1.53a3.5 3.5 0 0 1 .28 4.62M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4ZM11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0ZM16 16l-0.53 0.53 a 3.5 3.5 0 0 1 -4.94 0 L 9 15 l 1.53 -1.53 a 3.49 3.49 0 0 1 1.97 -.98M18.74 13.09c.26-.15.51-.34.73-.56L21 11l-1.53-1.53a3.5 3.5 0 0 0-4.62-.28M2 2L22 22",
  whistle: "M10 6v4M21 6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.675A7 7 0 1 1 9 6z",
  "whole-word": "M4 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M10 9v6M14 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M14 7v8M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1",
  wifi: "M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.859a10 10 0 0 1 14 0M8.5 16.429a5 5 0 0 1 7 0",
  "wifi-cog": "M14.31 19.53l0.92 -0.38 M15.23 16.85l-0.92 -0.38 M16.85 15.23l-0.38 -0.92 M16.85 20.77l-0.38 0.92 M19.15 15.23l0.38 -0.92 M19.53 21.7l-0.38 -0.92 M2 7.82a15 15 0 0 1 20 0M20.77 16.85l0.92 -0.38 M20.77 19.15l0.92 0.38 M5 11.858a10 10 0 0 1 11.5-1.785M8.5 15.429a5 5 0 0 1 2.413-1.31M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "wifi-high": "M12 20h.01M5 12.859a10 10 0 0 1 14 0M8.5 16.429a5 5 0 0 1 7 0",
  "wifi-low": "M12 20h.01M8.5 16.429a5 5 0 0 1 7 0",
  "wifi-off": "M12 20h.01M8.5 16.429a5 5 0 0 1 7 0M5 12.859a10 10 0 0 1 5.17-2.69M19 12.859a10 10 0 0 0-2.007-1.523M2 8.82a15 15 0 0 1 4.177-2.643M22 8.82a15 15 0 0 0-11.288-3.764M2 2l20 20 ",
  "wifi-pen": "M2 8.82a15 15 0 0 1 20 0M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506zM5 12.859a10 10 0 0 1 10.5-2.222M8.5 16.429a5 5 0 0 1 3-1.406",
  "wifi-sync": "M11.965 10.105v4L13.5 12.5a5 5 0 0 1 8 1.5M11.965 14.105h4M17.965 18.105h4L20.43 19.71a5 5 0 0 1-8-1.5M2 8.82a15 15 0 0 1 20 0M21.965 22.105v-4M5 12.86a10 10 0 0 1 3-2.032M8.5 16.429h.01",
  "wifi-zero": "M12 20h.01",
  wind: "M12.8 19.6A2 2 0 1 0 14 16H2M17.5 8a2.5 2.5 0 1 1 2 4H2M9.8 4.4A2 2 0 1 1 11 8H2",
  "wind-arrow-down": "M10 2v8M12.8 21.6A2 2 0 1 0 14 18H2M17.5 10a2.5 2.5 0 1 1 2 4H2M6 6l4 4 4 -4 ",
  wine: "M8 22h8M7 10h10M12 15v7M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z",
  "wine-off": "M8 22h8M7 10h3m7 0h-1.343M12 15v7M7.307 7.307A12.33 12.33 0 0 0 7 10a5 5 0 0 0 7.391 4.391M8.638 2.981C8.75 2.668 8.872 2.34 9 2h6c1.5 4 2 6 2 8 0 .407-.05.809-.145 1.198M2 2L22 22",
  workflow: "M5 3h4a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2ZM7 11v4a2 2 0 0 0 2 2h4M15 13h4a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z",
  worm: "M19 12l-1.5 3 M19.63 18.81 22 20M6.47 8.23a1.68 1.68 0 0 1 2.44 1.93l-.64 2.08a6.76 6.76 0 0 0 10.16 7.67l.42-.27a1 1 0 1 0-2.73-4.21l-.42.27a1.76 1.76 0 0 1-2.63-1.99l.64-2.08A6.66 6.66 0 0 0 3.94 3.9l-.7.4a1 1 0 1 0 2.55 4.34z",
  wrench: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",
  "wrench-off": "M10.747 5.093a6 6 0 0 1 6.841-2.882c.438.12.54.662.219.984L14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-2.882 6.842M13.5 13.5l-7.88 7.88 a 1 1 0 0 1 -2.999 -3 l 7.88 -7.88M2 2l20 20 ",
  x: "M18 6 6 18M6 6l12 12 ",
  "x-line-top": "M18 4H6M18 8 6 20M6 8l12 12 ",
  zap: "M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z",
  "zap-off": "M10.768 5.111 13.44 2.44a1.5 1.5 0 012.474 1.561l-1.633 4.625M18.89 13.23l0.67 -0.67 A 1.5 1.5 0 0018.5 10 h -2.844M2 2l20 20 M7.94 7.94l-3.5 3.5 A 1.5 1.5 0 005.5 14 h 4.002 a .5 .5 0 01.471 .666 L 8.086 20 a 1.5 1.5 0 002.475 1.56 l 5.5 -5.5",
  "zodiac-aquarius": "M2 10l2.46 -3.68 a .7 .7 0 0 1 1.106 -.013 l 2.39 3.413 a .7 .7 0 0 0 1.096 -.001 l 2.402 -3.432 a .7 .7 0 0 1 1.098 0 l 2.402 3.432 a .7 .7 0 0 0 1.098 0 l 2.389 -3.413 a .7 .7 0 0 1 1.106 .013 L 22 10M2 18l2.46 -3.68 a .7 .7 0 0 1 1.106 -.013 l 2.39 3.413 a .7 .7 0 0 0 1.097 0 l 2.402 -3.432 a .7 .7 0 0 1 1.098 0 l 2.402 3.432 a .7 .7 0 0 0 1.098 0 l 2.389 -3.413 a .7 .7 0 0 1 1.106 .013 L 22 18.002",
  "zodiac-aries": "M12 7.5a4.5 4.5 0 1 1 5 4.5M7 12a4.5 4.5 0 1 1 5-4.5V21",
  "zodiac-cancer": "M21 14.5A9 6.5 0 0 1 5.5 19M3 9.5A9 6.5 0 0 1 18.5 5M14 14.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M3 9.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
  "zodiac-capricorn": "M11 21a3 3 0 0 0 3-3V6.5a1 1 0 0 0-7 0M7 19V6a3 3 0 0 0-3-3h0M14 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "zodiac-gemini": "M16 4.525v14.948M20 3A17 17 0 0 1 4 3M4 21a17 17 0 0 1 16 0M8 4.525v14.948",
  "zodiac-leo": "M10 16c0-4-3-4.5-3-8a5 5 0 0 1 10 0c0 3.466-3 6.196-3 10a3 3 0 0 0 6 0M4 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  "zodiac-libra": "M3 16h6.857c.162-.012.19-.323.038-.38a6 6 0 1 1 4.212 0c-.153.057-.125.368.038.38H21M3 20h18",
  "zodiac-ophiuchus": "M3 10A6.06 6.06 0 0 1 12 10 A6.06 6.06 0 0 0 21 10M6 3v12a6 6 0 0 0 12 0V3",
  "zodiac-pisces": "M19 21a15 15 0 0 1 0-18M20 12H4M5 3a15 15 0 0 1 0 18",
  "zodiac-sagittarius": "M15 3h6v6M21 3 3 21M9 9l6 6 ",
  "zodiac-scorpio": "M10 19V5.5a1 1 0 0 1 5 0V17a2 2 0 0 0 2 2h5l-3-3M22 19l-3 3 M5 19V5.5a1 1 0 0 1 5 0M5 5.5A2.5 2.5 0 0 0 2.5 3",
  "zodiac-taurus": "M6 15a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M18 3A6 6 0 0 1 6 3",
  "zodiac-virgo": "M11 5.5a1 1 0 0 1 5 0V16a5 5 0 0 0 5 5M16 11.5a1 1 0 0 1 5 0V16a5 5 0 0 1-5 5M6 19V6a3 3 0 0 0-3-3h0M6 5.5a1 1 0 0 1 5 0V19",
  "zoom-in": "M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M21 21L16.65 16.65M11 8L11 14M8 11L14 11",
  "zoom-out": "M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M21 21L16.65 16.65M8 11L14 11"
};
var ICON_ALIASES = {
  "activity-square": "square-activity",
  "alarm-check": "alarm-clock-check",
  "alarm-minus": "alarm-clock-minus",
  "alarm-plus": "alarm-clock-plus",
  album: "square-bookmark",
  "alert-circle": "circle-alert",
  "alert-octagon": "octagon-alert",
  "alert-triangle": "triangle-alert",
  "align-center": "text-align-center",
  "align-justify": "text-align-justify",
  "align-left": "text-align-start",
  "align-right": "text-align-end",
  angry: "face-angry",
  annoyed: "face-expressionless",
  "area-chart": "chart-area",
  "arrow-down-01": "arrow-down-0-1",
  "arrow-down-10": "arrow-down-1-0",
  "arrow-down-az": "arrow-down-a-z",
  "arrow-down-circle": "circle-arrow-down",
  "arrow-down-left-from-circle": "circle-arrow-out-down-left",
  "arrow-down-left-from-square": "square-arrow-out-down-left",
  "arrow-down-left-square": "square-arrow-down-left",
  "arrow-down-right-from-circle": "circle-arrow-out-down-right",
  "arrow-down-right-from-square": "square-arrow-out-down-right",
  "arrow-down-right-square": "square-arrow-down-right",
  "arrow-down-square": "square-arrow-down",
  "arrow-down-za": "arrow-down-z-a",
  "arrow-left-circle": "circle-arrow-left",
  "arrow-left-square": "square-arrow-left",
  "arrow-right-circle": "circle-arrow-right",
  "arrow-right-square": "square-arrow-right",
  "arrow-up-01": "arrow-up-0-1",
  "arrow-up-10": "arrow-up-1-0",
  "arrow-up-az": "arrow-up-a-z",
  "arrow-up-circle": "circle-arrow-up",
  "arrow-up-left-from-circle": "circle-arrow-out-up-left",
  "arrow-up-left-from-square": "square-arrow-out-up-left",
  "arrow-up-left-square": "square-arrow-up-left",
  "arrow-up-right-from-circle": "circle-arrow-out-up-right",
  "arrow-up-right-from-square": "square-arrow-out-up-right",
  "arrow-up-right-square": "square-arrow-up-right",
  "arrow-up-square": "square-arrow-up",
  "arrow-up-za": "arrow-up-z-a",
  "asterisk-square": "square-asterisk",
  "axis-3-d": "axis-3d",
  "badge-help": "badge-question-mark",
  "bar-chart": "chart-no-axes-column-increasing",
  "bar-chart-2": "chart-no-axes-column",
  "bar-chart-3": "chart-column",
  "bar-chart-4": "chart-column-increasing",
  "bar-chart-big": "chart-column-big",
  "bar-chart-horizontal": "chart-bar",
  "bar-chart-horizontal-big": "chart-bar-big",
  "between-horizonal-end": "between-horizontal-end",
  "between-horizonal-start": "between-horizontal-start",
  "book-marked": "book-bookmark",
  "book-template": "book-dashed",
  "box-select": "square-dashed",
  "building-2": "building-complex",
  "candlestick-chart": "chart-candlestick",
  "check-circle": "circle-check-big",
  "check-circle-2": "circle-check",
  "check-square": "square-check-big",
  "check-square-2": "square-check",
  "chevron-down-circle": "circle-chevron-down",
  "chevron-down-square": "square-chevron-down",
  "chevron-left-circle": "circle-chevron-left",
  "chevron-left-square": "square-chevron-left",
  "chevron-right-circle": "circle-chevron-right",
  "chevron-right-square": "square-chevron-right",
  "chevron-up-circle": "circle-chevron-up",
  "chevron-up-square": "square-chevron-up",
  "circle-help": "circle-question-mark",
  "circle-slashed": "circle-slash-2",
  "clipboard-edit": "clipboard-pen",
  "clipboard-signature": "clipboard-pen-line",
  "code-2": "code-xml",
  "code-square": "square-code",
  columns: "columns-2",
  "columns-settings": "columns-3-cog",
  "contact-2": "contact-round",
  "curly-braces": "braces",
  "divide-circle": "circle-divide",
  "divide-square": "square-divide",
  "dot-square": "square-dot",
  "download-cloud": "cloud-download",
  edit: "square-pen",
  "edit-2": "pen",
  "edit-3": "pen-line",
  "equal-square": "square-equal",
  "file-audio": "file-headphone",
  "file-audio-2": "file-headphone",
  "file-axis-3-d": "file-axis-3d",
  "file-badge-2": "file-badge",
  "file-bar-chart": "file-chart-column-increasing",
  "file-bar-chart-2": "file-chart-column",
  "file-check-2": "file-check-corner",
  "file-code-2": "file-code-corner",
  "file-cog-2": "file-cog",
  "file-edit": "file-pen",
  "file-json": "file-braces",
  "file-json-2": "file-braces-corner",
  "file-key-2": "file-key",
  "file-line-chart": "file-chart-line",
  "file-lock-2": "file-lock",
  "file-minus-2": "file-minus-corner",
  "file-pie-chart": "file-chart-pie",
  "file-plus-2": "file-plus-corner",
  "file-question": "file-question-mark",
  "file-search-2": "file-search-corner",
  "file-signature": "file-pen-line",
  "file-type-2": "file-type-corner",
  "file-video": "file-play",
  "file-video-2": "file-video-camera",
  "file-volume-2": "file-signal",
  "file-warning": "file-exclamation-point",
  "file-x-2": "file-x-corner",
  filter: "funnel",
  "filter-x": "funnel-x",
  fingerprint: "fingerprint-pattern",
  "flip-horizontal": "square-centerline-dashed-horizontal",
  "flip-horizontal-2": "triangles-centerline-dashed-horizontal",
  "flip-vertical": "square-centerline-dashed-vertical",
  "flip-vertical-2": "triangles-centerline-dashed-vertical",
  "folder-cog-2": "folder-cog",
  "folder-edit": "folder-pen",
  "fork-knife": "utensils",
  "fork-knife-crossed": "utensils-crossed",
  "form-input": "rectangle-ellipsis",
  frown: "face-slightly-frowning",
  "function-square": "square-function",
  "gantt-chart": "chart-no-axes-gantt",
  "gantt-chart-square": "square-chart-gantt",
  "gauge-circle": "circle-gauge",
  "git-commit": "git-commit-horizontal",
  "globe-2": "earth",
  grab: "hand-grab",
  grid: "grid-3x3",
  "grid-2-x-2": "grid-2x2",
  "grid-2-x-2-check": "grid-2x2-check",
  "grid-2-x-2-plus": "grid-2x2-plus",
  "grid-2-x-2-x": "grid-2x2-x",
  "grid-3-x-3": "grid-3x3",
  "help-circle": "circle-question-mark",
  "helping-hand": "hand-helping",
  history: "rotate-ccw-clock",
  home: "house",
  "ice-cream": "ice-cream-cone",
  "ice-cream-2": "ice-cream-bowl",
  indent: "list-indent-increase",
  "indent-decrease": "list-indent-decrease",
  "indent-increase": "list-indent-increase",
  inspect: "square-mouse-pointer",
  "kanban-square": "square-kanban",
  "kanban-square-dashed": "square-dashed-kanban",
  "laptop-2": "laptop-minimal",
  laugh: "face-grinning",
  "layers-3": "layers",
  layout: "panels-top-left",
  "letter-text": "text-initial",
  "library-square": "square-library",
  "line-chart": "chart-line",
  "loader-2": "loader-circle",
  "location-edit": "map-pin-pen",
  "m-square": "square-m",
  "mail-question": "mail-question-mark",
  meh: "face-neutral",
  "menu-square": "square-menu",
  "message-circle-question": "message-circle-question-mark",
  "mic-2": "mic-vocal",
  "minus-circle": "circle-minus",
  "minus-square": "square-minus",
  "more-horizontal": "ellipsis",
  "more-vertical": "ellipsis-vertical",
  "mouse-pointer-square-dashed": "square-dashed-mouse-pointer",
  "move-3-d": "move-3d",
  outdent: "list-indent-decrease",
  "paintbrush-2": "paintbrush-vertical",
  palmtree: "tree-palm",
  "panel-bottom-inactive": "panel-bottom-dashed",
  "panel-left-inactive": "panel-left-dashed",
  "panel-right-inactive": "panel-right-dashed",
  "panel-top-inactive": "panel-top-dashed",
  "panels-left-right": "columns-3",
  "panels-top-bottom": "rows-3",
  "parking-circle": "circle-parking",
  "parking-circle-off": "circle-parking-off",
  "parking-square": "square-parking",
  "parking-square-off": "square-parking-off",
  "pause-circle": "circle-pause",
  "pause-octagon": "octagon-pause",
  "pen-box": "square-pen",
  "pen-square": "square-pen",
  "percent-circle": "circle-percent",
  "percent-diamond": "diamond-percent",
  "percent-square": "square-percent",
  "pi-square": "square-pi",
  "pie-chart": "chart-pie",
  "pilcrow-square": "square-pilcrow",
  "play-circle": "circle-play",
  "play-square": "square-play",
  "plug-zap-2": "plug-zap",
  "plus-circle": "circle-plus",
  "plus-square": "square-plus",
  podcast: "mic-signal",
  "power-circle": "circle-power",
  "power-square": "square-power",
  "rotate-3-d": "rotate-3d",
  rows: "rows-2",
  "scale-3-d": "scale-3d",
  "scatter-chart": "chart-scatter",
  "school-2": "university",
  "scissors-square": "square-scissors",
  "scissors-square-dashed-bottom": "square-bottom-dashed-scissors",
  "send-horizonal": "send-horizontal",
  "shield-close": "shield-x",
  "shield-question": "shield-question-mark",
  sidebar: "panel-left",
  "sidebar-close": "panel-left-close",
  "sidebar-open": "panel-left-open",
  "sigma-square": "square-sigma",
  "slash-square": "square-slash",
  sliders: "sliders-vertical",
  smile: "face-slightly-smiling",
  "smile-plus": "face-slightly-smiling-plus",
  "sort-asc": "arrow-up-narrow-wide",
  "sort-desc": "arrow-down-wide-narrow",
  "split-square-horizontal": "square-split-horizontal",
  "split-square-vertical": "square-split-vertical",
  "square-gantt-chart": "square-chart-gantt",
  stars: "sparkles",
  "stop-circle": "circle-stop",
  subtitles: "captions",
  "table-config": "columns-3-cog",
  "terminal-square": "square-terminal",
  "test-tube-2": "test-tube-diagonal",
  text: "text-align-start",
  "text-select": "square-dashed-text",
  "text-selection": "square-dashed-text",
  train: "tram-front",
  "trash-2": "trash",
  "tv-2": "tv-minimal",
  unlock: "lock-open",
  "unlock-keyhole": "lock-keyhole-open",
  "upload-cloud": "cloud-upload",
  "user-2": "user-round",
  "user-check-2": "user-round-check",
  "user-circle": "circle-user",
  "user-circle-2": "circle-user-round",
  "user-cog-2": "user-round-cog",
  "user-minus-2": "user-round-minus",
  "user-plus-2": "user-round-plus",
  "user-square": "square-user",
  "user-square-2": "square-user-round",
  "user-x-2": "user-round-x",
  "users-2": "users-round",
  verified: "badge-check",
  "wallet-2": "wallet-minimal",
  "wand-2": "wand-sparkles",
  waves: "waves-horizontal",
  "wrap-text": "text-wrap",
  "x-circle": "circle-x",
  "x-octagon": "octagon-x",
  "x-square": "square-x"
};

// ui/src/icons/index.ts
var DEFAULT_ICON = "star";
function normalizeIconName(raw) {
  return (raw || "").trim().replace(/^(lucide|icon)[-:_]/i, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
}
var COMPACT = (() => {
  const m = new Map;
  for (const n of Object.keys(ICONS))
    m.set(n.replace(/-/g, ""), n);
  return m;
})();
function resolveIconName(raw) {
  const key = normalizeIconName(raw);
  if (!key)
    return null;
  if (key in ICONS)
    return key;
  const alias = ICON_ALIASES[key];
  if (alias)
    return alias;
  return COMPACT.get(key.replace(/-/g, "")) ?? null;
}
var SORTED = Object.keys(ICONS).sort();
function searchIcons(query, limit = 40) {
  const q = normalizeIconName(query);
  if (!q)
    return SORTED.slice(0, limit);
  if (q in ICONS)
    return [q];
  if (q in ICON_ALIASES)
    return [ICON_ALIASES[q]];
  const out = [];
  const seen = new Set;
  for (const n of SORTED) {
    if (n.startsWith(q))
      out.push({ n, s: 0 });
    else if (n.includes(q))
      out.push({ n, s: 1 });
    else
      seen.add(n);
  }
  for (const [a, target] of Object.entries(ICON_ALIASES)) {
    if (seen.has(target))
      continue;
    if (a.startsWith(q) || a.includes(q))
      out.push({ n: target, s: a.startsWith(q) ? 0 : 1 });
  }
  return out.sort((x, y) => x.s - y.s || x.n.localeCompare(y.n)).slice(0, limit).map((o) => o.n);
}
function iconD(name) {
  const r = resolveIconName(name);
  return r ? ICONS[r] ?? null : null;
}
var r2 = (v) => {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? "0" : String(n);
};
function transformPathD(d, s, tx, ty) {
  if (!d)
    return d;
  if (s === 1 && tx === 0 && ty === 0)
    return d;
  const tokens = d.match(/[a-df-zA-DF-Z]|-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const counts = { m: 2, l: 2, t: 2, c: 6, s: 4, q: 4, a: 7, h: 1, v: 1 };
  const X = (v) => r2(v * s + tx);
  const Y = (v) => r2(v * s + ty);
  const dx = (v) => r2(v * s);
  let out = "";
  let i = 0;
  let cmd = "";
  const pair = (rel, x, y) => rel ? `${dx(x)} ${dx(y)}` : `${X(x)} ${Y(y)}`;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[a-zA-Z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd.toLowerCase() === "z") {
        out += cmd;
        continue;
      }
    }
    const lower = cmd.toLowerCase();
    const n = counts[lower];
    if (!n) {
      i++;
      continue;
    }
    const rel = cmd === lower;
    const vals = [];
    let guard = 0;
    while (vals.length < n && i < tokens.length && guard++ < 64) {
      const t2 = tokens[i];
      if (/^[a-zA-Z]$/.test(t2))
        break;
      const v = Number(t2);
      vals.push(Number.isFinite(v) ? v : 0);
      i++;
    }
    if (vals.length < n)
      break;
    switch (lower) {
      case "m":
      case "l":
      case "t":
        out += `${cmd}${pair(rel, vals[0], vals[1])}`;
        break;
      case "c":
        out += `${cmd}${pair(rel, vals[0], vals[1])} ${pair(rel, vals[2], vals[3])} ${pair(rel, vals[4], vals[5])}`;
        break;
      case "s":
      case "q":
        out += `${cmd}${pair(rel, vals[0], vals[1])} ${pair(rel, vals[2], vals[3])}`;
        break;
      case "a":
        out += `${cmd}${dx(vals[0])} ${dx(vals[1])} ${r2(vals[2])} ${vals[3]} ${vals[4]} ${pair(rel, vals[5], vals[6])}`;
        break;
      case "h":
        out += `${cmd}${rel ? dx(vals[0]) : X(vals[0])}`;
        break;
      case "v":
        out += `${cmd}${rel ? dx(vals[0]) : Y(vals[0])}`;
        break;
    }
  }
  return out;
}
function iconDrawSpec(icon, w, h, strokeWidth) {
  const d0 = iconD(icon);
  if (!d0 || !(w > 0) || !(h > 0))
    return null;
  const s = Math.min(w, h) / 24;
  return {
    d: transformPathD(d0, s, (w - 24 * s) / 2, (h - 24 * s) / 2),
    sw: Math.max(0.5, strokeWidth * s)
  };
}

// ui/src/doc.ts
var DOC_VERSION = 1;
var SHAPE_TYPES = [
  "rect",
  "ellipse",
  "triangle",
  "diamond",
  "pentagon",
  "hexagon",
  "star"
];
var INTERACTION_TRIGGERS = [
  "tap",
  "doubleTap",
  "longPress",
  "swipeLeft",
  "swipeRight",
  "swipeUp",
  "swipeDown"
];
var INTERACTION_ACTIONS = [
  "navigate",
  "back",
  "overlay",
  "closeOverlay",
  "scrollTo",
  "toggleVisible"
];
var PROTOTYPE_TRANSITIONS = [
  "none",
  "pushLeft",
  "pushRight",
  "pushUp",
  "pushDown",
  "fade",
  "scale",
  "slideUp",
  "slideDown"
];
var OVERLAY_POSITIONS = ["center", "top", "bottom", "left", "right"];
var SCROLL_AXES = ["v", "h", "both"];
function looseKey(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
}
var TRIGGER_ALIASES = {
  tap: "tap",
  click: "tap",
  touch: "tap",
  press: "tap",
  onclick: "tap",
  doubletap: "doubleTap",
  dbltap: "doubleTap",
  doubleclick: "doubleTap",
  dbclick: "doubleTap",
  longpress: "longPress",
  longclick: "longPress",
  hold: "longPress",
  presshold: "longPress",
  swipeleft: "swipeLeft",
  left: "swipeLeft",
  swiperight: "swipeRight",
  right: "swipeRight",
  swipeup: "swipeUp",
  up: "swipeUp",
  swipedown: "swipeDown",
  down: "swipeDown"
};
function normalizeTrigger(raw) {
  return TRIGGER_ALIASES[looseKey(raw)];
}
var ACTION_ALIASES = {
  navigate: "navigate",
  jump: "navigate",
  goto: "navigate",
  link: "navigate",
  open: "navigate",
  navigateto: "navigate",
  back: "back",
  prev: "back",
  previous: "back",
  return: "back",
  goback: "back",
  overlay: "overlay",
  popup: "overlay",
  modal: "overlay",
  dialog: "overlay",
  sheet: "overlay",
  showoverlay: "overlay",
  closeoverlay: "closeOverlay",
  close: "closeOverlay",
  closepopup: "closeOverlay",
  dismiss: "closeOverlay",
  hideoverlay: "closeOverlay",
  scrollto: "scrollTo",
  scroll: "scrollTo",
  togglevisible: "toggleVisible",
  toggle: "toggleVisible",
  showhide: "toggleVisible",
  visibility: "toggleVisible"
};
function normalizeAction(raw) {
  return ACTION_ALIASES[looseKey(raw)];
}
var TRANSITION_ALIASES = {
  none: "none",
  no: "none",
  instant: "none",
  off: "none",
  pushleft: "pushLeft",
  slideleft: "pushLeft",
  left: "pushLeft",
  pushright: "pushRight",
  slideright: "pushRight",
  right: "pushRight",
  pushup: "pushUp",
  slideup: "slideUp",
  up: "pushUp",
  pushdown: "pushDown",
  slidedown: "slideDown",
  down: "pushDown",
  fade: "fade",
  fadein: "fade",
  dissolve: "fade",
  scale: "scale",
  zoom: "scale",
  pop: "scale"
};
function normalizeTransition(raw) {
  return TRANSITION_ALIASES[looseKey(raw)];
}
var OVERLAY_ALIASES = {
  center: "center",
  middle: "center",
  centre: "center",
  top: "top",
  above: "top",
  bottom: "bottom",
  below: "bottom",
  sheet: "bottom",
  left: "left",
  right: "right"
};
function normalizeOverlayPosition(raw) {
  return OVERLAY_ALIASES[looseKey(raw)];
}
function normalizeScrollAxis(raw) {
  if (raw === true)
    return "v";
  const k = looseKey(raw);
  if (!k)
    return;
  if (k === "v" || k === "vertical" || k === "y" || k === "column")
    return "v";
  if (k === "h" || k === "horizontal" || k === "x" || k === "row")
    return "h";
  if (k === "both" || k === "all" || k === "xy" || k === "vh" || k === "hv")
    return "both";
  return;
}
function parseInteraction(raw) {
  if (typeof raw !== "object" || raw === null)
    return null;
  const o = raw;
  const trigger = normalizeTrigger(pick(o, "trigger", "on", "when", "event"));
  const action = normalizeAction(pick(o, "action", "do", "type", "behavior"));
  if (!trigger || !action)
    return null;
  const it = { trigger, action };
  const to = str(pick(o, "to", "target", "destination", "dest", "frame", "page"));
  if (to)
    it.to = to.trim().slice(0, 120);
  const pos = normalizeOverlayPosition(pick(o, "position", "placement", "anchor"));
  if (pos)
    it.position = pos;
  const tr = normalizeTransition(pick(o, "transition", "animation", "anim", "effect"));
  if (tr)
    it.transition = tr;
  const durRaw = pick(o, "duration", "speed");
  if (typeof durRaw === "number" && Number.isFinite(durRaw) && durRaw > 0) {
    it.duration = clamp(Math.round(durRaw), 40, 2000);
  }
  if (o.dismissOnTapOutside === false || o.dismissOnTapOutside === "false")
    it.dismissOnTapOutside = false;
  return it;
}
function parseInteractions(raw) {
  if (!Array.isArray(raw))
    return;
  const out = [];
  for (const item of raw.slice(0, 24)) {
    const it = parseInteraction(item);
    if (it)
      out.push(it);
  }
  return out.length ? out : undefined;
}
function nodeInteractions(n) {
  if (n.interactions && n.interactions.length)
    return n.interactions;
  if (n.onTap?.to)
    return [{ trigger: "tap", action: "navigate", to: n.onTap.to }];
  return [];
}
function hasInteraction(n) {
  return !!(n.interactions?.length || n.onTap?.to);
}
var BLEND_MODES = [
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity"
];
function normalizeBlendMode(raw) {
  if (typeof raw !== "string")
    return;
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!key || key === "normal" || key === "pass-through" || key === "passthrough" || key === "src-over")
    return;
  return BLEND_MODES.includes(key) ? key : undefined;
}
var DEVICE_PRESETS = {
  "ios-375": { w: 375, h: 812, label: "iOS \xB7 375\xD7812", group: "\u624B\u673A" },
  "ios-390": { w: 390, h: 844, label: "iOS \xB7 390\xD7844", group: "\u624B\u673A" },
  "android-360": { w: 360, h: 800, label: "Android \xB7 360\xD7800", group: "\u624B\u673A" },
  "tablet-768": { w: 768, h: 1024, label: "\u5E73\u677F \xB7 768\xD71024", group: "\u5E73\u677F" },
  "desktop-1440": { w: 1440, h: 900, label: "\u684C\u9762 \xB7 1440\xD7900", group: "\u684C\u9762" },
  "watch-168": { w: 168, h: 184, label: "\u624B\u8868 \xB7 168\xD7184", group: "\u5176\u4ED6" }
};
var DEVICE_ORDER = Object.keys(DEVICE_PRESETS);
var uidCounter = 0;
function uid(prefix = "n") {
  uidCounter = (uidCounter + 1) % 16777215;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}`;
}
var solid = (color, opacity = 1) => opacity < 1 ? { type: "solid", color, opacity } : { type: "solid", color };
function blankDoc(name = "UI \u8BBE\u8BA1") {
  const pageId = uid("p");
  return {
    version: DOC_VERSION,
    meta: { name, kind: "uidesign" },
    activePage: pageId,
    pages: [{ id: pageId, name: "\u9875\u9762 1", nodes: [] }]
  };
}
function newFrame(opts) {
  return {
    id: uid("f"),
    type: "frame",
    name: opts.name ?? opts.preset ?? "\u753B\u677F",
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    w: clamp(opts.w, 1, 20000),
    h: clamp(opts.h, 1, 20000),
    fills: [solid(opts.background ?? "#ffffff")],
    ...opts.preset ? { preset: opts.preset } : {},
    children: []
  };
}
function newNode(type, box, name) {
  const base = { id: uid(type[0]), name: name ?? TYPE_LABELS[type] ?? type, ...box };
  switch (type) {
    case "text":
      return { ...base, type: "text", runs: [{ text: "\u6587\u672C", size: 16, color: "#111111" }] };
    case "image":
      return { ...base, type: "image", src: "" };
    case "frame":
      return { ...base, type: "frame", fills: [solid("#ffffff")], children: [] };
    case "group":
      return { ...base, type: "group", children: [] };
    case "line":
    case "arrow":
      return { ...base, type, strokes: [{ color: "#111111", width: 2 }] };
    case "icon":
      return { ...base, type: "icon", icon: name && resolveIconName(name) ? resolveIconName(name) : DEFAULT_ICON, color: "#111111", strokeWidth: 2 };
    case "vector":
      return { ...base, type: "vector", path: "M0 0L100 0L50 100Z", fills: [solid("#d9d9d9")], strokes: [] };
    case "instance":
      return { ...base, type: "instance", componentId: "" };
    default:
      return { ...base, type, fills: [solid("#d9d9d9")], strokes: [] };
  }
}
var TYPE_LABELS = {
  frame: "\u753B\u677F",
  group: "\u7EC4",
  rect: "\u77E9\u5F62",
  ellipse: "\u692D\u5706",
  triangle: "\u4E09\u89D2\u5F62",
  diamond: "\u83F1\u5F62",
  pentagon: "\u4E94\u8FB9\u5F62",
  hexagon: "\u516D\u8FB9\u5F62",
  star: "\u661F\u5F62",
  line: "\u76F4\u7EBF",
  icon: "\u56FE\u6807",
  vector: "\u77E2\u91CF",
  arrow: "\u7BAD\u5934",
  text: "\u6587\u672C",
  image: "\u56FE\u7247",
  instance: "\u5B9E\u4F8B"
};
function* walkNodes(nodes) {
  for (const n of nodes) {
    yield n;
    if ("children" in n)
      yield* walkNodes(n.children);
  }
}
function* walkDoc(doc) {
  for (const page of doc.pages)
    for (const node of walkNodes(page.nodes))
      yield { pageId: page.id, node };
}
function findNode(doc, id) {
  const s = id.indexOf("/");
  if (s > 0) {
    const owner = findNode(doc, id.slice(0, s));
    if (!owner || owner.node.type !== "instance")
      return null;
    const segs = id.slice(s + 1).split("/").filter(Boolean).slice(0, 8);
    if (!segs.length)
      return null;
    let view = instanceView(doc, owner.node);
    let viewOwner = owner.node;
    let cur = null;
    let curParent = owner.node;
    let acc = owner.node.id;
    for (const seg of segs) {
      if (!view)
        return null;
      acc = `${acc}/${seg}`;
      const found = findDeepNodeWithParent(view, acc, null);
      if (!found)
        return null;
      cur = found.node;
      curParent = found.parent ?? viewOwner;
      if (cur.type === "instance") {
        view = instanceView(doc, cur);
        viewOwner = cur;
      } else if ("children" in cur) {
        view = cur.children;
        viewOwner = cur;
      } else
        view = null;
    }
    if (!cur)
      return null;
    return { node: cur, siblings: [], index: -1, parent: curParent, pageId: owner.pageId };
  }
  for (const page of doc.pages) {
    const loc = findInList(page.nodes, id, page.id, null);
    if (loc)
      return loc;
  }
  return null;
}
function findInList(list, id, pageId, parent) {
  for (let i = 0;i < list.length; i++) {
    const n = list[i];
    if (n.id === id)
      return { node: n, siblings: list, index: i, parent, pageId };
    if ("children" in n) {
      const hit = findInList(n.children, id, pageId, n);
      if (hit)
        return hit;
    }
  }
  return null;
}
var OVERRIDE_FORBIDDEN = new Set(["id", "type", "children", "componentId", "overrides"]);
function sanitizePatch(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch))
    if (!OVERRIDE_FORBIDDEN.has(k) && v !== undefined)
      out[k] = v;
  return out;
}
function findComponent(doc, id) {
  for (const c of doc.components ?? [])
    if (c.id === id)
      return c;
  return null;
}
function componentBounds(comp) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of comp.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  if (!Number.isFinite(minX))
    return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function resolveInstanceBounds(doc, inst) {
  const comp = findComponent(doc, inst.componentId);
  if (!comp || !comp.nodes.length)
    return null;
  return componentBounds(comp);
}
function instanceScale(doc, inst) {
  const b = resolveInstanceBounds(doc, inst);
  if (!b || b.w <= 0 || b.h <= 0 || inst.w <= 0 || inst.h <= 0)
    return { kx: 1, ky: 1 };
  return { kx: inst.w / b.w, ky: inst.h / b.h };
}
function applyOverridePatch(n, patch) {
  const merged = { ...n, ...sanitizePatch(patch) };
  if (n.type === "text" && typeof patch.text === "string" && patch.runs === undefined)
    merged.runs = [{ ...n.runs[0] ?? {}, text: patch.text }];
  const outer = patch.overrides;
  if (n.type === "instance" && typeof outer === "object" && outer !== null)
    merged.overrides = { ...n.overrides ?? {}, ...outer };
  const back = parseNode(merged, new Set([merged.id]));
  if (!back)
    return n;
  back.id = n.id;
  back.type = n.type;
  if ("children" in n && "children" in back)
    back.children = n.children;
  return back;
}
function applyOverrides(nodes, ov) {
  if (!ov)
    return nodes;
  const step = (list) => list.map((n) => {
    let m = ov[n.id] ? applyOverridePatch(n, ov[n.id]) : n;
    if ("children" in n) {
      const kids = step(n.children);
      if (kids !== n.children)
        m = { ...m, children: kids };
    }
    return m;
  });
  return step(nodes);
}
function resolveInstanceContent(doc, inst) {
  const comp = findComponent(doc, inst.componentId);
  if (!comp || !comp.nodes.length)
    return null;
  return applyOverrides(comp.nodes, inst.overrides);
}
function findDeepNode(list, id) {
  for (const n of list) {
    if (n.id === id)
      return n;
    if ("children" in n) {
      const hit = findDeepNode(n.children, id);
      if (hit)
        return hit;
    }
  }
  return null;
}
function findDeepNodeWithParent(list, id, parent) {
  for (const n of list) {
    if (n.id === id)
      return { node: n, parent };
    if ("children" in n) {
      const hit = findDeepNodeWithParent(n.children, id, n);
      if (hit)
        return hit;
    }
  }
  return null;
}
var viewRound = (v) => Math.round(v * 100) / 100;
function instanceView(doc, inst, depth = 0) {
  if (depth > 6)
    return null;
  const b = resolveInstanceBounds(doc, inst);
  if (!b)
    return null;
  const content = resolveInstanceContent(doc, inst);
  const { kx, ky } = instanceScale(doc, inst);
  const kAvg = (kx + ky) / 2;
  const prefix = `${inst.id}/`;
  const step = (list, root) => list.map((n) => {
    let m = {
      ...n,
      id: prefix + n.id,
      x: viewRound((root ? n.x - b.x : n.x) * kx),
      y: viewRound((root ? n.y - b.y : n.y) * ky),
      w: Math.max(0.5, viewRound(n.w * kx)),
      h: Math.max(0.5, viewRound(n.h * ky))
    };
    m = scaleStyleFields(m, kAvg);
    if ("children" in n)
      m = { ...m, children: step(n.children, false) };
    return m;
  });
  return step(content, true);
}
function unBakePatch(doc, inst, patch, isRoot) {
  const b = resolveInstanceBounds(doc, inst);
  const { kx, ky } = instanceScale(doc, inst);
  const kAvg = (kx + ky) / 2;
  if (!b)
    return { ...patch };
  const out = { ...patch };
  const n = (v) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const px = n(patch.x);
  if (px !== undefined)
    out.x = viewRound(kx === 0 ? px : isRoot ? px / kx + b.x : px / kx);
  const py = n(patch.y);
  if (py !== undefined)
    out.y = viewRound(ky === 0 ? py : isRoot ? py / ky + b.y : py / ky);
  const pw = n(patch.w);
  if (pw !== undefined)
    out.w = Math.max(0.5, viewRound(kx === 0 ? pw : pw / kx));
  const ph = n(patch.h);
  if (ph !== undefined)
    out.h = Math.max(0.5, viewRound(ky === 0 ? ph : ph / ky));
  if (kAvg > 0 && kAvg !== 1) {
    if (Array.isArray(patch.runs))
      out.runs = patch.runs.map((r) => typeof r?.size === "number" ? { ...r, size: viewRound(r.size / kAvg) } : r);
    if (typeof patch.strokeWidth === "number")
      out.strokeWidth = viewRound(patch.strokeWidth / kAvg);
    if (typeof patch.radius === "number")
      out.radius = viewRound(patch.radius / kAvg);
    if (Array.isArray(patch.strokes))
      out.strokes = patch.strokes.map((s) => ({ ...s, width: viewRound(s.width / kAvg) }));
  }
  return out;
}
function patchInstancePath(doc, inst, segs, patch) {
  if (!segs.length || segs.length > 8)
    return null;
  const view = instanceView(doc, inst);
  if (!view)
    return null;
  const head = segs[0];
  const rest = segs.slice(1);
  const targetId = `${inst.id}/${head}`;
  const target = findDeepNode(view, targetId);
  if (!target)
    return null;
  const ov = inst.overrides ?? {};
  if (!rest.length) {
    const isRoot = view.some((n) => n.id === targetId);
    const merged = { ...ov[head] ?? {}, ...sanitizePatch(unBakePatch(doc, inst, patch, isRoot)) };
    return { ...inst, overrides: { ...ov, [head]: merged } };
  }
  if (target.type !== "instance")
    return null;
  const nested = patchInstancePath(doc, target, rest, patch);
  if (!nested)
    return null;
  return { ...inst, overrides: { ...ov, [head]: { ...ov[head] ?? {}, overrides: nested.overrides } } };
}
function scaleStyleFields(n, k) {
  if (k === 1 || !Number.isFinite(k) || k <= 0)
    return n;
  if (n.type === "text")
    return { ...n, runs: n.runs.map((r) => ({ ...r, size: r.size === undefined ? r.size : viewRound(r.size * k) })) };
  const out = { ...n };
  const anyN = out;
  if (typeof anyN.strokeWidth === "number")
    anyN.strokeWidth = viewRound(anyN.strokeWidth * k);
  if (typeof anyN.radius === "number")
    anyN.radius = viewRound(anyN.radius * k);
  if (Array.isArray(anyN.strokes))
    anyN.strokes = anyN.strokes.map((s) => ({ ...s, width: viewRound(s.width * k) }));
  return out;
}
function bakeInstanceNodes(doc, inst, depth = 0) {
  if (depth > 6)
    return null;
  const view = instanceView(doc, inst);
  if (!view)
    return null;
  const expand = (list) => {
    const out = [];
    for (const n of list) {
      if (n.type === "instance") {
        const inner = bakeInstanceNodes(doc, n, depth + 1);
        if (inner) {
          out.push(...inner.map((c) => ({ ...c, x: viewRound(c.x + n.x), y: viewRound(c.y + n.y) })));
          continue;
        }
      }
      if ("children" in n)
        out.push({ ...n, children: expand(n.children) });
      else
        out.push(n);
    }
    return out;
  };
  return expand(view);
}
function allFrames(doc) {
  const out = [];
  for (const p of doc.pages)
    for (const n of p.nodes)
      if (n.type === "frame")
        out.push({ pageId: p.id, frame: n });
  return out;
}
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var num = (v, d = 0) => {
  if (typeof v === "number" && Number.isFinite(v))
    return v;
  if (typeof v === "string") {
    const s = v.trim().replace(/px$/i, "");
    if (s !== "" && Number.isFinite(Number(s)))
      return Number(s);
  }
  return d;
};
var str = (v, d = "") => typeof v === "string" ? v : d;
var boolish = (v, d) => v === true || v === "true" || v === 1 || v === "1" ? true : v === false || v === "false" || v === 0 || v === "0" ? false : d;
function pick(o, ...keys) {
  for (const k of keys)
    if (o[k] !== undefined && o[k] !== null)
      return o[k];
  return;
}
var HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
var NAMED_COLORS = {
  black: "#000000",
  white: "#ffffff",
  gray: "#808080",
  grey: "#808080",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#008000",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  silver: "#c0c0c0",
  navy: "#000080",
  teal: "#008080",
  lime: "#00ff00",
  cyan: "#00ffff",
  magenta: "#ff00ff"
};
var FUNC_COLOR = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;
var channel = (s) => {
  const v = s.endsWith("%") ? Number(s.slice(0, -1)) / 100 * 255 : Number(s);
  return Math.min(255, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
};
var colorOr = (v, d) => {
  if (typeof v !== "string")
    return d;
  const s = v.trim();
  if (s.startsWith("var:") && s.length > 4)
    return s;
  if (HEX.test(s))
    return s.toLowerCase();
  const named = NAMED_COLORS[s.toLowerCase()];
  if (named)
    return named;
  const m = FUNC_COLOR.exec(s);
  if (m) {
    const hex = `#${channel(m[1]).toString(16).padStart(2, "0")}${channel(m[2]).toString(16).padStart(2, "0")}${channel(m[3]).toString(16).padStart(2, "0")}`;
    if (m[4] === undefined)
      return hex;
    const a = m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    const alpha = Math.min(255, Math.max(0, Math.round((Number.isFinite(a) ? a : 1) * 255)));
    return alpha >= 255 ? hex : `${hex}${alpha.toString(16).padStart(2, "0")}`;
  }
  return d;
};
var opacity01 = (v, d = 1) => {
  if (typeof v === "string" && v.trim().endsWith("%"))
    return clamp(num(v.trim().slice(0, -1), d * 100) / 100, 0, 1);
  return v === undefined ? d : clamp(num(v, d), 0, 1);
};
var MISSING_VAR_COLOR = "#e8506e";
var isVarRef = (c) => typeof c === "string" && c.startsWith("var:") && c.length > 4;
var varRefId = (c) => c.slice(4);
function resolveVarColor(doc, color, fallback = "#000000", depth = 0) {
  if (!color)
    return fallback;
  if (!isVarRef(color))
    return color;
  if (depth > 4)
    return MISSING_VAR_COLOR;
  const def = doc?.variables?.find((v) => v.id === color.slice(4));
  if (!def)
    return MISSING_VAR_COLOR;
  return resolveVarColor(doc, def.value, MISSING_VAR_COLOR, depth + 1);
}
function collectVarRefs(doc) {
  const out = new Map;
  const bump = (c) => {
    if (isVarRef(c))
      out.set(c.slice(4), (out.get(c.slice(4)) ?? 0) + 1);
  };
  const walk = (n) => {
    for (const f of n.fills ?? []) {
      bump(f.color);
      for (const s of f.stops ?? [])
        bump(s.color);
    }
    for (const s of n.strokes ?? [])
      bump(s.color);
    for (const e of n.effects ?? [])
      bump(e.color);
    for (const r of n.runs ?? [])
      bump(r.color);
    for (const r of n.text?.runs ?? [])
      bump(r.color);
    bump(n.color);
  };
  for (const { node } of walkDoc(doc))
    walk(node);
  for (const comp of doc.components ?? [])
    for (const n of walkNodes(comp.nodes))
      walk(n);
  return out;
}
var mapVarColor = (c, map) => {
  if (!isVarRef(c))
    return c;
  const v = map.get(c.slice(4));
  if (v === undefined)
    return c;
  return v.startsWith("var:") || v.startsWith("#") ? v : `var:${v}`;
};
var remapColorObj = (o, map) => {
  const rec = o;
  if (!rec || typeof rec !== "object" || typeof rec.color !== "string")
    return o;
  const nc = mapVarColor(rec.color, map);
  return nc === rec.color ? o : { ...rec, color: nc };
};
var remapColorPaint = (f, map) => {
  const g = remapColorObj(f, map);
  if (Array.isArray(g.stops))
    g.stops = g.stops.map((s) => remapColorObj(s, map));
  return g;
};
function remapVarColors(list, map) {
  for (const n of list) {
    const rec = n;
    if (Array.isArray(rec.fills))
      rec.fills = rec.fills.map((f) => remapColorPaint(f, map));
    if (Array.isArray(rec.strokes))
      rec.strokes = rec.strokes.map((s) => remapColorObj(s, map));
    if (Array.isArray(rec.effects))
      rec.effects = rec.effects.map((e) => remapColorObj(e, map));
    if (Array.isArray(rec.runs))
      rec.runs = rec.runs.map((r) => remapColorObj(r, map));
    if (typeof rec.color === "string")
      rec.color = mapVarColor(rec.color, map);
    if (rec.overrides && typeof rec.overrides === "object") {
      for (const v of Object.values(rec.overrides))
        if (v && typeof v === "object")
          remapVarColors([v], map);
    }
    if ("children" in n && Array.isArray(n.children))
      remapVarColors(n.children, map);
  }
}
function parseVariables(raw, warn) {
  if (!Array.isArray(raw))
    return;
  const out = [];
  const seen = new Set;
  for (const item of raw.slice(0, 100)) {
    if (typeof item !== "object" || item === null)
      continue;
    const o = item;
    const id = str(o.id).slice(0, 60);
    const name = str(o.name).slice(0, 60);
    if (!id || !name) {
      warn?.("\u53D8\u91CF\u7F3A id/name\uFF0C\u5DF2\u8DF3\u8FC7");
      continue;
    }
    if (seen.has(id)) {
      warn?.(`\u53D8\u91CF id \u91CD\u590D\u5DF2\u53BB\u91CD\uFF1A${id}`);
      continue;
    }
    seen.add(id);
    const def = { id, name, value: colorOr(o.value, "#000000") };
    const desc = str(o.desc).slice(0, 200);
    if (desc)
      def.desc = desc;
    out.push(def);
  }
  return out.length ? out : undefined;
}
function parseFill(raw) {
  if (typeof raw !== "object" || raw === null)
    return null;
  const o = raw;
  if (o.type === "image") {
    const src = pickStr(o, "src", "image", "url", "path");
    if (!src)
      return null;
    const f = { type: "image", src: src.slice(0, 600) };
    if (boolish(o.visible, true) === false)
      f.visible = false;
    const op = opacity01(o.opacity ?? o.alpha, 1);
    if (op < 1)
      f.opacity = op;
    const mode = str(o.scaleMode ?? o.fit).toLowerCase();
    if (mode === "fit" || mode === "contain" || mode === "scale-down")
      f.scaleMode = "fit";
    else if (mode === "stretch" || mode === "fill-stretch")
      f.scaleMode = "stretch";
    else
      f.scaleMode = "fill";
    return f;
  }
  const rawType = o.type ?? o.kind;
  let type = rawType === "linear" || rawType === "linear-gradient" || rawType === "gradient" ? "linear" : rawType === "radial" || rawType === "radial-gradient" ? "radial" : rawType === "solid" || rawType === undefined ? "solid" : null;
  if (!type)
    return null;
  const f = { type };
  if (boolish(o.visible, true) === false)
    f.visible = false;
  const op = opacity01(o.opacity ?? o.alpha, 1);
  if (op < 1)
    f.opacity = op;
  if (type === "solid") {
    const stop0 = Array.isArray(o.stops) && o.stops[0] && typeof o.stops[0] === "object" ? o.stops[0].color : undefined;
    f.color = colorOr(pick(o, "color", "fill", "value") ?? stop0, "#d9d9d9");
  } else {
    const stops = [];
    if (Array.isArray(o.stops)) {
      for (const s of o.stops) {
        if (typeof s !== "object" || s === null)
          continue;
        const so = s;
        stops.push({ at: clamp(num(so.at ?? so.offset ?? so.position, 0), 0, 1), color: colorOr(so.color, "#000000") });
        if (stops.length >= 8)
          break;
      }
    }
    if (stops.length === 0) {
      const from = colorOr(pick(o, "from", "start", "colorA"), "#4f46e5");
      const to = colorOr(pick(o, "to", "end", "colorB"), "#06b6d4");
      stops.push({ at: 0, color: from }, { at: 1, color: to });
    }
    stops.sort((a, b) => a.at - b.at);
    f.stops = stops;
    if (type === "linear") {
      const rawAngle = pick(o, "angle", "rotation", "deg", "direction");
      let a = num(rawAngle, NaN);
      if (!Number.isFinite(a)) {
        const dirMap = { "to bottom": 180, "to top": 0, "to right": 90, "to left": 270, bottom: 180, top: 0, right: 90, left: 270 };
        a = dirMap[String(rawAngle ?? "").trim().toLowerCase()] ?? 0;
      }
      if (a !== 0 && Number.isFinite(a))
        f.angle = (a % 360 + 360) % 360;
    } else {
      const c = typeof o.center === "object" && o.center !== null ? o.center : null;
      if (c && (typeof c.x === "number" || typeof c.y === "number")) {
        f.center = { x: clamp(num(c.x, 0.5), 0, 1), y: clamp(num(c.y, 0.5), 0, 1) };
      }
    }
  }
  return f;
}
function parseStrokes(raw) {
  const list = Array.isArray(raw) ? raw : typeof raw === "object" && raw !== null ? [raw] : [];
  const out = [];
  for (const s of list) {
    if (typeof s !== "object" || s === null)
      continue;
    const so = s;
    const st = {
      color: colorOr(pick(so, "color", "stroke", "value"), "#111111"),
      width: clamp(num(pick(so, "width", "strokeWidth", "size"), 1), 0, 40)
    };
    if (so.align === "inside" || so.align === "outside")
      st.align = so.align;
    if (so.style === "dashed" || so.style === "dotted")
      st.style = so.style;
    if (boolish(so.visible, true) === false)
      st.visible = false;
    out.push(st);
    if (out.length >= 4)
      break;
  }
  return out;
}
function parseEffects(raw) {
  if (!Array.isArray(raw) || raw.length === 0)
    return;
  const out = [];
  for (const e of raw) {
    if (typeof e !== "object" || e === null)
      continue;
    const eo = e;
    if (eo.type === "drop-shadow" || eo.type === "inner-shadow") {
      out.push({
        type: eo.type,
        visible: eo.visible === false ? false : undefined,
        color: colorOr(eo.color, "#000000"),
        x: clamp(num(eo.x, 0), -200, 200),
        y: clamp(num(eo.y, 4), -200, 200),
        blur: clamp(num(eo.blur, 12), 0, 200)
      });
    } else if (eo.type === "layer-blur") {
      out.push({ type: "layer-blur", visible: eo.visible === false ? false : undefined, blur: clamp(num(eo.blur, 8), 0, 100) });
    }
    if (out.length >= 4)
      break;
  }
  return out.length ? out : undefined;
}
function parseRadius(raw) {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const o = raw;
    if (typeof o.x === "number" || typeof o.y === "number") {
      const v = [clamp(num(o.y, 0), 0, 4096), clamp(num(o.x, 0), 0, 4096), clamp(num(o.y, 0), 0, 4096), clamp(num(o.x, 0), 0, 4096)];
      return v.some((r) => r !== 0) ? [v[0], v[1], v[2], v[3]] : undefined;
    }
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw === 0)
      return;
    return clamp(raw, 0, 4096);
  }
  if (Array.isArray(raw) && raw.length === 4) {
    const v = raw.map((r) => clamp(num(r, 0), 0, 4096));
    return v.some((r) => r !== 0) ? [v[0], v[1], v[2], v[3]] : undefined;
  }
  return;
}
function parseRun(raw) {
  if (typeof raw !== "object" || raw === null)
    return null;
  const o = raw;
  if (typeof o.text !== "string")
    return null;
  const r = { text: o.text.slice(0, 20000) };
  const color = pick(o, "color", "fill", "fontColor", "textColor");
  if (color !== undefined)
    r.color = colorOr(color, "#111111");
  const size = pick(o, "size", "fontSize");
  if (size !== undefined)
    r.size = clamp(num(size, 16), 1, 400);
  const weight = pick(o, "weight", "fontWeight");
  if (weight !== undefined)
    r.weight = clamp(num(weight, 400), 100, 1000);
  if (boolish(pick(o, "italic", "isItalic"), false))
    r.italic = true;
  if (boolish(pick(o, "underline", "isUnderline"), false))
    r.underline = true;
  const font = pick(o, "font", "fontFamily");
  if (typeof font === "string" && font.trim())
    r.font = font.slice(0, 120);
  return r;
}
function pickStr(o, ...keys) {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim())
      return v;
  }
  return;
}
var TYPE_ALIASES = {
  rectangle: "rect",
  square: "rect",
  box: "rect",
  circle: "ellipse",
  oval: "ellipse",
  textbox: "text",
  paragraph: "text",
  label: "text",
  img: "image",
  picture: "image",
  photo: "image",
  bitmap: "image",
  artboard: "frame",
  screen: "frame",
  glyph: "icon",
  lucide: "icon",
  lucideicon: "icon",
  iconnode: "icon",
  path: "vector",
  shape: "vector",
  componentinstance: "instance",
  symbolinstance: "instance",
  instance: "instance"
};
function normalizeNodeType(t) {
  if (typeof t !== "string")
    return null;
  const key = t.trim().toLowerCase();
  if (key === "frame" || key === "group" || key === "rect" || key === "ellipse" || key === "triangle" || key === "diamond" || key === "pentagon" || key === "hexagon" || key === "star" || key === "line" || key === "arrow" || key === "text" || key === "image" || key === "icon" || key === "vector" || key === "instance") {
    return key;
  }
  return TYPE_ALIASES[key] ?? null;
}
function parseNode(raw, seenIds, warn) {
  if (typeof raw !== "object" || raw === null)
    return null;
  const o = raw;
  const t = normalizeNodeType(o.type);
  if (!t) {
    warn?.(`\u672A\u77E5\u8282\u70B9\u7C7B\u578B "${String(o.type).slice(0, 40)}"\uFF08\u8282\u70B9\u88AB\u8DF3\u8FC7\uFF09`);
    return null;
  }
  let id = str(o.id);
  if (!id || seenIds.has(id))
    id = uid(t[0]);
  seenIds.add(id);
  const name0 = str(o.name);
  const base = {
    id,
    name: (name0 || TYPE_LABELS[t] || String(t)).slice(0, 120),
    x: clamp(num(o.x), -1e5, 1e5),
    y: clamp(num(o.y), -1e5, 1e5),
    w: clamp(num(o.w, 100), 1, 20000),
    h: clamp(num(o.h, 100), 1, 20000)
  };
  const rot = num(o.rotation, 0);
  if (rot !== 0)
    base.rotation = (rot % 360 + 360) % 360;
  const op = opacity01(o.opacity, 1);
  if (op < 1)
    base.opacity = op;
  if (boolish(o.visible, true) === false)
    base.visible = false;
  if (boolish(o.locked, false))
    base.locked = true;
  const radius = parseRadius(pick(o, "radius", "cornerRadius", "borderRadius", "corner_radius"));
  if (radius !== undefined)
    base.radius = radius;
  const effects = parseEffects(o.effects);
  if (effects)
    base.effects = effects;
  const interactions = parseInteractions(pick(o, "interactions", "prototype", "triggers"));
  if (interactions)
    base.interactions = interactions;
  if (typeof o.onTap === "object" && o.onTap !== null) {
    const to = str(o.onTap.to);
    if (to)
      base.onTap = { to: to.slice(0, 120) };
  }
  if (boolish(o.mask, false))
    base.mask = true;
  const gr = num(o.grow, 0);
  if (gr > 0)
    base.grow = clamp(gr, 0, 100);
  const blend = normalizeBlendMode(pick(o, "blendMode", "blend", "mixBlendMode"));
  if (blend)
    base.blendMode = blend;
  if (boolish(pick(o, "flipX", "flipH", "mirrorX"), false))
    base.flipX = true;
  if (boolish(pick(o, "flipY", "flipV", "mirrorY"), false))
    base.flipY = true;
  if (t === "frame" || t === "group") {
    const children = parseChildren(o.children, seenIds, warn);
    if (t === "group")
      return { ...base, type: "group", children };
    const node = { ...base, type: "frame", children, fills: fillsForNode(o) };
    const strokes = strokesForNode(o);
    if (strokes.length)
      node.strokes = strokes;
    if (o.clip === false)
      node.clip = false;
    if (typeof o.preset === "string" && o.preset in DEVICE_PRESETS)
      node.preset = o.preset;
    const layout = normalizeLayout(o.layout);
    if (layout)
      node.layout = layout;
    const scroll = normalizeScrollAxis(pick(o, "scroll", "scrollAxis", "overflow"));
    if (scroll)
      node.scroll = scroll;
    return node;
  }
  if (t === "text") {
    const rawRuns = Array.isArray(o.runs) ? o.runs : [o];
    const runs = rawRuns.map(parseRun).filter((r) => r !== null);
    const node = { ...base, type: "text", runs: runs.length ? runs.slice(0, 64) : [{ text: "\u6587\u672C" }] };
    if (o.align === "center" || o.align === "right")
      node.align = o.align;
    if (o.vAlign === "middle" || o.vAlign === "bottom")
      node.vAlign = o.vAlign;
    if (o.lineHeight !== undefined)
      node.lineHeight = clamp(num(o.lineHeight, 1.4), 0.5, 4);
    if (o.letterSpacing !== undefined)
      node.letterSpacing = clamp(num(o.letterSpacing, 0), -20, 40);
    return node;
  }
  if (t === "image") {
    const node = { ...base, type: "image", src: str(pickStr(o, "src", "url", "href", "path") ?? "").slice(0, 600) };
    const fit = str(o.fit).toLowerCase();
    if (fit === "contain" || fit === "stretch" || fit === "scale-down")
      node.fit = fit === "scale-down" ? "contain" : fit;
    else if (fit === "fill" || fit === "crop")
      node.fit = fit === "fill" ? "stretch" : "cover";
    const strokes = strokesForNode(o);
    if (strokes.length)
      node.strokes = strokes;
    return node;
  }
  if (t === "icon") {
    const wanted = pickStr(o, "icon", "iconName", "glyph", "symbol") ?? pickStr(o, "name") ?? "";
    const resolved = resolveIconName(wanted);
    if (wanted && !resolved)
      warn?.(`\u672A\u77E5\u56FE\u6807\u540D "${wanted.slice(0, 60)}"\uFF08\u5C06\u753B\u5360\u4F4D\uFF09`);
    const node = {
      ...base,
      type: "icon",
      icon: resolved ?? wanted ?? DEFAULT_ICON,
      color: colorOr(pick(o, "color", "tint", "stroke", "fill"), "#111111"),
      strokeWidth: clamp(num(pick(o, "strokeWidth", "thickness", "weight"), 2), 0.25, 12)
    };
    if (!name0 && resolved)
      node.name = resolved;
    return node;
  }
  if (t === "vector") {
    const d = pickStr(o, "path", "d");
    if (!d) {
      warn?.("vector \u8282\u70B9\u7F3A\u5C11 path\uFF08SVG d \u5B57\u7B26\u4E32\uFF09\uFF0C\u5DF2\u8DF3\u8FC7");
      return null;
    }
    const node = { ...base, type: "vector", path: d.slice(0, 40000), fills: fillsForNode(o), strokes: strokesForNode(o) };
    return node;
  }
  if (t === "instance") {
    const ref = pickStr(o, "componentId", "component", "ref", "mainComponent", "componentRef");
    const node = { ...base, type: "instance", componentId: (ref ?? "").trim().slice(0, 120) };
    if (!ref)
      warn?.("instance \u7F3A componentId\uFF08\u6E32\u67D3\u5360\u4F4D\u6846\uFF0C\u8BF7\u7528 list_components \u67E5\u4E3B\u6863 id\uFF09");
    if (o.w === undefined)
      node.w = 0;
    if (o.h === undefined)
      node.h = 0;
    const ov = parseOverrides(o.overrides);
    if (ov)
      node.overrides = ov;
    return node;
  }
  if (t === "line" || t === "arrow") {
    const node = { ...base, type: t, strokes: strokesForNode(o) };
    if (!node.strokes.length)
      node.strokes = [{ color: "#111111", width: 2 }];
    const d = num(o.dir, 0);
    if (d === 1 || d === 2 || d === 3)
      node.dir = d;
    return node;
  }
  const node = { ...base, type: t, fills: fillsForNode(o), strokes: strokesForNode(o) };
  const lt = parseLayerText(pick(o, "text", "label", "layerText"));
  if (lt)
    node.text = lt;
  return node;
}
function parseLayerText(raw) {
  if (raw === undefined || raw === null)
    return null;
  const box = typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const src = box ? pick(box, "runs", "text", "label") : raw;
  if (src === undefined || src === null)
    return null;
  const rawRuns = Array.isArray(src) ? src : typeof src === "string" ? [{ text: src }] : [src];
  const runs = rawRuns.map(parseRun).filter((r) => r !== null).slice(0, 64);
  if (runs.length === 0 || runs.every((r) => !r.text))
    return null;
  const out = { runs };
  if (box) {
    if (box.align === "left" || box.align === "right")
      out.align = box.align;
    if (box.vAlign === "top" || box.vAlign === "bottom")
      out.vAlign = box.vAlign;
    if (box.lineHeight !== undefined)
      out.lineHeight = clamp(num(box.lineHeight, 1.4), 0.5, 4);
    if (box.letterSpacing !== undefined)
      out.letterSpacing = clamp(num(box.letterSpacing, 0), -20, 40);
  }
  return out;
}
var layerText = (n) => n.type === "text" ? null : n.text ?? null;
function nodeTextRuns(n) {
  if (n.type === "text")
    return n.runs;
  return layerText(n)?.runs ?? [];
}
function parseFills(raw) {
  if (!Array.isArray(raw))
    return [];
  const out = [];
  for (const f of raw) {
    const p = parseFill(f);
    if (p)
      out.push(p);
    if (out.length >= 4)
      break;
  }
  return out;
}
function fillsShorthand(o) {
  const v = pick(o, "fill", "background", "bg", "fillColor", "backgroundColor");
  if (v === undefined)
    return [];
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (!s || s === "none" || s === "transparent")
      return [];
    const c = colorOr(v, "");
    return c ? [{ type: "solid", color: c }] : [];
  }
  const f = parseFill(v);
  return f ? [f] : [];
}
function strokesShorthand(o) {
  const v = pick(o, "stroke", "border", "borderColor", "outline");
  if (v === undefined)
    return [];
  if (typeof v === "string") {
    const c = colorOr(v, "");
    if (!c)
      return [];
    return [{ color: c, width: clamp(num(pick(o, "strokeWidth", "borderWidth", "outlineWidth"), 1), 0, 40) }];
  }
  const st = parseStrokes([v]);
  const w = pick(o, "strokeWidth", "borderWidth", "outlineWidth");
  if (st[0] && w !== undefined)
    st[0].width = clamp(num(w, 1), 0, 40);
  return st;
}
function fillsForNode(o) {
  return Array.isArray(o.fills) ? parseFills(o.fills) : fillsShorthand(o);
}
function strokesForNode(o) {
  return Array.isArray(o.strokes) ? parseStrokes(o.strokes) : strokesShorthand(o);
}
function normalizeLayout(raw) {
  if (typeof raw !== "object" || raw === null)
    return;
  const o = raw;
  const modeRaw = str(pick(o, "mode", "direction", "orientation")).toLowerCase();
  const mode = modeRaw === "h" || modeRaw === "horizontal" || modeRaw === "row" ? "h" : modeRaw === "v" || modeRaw === "vertical" || modeRaw === "column" ? "v" : null;
  if (!mode)
    return;
  const lo = { mode };
  const gap = num(pick(o, "gap", "itemSpacing", "spacing"), 0);
  if (gap > 0)
    lo.gap = clamp(gap, 0, 2000);
  const p = o.padding;
  if (typeof p === "number") {
    const v = clamp(num(p, 0), 0, 1000);
    if (v > 0)
      lo.padding = [v, v, v, v];
  } else if (Array.isArray(p) && p.length === 4) {
    const q = p.map((x) => clamp(num(x, 0), 0, 1000));
    if (q.some((x) => x > 0))
      lo.padding = [q[0], q[1], q[2], q[3]];
  }
  const mainMap = {
    start: "start",
    min: "start",
    "flex-start": "start",
    center: "center",
    middle: "center",
    end: "end",
    max: "end",
    "flex-end": "end",
    between: "between",
    "space-between": "between"
  };
  const main = mainMap[str(pick(o, "main", "primaryAxisAlignItems", "justifyContent")).toLowerCase()];
  if (main && main !== "start")
    lo.main = main;
  const crossMap = {
    start: "start",
    min: "start",
    "flex-start": "start",
    center: "center",
    middle: "center",
    end: "end",
    max: "end",
    "flex-end": "end",
    stretch: "stretch",
    fill: "stretch"
  };
  const cross = crossMap[str(pick(o, "cross", "counterAxisAlignItems", "alignItems")).toLowerCase()];
  if (cross && cross !== "start")
    lo.cross = cross;
  if (o.wrap === true || o.wrap === "true")
    lo.wrap = true;
  const hugRaw = str(pick(o, "hug", "sizing")).toLowerCase();
  const hugMap = {
    main: "main",
    cross: "cross",
    both: "both",
    all: "both",
    none: undefined,
    fixed: undefined,
    "": undefined
  };
  const hug = hugMap[hugRaw];
  if (hug)
    lo.hug = hug;
  return lo;
}
function parseOverrides(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return;
  const out = {};
  for (const [k, v] of Object.entries(raw).slice(0, 300)) {
    if (!k.trim())
      continue;
    if (typeof v !== "object" || v === null || Array.isArray(v))
      continue;
    const patch = {};
    for (const [fk, fv] of Object.entries(v)) {
      if (fk === "id" || fk === "type" || fk === "children" || fk === "componentId" || fk === "overrides")
        continue;
      if (fv === undefined)
        continue;
      patch[fk] = fv;
    }
    if (Object.keys(patch).length)
      out[k.trim().slice(0, 120)] = patch;
  }
  return Object.keys(out).length ? out : undefined;
}
function parseComponents(raw, warn) {
  if (!Array.isArray(raw))
    return;
  const seen = new Set;
  const out = [];
  for (const c of raw) {
    if (typeof c !== "object" || c === null)
      continue;
    const o = c;
    let id = str(o.id).trim();
    if (!id) {
      warn?.("\u7EC4\u4EF6\u4E3B\u6863\u7F3A id\uFF08\u5DF2\u8DF3\u8FC7\uFF09");
      continue;
    }
    if (seen.has(id))
      id = uid("c");
    seen.add(id);
    const nodes = parseChildren(o.nodes ?? o.children, seen, warn);
    if (!nodes.length) {
      warn?.(`\u7EC4\u4EF6 "${id}" \u4E3B\u6863\u4E3A\u7A7A\uFF08\u5DF2\u8DF3\u8FC7\uFF09`);
      continue;
    }
    out.push({ id, name: str(o.name, id).slice(0, 120), nodes });
    if (out.length >= 200)
      break;
  }
  return out.length ? out : undefined;
}
function syncSentinelInstanceSizes(doc) {
  const list = [...walkDoc(doc)].map(({ node }) => node);
  for (const comp of doc.components ?? [])
    list.push(...walkNodes(comp.nodes));
  for (const node of list) {
    if (node.type !== "instance" || node.w > 0 && node.h > 0)
      continue;
    const b = resolveInstanceBounds(doc, node);
    if (node.w === 0)
      node.w = Math.max(1, b?.w ?? 100);
    if (node.h === 0)
      node.h = Math.max(1, b?.h ?? 100);
  }
}
function parseChildren(raw, seenIds, warn) {
  if (!Array.isArray(raw))
    return [];
  const out = [];
  for (const c of raw) {
    const n = parseNode(c, seenIds, warn);
    if (n)
      out.push(n);
    if (out.length >= 500)
      break;
  }
  return out;
}
function parsePage(raw, seenIds, warn) {
  if (typeof raw !== "object" || raw === null)
    return null;
  const o = raw;
  let id = str(o.id);
  if (!id || seenIds.has(id))
    id = uid("p");
  seenIds.add(id);
  return { id, name: str(o.name, "\u9875\u9762").slice(0, 80), nodes: parseChildren(o.nodes, seenIds, warn) };
}
function parseDesignDoc(json) {
  const warnings = [];
  let raw;
  let fixes;
  try {
    raw = JSON.parse(json);
  } catch {
    const fixed = fixJsonText(json);
    if (!fixed.changed)
      return { doc: blankDoc(), warnings: ["JSON \u65E0\u6CD5\u89E3\u6790"], fatal: true };
    try {
      raw = JSON.parse(fixed.text);
      fixes = fixed.fixes;
      warnings.push(`\u5DF2\u81EA\u52A8\u4FEE\u590D JSON\uFF1A${fixed.fixes.join("\u3001")}`);
    } catch {
      return { doc: blankDoc(), warnings: ["JSON \u65E0\u6CD5\u89E3\u6790\uFF08\u81EA\u52A8\u4FEE\u590D\u540E\u4ECD\u5931\u8D25\uFF09"], fatal: true, fixes: fixed.fixes };
    }
  }
  if (typeof raw !== "object" || raw === null)
    return { doc: blankDoc(), warnings: ["\u6587\u6863\u4E0D\u662F\u5BF9\u8C61"], fatal: true };
  const o = raw;
  const seenIds = new Set;
  const warnCounts = new Map;
  const warn = (msg) => warnCounts.set(msg, (warnCounts.get(msg) ?? 0) + 1);
  const meta = typeof o.meta === "object" && o.meta !== null ? o.meta : {};
  const pages = [];
  if (Array.isArray(o.pages)) {
    for (const p of o.pages) {
      const page = parsePage(p, seenIds, warn);
      if (page)
        pages.push(page);
      if (pages.length >= 20)
        break;
    }
  }
  if (pages.length === 0)
    pages.push({ id: uid("p"), name: "\u9875\u9762 1", nodes: [] });
  let activePage = str(o.activePage);
  if (!pages.some((p) => p.id === activePage))
    activePage = pages[0].id;
  const components = parseComponents(o.components, warn);
  const variables = parseVariables(o.variables, warn);
  for (const [msg, n] of warnCounts)
    warnings.push(n > 1 ? `${msg} \xD7${n}` : msg);
  const doc = {
    version: DOC_VERSION,
    meta: { name: str(meta.name, "UI \u8BBE\u8BA1").slice(0, 120) || "UI \u8BBE\u8BA1", kind: "uidesign" },
    activePage,
    pages,
    ...components ? { components } : {},
    ...variables ? { variables } : {}
  };
  syncSentinelInstanceSizes(doc);
  if (components) {
    const ids = new Set(components.map((c) => c.id));
    const missing = new Set;
    for (const { node } of walkDoc(doc))
      if (node.type === "instance" && node.componentId && !ids.has(node.componentId))
        missing.add(node.componentId);
    for (const m of [...missing].slice(0, 8))
      warnings.push(`\u5B9E\u4F8B\u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u7EC4\u4EF6 "${m.slice(0, 40)}"\uFF08\u663E\u793A\u5360\u4F4D\u6846\uFF09`);
  }
  if (variables) {
    const ids = new Set(variables.map((v) => v.id));
    const missing = [...collectVarRefs(doc).keys()].filter((id) => !ids.has(id)).slice(0, 8);
    for (const m of missing)
      warnings.push(`\u989C\u8272\u5F15\u7528\u4E86\u672A\u5B9A\u4E49\u7684\u53D8\u91CF "var:${m}"\uFF08\u663E\u793A\u4E3A\u8B66\u793A\u7C89\uFF09`);
  }
  return { doc, warnings, fatal: false, fixes };
}
function serializeDoc(doc) {
  return JSON.stringify(doc, null, 2);
}

// ui/src/geometry.ts
var deg2rad = (d) => d * Math.PI / 180;
var round1 = (v) => Math.round(v * 10) / 10;
function aabbRotated(box, th) {
  if (!th)
    return box;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const cos = Math.abs(Math.cos(deg2rad(th)));
  const sin = Math.abs(Math.sin(deg2rad(th)));
  const w = box.w * cos + box.h * sin;
  const h = box.w * sin + box.h * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
var boxCorners = (b) => [
  { x: b.x, y: b.y },
  { x: b.x + b.w, y: b.y },
  { x: b.x + b.w, y: b.y + b.h },
  { x: b.x, y: b.y + b.h }
];
function rotateAbout(p, cx, cy, th) {
  if (!th)
    return p;
  const rad = deg2rad(th);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}
function worldCornersOf(doc, id) {
  const loc = findNode(doc, id);
  if (!loc)
    return null;
  const n = loc.node;
  let pts = boxCorners(n).map((p) => rotateAbout(p, n.x + n.w / 2, n.y + n.h / 2, n.rotation || 0));
  let parent = loc.parent;
  const guard = new Set;
  while (parent) {
    const hw = parent.w / 2;
    const hh = parent.h / 2;
    const cx = parent.x + hw;
    const cy = parent.y + hh;
    const th = parent.rotation || 0;
    if (th) {
      pts = pts.map((p) => {
        const dx = p.x - hw;
        const dy = p.y - hh;
        const rad = deg2rad(th);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
      });
    } else {
      pts = pts.map((p) => ({ x: cx + (p.x - hw), y: cy + (p.y - hh) }));
    }
    if (guard.has(parent.id))
      break;
    guard.add(parent.id);
    parent = findNode(doc, parent.id)?.parent ?? null;
  }
  return pts;
}
function worldBoxOf(doc, id) {
  const pts = worldCornersOf(doc, id);
  if (!pts)
    return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function unionBox(boxes) {
  if (boxes.length === 0)
    return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function deriveGroupBox(g) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const c of g.children) {
    any = true;
    const b = aabbRotated({ x: c.x, y: c.y, w: c.w, h: c.h }, c.rotation || 0);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (!any)
    return;
  g.x = round1(g.x + minX);
  g.y = round1(g.y + minY);
  g.w = Math.max(1, round1(maxX - minX));
  g.h = Math.max(1, round1(maxY - minY));
  if (minX !== 0 || minY !== 0) {
    for (const c of g.children) {
      c.x = round1(c.x - minX);
      c.y = round1(c.y - minY);
    }
  }
}
function normalizeGroups(doc) {
  const visit = (list) => {
    for (const n of list) {
      if (n.type === "group" || n.type === "frame") {
        visit(n.children);
        if (n.type === "group")
          deriveGroupBox(n);
      }
    }
  };
  for (const page of doc.pages)
    visit(page.nodes);
}
function applyAlign(doc, ids, mode, ref) {
  const entries = [];
  for (const id of ids) {
    const loc = findNode(doc, id);
    if (!loc)
      continue;
    if (loc.parent?.type === "group")
      continue;
    if (loc.node.locked === true || loc.node.visible === false)
      continue;
    const box = worldBoxOf(doc, id);
    if (!box)
      continue;
    let ancRot = 0;
    const seen = new Set;
    for (let p = loc.parent;p && !seen.has(p.id); p = findNode(doc, p.id)?.parent ?? null) {
      seen.add(p.id);
      ancRot += p.rotation || 0;
    }
    entries.push({ node: loc.node, box, move: { x: 0, y: 0 }, ancRot });
  }
  if (entries.length === 0)
    return [];
  if (mode === "hdist" || mode === "vdist") {
    if (entries.length < 3)
      return [];
    const axis = mode === "hdist" ? "x" : "y";
    const size = mode === "hdist" ? "w" : "h";
    entries.sort((a, b) => a.box[axis] - b.box[axis]);
    const first = entries[0];
    const last = entries[entries.length - 1];
    const span = last.box[axis] + last.box[size] - first.box[axis];
    const totalSize = entries.reduce((s, e) => s + e.box[size], 0);
    const gap = (span - totalSize) / (entries.length - 1);
    let cursor = first.box[axis];
    for (const e of entries) {
      e.move[axis] = cursor - e.box[axis];
      cursor += e.box[size] + gap;
    }
    return commitMoves(entries);
  }
  const box = ref ?? unionBox(entries.map((e) => e.box));
  if (!box)
    return [];
  for (const e of entries) {
    if (mode === "left")
      e.move.x = box.x - e.box.x;
    else if (mode === "hcenter")
      e.move.x = box.x + box.w / 2 - (e.box.x + e.box.w / 2);
    else if (mode === "right")
      e.move.x = box.x + box.w - (e.box.x + e.box.w);
    else if (mode === "top")
      e.move.y = box.y - e.box.y;
    else if (mode === "vcenter")
      e.move.y = box.y + box.h / 2 - (e.box.y + e.box.h / 2);
    else if (mode === "bottom")
      e.move.y = box.y + box.h - (e.box.y + e.box.h);
  }
  return commitMoves(entries);
}
function commitMoves(entries) {
  const ids = [];
  for (const e of entries) {
    let { x: dx, y: dy } = e.move;
    if (e.ancRot && (dx !== 0 || dy !== 0)) {
      const r = rotateAbout({ x: dx, y: dy }, 0, 0, -e.ancRot);
      dx = r.x;
      dy = r.y;
    }
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001)
      continue;
    e.node.x = round1(e.node.x + dx);
    e.node.y = round1(e.node.y + dy);
    ids.push(e.node.id);
  }
  return ids;
}

// mcp/render.ts
import { readFileSync } from "fs";
import path from "path";

// node_modules/@resvg/resvg-wasm/index.mjs
var wasm;
var heap = new Array(128).fill(undefined);
heap.push(undefined, null, true, false);
var heap_next = heap.length;
function addHeapObject(obj) {
  if (heap_next === heap.length)
    heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
function getObject(idx) {
  return heap[idx];
}
function dropObject(idx) {
  if (idx < 132)
    return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
var WASM_VECTOR_LEN = 0;
var cachedUint8Memory0 = null;
function getUint8Memory0() {
  if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}
var cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
  throw Error("TextEncoder not available");
} };
var encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
  return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
  const buf = cachedTextEncoder.encode(arg);
  view.set(buf);
  return {
    read: arg.length,
    written: buf.length
  };
};
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8Memory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8Memory0();
  let offset = 0;
  for (;offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127)
      break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function isLikeNone(x) {
  return x === undefined || x === null;
}
var cachedInt32Memory0 = null;
function getInt32Memory0() {
  if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachedInt32Memory0;
}
var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder.decode();
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
  return instance.ptr;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
  }
}
var BBoxFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_bbox_free(ptr >>> 0));
var BBox = class _BBox {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_BBox.prototype);
    obj.__wbg_ptr = ptr;
    BBoxFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    BBoxFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_bbox_free(ptr);
  }
  get x() {
    const ret = wasm.__wbg_get_bbox_x(this.__wbg_ptr);
    return ret;
  }
  set x(arg0) {
    wasm.__wbg_set_bbox_x(this.__wbg_ptr, arg0);
  }
  get y() {
    const ret = wasm.__wbg_get_bbox_y(this.__wbg_ptr);
    return ret;
  }
  set y(arg0) {
    wasm.__wbg_set_bbox_y(this.__wbg_ptr, arg0);
  }
  get width() {
    const ret = wasm.__wbg_get_bbox_width(this.__wbg_ptr);
    return ret;
  }
  set width(arg0) {
    wasm.__wbg_set_bbox_width(this.__wbg_ptr, arg0);
  }
  get height() {
    const ret = wasm.__wbg_get_bbox_height(this.__wbg_ptr);
    return ret;
  }
  set height(arg0) {
    wasm.__wbg_set_bbox_height(this.__wbg_ptr, arg0);
  }
};
var RenderedImageFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_renderedimage_free(ptr >>> 0));
var RenderedImage = class _RenderedImage {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_RenderedImage.prototype);
    obj.__wbg_ptr = ptr;
    RenderedImageFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RenderedImageFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_renderedimage_free(ptr);
  }
  get width() {
    const ret = wasm.renderedimage_width(this.__wbg_ptr);
    return ret >>> 0;
  }
  get height() {
    const ret = wasm.renderedimage_height(this.__wbg_ptr);
    return ret >>> 0;
  }
  asPng() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.renderedimage_asPng(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  get pixels() {
    const ret = wasm.renderedimage_pixels(this.__wbg_ptr);
    return takeObject(ret);
  }
};
var ResvgFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {}, unregister: () => {} } : new FinalizationRegistry((ptr) => wasm.__wbg_resvg_free(ptr >>> 0));
var Resvg = class {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ResvgFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_resvg_free(ptr);
  }
  constructor(svg, options, custom_font_buffers) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      var ptr0 = isLikeNone(options) ? 0 : passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      wasm.resvg_new(retptr, addHeapObject(svg), ptr0, len0, isLikeNone(custom_font_buffers) ? 0 : addHeapObject(custom_font_buffers));
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      this.__wbg_ptr = r0 >>> 0;
      return this;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  get width() {
    const ret = wasm.resvg_width(this.__wbg_ptr);
    return ret;
  }
  get height() {
    const ret = wasm.resvg_height(this.__wbg_ptr);
    return ret;
  }
  render() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.resvg_render(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return RenderedImage.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  toString() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.resvg_toString(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  innerBBox() {
    const ret = wasm.resvg_innerBBox(this.__wbg_ptr);
    return ret === 0 ? undefined : BBox.__wrap(ret);
  }
  getBBox() {
    const ret = wasm.resvg_getBBox(this.__wbg_ptr);
    return ret === 0 ? undefined : BBox.__wrap(ret);
  }
  cropByBBox(bbox) {
    _assertClass(bbox, BBox);
    wasm.resvg_cropByBBox(this.__wbg_ptr, bbox.__wbg_ptr);
  }
  imagesToResolve() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.resvg_imagesToResolve(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  resolveImage(href, buffer) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(href, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      wasm.resvg_resolveImage(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(buffer));
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        if (module.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg_new_28c511d9baebfa89 = function(arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_buffer_12d079cc21e14bdb = function(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_aa4a17c33a06e5cb = function(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject(arg0);
  };
  imports.wbg.__wbg_new_63b92bc8671ed464 = function(arg0) {
    const ret = new Uint8Array(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_values_839f3396d5aac002 = function(arg0) {
    const ret = getObject(arg0).values();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_next_196c84450b364254 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).next();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_done_298b57d23c0fc80c = function(arg0) {
    const ret = getObject(arg0).done;
    return ret;
  };
  imports.wbg.__wbg_value_d93c65011f51a456 = function(arg0) {
    const ret = getObject(arg0).value;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_instanceof_Uint8Array_2b3bbecd033d19f6 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Uint8Array;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof obj === "string" ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len1;
    getInt32Memory0()[arg0 / 4 + 0] = ptr1;
  };
  imports.wbg.__wbg_new_16b304a2cfa7ff4a = function() {
    const ret = new Array;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_push_a5b05aedc7234f9f = function(arg0, arg1) {
    const ret = getObject(arg0).push(getObject(arg1));
    return ret;
  };
  imports.wbg.__wbg_length_c20a40f15020d68a = function(arg0) {
    const ret = getObject(arg0).length;
    return ret;
  };
  imports.wbg.__wbg_set_a47bac70306a19a7 = function(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
  };
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  return imports;
}
function __wbg_init_memory(imports, maybe_memory) {}
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module;
  cachedInt32Memory0 = null;
  cachedUint8Memory0 = null;
  return wasm;
}
async function __wbg_init(input) {
  if (wasm !== undefined)
    return wasm;
  if (typeof input === "undefined") {
    input = new URL("index_bg.wasm", undefined);
  }
  const imports = __wbg_get_imports();
  if (typeof input === "string" || typeof Request === "function" && input instanceof Request || typeof URL === "function" && input instanceof URL) {
    input = fetch(input);
  }
  __wbg_init_memory(imports);
  const { instance, module } = await __wbg_load(await input, imports);
  return __wbg_finalize_init(instance, module);
}
var dist_default = __wbg_init;
var initialized = false;
var initWasm = async (module_or_path) => {
  if (initialized) {
    throw new Error("Already initialized. The `initWasm()` function can be used only once.");
  }
  await dist_default(await module_or_path);
  initialized = true;
};
var Resvg2 = class extends Resvg {
  constructor(svg, options) {
    if (!initialized)
      throw new Error("Wasm has not been initialized. Call `initWasm()` function.");
    const font = options?.font;
    if (!!font && isCustomFontsOptions(font)) {
      const serializableOptions = {
        ...options,
        font: {
          ...font,
          fontBuffers: undefined
        }
      };
      super(svg, JSON.stringify(serializableOptions), font.fontBuffers);
    } else {
      super(svg, JSON.stringify(options));
    }
  }
};
function isCustomFontsOptions(value) {
  return Object.prototype.hasOwnProperty.call(value, "fontBuffers");
}

// ui/src/leafer/scene.ts
var FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";
function radiusProp(n) {
  if (n.radius === undefined)
    return;
  return n.radius;
}
function nGon(w, h, sides, startDeg) {
  const cx = w / 2;
  const cy = h / 2;
  const pts = [];
  for (let i = 0;i < sides; i++) {
    const a = (startDeg + 360 / sides * i) * Math.PI / 180;
    pts.push(`${(cx + cx * Math.cos(a)).toFixed(2)},${(cy + cy * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}
function starPath(w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const pts = [];
  for (let i = 0;i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.4;
    const a = (-90 + i * 36) * Math.PI / 180;
    pts.push(`${(cx + cx * r * Math.cos(a)).toFixed(2)},${(cy + cy * r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}
function diamondPath(w, h) {
  return `M${(w / 2).toFixed(2)},0 L${w.toFixed(2)},${(h / 2).toFixed(2)} L${(w / 2).toFixed(2)},${h} L0,${(h / 2).toFixed(2)} Z`;
}
function trianglePath(w, h) {
  return `M${(w / 2).toFixed(2)},0 L${w.toFixed(2)},${h.toFixed(2)} L0,${h.toFixed(2)} Z`;
}
function shapePath(type, w, h) {
  switch (type) {
    case "triangle":
      return trianglePath(w, h);
    case "diamond":
      return diamondPath(w, h);
    case "pentagon":
      return nGon(w, h, 5, -90);
    case "hexagon":
      return nGon(w, h, 6, -90);
    case "star":
      return starPath(w, h);
    default:
      return null;
  }
}
var CJK = /[\u2E80-\u9FFF\u8C48-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\u3000-\u303F]/;
function* tokenize(s) {
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch) || CJK.test(ch)) {
      yield ch;
      i++;
      continue;
    }
    const start = i;
    while (i < s.length && !/\s/.test(s[i]) && !CJK.test(s[i]))
      i++;
    yield s.slice(start, i);
  }
}
function fontCssOf(r) {
  return `${r.italic ? "italic " : ""}${r.bold ? "700 " : ""}${r.fontSize}px ${r.font}`;
}
function layoutText(runs, w, h, align, vAlign, lineHeightMul, measure) {
  const lines = [];
  let line = { items: [], width: 0, above: 0, below: 0 };
  const flush = () => {
    lines.push(line);
    line = { items: [], width: 0, above: 0, below: 0 };
  };
  const grow = (r) => {
    const lh = r.fontSize * lineHeightMul;
    const m = measure("", fontCssOf(r));
    const above = (lh + m.ascent - m.descent) / 2;
    const below = (lh - m.ascent + m.descent) / 2;
    if (above > line.above)
      line.above = above;
    if (below > line.below)
      line.below = below;
  };
  const push = (r, text, width) => {
    line.items.push({ run: r, text, width });
    grow(r);
    line.width += width;
  };
  let touched = false;
  for (const r of runs) {
    const css = fontCssOf(r);
    r.text.split(`
`).forEach((para, pi) => {
      if (pi > 0)
        flush();
      touched = true;
      if (para === "") {
        grow(r);
        return;
      }
      for (const tok of tokenize(para)) {
        let text = tok;
        let tw = measure(text, css).width;
        if (line.items.length > 0 && line.width + tw > w)
          flush();
        while (tw > w) {
          let cut = Math.max(1, text.length - 1);
          while (cut > 1 && measure(text.slice(0, cut), css).width > w)
            cut--;
          const head = text.slice(0, cut);
          push(r, head, measure(head, css).width);
          text = text.slice(cut);
          tw = measure(text, css).width;
          if (tw > w)
            flush();
        }
        if (text === "")
          continue;
        if (line.items.length > 0 && line.width + tw > w)
          flush();
        push(r, text, tw);
      }
    });
  }
  if (touched && (line.items.length > 0 || line.above + line.below > 0))
    flush();
  if (lines.length === 0)
    return [];
  const total = lines.reduce((s, l) => s + l.above + l.below, 0);
  let y = 0;
  if (vAlign === "middle")
    y = (h - total) / 2;
  else if (vAlign === "bottom")
    y = h - total;
  const frags = [];
  for (const l of lines) {
    let x = 0;
    if (align === "center")
      x = (w - l.width) / 2;
    else if (align === "right")
      x = w - l.width;
    const baseline = y + l.above;
    for (const it of l.items) {
      frags.push({ text: it.text, x, baseline, run: it.run });
      x += it.width;
    }
    y += l.above + l.below;
  }
  return frags;
}
function runsToSpec(runs) {
  return runs.map((r) => ({
    text: r.text,
    color: r.color ?? "#111111",
    fontSize: r.size ?? 14,
    bold: (r.weight ?? 400) >= 600,
    italic: !!r.italic,
    font: r.font ?? FONT_STACK
  }));
}
var DIR_CORNERS = {
  0: [[0, 0], [1, 1]],
  1: [[0, 1], [1, 0]],
  2: [[1, 1], [0, 0]],
  3: [[1, 0], [0, 1]]
};
function lineEnds(dir, w, h) {
  const [s, e] = DIR_CORNERS[dir];
  return { x1: s[0] * w, y1: s[1] * h, x2: e[0] * w, y2: e[1] * h };
}
function arrowHeadPath(x2, y2, x1, y1, size) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a1 = ang + Math.PI - 0.42;
  const a2 = ang + Math.PI + 0.42;
  const p1x = x2 + size * Math.cos(a1);
  const p1y = y2 + size * Math.sin(a1);
  const p2x = x2 + size * Math.cos(a2);
  const p2y = y2 + size * Math.sin(a2);
  return `M${x2.toFixed(2)},${y2.toFixed(2)} L${p1x.toFixed(2)},${p1y.toFixed(2)} L${p2x.toFixed(2)},${p2y.toFixed(2)} Z`;
}

// ui/src/svg.ts
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function textBody(block, w, h, ctx) {
  const frags = layoutText(runsToSpec(block.runs), w, h, block.align ?? "left", block.vAlign ?? "top", block.lineHeight ?? 1.4, ctx.measure);
  const ls = block.letterSpacing ? ` letter-spacing="${block.letterSpacing}"` : "";
  return frags.map((f) => `<text x="${f.x.toFixed(2)}" y="${f.baseline.toFixed(2)}" font-size="${f.run.fontSize}" font-family="${esc(f.run.font)}" fill="${esc(resolveVarColor(ctx.doc, f.run.color))}"${f.run.bold ? ' font-weight="700"' : ""}${f.run.italic ? ' font-style="italic"' : ""}${ls}>${esc(f.text)}</text>`).join("");
}
function layerTextBody(node, w, h, ctx) {
  const lt = layerText(node);
  if (!lt)
    return "";
  return textBody({ runs: lt.runs, align: lt.align ?? "center", vAlign: lt.vAlign ?? "middle", lineHeight: lt.lineHeight, letterSpacing: lt.letterSpacing }, w, h, ctx);
}
function fillAttr(f, ctx) {
  if (f.visible === false)
    return null;
  const op = f.opacity ?? 1;
  const opA = op < 1 ? ` fill-opacity="${op}"` : "";
  if (f.type === "solid")
    return `fill="${esc(resolveVarColor(ctx.doc, f.color))}"${opA}`;
  const stops = (f.stops ?? []).map((s) => `<stop offset="${Math.max(0, Math.min(1, s.at))}" stop-color="${esc(resolveVarColor(ctx.doc, s.color))}"/>`).join("");
  if (!stops)
    return null;
  ctx.uid += 1;
  const id = `p${ctx.uid}`;
  if (f.type === "linear") {
    ctx.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1" gradientTransform="rotate(${f.angle ?? 0} .5 .5)">${stops}</linearGradient>`);
  } else {
    const cx = f.center?.x ?? 0.5;
    const cy = f.center?.y ?? 0.5;
    ctx.defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="0.75">${stops}</radialGradient>`);
  }
  return `fill="url(#${id})"${opA}`;
}
function strokeAttr(s, ctx) {
  if (s.visible === false || s.width <= 0)
    return null;
  const dash = s.style === "dashed" ? ` stroke-dasharray="${(s.width * 4).toFixed(1)} ${(s.width * 3).toFixed(1)}"` : s.style === "dotted" ? ` stroke-dasharray="${Math.max(1, s.width)} ${s.width * 2}" stroke-linecap="round"` : "";
  return `stroke="${esc(resolveVarColor(ctx.doc, s.color))}" stroke-width="${s.width}"${dash}`;
}
function filterAttr(effects, ctx) {
  if (!effects || effects.length === 0)
    return "";
  const body = [];
  for (const e of effects) {
    if (e.visible === false)
      continue;
    if (e.type === "layer-blur")
      continue;
    else
      body.push(`<feDropShadow dx="${e.x}" dy="${e.y}" stdDeviation="${(e.blur ?? 0) / 2}" flood-color="${esc(resolveVarColor(ctx.doc, e.color))}"/>`);
  }
  if (body.length === 0)
    return "";
  ctx.uid += 1;
  const id = `e${ctx.uid}`;
  ctx.defs.push(`<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%">${body.join("")}</filter>`);
  return ` filter="url(#${id})"`;
}
function rectPath(w, h, r) {
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, w / 2, h / 2)));
  return `M${tl},0 L${w - tr},0 A${tr},${tr} 0 0 1 ${w},${tr} L${w},${h - br} A${br},${br} 0 0 1 ${w - br},${h}` + ` L${bl},${h} A${bl},${bl} 0 0 1 0,${h - bl} L0,${tl} A${tl},${tl} 0 0 1 ${tl},0 Z`;
}
function boxEls(node, ctx, kind, d, extraAttr = "") {
  const { w, h } = node;
  const rad = radiusProp(node);
  let geoEl = (attr, fillNone = false) => "";
  if (kind === "rect") {
    if (Array.isArray(rad)) {
      geoEl = (attr, fillNone) => `<path d="${rectPath(w, h, rad)}" ${attr}${fillNone ? ' fill="none"' : ""}${extraAttr}/>`;
    } else {
      geoEl = (attr, fillNone) => `<rect width="${w}" height="${h}"${rad !== undefined ? ` rx="${Math.min(rad, w / 2, h / 2)}"` : ""} ${attr}${fillNone ? ' fill="none"' : ""}${extraAttr}/>`;
    }
  } else if (kind === "ellipse") {
    geoEl = (attr, fillNone) => `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${attr}${fillNone ? ' fill="none"' : ""}${extraAttr}/>`;
  } else {
    geoEl = (attr, fillNone) => `<path d="${d}" ${attr}${fillNone ? ' fill="none"' : ""}${extraAttr}/>`;
  }
  const parts = [];
  const fills = "fills" in node ? node.fills ?? [] : [];
  for (const f of fills) {
    if (f.type === "image") {
      const img = imageFillEl(node, ctx, f, kind, rad, d);
      if (img)
        parts.push(img);
      continue;
    }
    const a = fillAttr(f, ctx);
    if (a)
      parts.push(geoEl(a));
  }
  const strokes = "strokes" in node ? node.strokes ?? [] : [];
  for (const s of strokes) {
    const a = strokeAttr(s, ctx);
    if (a)
      parts.push(geoEl(a, true));
  }
  return parts.join("");
}
function geoMarkup(kind, w, h, rad, d) {
  if (kind === "ellipse")
    return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
  if (kind === "path")
    return `<path d="${d ?? ""}"/>`;
  if (Array.isArray(rad))
    return `<path d="${rectPath(w, h, rad)}"/>`;
  return `<rect width="${w}" height="${h}"${rad !== undefined && rad > 0 ? ` rx="${Math.min(rad, w / 2, h / 2)}"` : ""}/>`;
}
function imageFillEl(node, ctx, f, kind, rad, d) {
  if (f.visible === false || !f.src)
    return null;
  const url = ctx.images.get(f.src);
  if (!url)
    return null;
  ctx.uid += 1;
  const id = `if${ctx.uid}`;
  ctx.defs.push(`<clipPath id="${id}">${geoMarkup(kind, node.w, node.h, rad, d)}</clipPath>`);
  const par = f.scaleMode === "fit" ? "xMidYMid meet" : f.scaleMode === "stretch" ? "none" : "xMidYMid slice";
  const op = f.opacity !== undefined && f.opacity < 1 ? ` opacity="${f.opacity}"` : "";
  return `<image href="${esc(url)}" width="${node.w}" height="${node.h}" preserveAspectRatio="${par}" clip-path="url(#${id})"${op}/>`;
}
function maskGeo(n) {
  const tf = ` transform="translate(${n.x} ${n.y})${n.rotation ? ` rotate(${n.rotation} ${n.w / 2} ${n.h / 2})` : ""}"`;
  if (n.type === "ellipse")
    return `<ellipse${tf} cx="${n.w / 2}" cy="${n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}"/>`;
  if (n.type === "rect")
    return geoMarkup("rect", n.w, n.h, radiusProp(n)).replace("/>", `${tf}/>`);
  if (["triangle", "diamond", "pentagon", "hexagon", "star"].includes(n.type)) {
    return `<path${tf} d="${shapePath(n.type, n.w, n.h) ?? ""}"/>`;
  }
  if (n.type === "vector")
    return `<path${tf} d="${n.path}"/>`;
  return `<rect${tf} width="${n.w}" height="${n.h}"/>`;
}
function renderChildrenMasks(children, ctx) {
  let out = "";
  let depth = 0;
  for (const c of children) {
    if (c.mask && c.visible !== false) {
      ctx.uid += 1;
      const id = `m${ctx.uid}`;
      ctx.defs.push(`<clipPath id="${id}">${maskGeo(c)}</clipPath>`);
      out += `<g clip-path="url(#${id})">`;
      depth++;
      continue;
    }
    out += renderNode(c, ctx);
  }
  while (depth-- > 0)
    out += "</g>";
  return out;
}
function renderNode(node, ctx) {
  if (node.visible === false)
    return "";
  const tf = [`translate(${node.x} ${node.y})`];
  if (node.rotation)
    tf.push(`rotate(${node.rotation} ${node.w / 2} ${node.h / 2})`);
  if (node.flipX || node.flipY) {
    tf.push(`translate(${node.flipX ? node.w : 0} ${node.flipY ? node.h : 0})`);
    tf.push(`scale(${node.flipX ? -1 : 1} ${node.flipY ? -1 : 1})`);
  }
  const blendAttr = node.blendMode ? ` mix-blend-mode="${node.blendMode}" style="mix-blend-mode:${node.blendMode}"` : "";
  const gAttr = `transform="${tf.join(" ")}"${(node.opacity ?? 1) < 1 ? ` opacity="${node.opacity}"` : ""}${blendAttr} data-id="${esc(node.id)}"`;
  const fx = filterAttr(node.effects, ctx);
  if (node.type === "group") {
    return `<g ${gAttr}>${renderChildrenMasks(node.children, ctx)}</g>`;
  }
  if (node.type === "frame") {
    ctx.uid += 1;
    const clipId = `c${ctx.uid}`;
    const clip = node.clip !== false || !!node.scroll;
    if (clip)
      ctx.defs.push(`<clipPath id="${clipId}"><rect width="${node.w}" height="${node.h}"/></clipPath>`);
    const bg = boxEls(node, ctx, "rect");
    const rendered = renderChildrenMasks(node.children, ctx);
    const kids = node.scroll ? `<g data-scroll-body="${esc(node.scroll)}">${rendered}</g>` : rendered;
    const scrollAttr = node.scroll ? ` data-scroll="${esc(node.scroll)}"` : "";
    return `<g ${gAttr}${scrollAttr}>${bg}<g${clip ? ` clip-path="url(#${clipId})"` : ""}>${kids}</g></g>`;
  }
  if (node.type === "instance") {
    const view = instanceView(ctx.doc, node);
    if (!view)
      return `<g ${gAttr}>` + `<rect width="${node.w}" height="${node.h}" fill="#f1f3f5" stroke="#9aa0a6" stroke-width="1" stroke-dasharray="5 4"/>` + `</g>`;
    return `<g ${gAttr}>${renderChildrenMasks(view, ctx)}</g>`;
  }
  if (node.type === "rect" || node.type === "ellipse") {
    return `<g ${gAttr}${fx}>${boxEls(node, ctx, node.type === "rect" ? "rect" : "ellipse")}${layerTextBody(node, node.w, node.h, ctx)}</g>`;
  }
  if (["triangle", "diamond", "pentagon", "hexagon", "star"].includes(node.type)) {
    const d = shapePath(node.type, node.w, node.h) ?? "";
    return `<g ${gAttr}${fx}>${boxEls(node, ctx, "path", d)}${layerTextBody(node, node.w, node.h, ctx)}</g>`;
  }
  if (node.type === "line" || node.type === "arrow") {
    const { x1, y1, x2, y2 } = lineEnds(node.dir ?? 0, node.w, node.h);
    const s = (node.strokes ?? [])[0];
    const sa = s ? strokeAttr(s, ctx) : 'stroke="#111111" stroke-width="1"';
    if (!sa)
      return "";
    const head = node.type === "arrow" && s && s.visible !== false ? `<path d="${arrowHeadPath(x2, y2, x1, y1, Math.max(6, s.width * 3))}" fill="${esc(resolveVarColor(ctx.doc, s.color))}"/>` : "";
    return `<g ${gAttr}${fx}><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${sa}/>${head}</g>`;
  }
  if (node.type === "text") {
    return `<g ${gAttr}${fx}>${textBody(node, node.w, node.h, ctx)}</g>`;
  }
  if (node.type === "vector") {
    return `<g ${gAttr}${fx}>${boxEls(node, ctx, "path", node.path)}</g>`;
  }
  if (node.type === "icon") {
    const spec = iconDrawSpec(node.icon, node.w, node.h, node.strokeWidth ?? 2);
    if (!spec) {
      const fs = Math.max(8, Math.min(node.w, node.h) * 0.6);
      return `<g ${gAttr}${fx}><rect width="${node.w}" height="${node.h}" fill="none" stroke="#9aa0a6" stroke-width="1" stroke-dasharray="4 3"/>` + `<text x="${node.w / 2}" y="${node.h / 2 + fs * 0.35}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fs.toFixed(1)}" fill="#9aa0a6">?</text></g>`;
    }
    return `<g ${gAttr}${fx}><path d="${spec.d}" fill="none" stroke="${esc(resolveVarColor(ctx.doc, node.color, "#111111"))}" stroke-width="${spec.sw.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  if (node.type !== "image")
    return "";
  const url = ctx.images.get(node.src);
  const rad = radiusProp(node);
  let img = "";
  if (url) {
    const par = node.fit === "contain" ? "xMidYMid meet" : node.fit === "stretch" ? "none" : "xMidYMid slice";
    let clipAttr = "";
    if (rad !== undefined) {
      ctx.uid += 1;
      const cid = `ci${ctx.uid}`;
      ctx.defs.push(`<clipPath id="${cid}">${Array.isArray(rad) ? `<path d="${rectPath(node.w, node.h, rad)}"/>` : `<rect width="${node.w}" height="${node.h}" rx="${Math.min(rad, node.w / 2, node.h / 2)}"/>`}</clipPath>`);
      clipAttr = ` clip-path="url(#${cid})"`;
    }
    img = `<image href="${url}" x="0" y="0" width="${node.w}" height="${node.h}" preserveAspectRatio="${par}"${clipAttr}/>`;
  } else {
    img = `<rect width="${node.w}" height="${node.h}" fill="#f1f3f5"/>`;
  }
  const strokes = (node.strokes ?? []).map((s) => strokeAttr(s, ctx)).filter(Boolean);
  const ring = strokes.map((a) => `<rect width="${node.w}" height="${node.h}" fill="none" ${a}/>`).join("");
  return `<g ${gAttr}${fx}>${img}${ring}</g>`;
}
function collectImageSrcs(nodes) {
  const srcs = new Set;
  const collect = (list) => {
    for (const n of list) {
      if (n.type === "image")
        srcs.add(n.src);
      if ("fills" in n) {
        for (const f of n.fills) {
          if (f.type === "image" && f.src)
            srcs.add(f.src);
        }
      }
      if (n.type === "frame" || n.type === "group")
        collect(n.children);
    }
  };
  collect(nodes);
  return srcs;
}
function buildSvg(doc, ids, opts) {
  const items = ids.map((id) => {
    const loc = findNode(doc, id);
    const wb = worldBoxOf(doc, id);
    return loc && wb && loc.node.visible !== false ? { node: loc.node, wb, top: !loc.parent } : null;
  }).filter((x) => !!x);
  if (items.length === 0)
    return null;
  const box = unionBox(items.map((i) => i.wb));
  const ctx = { defs: [], uid: 0, measure: opts.measure, images: opts.images, doc };
  const topIds = new Set(items.filter((i) => i.top).map((i) => i.node.id));
  let body = "";
  for (const p of doc.pages) {
    const seq = p.nodes.filter((n) => topIds.has(n.id) && n.visible !== false);
    if (seq.length)
      body += renderChildrenMasks(seq, ctx);
  }
  for (const i of items) {
    if (i.top)
      continue;
    const inner = renderNode(i.node, ctx);
    body += `<g transform="translate(${i.wb.x - i.node.x} ${i.wb.y - i.node.y})">${inner}</g>`;
  }
  const bg = opts.background ? `<rect x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" fill="${esc(opts.background)}"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(box.w))}" height="${Math.max(1, Math.round(box.h))}" ` + `viewBox="${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}">` + (ctx.defs.length ? `<defs>${ctx.defs.join("")}</defs>` : "") + bg + body + `</svg>`;
  return { svg, box };
}

// mcp/render.ts
var wasmReady = null;
function ensureResvg() {
  wasmReady ??= (async () => {
    try {
      await initWasm(readFileSync(new URL("./vendor/resvg-index_bg.wasm", import.meta.url)));
    } catch (err) {
      throw new Error("ui-design mcp: \u521D\u59CB\u5316 resvg wasm \u5931\u8D25\uFF08mcp/vendor/resvg-index_bg.wasm \u7F3A\u5931\u6216\u4E0D\u53EF\u8BFB\u2014\u2014\u63D2\u4EF6\u5305\u4E0D\u5B8C\u6574\uFF1F\uFF09", { cause: err });
    }
  })();
  return wasmReady;
}
var fontBuffers = null;
function ensureFonts() {
  if (!fontBuffers) {
    try {
      fontBuffers = [readFileSync(new URL("./fonts/NotoSansSC-Regular.otf", import.meta.url))];
    } catch (err) {
      throw new Error("ui-design mcp: \u5185\u7F6E\u5B57\u4F53 mcp/fonts/NotoSansSC-Regular.otf \u7F3A\u5931\uFF08\u63D2\u4EF6\u5305\u4E0D\u5B8C\u6574\uFF1F\uFF09", {
        cause: err
      });
    }
  }
  return fontBuffers;
}
function fontOptions() {
  return {
    fontBuffers: ensureFonts(),
    defaultFontFamily: "Noto Sans SC",
    sansSerifFamily: "Noto Sans SC"
  };
}
var MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp"
};
function imageMime(p) {
  return MIME_BY_EXT[path.extname(p).toLowerCase()] ?? null;
}
var MAX_ASSET_BYTES = 8 * 1024 * 1024;
function readDocImages(workspace, nodes) {
  const urls = new Map;
  const raw = new Map;
  let missing = 0;
  for (const src of collectImageSrcs(nodes)) {
    try {
      if (path.isAbsolute(src))
        throw new Error("absolute");
      const abs = path.resolve(workspace, src);
      if (!abs.startsWith(workspace + path.sep))
        throw new Error("escape");
      const mime = imageMime(abs);
      if (!mime)
        throw new Error("format");
      const buf = readFileSync(abs);
      if (buf.byteLength > MAX_ASSET_BYTES)
        throw new Error("large");
      urls.set(src, `data:${mime};base64,${buf.toString("base64")}`);
      raw.set(src, buf);
    } catch {
      urls.set(src, null);
      raw.set(src, null);
      missing++;
    }
  }
  return { urls, raw, missing };
}
function isWide(cp) {
  return cp >= 4352 && cp <= 4447 || cp >= 11904 && cp <= 12351 || cp >= 12353 && cp <= 13311 || cp >= 13312 && cp <= 19903 || cp >= 19968 && cp <= 40959 || cp >= 40960 && cp <= 42191 || cp >= 44032 && cp <= 55215 || cp >= 63744 && cp <= 64255 || cp >= 65072 && cp <= 65103 || cp >= 65280 && cp <= 65376 || cp >= 65504 && cp <= 65510 || cp >= 131072 && cp <= 262141;
}
var NARROW = new Set(["i", "l", "\xEF", "\u0131", "!", "'", ".", ",", ":", ";", "|", "`", "^", "(", ")", "[", "]", "{", "}", "/", "\\", "\xAD"]);
var NARROW2 = new Set(["f", "t", "r", "J", "[", "j", "-", "]"]);
function charFactor(ch) {
  if (isWide(ch.codePointAt(0) ?? 0))
    return 1;
  if (ch === " ")
    return 0.3;
  if (NARROW.has(ch))
    return 0.28;
  if (NARROW2.has(ch))
    return 0.36;
  if (ch === "m")
    return 0.85;
  if (ch === "M")
    return 0.94;
  if (ch === "w")
    return 0.78;
  if (ch === "W")
    return 0.9;
  if (ch === "%" || ch === "&" || ch === "@")
    return 0.88;
  if (ch >= "0" && ch <= "9")
    return 0.56;
  if (ch >= "A" && ch <= "Z")
    return 0.68;
  if (ch >= "a" && ch <= "z")
    return 0.53;
  return 0.6;
}
function makeApproxMeasure() {
  const cache = new Map;
  return (text, fontCss) => {
    const size = parseFloat(fontCss.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "16") || 16;
    const bold = /\b700\b|bold/.test(fontCss);
    const key = `${text}|${size}|${bold ? 1 : 0}`;
    let width = cache.get(key);
    if (width === undefined) {
      let sum = 0;
      for (const ch of text)
        sum += charFactor(ch);
      width = sum * size * (bold ? 1.04 : 1);
      cache.set(key, width);
    }
    return { width, ascent: size * 0.8, descent: size * 0.2 };
  };
}
var PNG_BUDGET = Math.floor(2 * 1024 * 1024 * 0.95);
async function rasterizePng(svg, boxW, boxH, opts = {}) {
  await ensureResvg();
  let ratio = opts.scale ?? 2;
  const maxDim = opts.maxDim ?? 1600;
  const budget = opts.budgetBytes === undefined ? PNG_BUDGET : opts.budgetBytes;
  ratio = Math.min(ratio, maxDim / Math.max(boxW, boxH));
  const draw = (r) => {
    const resvg = new Resvg2(svg, {
      fitTo: { mode: "width", value: Math.max(1, Math.round(boxW * r)) },
      font: fontOptions()
    });
    const img = resvg.render();
    return { png: img.asPng(), width: img.width, height: img.height };
  };
  for (let guard = 0;; guard++) {
    const out = draw(Math.max(0.05, ratio));
    const over = budget !== null && out.png.byteLength > budget;
    if (!over || ratio <= 0.3 || guard >= 6)
      return out;
    ratio *= 0.7;
  }
}
async function renderDocPng(workspace, doc, ids, opts = {}) {
  const nodes = ids.map((id) => findNode(doc, id)?.node).filter((n) => !!n && n.visible !== false);
  if (nodes.length === 0)
    return null;
  const imgs = readDocImages(workspace, nodes);
  const built = buildSvg(doc, nodes.map((n) => n.id), {
    measure: makeApproxMeasure(),
    images: imgs.urls,
    background: opts.background ?? undefined
  });
  if (!built)
    return null;
  const { svg, box } = built;
  const r = await rasterizePng(svg, box.w, box.h, { scale: opts.scale, maxDim: opts.maxDim, budgetBytes: opts.budgetBytes });
  return { ...r, boxW: Math.round(box.w), boxH: Math.round(box.h), missingImages: imgs.missing };
}
function renderDocSvg(workspace, doc, ids, opts = {}) {
  const nodes = ids.map((id) => findNode(doc, id)?.node).filter((n) => !!n && n.visible !== false);
  if (nodes.length === 0)
    return null;
  const imgs = readDocImages(workspace, nodes);
  const built = buildSvg(doc, nodes.map((n) => n.id), {
    measure: makeApproxMeasure(),
    images: imgs.urls,
    background: opts.background ?? undefined
  });
  if (!built)
    return null;
  return { svg: built.svg, boxW: Math.round(built.box.w), boxH: Math.round(built.box.h), missingImages: imgs.missing };
}

// mcp/export.ts
import { mkdirSync, readFileSync as readFileSync2, writeFileSync } from "fs";
import path2 from "path";

// ui/src/bundle.ts
var DEFAULT_FORMATS = ["png", "html", "source"];
function safeToken(name, fallback = "screen") {
  const cleaned = (name || "").replace(/[\u0000-\u001f/\\:*?"<>|]+/g, " ").trim().replace(/\s+/g, "-").slice(0, 48);
  return cleaned || fallback;
}
function baseName(src) {
  const seg = src.split(/[/\\]/).filter(Boolean).pop() ?? src;
  return safeToken(seg.replace(/\.[^.]+$/, ""), "asset") + extOf(seg);
}
function extOf(seg) {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(seg);
  return m ? m[0].toLowerCase() : ".png";
}
function planBundle(doc, page, ids, dirBase, opts = {}) {
  const dir = (opts.dir?.trim() || `${dirBase}-export`).replace(/\/+$/, "");
  const formats = new Set(opts.formats?.length ? opts.formats : DEFAULT_FORMATS);
  const screens = [];
  const srcs = new Set;
  let n = 0;
  for (const id of ids) {
    const loc = findNode(doc, id);
    const node = loc?.node;
    if (!node || node.visible === false)
      continue;
    n += 1;
    const idx = String(n).padStart(2, "0");
    const token = safeToken(node.name, `screen${idx}`);
    screens.push({
      index: n,
      id,
      name: node.name,
      w: Math.round(node.w),
      h: Math.round(node.h),
      pngPath: `${dir}/screens/${idx}-${token}.png`,
      svgPath: `${dir}/screens/${idx}-${token}.svg`,
      codePath: `${dir}/code/${idx}-${token}.css`
    });
    collectSrcs(node, srcs, doc);
  }
  const used = new Set;
  const assets = [];
  for (const src of srcs) {
    let rel = baseName(src);
    let bump = 2;
    while (used.has(rel))
      rel = baseName(src).replace(/(\.[^.]+)$/, `~${bump++}$1`);
    used.add(rel);
    assets.push({ src, rel, path: `${dir}/assets/${rel}` });
  }
  return {
    dir,
    pageName: page.name,
    screens,
    assets,
    formats,
    indexHtmlPath: `${dir}/index.html`,
    manifestPath: `${dir}/manifest.json`,
    sourcePath: `${dir}/${safeToken(dirBase, "design")}.uidesign.json`,
    scale: opts.scale ?? 2,
    maxDim: opts.maxDim ?? 4096,
    background: opts.background ?? null
  };
}
function collectSrcs(node, out, doc) {
  if (node.type === "image")
    out.add(node.src);
  if (node.type === "instance") {
    const baked = bakeInstanceNodes(doc, node);
    if (baked)
      for (const c of baked)
        collectSrcs(c, out, doc);
    return;
  }
  if (node.type === "frame" || node.type === "group")
    for (const c of node.children)
      collectSrcs(c, out, doc);
}
function externalImagesMap(plan) {
  const m = new Map;
  for (const a of plan.assets)
    m.set(a.src, `assets/${a.rel}`);
  return m;
}
function buildManifest(doc, plan, docPath, files, nowIso) {
  const sorted = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {
    generator: "ui-design/export",
    doc: docPath,
    docName: doc.meta.name,
    page: plan.pageName,
    createdAt: nowIso,
    formats: [...plan.formats],
    screens: plan.screens.map((s) => ({ name: s.name, width: s.w, height: s.h })),
    files: sorted,
    note: "\u9759\u6001\u5BFC\u51FA\u5305\uFF1Aindex.html \u76F4\u63A5\u6D4F\u89C8\u5668\u6253\u5F00\u53EF\u70B9\u539F\u578B\uFF1Bscreens/*.png \u4E3A\u9010\u753B\u677F\u4F4D\u56FE\uFF1Bassets/ \u4E3A\u5916\u94FE\u4F4D\u56FE\uFF1B\u672C\u6587\u4EF6\u5217\u51FA\u5168\u90E8\u76F8\u5BF9\u8DEF\u5F84\u3002"
  };
}
function serializeManifest(m) {
  return JSON.stringify(m, null, 2);
}

// ui/src/prototype.ts
function defaultTransition(action, position = "center") {
  switch (action) {
    case "navigate":
      return "pushLeft";
    case "back":
      return "pushRight";
    case "overlay":
      return position === "bottom" ? "slideUp" : position === "top" ? "slideDown" : position === "left" ? "pushLeft" : position === "right" ? "pushRight" : "scale";
    case "closeOverlay":
      return "none";
    default:
      return "none";
  }
}
function transitionDuration(t) {
  switch (t) {
    case "none":
      return 0;
    case "fade":
      return 200;
    case "scale":
      return 220;
    case "slideUp":
    case "slideDown":
      return 260;
    default:
      return 300;
  }
}
function resolveTargetFrame(doc, id) {
  const loc = findNode(doc, id);
  return loc && loc.node.type === "frame" && !loc.parent ? loc.node : null;
}
function topLevelFrameOf(doc, nodeId) {
  let loc = findNode(doc, nodeId);
  while (loc && loc.parent)
    loc = findNode(doc, loc.parent.id);
  return loc && loc.node.type === "frame" ? loc.node : null;
}
function findBoxInFrame(doc, frame, id) {
  if (id === frame.id)
    return { x: 0, y: 0, w: frame.w, h: frame.h };
  let hit = null;
  const walk = (list, ox, oy) => {
    for (const n of list) {
      if (hit)
        return;
      const x = ox + n.x;
      const y = oy + n.y;
      if (n.id === id) {
        hit = { x, y, w: n.w, h: n.h };
        return;
      }
      if (n.type === "instance" && doc) {
        const baked = bakeInstanceNodes(doc, n);
        if (baked) {
          walk(baked, x, y);
          continue;
        }
      }
      if ("children" in n)
        walk(n.children, x, y);
    }
  };
  walk(frame.children, 0, 0);
  return hit;
}
function scrollPlanFor(doc, frame, id) {
  const box = findBoxInFrame(doc, frame, id);
  if (!box)
    return null;
  const axis = frame.scroll;
  const useX = axis === "h" || axis === "both";
  const useY = axis === "v" || axis === "both";
  const along = (start, size, viewport) => {
    if (size >= viewport)
      return Math.max(0, start);
    const visible = start >= 0 && start + size <= viewport;
    return Math.max(0, visible ? start : start + size - viewport);
  };
  return {
    x: useX ? along(box.x, box.w, frame.w) : 0,
    y: useY ? along(box.y, box.h, frame.h) : 0
  };
}
function checkInteractionTarget(doc, frame, it) {
  if (it.action === "back" || it.action === "closeOverlay")
    return { ok: true };
  const to = (it.to ?? "").trim();
  if (!to)
    return { ok: false, reason: `\u52A8\u4F5C ${it.action} \u9700\u8981 to\uFF08\u76EE\u6807 id\uFF09` };
  if (it.action === "scrollTo" || it.action === "toggleVisible") {
    if (!frame)
      return { ok: false, reason: "\u627E\u4E0D\u5230\u8BE5\u8282\u70B9\u6240\u5C5E\u7684\u9876\u5C42\u753B\u677F\uFF0C\u5C4F\u5185\u52A8\u4F5C\u65E0\u4ECE\u6821\u9A8C" };
    if (!findBoxInFrame(doc, frame, to))
      return { ok: false, reason: `\u76EE\u6807\u8282\u70B9\u4E0D\u5728\u5F53\u524D\u753B\u677F\u5185\uFF1A${to}` };
    return { ok: true };
  }
  if (!resolveTargetFrame(doc, to))
    return { ok: false, reason: `\u76EE\u6807\u4E0D\u662F\u9876\u5C42\u753B\u677F\u6216\u5DF2\u5220\u9664\uFF1A${to}\uFF08navigate/overlay \u5FC5\u987B\u6307\u5411\u4E00\u5757\u9876\u5C42\u753B\u677F\uFF09` };
  return { ok: true };
}
function resolveOne(doc, frame, it) {
  const action = it.action;
  const position = it.position ?? "center";
  const transition = it.transition ?? defaultTransition(action, position);
  const base = {
    trigger: it.trigger,
    action,
    transition,
    duration: it.duration ?? transitionDuration(transition),
    position,
    dismissOnTapOutside: it.dismissOnTapOutside !== false
  };
  if (action === "back" || action === "closeOverlay") {
    return { ...base, target: null, targetName: null };
  }
  const to = (it.to ?? "").trim();
  if (!doc || !checkInteractionTarget(doc, frame, it).ok)
    return { trigger: it.trigger, action, to };
  const screenScoped = action === "scrollTo" || action === "toggleVisible";
  const targetName = screenScoped ? findNode(doc, to)?.node.name ?? null : resolveTargetFrame(doc, to)?.name ?? null;
  return {
    ...base,
    target: to,
    targetName,
    ...action === "scrollTo" ? { scrollPlan: scrollPlanFor(doc, frame, to) ?? undefined } : {}
  };
}
var isDead = (x) => !("duration" in x);
function collectHotspots(frame, doc) {
  const out = [];
  const walk = (list, ox, oy) => {
    for (const n of list) {
      if (n.visible === false)
        continue;
      const x = ox + n.x;
      const y = oy + n.y;
      const declared = nodeInteractions(n);
      if (declared.length) {
        const resolved = declared.map((it) => resolveOne(doc, frame, it));
        out.push({
          nodeId: n.id,
          name: n.name,
          box: { x, y, w: n.w, h: n.h },
          actions: resolved.filter((r) => !isDead(r)),
          dead: resolved.filter(isDead).map(({ trigger, action, to }) => ({ trigger, action, to }))
        });
      }
      if (n.type === "instance" && doc) {
        const baked = bakeInstanceNodes(doc, n);
        if (baked) {
          walk(baked, x, y);
          continue;
        }
      }
      if ("children" in n)
        walk(n.children, x, y);
    }
  };
  walk(frame.children, 0, 0);
  return out;
}
var TRIGGER_LABELS = {
  tap: "\u5355\u51FB",
  doubleTap: "\u53CC\u51FB",
  longPress: "\u957F\u6309",
  swipeLeft: "\u5DE6\u6ED1",
  swipeRight: "\u53F3\u6ED1",
  swipeUp: "\u4E0A\u6ED1",
  swipeDown: "\u4E0B\u6ED1"
};
var ACTION_LABELS = {
  navigate: "\u8DF3\u8F6C\u753B\u677F",
  back: "\u8FD4\u56DE\u4E0A\u4E00\u5C4F",
  overlay: "\u6253\u5F00\u6D6E\u5C42",
  closeOverlay: "\u5173\u95ED\u6D6E\u5C42",
  scrollTo: "\u6EDA\u52A8\u5230",
  toggleVisible: "\u663E\u793A/\u9690\u85CF"
};

// ui/src/prototype-runtime.ts
var RUNTIME_CSS = `
.uir{position:relative;display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;
  background:#18181b;color:#e4e4e7;font:400 12px/1.4 ui-sans-serif,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  -webkit-font-smoothing:antialiased}
.uir,.uir *{box-sizing:border-box}
.uir-top{display:flex;flex:none;align-items:center;gap:6px;height:44px;padding:0 12px}
.uir-btn{all:unset;cursor:pointer;display:flex;align-items:center;justify-content:center;width:28px;height:28px;
  border-radius:999px;color:#e4e4e7;font-size:15px;line-height:1}
.uir-btn:hover{background:rgba(255,255,255,.1)}
.uir-btn[disabled]{opacity:.3;cursor:default}
.uir-btn[disabled]:hover{background:none}
.uir-title{display:flex;min-width:0;align-items:center;gap:6px;font-size:12px}
.uir-title b{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}
.uir-dot{width:6px;height:6px;border-radius:999px;background:#0d99ff;flex:none}
.uir-page{color:#71717a}
.uir-pill{padding:1px 7px;border-radius:999px;background:rgba(255,255,255,.08);color:#a1a1aa;font-size:10px;white-space:nowrap}
.uir-spacer{flex:1}
.uir-stage{position:relative;flex:1;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;
  touch-action:none;user-select:none;-webkit-user-select:none}
.uir-plane{position:relative;flex:none}
.uir-fit{position:relative;width:100%;height:100%;transform-origin:top left;background:#fff;overflow:hidden}
.uir-wrap{position:absolute;left:0;top:0;will-change:transform,opacity}
.uir-wrap>.uir-fit{box-shadow:0 12px 48px rgba(0,0,0,.5)}
.uir-backdrop{position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.42);opacity:0;
  transition:opacity .2s ease}
.uir-backdrop.on{opacity:1}
.uir-hot-layer{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none}
/* pointer-events:\u81EA\u52A8 \u2014\u2014 \u70ED\u70B9\u5C42\u7684\u5BB9\u5668\u662F none\uFF08\u5426\u5219\u4F1A\u76D6\u4F4F\u6574\u5C4F\u6321\u4F4F\u6EDA\u52A8\u62D6\u62FD\uFF09\uFF0C
   \u5FC5\u987B\u7531\u6BCF\u4E2A\u70ED\u70B9\u81EA\u5DF1\u628A\u4E8B\u4EF6\u6536\u56DE\u6765\uFF0C\u6F0F\u4E86\u8FD9\u884C\u6574\u4E2A\u539F\u578B\u5C31\u70B9\u4E0D\u52A8\u4E86 */
.uir-hot{position:absolute;padding:0;border:0;cursor:pointer;pointer-events:auto;border-radius:3px;
  background:rgba(13,153,255,.06);
  box-shadow:inset 0 0 0 1.5px rgba(13,153,255,.9),0 0 0 4px rgba(13,153,255,.14);transition:background .12s ease}
.uir-hot:hover{background:rgba(13,153,255,.2)}
.uir-hot.dead{background:rgba(244,63,94,.08);box-shadow:inset 0 0 0 1.5px rgba(244,63,94,.85);cursor:not-allowed}
.uir-tag{position:absolute;left:0;top:-15px;padding:0 5px;border-radius:999px;background:rgba(13,153,255,.95);
  color:#fff;font-size:9px;line-height:15px;white-space:nowrap;pointer-events:none;font-weight:500}
.uir-hot.dead .uir-tag{background:rgba(244,63,94,.95)}
.uir-bottom{display:flex;flex:none;align-items:center;justify-content:center;gap:6px;height:48px;padding:0 12px;overflow-x:auto}
.uir-chip{all:unset;cursor:pointer;flex:none;height:28px;display:flex;align-items:center;padding:0 10px;border-radius:999px;
  background:rgba(255,255,255,.08);color:#a1a1aa;font-size:11px;white-space:nowrap}
.uir-chip:hover{background:rgba(255,255,255,.16)}
.uir-chip.on{background:rgba(255,255,255,.95);color:#18181b;font-weight:600}
.uir-empty{color:#71717a;font-size:13px}
`;
function prototypeRuntime(root, payload, hooks) {
  const RT_ACTION_TEXT = {
    navigate: "\u8DF3\u8F6C\u753B\u677F",
    back: "\u8FD4\u56DE\u4E0A\u4E00\u5C4F",
    overlay: "\u6253\u5F00\u6D6E\u5C42",
    closeOverlay: "\u5173\u95ED\u6D6E\u5C42",
    scrollTo: "\u6EDA\u52A8\u5230",
    toggleVisible: "\u663E\u793A/\u9690\u85CF"
  };
  const RT_TRIGGER_GLYPH = {
    doubleTap: "\xD72",
    longPress: "\u23F1",
    swipeLeft: "\u2190",
    swipeRight: "\u2192",
    swipeUp: "\u2191",
    swipeDown: "\u2193"
  };
  const RT_DRAG_SLOP = 8;
  const RT_SWIPE_SLOP = 40;
  const RT_HOLD_MS = 500;
  const screens = payload.screens || [];
  const hotspots = payload.hotspots || {};
  const triggerLabels = payload.triggerLabels || {};
  const hooks0 = hooks || {};
  const byId = {};
  for (let i = 0;i < screens.length; i++)
    byId[screens[i].id] = screens[i];
  const cleanupFns = [];
  const cache = {};
  const history = [];
  const overlays = [];
  const toggled = {};
  const scrollState = {};
  const extentCache = {};
  let currentId = "";
  let fit = 1;
  let suppressClick = false;
  root.className = "uir";
  root.innerHTML = '<div class="uir-top">' + '<button class="uir-btn uir-back" type="button" title="\u8FD4\u56DE\u4E0A\u4E00\u5C42\uFF08\u2190\uFF09">\u2190</button>' + '<div class="uir-title"><span class="uir-dot"></span><b class="uir-name"></b><span class="uir-page"></span>' + '<span class="uir-pill">\u70B9\u51FB\u9AD8\u4EAE\u533A\u53EF\u4EA4\u4E92</span></div>' + '<div class="uir-spacer"></div>' + '<button class="uir-btn uir-exit" type="button" title="\u9000\u51FA\u9884\u89C8\uFF08Esc\uFF09">\xD7</button>' + "</div>" + '<div class="uir-stage"><div class="uir-plane"></div></div>' + '<div class="uir-bottom"></div>';
  const stage = root.querySelector(".uir-stage");
  const plane = root.querySelector(".uir-plane");
  const bottom = root.querySelector(".uir-bottom");
  const elName = root.querySelector(".uir-name");
  const elPage = root.querySelector(".uir-page");
  const btnBack = root.querySelector(".uir-back");
  const btnExit = root.querySelector(".uir-exit");
  btnExit.style.display = hooks0.onExit ? "" : "none";
  const mk = (tag, cls) => {
    const e = document.createElement(tag);
    if (cls)
      e.className = cls;
    return e;
  };
  function nodeEl(scope, id) {
    const all = scope.querySelectorAll("[data-id]");
    for (let i = 0;i < all.length; i++)
      if (all[i].getAttribute("data-id") === id)
        return all[i];
    return null;
  }
  function applyToggles(scope, screenId) {
    const all = scope.querySelectorAll("[data-id]");
    for (let i = 0;i < all.length; i++) {
      const nid = all[i].getAttribute("data-id") || "";
      const key = screenId + "/" + nid;
      if (Object.prototype.hasOwnProperty.call(toggled, key)) {
        all[i].style.display = toggled[key] ? "" : "none";
      }
    }
  }
  function buildScreen(sc, role) {
    const key = role + ":" + sc.id;
    const cached = cache[key];
    if (cached) {
      applyToggles(cached, sc.id);
      return cached;
    }
    const wrap = mk("div", "uir-wrap " + (role === "ov" ? "uir-ov" : "uir-base"));
    wrap.setAttribute("data-screen", sc.id);
    wrap.style.width = sc.w + "px";
    wrap.style.height = sc.h + "px";
    const fitBox = mk("div", "uir-fit");
    fitBox.innerHTML = sc.svg;
    const layer = mk("div", "uir-hot-layer");
    const list = hotspots[sc.id] || [];
    for (let i = 0;i < list.length; i++) {
      const h = list[i];
      const acts = h.actions || [];
      const live = acts.length > 0;
      const btn = mk("button", "uir-hot" + (live ? "" : " dead"));
      btn.type = "button";
      btn.setAttribute("data-hot", h.nodeId);
      btn.style.left = h.box.x + "px";
      btn.style.top = h.box.y + "px";
      btn.style.width = Math.max(h.box.w, 8) + "px";
      btn.style.height = Math.max(h.box.h, 8) + "px";
      if (!live) {
        btn.title = (h.name || h.nodeId) + "\uFF1A\u4EA4\u4E92\u76EE\u6807\u5DF2\u5220\u9664";
        btn.appendChild(tagEl("\u5931\u6548"));
      } else {
        const parts = [];
        let gestureTag = "";
        for (let k = 0;k < acts.length; k++) {
          const a = acts[k];
          const tl = triggerLabels[a.trigger] || a.trigger;
          let text = tl + " \u2192 " + (RT_ACTION_TEXT[a.action] || a.action);
          if (a.targetName)
            text += "\u300C" + a.targetName + "\u300D";
          parts.push(text);
          if (!gestureTag && a.trigger !== "tap") {
            gestureTag = tl + (RT_TRIGGER_GLYPH[a.trigger] ? " " + RT_TRIGGER_GLYPH[a.trigger] : "");
          }
        }
        btn.title = (h.name || h.nodeId) + "\uFF1A" + parts.join(" / ");
        if (gestureTag)
          btn.appendChild(tagEl(gestureTag));
      }
      attach(btn, h, sc.id);
      layer.appendChild(btn);
    }
    fitBox.appendChild(layer);
    wrap.appendChild(fitBox);
    cache[key] = wrap;
    applyToggles(wrap, sc.id);
    return wrap;
  }
  function tagEl(text) {
    const t = mk("span", "uir-tag");
    t.textContent = text;
    return t;
  }
  function attach(btn, h, screenId) {
    const acts = h.actions || [];
    const find = (t) => {
      for (let i = 0;i < acts.length; i++)
        if (acts[i].trigger === t)
          return acts[i];
      return;
    };
    const tap = find("tap");
    const dbl = find("doubleTap");
    const hold = find("longPress");
    const swipes = [find("swipeLeft"), find("swipeRight"), find("swipeUp"), find("swipeDown")];
    if (!tap && !dbl && !hold && !swipes[0] && !swipes[1] && !swipes[2] && !swipes[3])
      return;
    let downAt = 0;
    let downX = 0;
    let downY = 0;
    let holdTimer = null;
    let holdFired = false;
    let tapTimer = null;
    const clearHold = () => {
      if (holdTimer !== null)
        clearTimeout(holdTimer);
      holdTimer = null;
    };
    btn.addEventListener("pointerdown", (e) => {
      downAt = Date.now();
      downX = e.clientX;
      downY = e.clientY;
      holdFired = false;
      if (hold) {
        holdTimer = setTimeout(() => {
          holdFired = true;
          run(hold, screenId);
        }, RT_HOLD_MS);
      }
    });
    btn.addEventListener("pointerleave", clearHold);
    btn.addEventListener("pointercancel", clearHold);
    btn.addEventListener("pointerup", (e) => {
      clearHold();
      if (holdFired)
        return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx > RT_SWIPE_SLOP || ady > RT_SWIPE_SLOP) {
        const idx = adx >= ady ? dx < 0 ? 0 : 1 : dy < 0 ? 2 : 3;
        const hit = swipes[idx];
        if (hit)
          run(hit, screenId);
        return;
      }
      if (adx > RT_DRAG_SLOP || ady > RT_DRAG_SLOP)
        return;
      if (!tap)
        return;
      if (dbl) {
        if (tapTimer !== null)
          clearTimeout(tapTimer);
        tapTimer = setTimeout(() => {
          tapTimer = null;
          run(tap, screenId);
        }, 240);
      } else {
        run(tap, screenId);
      }
    });
    if (dbl) {
      btn.addEventListener("dblclick", (e) => {
        e.preventDefault();
        if (tapTimer !== null)
          clearTimeout(tapTimer);
        tapTimer = null;
        run(dbl, screenId);
      });
    }
  }
  function run(a, fromScreenId) {
    switch (a.action) {
      case "navigate":
        if (!a.target)
          return;
        clearOverlays();
        goTo(a.target, a.transition, a.duration, true);
        return;
      case "overlay":
        if (a.target)
          openOverlay(a.target, a.position, a.transition, a.duration, a.dismissOnTapOutside);
        return;
      case "closeOverlay":
        closeTopOverlay(a.transition, a.duration);
        return;
      case "back":
        back();
        return;
      case "scrollTo":
        if (a.scrollPlan)
          scrollBodyTo(fromScreenId, a.scrollPlan.x, a.scrollPlan.y);
        return;
      case "toggleVisible":
        if (a.target) {
          const key = fromScreenId + "/" + a.target;
          toggled[key] = !toggled[key];
          for (const k in cache) {
            const w = cache[k];
            if (w && w.getAttribute("data-screen") === fromScreenId)
              applyToggles(w, fromScreenId);
          }
        }
        return;
      default:
        return;
    }
  }
  function animFor(t, dir) {
    const ID = { transform: "translateX(0%) translateY(0%) scale(1)", opacity: "1" };
    const X = (v) => ({ transform: "translateX(" + v + "%)", opacity: "1" });
    const Y = (v) => ({ transform: "translateY(" + v + "%)", opacity: "1" });
    const FADE_IN = { opacity: "0", transform: "translateX(0%) translateY(0%) scale(1)" };
    const FADE_OUT = { opacity: "0", transform: "translateX(0%) translateY(0%) scale(1)" };
    if (t === "pushLeft")
      return dir === "in" ? { from: X(100), to: ID } : { from: ID, to: X(-100) };
    if (t === "pushRight")
      return dir === "in" ? { from: X(-100), to: ID } : { from: ID, to: X(100) };
    if (t === "pushUp")
      return dir === "in" ? { from: Y(100), to: ID } : { from: ID, to: Y(-100) };
    if (t === "pushDown")
      return dir === "in" ? { from: Y(-100), to: ID } : { from: ID, to: Y(100) };
    if (t === "slideUp")
      return dir === "in" ? { from: Y(100), to: ID } : { from: ID, to: Y(100) };
    if (t === "slideDown")
      return dir === "in" ? { from: Y(-100), to: ID } : { from: ID, to: Y(-100) };
    if (t === "scale") {
      return dir === "in" ? { from: { transform: "scale(.92)", opacity: "0" }, to: { transform: "scale(1)", opacity: "1" } } : { from: { transform: "scale(1)", opacity: "1" }, to: { transform: "scale(.96)", opacity: "0" } };
    }
    return dir === "in" ? { from: FADE_IN, to: { opacity: "1" } } : { from: { opacity: "1" }, to: FADE_OUT };
  }
  function applyAnim(el2, s) {
    if (s.transform !== undefined)
      el2.style.transform = s.transform;
    if (s.opacity !== undefined)
      el2.style.opacity = s.opacity;
  }
  const EASE = "cubic-bezier(.2,.8,.2,1)";
  function animateIn(el2, t, ms) {
    if (t === "none" || ms <= 0)
      return;
    const a = animFor(t, "in");
    el2.style.transition = "none";
    applyAnim(el2, a.from);
    el2.offsetWidth;
    el2.style.transition = "transform " + ms + "ms " + EASE + ",opacity " + ms + "ms ease";
    applyAnim(el2, a.to);
  }
  function animateOut(el2, t, ms, done) {
    if (t === "none" || ms <= 0) {
      done();
      return;
    }
    const a = animFor(t, "out");
    el2.style.transition = "transform " + ms + "ms " + EASE + ",opacity " + ms + "ms ease";
    applyAnim(el2, a.to);
    setTimeout(done, ms + 20);
  }
  const invert = (t) => t === "pushLeft" ? "pushRight" : t === "pushRight" ? "pushLeft" : t === "pushUp" ? "pushDown" : t === "pushDown" ? "pushUp" : t === "slideUp" ? "slideDown" : t === "slideDown" ? "slideUp" : t;
  function applyFit(wrap) {
    const inner = wrap.firstElementChild;
    if (inner)
      inner.style.transform = "scale(" + fit + ")";
  }
  function layoutPlane(sc) {
    plane.style.width = sc.w * fit + "px";
    plane.style.height = sc.h * fit + "px";
  }
  function indexOf(id) {
    for (let i = 0;i < screens.length; i++)
      if (screens[i].id === id)
        return i;
    return 0;
  }
  function clearOverlays() {
    while (overlays.length) {
      const ov = overlays.pop();
      if (ov.el.parentNode)
        ov.el.parentNode.removeChild(ov.el);
      if (ov.backdrop && ov.backdrop.parentNode)
        ov.backdrop.parentNode.removeChild(ov.backdrop);
    }
  }
  function goTo(id, transition, duration, remember) {
    const sc = byId[id];
    if (!sc || id === currentId)
      return;
    const prevId = currentId;
    const prevWrap = currentId ? plane.querySelector('.uir-base[data-screen="' + currentId + '"]') : null;
    const t = transition || "pushLeft";
    const ms = duration === undefined ? 300 : duration;
    if (remember && prevId)
      history.push({ id: prevId, transition: t });
    currentId = id;
    const wrap = buildScreen(sc, "base");
    layoutPlane(sc);
    applyFit(wrap);
    if (prevWrap && prevWrap !== wrap) {
      animateOut(prevWrap, t, ms, () => {
        if (prevWrap.parentNode)
          prevWrap.parentNode.removeChild(prevWrap);
      });
    }
    plane.appendChild(wrap);
    animateIn(wrap, t, ms);
    scrollState[id] = scrollState[id] || { x: 0, y: 0 };
    syncHud();
    if (hooks0.onScreen)
      hooks0.onScreen(id, indexOf(id));
  }
  function back() {
    if (overlays.length) {
      closeTopOverlay(null, undefined);
      return;
    }
    const prev = history.pop();
    if (!prev)
      return;
    goTo(prev.id, invert(prev.transition), 300, false);
  }
  function anchorFor(pos, screen, layer) {
    if (pos === "top")
      return { x: Math.round((screen.w - layer.w) / 2), y: 0 };
    if (pos === "bottom")
      return { x: Math.round((screen.w - layer.w) / 2), y: screen.h - layer.h };
    if (pos === "left")
      return { x: 0, y: Math.round((screen.h - layer.h) / 2) };
    if (pos === "right")
      return { x: screen.w - layer.w, y: Math.round((screen.h - layer.h) / 2) };
    return { x: Math.round((screen.w - layer.w) / 2), y: Math.round((screen.h - layer.h) / 2) };
  }
  function placeOverlay(el2, pos, sc) {
    const screen = currentId ? byId[currentId] : sc;
    const anchor = anchorFor(pos, screen || sc, sc);
    el2.style.left = anchor.x * fit + "px";
    el2.style.top = anchor.y * fit + "px";
  }
  function openOverlay(id, position, transition, duration, dismiss) {
    const sc = byId[id];
    if (!sc)
      return;
    const pos = position || "center";
    const wrap = buildScreen(sc, "ov");
    wrap.style.transformOrigin = "center center";
    applyFit(wrap);
    placeOverlay(wrap, pos, sc);
    let backdrop = null;
    if (pos === "center" || pos === "top" || pos === "bottom") {
      backdrop = mk("div", "uir-backdrop");
      plane.appendChild(backdrop);
      backdrop.offsetWidth;
      backdrop.classList.add("on");
      if (dismiss)
        backdrop.addEventListener("click", () => closeTopOverlay(null, undefined));
    }
    plane.appendChild(wrap);
    const t = transition || "scale";
    animateIn(wrap, t, duration === undefined ? 240 : duration);
    overlays.push({ id, position: pos, transition: t, el: wrap, backdrop });
    syncHud();
  }
  function closeTopOverlay(transition, duration) {
    const top = overlays.pop();
    if (!top)
      return;
    const t = transition && transition !== "none" ? transition : invert(top.transition);
    const ms = duration === undefined ? 240 : duration;
    if (top.backdrop) {
      top.backdrop.classList.remove("on");
      const bd = top.backdrop;
      setTimeout(() => {
        if (bd.parentNode)
          bd.parentNode.removeChild(bd);
      }, 240);
    }
    animateOut(top.el, t, ms, () => {
      if (top.el.parentNode)
        top.el.parentNode.removeChild(top.el);
    });
    syncHud();
  }
  function contentExtent(screenId) {
    const hit = extentCache[screenId];
    if (hit)
      return hit;
    const w = plane.querySelector('.uir-base[data-screen="' + screenId + '"]');
    const body = w ? w.querySelector("[data-scroll-body]") : null;
    let out = { x: 0, y: 0 };
    if (body && typeof body.getBBox === "function") {
      try {
        const bb = body.getBBox();
        out = { x: bb.x + bb.width, y: bb.y + bb.height };
      } catch {}
    }
    if (out.x || out.y)
      extentCache[screenId] = out;
    return out;
  }
  function scrollBodyTo(screenId, x, y) {
    const wrap = plane.querySelector('.uir-base[data-screen="' + screenId + '"]');
    if (!wrap)
      return;
    const body = wrap.querySelector("[data-scroll-body]");
    if (!body)
      return;
    const sc = byId[screenId];
    if (!sc)
      return;
    const axis = body.getAttribute("data-scroll-body") || "";
    const ext = contentExtent(screenId);
    const maxY = Math.max(0, ext.y - sc.h);
    const maxX = Math.max(0, ext.x - sc.w);
    const ny = axis === "v" || axis === "both" ? Math.min(Math.max(0, y), maxY) : 0;
    const nx = axis === "h" || axis === "both" ? Math.min(Math.max(0, x), maxX) : 0;
    scrollState[screenId] = { x: nx, y: ny };
    body.setAttribute("transform", "translate(" + -nx + " " + -ny + ")");
  }
  function attachScroll() {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    const cur = () => currentId ? byId[currentId] : undefined;
    stage.addEventListener("wheel", (e) => {
      const s = cur();
      if (!s || !s.scroll)
        return;
      e.preventDefault();
      const st = scrollState[s.id] || { x: 0, y: 0 };
      scrollBodyTo(s.id, st.x + e.deltaX, st.y + e.deltaY);
    }, { passive: false });
    stage.addEventListener("pointerdown", (e) => {
      const s = cur();
      if (!s || !s.scroll)
        return;
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    stage.addEventListener("pointermove", (e) => {
      if (!dragging)
        return;
      const s = cur();
      if (!s)
        return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3)
        moved = true;
      lastX = e.clientX;
      lastY = e.clientY;
      const st = scrollState[s.id] || { x: 0, y: 0 };
      scrollBodyTo(s.id, st.x - dx / fit, st.y - dy / fit);
    });
    const end = () => {
      if (dragging && moved) {
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
      dragging = false;
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("click", (e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
  }
  function syncHud() {
    const sc = currentId ? byId[currentId] : undefined;
    elName.textContent = sc ? sc.name : "\u65E0\u753B\u677F";
    elPage.textContent = sc ? indexOf(sc.id) + 1 + "/" + screens.length : "";
    btnBack.disabled = overlays.length === 0 && history.length === 0;
    const chips = bottom.children;
    for (let i = 0;i < chips.length; i++) {
      const c = chips[i];
      if (c.getAttribute("data-target") === currentId)
        c.classList.add("on");
      else
        c.classList.remove("on");
    }
  }
  function doFit() {
    const sc = currentId ? byId[currentId] : screens[0];
    if (!sc || !stage.clientWidth)
      return;
    fit = Math.min(1.5, Math.max(0.1, Math.min((stage.clientWidth - 32) / sc.w, (stage.clientHeight - 32) / sc.h)));
    layoutPlane(sc);
    for (const key in cache) {
      const w = cache[key];
      if (!w)
        continue;
      applyFit(w);
      if (key.indexOf("ov:") === 0) {
        const ov = overlays.find((o) => o.el === w);
        const scr = byId[w.getAttribute("data-screen") || ""];
        if (ov && scr)
          placeOverlay(w, ov.position, scr);
      }
    }
  }
  const onKey = (e) => {
    if (e.key === "Escape") {
      if (overlays.length) {
        closeTopOverlay(null, undefined);
        return;
      }
      if (hooks0.onExit)
        hooks0.onExit();
      return;
    }
    if (overlays.length)
      return;
    if (e.key === "ArrowLeft" && history.length)
      back();
    if (e.key === "ArrowRight") {
      const i = (currentId ? indexOf(currentId) : 0) + 1;
      if (i < screens.length)
        goTo(screens[i].id, "pushLeft", 300, true);
    }
  };
  window.addEventListener("keydown", onKey);
  cleanupFns.push(() => window.removeEventListener("keydown", onKey));
  btnBack.addEventListener("click", () => back());
  if (hooks0.onExit)
    btnExit.addEventListener("click", () => hooks0.onExit());
  attachScroll();
  for (let i = 0;i < screens.length; i++) {
    const s = screens[i];
    const chip = mk("button", "uir-chip");
    chip.type = "button";
    chip.textContent = s.name;
    chip.setAttribute("data-target", s.id);
    chip.addEventListener("click", () => {
      if (overlays.length || s.id === currentId)
        return;
      goTo(s.id, "fade", 200, true);
    });
    bottom.appendChild(chip);
  }
  if (screens.length === 0) {
    plane.innerHTML = '<div class="uir-empty">\u8FD8\u6CA1\u6709\u753B\u677F\uFF1A\u5148\u753B\u4E00\u5757\u753B\u677F\uFF08F\uFF09\u518D\u9884\u89C8</div>';
  } else {
    let startId = payload.start;
    if (!byId[startId])
      startId = screens[0].id;
    const sc = byId[startId];
    currentId = startId;
    if (stage.clientWidth) {
      fit = Math.min(1.5, Math.max(0.1, Math.min((stage.clientWidth - 32) / sc.w, (stage.clientHeight - 32) / sc.h)));
    }
    layoutPlane(sc);
    const first = buildScreen(sc, "base");
    applyFit(first);
    plane.appendChild(first);
    syncHud();
    if (hooks0.onScreen)
      hooks0.onScreen(startId, indexOf(startId));
  }
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => doFit());
    ro.observe(stage);
  }
  window.addEventListener("resize", doFit);
  cleanupFns.push(() => window.removeEventListener("resize", doFit));
  return {
    go: (id, transition, duration) => {
      if (overlays.length)
        return;
      goTo(id, transition || "fade", duration === undefined ? 200 : duration, true);
    },
    back: () => back(),
    current: () => currentId,
    destroy: () => {
      if (ro)
        ro.disconnect();
      for (const f of cleanupFns)
        f();
      root.innerHTML = "";
    }
  };
}
function prototypeRuntimeSource() {
  return prototypeRuntime.toString();
}
var RUNTIME_TRIGGER_LABELS = {
  tap: "\u5355\u51FB",
  doubleTap: "\u53CC\u51FB",
  longPress: "\u957F\u6309",
  swipeLeft: "\u5DE6\u6ED1",
  swipeRight: "\u53F3\u6ED1",
  swipeUp: "\u4E0A\u6ED1",
  swipeDown: "\u4E0B\u6ED1"
};

// ui/src/prototype-payload.ts
function toRuntimeHotspots(doc, frame, screenIds) {
  return collectHotspots(frame, doc).map((h) => {
    const actions = [];
    const dead = [...h.dead];
    for (const a of h.actions) {
      const needsScreen = a.action === "navigate" || a.action === "overlay";
      if (needsScreen && (!a.target || !screenIds.has(a.target))) {
        dead.push({ trigger: a.trigger, action: a.action, to: a.target ?? "" });
        continue;
      }
      actions.push({
        trigger: a.trigger,
        action: a.action,
        target: a.target,
        targetName: a.targetName,
        transition: a.transition,
        duration: a.duration,
        position: a.position,
        dismissOnTapOutside: a.dismissOnTapOutside,
        ...a.scrollPlan ? { scrollPlan: { x: a.scrollPlan.x, y: a.scrollPlan.y } } : {}
      });
    }
    return { nodeId: h.nodeId, name: h.name, box: { x: h.box.x, y: h.box.y, w: h.box.w, h: h.box.h }, actions, dead };
  });
}
function fluidSvg(svg) {
  return svg.replace(/ width="\d+(\.\d+)?" height="\d+(\.\d+)?"/, ' width="100%" height="100%"');
}
function buildRuntimePayload(doc, opts) {
  const all = allFrames(doc);
  const picked = opts.frameIds ? opts.frameIds.map((id) => all.find((f) => f.frame.id === id)).filter((f) => !!f) : all;
  const screens = [];
  const drawn = [];
  for (const { frame } of picked) {
    const r = buildSvg(doc, [frame.id], { measure: opts.measure, images: opts.images ?? new Map });
    if (!r)
      continue;
    screens.push({
      id: frame.id,
      name: frame.name,
      w: Math.max(1, Math.round(frame.w)),
      h: Math.max(1, Math.round(frame.h)),
      svg: fluidSvg(r.svg),
      ...frame.scroll ? { scroll: frame.scroll } : {}
    });
    drawn.push(frame);
  }
  const screenIds = new Set(screens.map((s) => s.id));
  const hotspots = {};
  for (const frame of drawn) {
    const hs = toRuntimeHotspots(doc, frame, screenIds);
    if (hs.length)
      hotspots[frame.id] = hs;
  }
  return {
    screens,
    start: screens[0]?.id ?? "",
    hotspots,
    triggerLabels: { ...TRIGGER_LABELS, ...RUNTIME_TRIGGER_LABELS }
  };
}

// ui/src/html.ts
var esc2 = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function renderPrototypeHtml(doc, opts) {
  const frames = allFrames(doc).filter((f) => !opts.pageId || f.pageId === opts.pageId);
  if (frames.length === 0)
    return null;
  const payload = buildRuntimePayload(doc, {
    measure: opts.measure,
    images: opts.images,
    frameIds: frames.map((f) => f.frame.id)
  });
  if (payload.screens.length === 0)
    return null;
  const title = esc2(opts.title ?? doc.meta.name);
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} \xB7 \u539F\u578B</title>
<style>
  html,body{margin:0;height:100%;background:#18181b;overflow:hidden}
  #app{position:fixed;inset:0}
${RUNTIME_CSS}
</style>
</head>
<body>
<div id="app"></div>
<script type="application/json" id="payload">${json}</script>
<script>
(function(){
  var raw=document.getElementById('payload').textContent;
  var payload;try{payload=JSON.parse(raw)}catch(e){document.getElementById('app').innerHTML='<div style="color:#e4e4e7;padding:24px">\u539F\u578B\u6570\u636E\u635F\u574F</div>';return}
  var factory=${prototypeRuntimeSource()};
  factory(document.getElementById('app'),payload,{});
})();
</script>
</body>
</html>`;
}

// ui/src/css.ts
var px = (v) => `${Math.round(v * 100) / 100}px`;
function withAlpha(color, opacity) {
  if (opacity >= 1)
    return color;
  let m = /^#([0-9a-fA-F]{3})$/.exec(color);
  if (m)
    color = `#${m[1].split("").map((c) => c + c).join("")}`;
  m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(color);
  if (!m)
    return color;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const a = Math.round(opacity * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function fillDecl(f, doc) {
  if (f.visible === false)
    return null;
  const op = f.opacity ?? 1;
  if (f.type === "image") {
    if (!f.src)
      return null;
    const size = f.scaleMode === "fit" ? "contain" : f.scaleMode === "stretch" ? "100% 100%" : "cover";
    return `url("${f.src}") center / ${size} no-repeat`;
  }
  if (f.type === "solid")
    return withAlpha(resolveVarColor(doc, f.color), op);
  const stops = (f.stops ?? []).map((s) => `${resolveVarColor(doc, s.color)} ${Math.round(s.at * 100)}%`).join(", ");
  if (!stops)
    return null;
  if (f.type === "linear") {
    return `linear-gradient(${((180 + (f.angle ?? 0)) % 360 + 360) % 360}deg, ${stops})`;
  }
  const cx = Math.round((f.center?.x ?? 0.5) * 100);
  const cy = Math.round((f.center?.y ?? 0.5) * 100);
  return `radial-gradient(circle at ${cx}% ${cy}%, ${stops})`;
}
function strokeRingAndBorder(s, doc) {
  const style = s.style === "dashed" ? "dashed" : s.style === "dotted" ? "dotted" : "solid";
  const w = px(s.width);
  const color = resolveVarColor(doc, s.color);
  if (s.align === "inside")
    return { ring: `inset 0 0 0 ${w} ${color}` };
  if (s.align === "outside")
    return { ring: `0 0 0 ${w} ${color}` };
  return { border: `${w} ${style} ${color}` };
}
function nodeCssDecls(node, doc) {
  const d = [];
  d.push(`position: absolute;`, `left: ${px(node.x)};`, `top: ${px(node.y)};`);
  d.push(`width: ${px(node.w)};`, `height: ${px(node.h)};`);
  if (node.type === "ellipse")
    d.push(`border-radius: 50%;`);
  else {
    const rad = radiusProp(node);
    if (typeof rad === "number") {
      if (rad > 0)
        d.push(`border-radius: ${px(rad)};`);
    } else if (Array.isArray(rad)) {
      if (rad.some((v) => v > 0))
        d.push(`border-radius: ${rad.map(px).join(" ")};`);
    }
  }
  if (node.type === "vector")
    d.push(`clip-path: path("${node.path}");`);
  if (node.rotation)
    d.push(`transform: rotate(${Math.round(node.rotation * 100) / 100}deg);`);
  if (node.flipX && node.flipY)
    d.push(`transform: scale(-1, -1);`);
  else if (node.flipX)
    d.push(`transform: scaleX(-1);`);
  else if (node.flipY)
    d.push(`transform: scaleY(-1);`);
  if (node.blendMode)
    d.push(`mix-blend-mode: ${node.blendMode};`);
  if (node.opacity !== undefined && node.opacity < 1)
    d.push(`opacity: ${node.opacity};`);
  const shadows = [];
  let border = null;
  if ("fills" in node) {
    const layers = node.fills.map((f) => fillDecl(f, doc)).filter((x) => !!x).reverse();
    if (node.type === "frame") {
      d.push(`overflow: ${node.clip === false ? "visible" : "hidden"};`);
    }
    if (layers.length === 1)
      d.push(`background: ${layers[0]};`);
    else if (layers.length > 1)
      d.push(`background: ${layers.join(", ")};`);
    else if (node.type === "frame")
      d.push(`background: transparent;`);
  }
  if ("strokes" in node && node.strokes) {
    const s = node.strokes.find((x) => x.visible !== false && x.width > 0);
    if (s) {
      const r = strokeRingAndBorder(s, doc);
      if (r.border)
        border = r.border;
      if (r.ring)
        shadows.push(r.ring);
    }
  }
  if (border)
    d.push(`border: ${border};`);
  for (const e of node.effects ?? []) {
    if (e.visible === false)
      continue;
    if (e.type === "drop-shadow")
      shadows.push(`${px(e.x)} ${px(e.y)} ${px(e.blur)} ${resolveVarColor(doc, e.color)}`);
    else if (e.type === "inner-shadow")
      shadows.push(`inset ${px(e.x)} ${px(e.y)} ${px(e.blur)} ${resolveVarColor(doc, e.color)}`);
    else {
      d.push(`-webkit-backdrop-filter: blur(${px(e.blur)});`);
      d.push(`backdrop-filter: blur(${px(e.blur)});`);
    }
  }
  if (shadows.length)
    d.push(`box-shadow: ${shadows.join(", ")};`);
  if (node.type === "text") {
    const r = node.runs[0];
    if (r) {
      if (r.color)
        d.push(`color: ${resolveVarColor(doc, r.color)};`);
      if (r.size)
        d.push(`font-size: ${px(r.size)};`);
      if (r.weight && r.weight !== 400)
        d.push(`font-weight: ${r.weight};`);
      if (r.italic)
        d.push(`font-style: italic;`);
      if (r.underline)
        d.push(`text-decoration: underline;`);
      if (r.font)
        d.push(`font-family: "${r.font}";`);
    }
    d.push(`line-height: ${node.lineHeight ?? 1.4};`);
    if (node.letterSpacing)
      d.push(`letter-spacing: ${px(node.letterSpacing)};`);
    d.push(`text-align: ${node.align ?? "left"};`);
    if (node.runs.length > 1)
      d.push(`/* \u5BCC\u6587\u672C\u542B ${node.runs.length} \u6BB5\u6837\u5F0F\uFF0C\u6B64\u5904\u53D6\u9996\u6BB5 */`);
  }
  if (node.type === "image") {
    const fit = node.fit === "contain" ? "contain" : node.fit === "stretch" ? "100% 100%" : "cover";
    d.push(`background-image: url("${node.src}");`, `background-size: ${fit};`, `background-position: center;`);
  }
  if (node.type === "line" || node.type === "arrow")
    d.push(`/* ${TYPE_LABELS[node.type]}\uFF1A\u8BF7\u7528 SVG \u5BFC\u51FA\u83B7\u53D6\u77E2\u91CF */`);
  if (["triangle", "diamond", "pentagon", "hexagon", "star"].includes(node.type))
    d.push(`/* ${TYPE_LABELS[node.type]}\uFF1ACSS \u65E0\u6CD5\u7CBE\u786E\u8868\u8FBE\uFF0C\u8BF7\u7528 SVG \u5BFC\u51FA */`);
  return d;
}
function asciiSlug(s) {
  return s.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function looksUuid(slug, id) {
  if (!slug)
    return false;
  if (slug === id.toLowerCase())
    return true;
  if (slug.length < 8)
    return false;
  const digits = (slug.match(/\d/g) ?? []).length;
  const maxRun = Math.max(...slug.split(/[^a-z]+/).map((w) => w.length));
  return digits >= 4 && maxRun <= 3;
}
function cssSelectorOf(node) {
  const slug = asciiSlug(node.name);
  if (slug && !looksUuid(slug, node.id))
    return `.${slug}`;
  return `.${asciiSlug(node.type) || "node"}`;
}
function flattenForCss(node, doc) {
  if (node.type !== "instance" || !doc)
    return node;
  const inst = node;
  const baked = bakeInstanceNodes(doc, inst);
  if (!baked || baked.length === 0)
    return node;
  if (baked.length === 1) {
    const r = baked[0];
    return {
      ...r,
      id: inst.id,
      name: inst.name,
      x: inst.x,
      y: inst.y,
      ...inst.rotation ? { rotation: (r.rotation ?? 0) + inst.rotation } : {},
      ...inst.opacity !== undefined ? { opacity: (r.opacity ?? 1) * inst.opacity } : {}
    };
  }
  return {
    id: inst.id,
    type: "frame",
    name: inst.name,
    x: inst.x,
    y: inst.y,
    w: inst.w,
    h: inst.h,
    ...inst.rotation ? { rotation: inst.rotation } : {},
    ...inst.opacity !== undefined ? { opacity: inst.opacity } : {},
    clip: false,
    fills: [],
    strokes: [],
    children: baked
  };
}
function nodeToCss(node, doc) {
  node = flattenForCss(node, doc);
  const sel = cssSelectorOf(node);
  const slug = asciiSlug(node.name);
  const name = node.name.trim();
  const head = !looksUuid(slug, node.id) && name && name.toLowerCase() !== sel.slice(1) ? `/* ${name} */
` : "";
  const decls = nodeCssDecls(node, doc);
  return `${head}${sel} {
${decls.map((l) => `  ${l}`).join(`
`)}
}`;
}

// mcp/export.ts
var DOC_SUFFIX = ".uidesign.json";
var toRel = (workspace, abs) => {
  const rel = path2.relative(workspace, abs);
  return (rel && !rel.startsWith("..") ? rel : abs).split(path2.sep).join("/");
};
function resolveInside(workspace, rel) {
  const abs = path2.resolve(workspace, rel);
  if (abs !== workspace && !abs.startsWith(workspace + path2.sep)) {
    throw new Error(`\u5BFC\u51FA\u8DEF\u5F84\u8D8A\u51FA\u5DE5\u4F5C\u533A\uFF1A${rel}`);
  }
  return abs;
}
function write(workspace, rel, data) {
  const abs = resolveInside(workspace, rel);
  mkdirSync(path2.dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  return Buffer.byteLength(data);
}
function saveToWorkspace(workspace, rel, data) {
  const clean = (rel || "").trim().replace(/\\/g, "/");
  if (!clean)
    throw new Error("saveTo \u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A");
  write(workspace, clean, data);
  return clean.split("/").filter(Boolean).join("/");
}
async function exportBundle(workspace, docAbs, doc, page, ids, opts = {}) {
  const nodes = ids.map((id) => findNode(doc, id)?.node).filter((n) => !!n && n.visible !== false);
  if (nodes.length === 0)
    throw new Error(`\u9875\u9762\u300C${page.name}\u300D\u6CA1\u6709\u53EF\u89C1\u7684\u9876\u5C42\u753B\u677F\u53EF\u5BFC\u51FA`);
  const dirBase = opts.dirBase ?? path2.basename(docAbs, DOC_SUFFIX);
  const plan = planBundle(doc, page, nodes.map((n) => n.id), dirBase, opts);
  const imgs = readDocImages(workspace, nodes);
  const files = [];
  const srcText = readFileSync2(docAbs);
  files.push({ path: plan.sourcePath, kind: "source", bytes: write(workspace, plan.sourcePath, srcText) });
  let missingAssets = 0;
  for (const a of plan.assets) {
    const buf = imgs.raw.get(a.src);
    if (buf)
      files.push({ path: a.path, kind: "asset", bytes: write(workspace, a.path, buf) });
    else
      missingAssets++;
  }
  if (plan.formats.has("png") || plan.formats.has("svg")) {
    for (const s of plan.screens) {
      if (plan.formats.has("png")) {
        const png = await renderDocPng(workspace, doc, [s.id], {
          scale: plan.scale,
          maxDim: plan.maxDim,
          background: plan.background,
          budgetBytes: null
        });
        if (png)
          files.push({
            path: s.pngPath,
            kind: "png",
            screen: s.name,
            width: png.width,
            height: png.height,
            bytes: write(workspace, s.pngPath, Buffer.from(png.png))
          });
      }
      if (plan.formats.has("svg")) {
        const svg = renderDocSvg(workspace, doc, [s.id], { background: plan.background ?? undefined });
        if (svg)
          files.push({
            path: s.svgPath,
            kind: "svg",
            screen: s.name,
            width: svg.boxW,
            height: svg.boxH,
            bytes: write(workspace, s.svgPath, svg.svg)
          });
      }
    }
  }
  if (plan.formats.has("code")) {
    for (const s of plan.screens) {
      const loc = findNode(doc, s.id);
      if (!loc)
        continue;
      const rules = [];
      const walk = (n) => {
        rules.push(nodeToCss(n, doc));
        if (n.type === "frame" || n.type === "group")
          for (const c of n.children)
            walk(c);
      };
      walk(loc.node);
      files.push({
        path: s.codePath,
        kind: "code",
        screen: s.name,
        bytes: write(workspace, s.codePath, rules.join(`

`))
      });
    }
  }
  if (plan.formats.has("html")) {
    const html = renderPrototypeHtml(doc, {
      measure: makeApproxMeasure(),
      pageId: page.id,
      title: doc.meta.name,
      images: externalImagesMap(plan)
    });
    if (html)
      files.push({ path: plan.indexHtmlPath, kind: "html", bytes: write(workspace, plan.indexHtmlPath, html) });
  }
  const docRel = toRel(workspace, docAbs);
  const manifestText = serializeManifest(buildManifest(doc, plan, docRel, files, new Date().toISOString()));
  files.push({ path: plan.manifestPath, kind: "manifest", bytes: write(workspace, plan.manifestPath, manifestText) });
  return {
    dir: plan.dir,
    doc: docRel,
    docName: doc.meta.name,
    page: plan.pageName,
    screens: plan.screens.map((s) => s.name),
    files: files.map((f) => ({ path: f.path, kind: f.kind, width: f.width, height: f.height, bytes: f.bytes })),
    manifest: plan.manifestPath,
    missingAssets
  };
}

// ui/src/merge.ts
function reidTree(n, map) {
  const c = { ...n, id: uid(n.type[0]) };
  map.set(n.id, c.id);
  if ("children" in c)
    c.children = c.children.map((k) => reidTree(k, map));
  return c;
}
function remapRefs(list, nodeMap, compMap, dead) {
  for (const n of list) {
    if (n.type === "instance") {
      const inst = n;
      if (inst.componentId) {
        const nc = compMap.get(inst.componentId);
        if (nc)
          inst.componentId = nc;
        else
          dead.add(inst.componentId);
      }
      if (inst.overrides) {
        const o = {};
        for (const [k, v] of Object.entries(inst.overrides))
          o[nodeMap.get(k) ?? k] = v;
        inst.overrides = o;
      }
    }
    if ("children" in n)
      remapRefs(n.children, nodeMap, compMap, dead);
  }
}
function mergeImportedDoc(target, incoming, opts) {
  const warnings = [];
  const nodeMap = new Map;
  const compMap = new Map;
  const comps = (incoming.components ?? []).map((c) => {
    const id = uid("c");
    compMap.set(c.id, id);
    return { id, name: c.name, nodes: c.nodes.map((n) => reidTree(n, nodeMap)) };
  });
  let pages = incoming.pages;
  if (opts?.pageNames?.length) {
    const want = new Set(opts.pageNames);
    pages = pages.filter((p) => want.has(p.id) || want.has(p.name));
    const missed = opts.pageNames.filter((q) => !pages.some((p) => p.id === q || p.name === q));
    if (missed.length)
      warnings.push(`\u6765\u6E90\u6863\u91CC\u6CA1\u6709\u8FD9\u4E9B\u9875\uFF1A${missed.join("\u3001")}`);
  }
  if (pages.length === 0)
    throw new Error("\u5BFC\u5165\u5931\u8D25\uFF1A\u6765\u6E90\u6863\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u9875\u9762");
  const newPages = pages.map((p) => ({ id: uid("p"), name: p.name, nodes: p.nodes.map((n) => reidTree(n, nodeMap)) }));
  const dead = new Set;
  for (const c of comps)
    remapRefs(c.nodes, nodeMap, compMap, dead);
  for (const p of newPages)
    remapRefs(p.nodes, nodeMap, compMap, dead);
  if (dead.size)
    warnings.push(`${dead.size} \u4E2A\u5B9E\u4F8B\u5F15\u7528\u7684\u7EC4\u4EF6\u672A\u5728\u6765\u6E90\u6863\u5185\uFF0C\u5C06\u663E\u793A\u4E3A\u300C\u7EC4\u4EF6\u7F3A\u5931\u300D\u5360\u4F4D`);
  const varMap = new Map;
  const takenNames = new Set((target.variables ?? []).map((v) => v.name));
  const newVars = (incoming.variables ?? []).map((v) => {
    const id = uid("v");
    varMap.set(v.id, id);
    let name = v.name;
    for (let i = 2;takenNames.has(name); i++)
      name = `${v.name} ${i}`;
    takenNames.add(name);
    return { id, name, value: v.value, ...v.desc ? { desc: v.desc } : {} };
  });
  if (newVars.length) {
    for (const c of comps)
      remapVarColors(c.nodes, varMap);
    for (const p of newPages)
      remapVarColors(p.nodes, varMap);
  }
  const doc = {
    ...target,
    pages: [...target.pages, ...newPages],
    components: comps.length || target.components?.length ? [...target.components ?? [], ...comps] : undefined,
    variables: newVars.length || target.variables?.length ? [...target.variables ?? [], ...newVars] : undefined
  };
  let nodes = 0;
  const count = (list) => {
    for (const n of list) {
      nodes++;
      if ("children" in n)
        count(n.children);
    }
  };
  for (const p of newPages)
    count(p.nodes);
  for (const c of comps)
    count(c.nodes);
  return { doc, pages: newPages.map((p) => ({ id: p.id, name: p.name })), components: comps.length, variables: newVars.length, nodes, warnings };
}

// node_modules/splaytree/dist/splaytree.js
class f {
  constructor(t, e) {
    this.next = null, this.key = t, this.data = e, this.left = null, this.right = null;
  }
}
function d(n, t) {
  return n > t ? 1 : n < t ? -1 : 0;
}
function u(n, t, e) {
  const r = new f(null, null);
  let l = r, i = r;
  for (;; ) {
    const o = e(n, t.key);
    if (o < 0) {
      if (t.left === null)
        break;
      if (e(n, t.left.key) < 0) {
        const s = t.left;
        if (t.left = s.right, s.right = t, t = s, t.left === null)
          break;
      }
      i.left = t, i = t, t = t.left;
    } else if (o > 0) {
      if (t.right === null)
        break;
      if (e(n, t.right.key) > 0) {
        const s = t.right;
        if (t.right = s.left, s.left = t, t = s, t.right === null)
          break;
      }
      l.right = t, l = t, t = t.right;
    } else
      break;
  }
  return l.right = t.left, i.left = t.right, t.left = r.right, t.right = r.left, t;
}
function c(n, t, e, r) {
  const l = new f(n, t);
  if (e === null)
    return l.left = l.right = null, l;
  e = u(n, e, r);
  const i = r(n, e.key);
  return i < 0 ? (l.left = e.left, l.right = e, e.left = null) : i >= 0 && (l.right = e.right, l.left = e, e.right = null), l;
}
function m(n, t, e) {
  let r = null, l = null;
  if (t) {
    t = u(n, t, e);
    const i = e(t.key, n);
    i === 0 ? (r = t.left, l = t.right) : i < 0 ? (l = t.right, t.right = null, r = t) : (r = t.left, t.left = null, l = t);
  }
  return { left: r, right: l };
}
function w(n, t, e) {
  return t === null ? n : (n === null || (t = u(n.key, t, e), t.left = n), t);
}
function _(n, t, e, r, l) {
  if (n) {
    r(`${t}${e ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 "}${l(n)}
`);
    const i = t + (e ? "    " : "\u2502   ");
    n.left && _(n.left, i, false, r, l), n.right && _(n.right, i, true, r, l);
  }
}

class z {
  constructor(t = d) {
    this._root = null, this._size = 0, this._comparator = t;
  }
  insert(t, e) {
    return this._size++, this._root = c(t, e, this._root, this._comparator);
  }
  add(t, e) {
    const r = new f(t, e);
    this._root === null && (r.left = r.right = null, this._size++, this._root = r);
    const l = this._comparator, i = u(t, this._root, l), o = l(t, i.key);
    return o === 0 ? this._root = i : (o < 0 ? (r.left = i.left, r.right = i, i.left = null) : o > 0 && (r.right = i.right, r.left = i, i.right = null), this._size++, this._root = r), this._root;
  }
  remove(t) {
    this._root = this._remove(t, this._root, this._comparator);
  }
  _remove(t, e, r) {
    let l;
    return e === null ? null : (e = u(t, e, r), r(t, e.key) === 0 ? (e.left === null ? l = e.right : (l = u(t, e.left, r), l.right = e.right), this._size--, l) : e);
  }
  pop() {
    let t = this._root;
    if (t) {
      for (;t.left; )
        t = t.left;
      return this._root = u(t.key, this._root, this._comparator), this._root = this._remove(t.key, this._root, this._comparator), { key: t.key, data: t.data };
    }
    return null;
  }
  findStatic(t) {
    let e = this._root;
    const r = this._comparator;
    for (;e; ) {
      const l = r(t, e.key);
      if (l === 0)
        return e;
      l < 0 ? e = e.left : e = e.right;
    }
    return null;
  }
  find(t) {
    return this._root && (this._root = u(t, this._root, this._comparator), this._comparator(t, this._root.key) !== 0) ? null : this._root;
  }
  contains(t) {
    let e = this._root;
    const r = this._comparator;
    for (;e; ) {
      const l = r(t, e.key);
      if (l === 0)
        return true;
      l < 0 ? e = e.left : e = e.right;
    }
    return false;
  }
  forEach(t, e) {
    let r = this._root;
    const l = [];
    let i = false;
    for (;!i; )
      r !== null ? (l.push(r), r = r.left) : l.length !== 0 ? (r = l.pop(), t.call(e, r), r = r.right) : i = true;
    return this;
  }
  range(t, e, r, l) {
    const i = [], o = this._comparator;
    let s = this._root, h;
    for (;i.length !== 0 || s; )
      if (s)
        i.push(s), s = s.left;
      else {
        if (s = i.pop(), h = o(s.key, e), h > 0)
          break;
        if (o(s.key, t) >= 0 && r.call(l, s))
          return this;
        s = s.right;
      }
    return this;
  }
  keys() {
    const t = [];
    return this.forEach(({ key: e }) => {
      t.push(e);
    }), t;
  }
  values() {
    const t = [];
    return this.forEach(({ data: e }) => {
      t.push(e);
    }), t;
  }
  min() {
    return this._root ? this.minNode(this._root).key : null;
  }
  max() {
    return this._root ? this.maxNode(this._root).key : null;
  }
  minNode(t = this._root) {
    if (t)
      for (;t.left; )
        t = t.left;
    return t;
  }
  maxNode(t = this._root) {
    if (t)
      for (;t.right; )
        t = t.right;
    return t;
  }
  at(t) {
    let e = this._root, r = false, l = 0;
    const i = [];
    for (;!r; )
      if (e)
        i.push(e), e = e.left;
      else if (i.length > 0) {
        if (e = i.pop(), l === t)
          return e;
        l++, e = e.right;
      } else
        r = true;
    return null;
  }
  next(t) {
    let e = this._root, r = null;
    if (t.right) {
      for (r = t.right;r.left; )
        r = r.left;
      return r;
    }
    const l = this._comparator;
    for (;e; ) {
      const i = l(t.key, e.key);
      if (i === 0)
        break;
      i < 0 ? (r = e, e = e.left) : e = e.right;
    }
    return r;
  }
  prev(t) {
    let e = this._root, r = null;
    if (t.left !== null) {
      for (r = t.left;r.right; )
        r = r.right;
      return r;
    }
    const l = this._comparator;
    for (;e; ) {
      const i = l(t.key, e.key);
      if (i === 0)
        break;
      i < 0 ? e = e.left : (r = e, e = e.right);
    }
    return r;
  }
  clear() {
    return this._root = null, this._size = 0, this;
  }
  toList() {
    return k(this._root);
  }
  load(t, e = [], r = false) {
    let l = t.length;
    const i = this._comparator;
    if (r && g(t, e, 0, l - 1, i), this._root === null)
      this._root = a(t, e, 0, l), this._size = l;
    else {
      const o = y(this.toList(), x(t, e), i);
      l = this._size + l, this._root = p({ head: o }, 0, l);
    }
    return this;
  }
  isEmpty() {
    return this._root === null;
  }
  get size() {
    return this._size;
  }
  get root() {
    return this._root;
  }
  toString(t = (e) => String(e.key)) {
    const e = [];
    return _(this._root, "", true, (r) => e.push(r), t), e.join("");
  }
  update(t, e, r) {
    const l = this._comparator;
    let { left: i, right: o } = m(t, this._root, l);
    l(t, e) < 0 ? o = c(e, r, o, l) : i = c(e, r, i, l), this._root = w(i, o, l);
  }
  split(t) {
    return m(t, this._root, this._comparator);
  }
  *[Symbol.iterator]() {
    let t = this._root;
    const e = [];
    let r = false;
    for (;!r; )
      t !== null ? (e.push(t), t = t.left) : e.length !== 0 ? (t = e.pop(), yield t, t = t.right) : r = true;
  }
}
function a(n, t, e, r) {
  const l = r - e;
  if (l > 0) {
    const i = e + Math.floor(l / 2), o = n[i], s = t[i], h = new f(o, s);
    return h.left = a(n, t, e, i), h.right = a(n, t, i + 1, r), h;
  }
  return null;
}
function x(n, t) {
  const e = new f(null, null);
  let r = e;
  for (let l = 0;l < n.length; l++)
    r = r.next = new f(n[l], t[l]);
  return r.next = null, e.next;
}
function k(n) {
  let t = n;
  const e = [];
  let r = false;
  const l = new f(null, null);
  let i = l;
  for (;!r; )
    t ? (e.push(t), t = t.left) : e.length > 0 ? (t = i = i.next = e.pop(), t = t.right) : r = true;
  return i.next = null, l.next;
}
function p(n, t, e) {
  const r = e - t;
  if (r > 0) {
    const l = t + Math.floor(r / 2), i = p(n, t, l), o = n.head;
    return o.left = i, n.head = n.head.next, o.right = p(n, l + 1, e), o;
  }
  return null;
}
function y(n, t, e) {
  const r = new f(null, null);
  let l = r, i = n, o = t;
  for (;i !== null && o !== null; )
    e(i.key, o.key) < 0 ? (l.next = i, i = i.next) : (l.next = o, o = o.next), l = l.next;
  return i !== null ? l.next = i : o !== null && (l.next = o), r.next;
}
function g(n, t, e, r, l) {
  if (e >= r)
    return;
  const i = n[e + r >> 1];
  let o = e - 1, s = r + 1;
  for (;; ) {
    do
      o++;
    while (l(n[o], i) < 0);
    do
      s--;
    while (l(n[s], i) > 0);
    if (o >= s)
      break;
    let h = n[o];
    n[o] = n[s], n[s] = h, h = t[o], t[o] = t[s], t[s] = h;
  }
  g(n, t, e, s, l), g(n, t, s + 1, r, l);
}

// node_modules/robust-predicates/esm/util.js
var epsilon = 0.00000000000000011102230246251565;
var splitter = 134217729;
var resulterrbound = (3 + 8 * epsilon) * epsilon;
function sum(elen, e, flen, f, h) {
  let Q, Qnew, hh, bvirt;
  let enow = e[0];
  let fnow = f[0];
  let eindex = 0;
  let findex = 0;
  if (fnow > enow === fnow > -enow) {
    Q = enow;
    enow = e[++eindex];
  } else {
    Q = fnow;
    fnow = f[++findex];
  }
  let hindex = 0;
  if (eindex < elen && findex < flen) {
    if (fnow > enow === fnow > -enow) {
      Qnew = enow + Q;
      hh = Q - (Qnew - enow);
      enow = e[++eindex];
    } else {
      Qnew = fnow + Q;
      hh = Q - (Qnew - fnow);
      fnow = f[++findex];
    }
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
    while (eindex < elen && findex < flen) {
      if (fnow > enow === fnow > -enow) {
        Qnew = Q + enow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (enow - bvirt);
        enow = e[++eindex];
      } else {
        Qnew = Q + fnow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (fnow - bvirt);
        fnow = f[++findex];
      }
      Q = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
    }
  }
  while (eindex < elen) {
    Qnew = Q + enow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (enow - bvirt);
    enow = e[++eindex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  while (findex < flen) {
    Qnew = Q + fnow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (fnow - bvirt);
    fnow = f[++findex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  if (Q !== 0 || hindex === 0) {
    h[hindex++] = Q;
  }
  return hindex;
}
function estimate(elen, e) {
  let Q = e[0];
  for (let i = 1;i < elen; i++)
    Q += e[i];
  return Q;
}
function vec(n) {
  return new Float64Array(n);
}

// node_modules/robust-predicates/esm/orient2d.js
var ccwerrboundA = (3 + 16 * epsilon) * epsilon;
var ccwerrboundB = (2 + 12 * epsilon) * epsilon;
var ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;
var B = vec(4);
var C1 = vec(8);
var C2 = vec(12);
var D = vec(16);
var u2 = vec(4);
function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
  let acxtail, acytail, bcxtail, bcytail;
  let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;
  const acx = ax - cx;
  const bcx = bx - cx;
  const acy = ay - cy;
  const bcy = by - cy;
  s1 = acx * bcy;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcx;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  B[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  B[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  B[2] = _j - (u3 - bvirt) + (_i - bvirt);
  B[3] = u3;
  let det = estimate(4, B);
  let errbound = ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) {
    return det;
  }
  bvirt = ax - acx;
  acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx;
  bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy;
  acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy;
  bcytail = by - (bcy + bvirt) + (bvirt - cy);
  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) {
    return det;
  }
  errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound)
    return det;
  s1 = acxtail * bcy;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcx;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u2[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u2[3] = u3;
  const C1len = sum(4, B, 4, u2, C1);
  s1 = acx * bcytail;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcxtail;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u2[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u2[3] = u3;
  const C2len = sum(C1len, C1, 4, u2, C2);
  s1 = acxtail * bcytail;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcxtail;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u2[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u2[3] = u3;
  const Dlen = sum(C2len, C2, 4, u2, D);
  return D[Dlen - 1];
}
function orient2d(ax, ay, bx, by, cx, cy) {
  const detleft = (ay - cy) * (bx - cx);
  const detright = (ax - cx) * (by - cy);
  const det = detleft - detright;
  const detsum = Math.abs(detleft + detright);
  if (Math.abs(det) >= ccwerrboundA * detsum)
    return det;
  return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}
// node_modules/robust-predicates/esm/orient3d.js
var o3derrboundA = (7 + 56 * epsilon) * epsilon;
var o3derrboundB = (3 + 28 * epsilon) * epsilon;
var o3derrboundC = (26 + 288 * epsilon) * epsilon * epsilon;
var bc = vec(4);
var ca = vec(4);
var ab = vec(4);
var at_b = vec(4);
var at_c = vec(4);
var bt_c = vec(4);
var bt_a = vec(4);
var ct_a = vec(4);
var ct_b = vec(4);
var bct = vec(8);
var cat = vec(8);
var abt = vec(8);
var u3 = vec(4);
var _8 = vec(8);
var _8b = vec(8);
var _16 = vec(16);
var _12 = vec(12);
var fin = vec(192);
var fin2 = vec(192);
// node_modules/robust-predicates/esm/incircle.js
var iccerrboundA = (10 + 96 * epsilon) * epsilon;
var iccerrboundB = (4 + 48 * epsilon) * epsilon;
var iccerrboundC = (44 + 576 * epsilon) * epsilon * epsilon;
var bc2 = vec(4);
var ca2 = vec(4);
var ab2 = vec(4);
var aa = vec(4);
var bb = vec(4);
var cc = vec(4);
var u4 = vec(4);
var v = vec(4);
var axtbc = vec(8);
var aytbc = vec(8);
var bxtca = vec(8);
var bytca = vec(8);
var cxtab = vec(8);
var cytab = vec(8);
var abt2 = vec(8);
var bct2 = vec(8);
var cat2 = vec(8);
var abtt = vec(4);
var bctt = vec(4);
var catt = vec(4);
var _82 = vec(8);
var _162 = vec(16);
var _16b = vec(16);
var _16c = vec(16);
var _32 = vec(32);
var _32b = vec(32);
var _48 = vec(48);
var _64 = vec(64);
var fin3 = vec(1152);
var fin22 = vec(1152);
// node_modules/robust-predicates/esm/insphere.js
var isperrboundA = (16 + 224 * epsilon) * epsilon;
var isperrboundB = (5 + 72 * epsilon) * epsilon;
var isperrboundC = (71 + 1408 * epsilon) * epsilon * epsilon;
var ab3 = vec(4);
var bc3 = vec(4);
var cd = vec(4);
var de = vec(4);
var ea = vec(4);
var ac = vec(4);
var bd = vec(4);
var ce = vec(4);
var da = vec(4);
var eb = vec(4);
var abc = vec(24);
var bcd = vec(24);
var cde = vec(24);
var dea = vec(24);
var eab = vec(24);
var abd = vec(24);
var bce = vec(24);
var cda = vec(24);
var deb = vec(24);
var eac = vec(24);
var adet = vec(1152);
var bdet = vec(1152);
var cdet = vec(1152);
var ddet = vec(1152);
var edet = vec(1152);
var abdet = vec(2304);
var cddet = vec(2304);
var cdedet = vec(3456);
var deter = vec(5760);
var _83 = vec(8);
var _8b2 = vec(8);
var _8c = vec(8);
var _163 = vec(16);
var _24 = vec(24);
var _482 = vec(48);
var _48b = vec(48);
var _96 = vec(96);
var _192 = vec(192);
var _384x = vec(384);
var _384y = vec(384);
var _384z = vec(384);
var _768 = vec(768);
var xdet = vec(96);
var ydet = vec(96);
var zdet = vec(96);
var fin4 = vec(1152);
// node_modules/polygon-clipping/dist/polygon-clipping.esm.js
var isInBbox = (bbox, point) => {
  return bbox.ll.x <= point.x && point.x <= bbox.ur.x && bbox.ll.y <= point.y && point.y <= bbox.ur.y;
};
var getBboxOverlap = (b1, b2) => {
  if (b2.ur.x < b1.ll.x || b1.ur.x < b2.ll.x || b2.ur.y < b1.ll.y || b1.ur.y < b2.ll.y)
    return null;
  const lowerX = b1.ll.x < b2.ll.x ? b2.ll.x : b1.ll.x;
  const upperX = b1.ur.x < b2.ur.x ? b1.ur.x : b2.ur.x;
  const lowerY = b1.ll.y < b2.ll.y ? b2.ll.y : b1.ll.y;
  const upperY = b1.ur.y < b2.ur.y ? b1.ur.y : b2.ur.y;
  return {
    ll: {
      x: lowerX,
      y: lowerY
    },
    ur: {
      x: upperX,
      y: upperY
    }
  };
};
var epsilon2 = Number.EPSILON;
if (epsilon2 === undefined)
  epsilon2 = Math.pow(2, -52);
var EPSILON_SQ = epsilon2 * epsilon2;
var cmp = (a, b) => {
  if (-epsilon2 < a && a < epsilon2) {
    if (-epsilon2 < b && b < epsilon2) {
      return 0;
    }
  }
  const ab = a - b;
  if (ab * ab < EPSILON_SQ * a * b) {
    return 0;
  }
  return a < b ? -1 : 1;
};

class PtRounder {
  constructor() {
    this.reset();
  }
  reset() {
    this.xRounder = new CoordRounder;
    this.yRounder = new CoordRounder;
  }
  round(x, y) {
    return {
      x: this.xRounder.round(x),
      y: this.yRounder.round(y)
    };
  }
}

class CoordRounder {
  constructor() {
    this.tree = new z;
    this.round(0);
  }
  round(coord) {
    const node = this.tree.add(coord);
    const prevNode = this.tree.prev(node);
    if (prevNode !== null && cmp(node.key, prevNode.key) === 0) {
      this.tree.remove(coord);
      return prevNode.key;
    }
    const nextNode = this.tree.next(node);
    if (nextNode !== null && cmp(node.key, nextNode.key) === 0) {
      this.tree.remove(coord);
      return nextNode.key;
    }
    return coord;
  }
}
var rounder = new PtRounder;
var crossProduct = (a, b) => a.x * b.y - a.y * b.x;
var dotProduct = (a, b) => a.x * b.x + a.y * b.y;
var compareVectorAngles = (basePt, endPt1, endPt2) => {
  const res = orient2d(basePt.x, basePt.y, endPt1.x, endPt1.y, endPt2.x, endPt2.y);
  if (res > 0)
    return -1;
  if (res < 0)
    return 1;
  return 0;
};
var length = (v) => Math.sqrt(dotProduct(v, v));
var sineOfAngle = (pShared, pBase, pAngle) => {
  const vBase = {
    x: pBase.x - pShared.x,
    y: pBase.y - pShared.y
  };
  const vAngle = {
    x: pAngle.x - pShared.x,
    y: pAngle.y - pShared.y
  };
  return crossProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
var cosineOfAngle = (pShared, pBase, pAngle) => {
  const vBase = {
    x: pBase.x - pShared.x,
    y: pBase.y - pShared.y
  };
  const vAngle = {
    x: pAngle.x - pShared.x,
    y: pAngle.y - pShared.y
  };
  return dotProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
var horizontalIntersection = (pt, v, y) => {
  if (v.y === 0)
    return null;
  return {
    x: pt.x + v.x / v.y * (y - pt.y),
    y
  };
};
var verticalIntersection = (pt, v, x) => {
  if (v.x === 0)
    return null;
  return {
    x,
    y: pt.y + v.y / v.x * (x - pt.x)
  };
};
var intersection$1 = (pt1, v1, pt2, v2) => {
  if (v1.x === 0)
    return verticalIntersection(pt2, v2, pt1.x);
  if (v2.x === 0)
    return verticalIntersection(pt1, v1, pt2.x);
  if (v1.y === 0)
    return horizontalIntersection(pt2, v2, pt1.y);
  if (v2.y === 0)
    return horizontalIntersection(pt1, v1, pt2.y);
  const kross = crossProduct(v1, v2);
  if (kross == 0)
    return null;
  const ve = {
    x: pt2.x - pt1.x,
    y: pt2.y - pt1.y
  };
  const d1 = crossProduct(ve, v1) / kross;
  const d2 = crossProduct(ve, v2) / kross;
  const x1 = pt1.x + d2 * v1.x, x2 = pt2.x + d1 * v2.x;
  const y1 = pt1.y + d2 * v1.y, y2 = pt2.y + d1 * v2.y;
  const x = (x1 + x2) / 2;
  const y = (y1 + y2) / 2;
  return {
    x,
    y
  };
};

class SweepEvent {
  static compare(a, b) {
    const ptCmp = SweepEvent.comparePoints(a.point, b.point);
    if (ptCmp !== 0)
      return ptCmp;
    if (a.point !== b.point)
      a.link(b);
    if (a.isLeft !== b.isLeft)
      return a.isLeft ? 1 : -1;
    return Segment.compare(a.segment, b.segment);
  }
  static comparePoints(aPt, bPt) {
    if (aPt.x < bPt.x)
      return -1;
    if (aPt.x > bPt.x)
      return 1;
    if (aPt.y < bPt.y)
      return -1;
    if (aPt.y > bPt.y)
      return 1;
    return 0;
  }
  constructor(point, isLeft) {
    if (point.events === undefined)
      point.events = [this];
    else
      point.events.push(this);
    this.point = point;
    this.isLeft = isLeft;
  }
  link(other) {
    if (other.point === this.point) {
      throw new Error("Tried to link already linked events");
    }
    const otherEvents = other.point.events;
    for (let i = 0, iMax = otherEvents.length;i < iMax; i++) {
      const evt = otherEvents[i];
      this.point.events.push(evt);
      evt.point = this.point;
    }
    this.checkForConsuming();
  }
  checkForConsuming() {
    const numEvents = this.point.events.length;
    for (let i = 0;i < numEvents; i++) {
      const evt1 = this.point.events[i];
      if (evt1.segment.consumedBy !== undefined)
        continue;
      for (let j = i + 1;j < numEvents; j++) {
        const evt2 = this.point.events[j];
        if (evt2.consumedBy !== undefined)
          continue;
        if (evt1.otherSE.point.events !== evt2.otherSE.point.events)
          continue;
        evt1.segment.consume(evt2.segment);
      }
    }
  }
  getAvailableLinkedEvents() {
    const events = [];
    for (let i = 0, iMax = this.point.events.length;i < iMax; i++) {
      const evt = this.point.events[i];
      if (evt !== this && !evt.segment.ringOut && evt.segment.isInResult()) {
        events.push(evt);
      }
    }
    return events;
  }
  getLeftmostComparator(baseEvent) {
    const cache = new Map;
    const fillCache = (linkedEvent) => {
      const nextEvent = linkedEvent.otherSE;
      cache.set(linkedEvent, {
        sine: sineOfAngle(this.point, baseEvent.point, nextEvent.point),
        cosine: cosineOfAngle(this.point, baseEvent.point, nextEvent.point)
      });
    };
    return (a, b) => {
      if (!cache.has(a))
        fillCache(a);
      if (!cache.has(b))
        fillCache(b);
      const {
        sine: asine,
        cosine: acosine
      } = cache.get(a);
      const {
        sine: bsine,
        cosine: bcosine
      } = cache.get(b);
      if (asine >= 0 && bsine >= 0) {
        if (acosine < bcosine)
          return 1;
        if (acosine > bcosine)
          return -1;
        return 0;
      }
      if (asine < 0 && bsine < 0) {
        if (acosine < bcosine)
          return -1;
        if (acosine > bcosine)
          return 1;
        return 0;
      }
      if (bsine < asine)
        return -1;
      if (bsine > asine)
        return 1;
      return 0;
    };
  }
}
var segmentId = 0;

class Segment {
  static compare(a, b) {
    const alx = a.leftSE.point.x;
    const blx = b.leftSE.point.x;
    const arx = a.rightSE.point.x;
    const brx = b.rightSE.point.x;
    if (brx < alx)
      return 1;
    if (arx < blx)
      return -1;
    const aly = a.leftSE.point.y;
    const bly = b.leftSE.point.y;
    const ary = a.rightSE.point.y;
    const bry = b.rightSE.point.y;
    if (alx < blx) {
      if (bly < aly && bly < ary)
        return 1;
      if (bly > aly && bly > ary)
        return -1;
      const aCmpBLeft = a.comparePoint(b.leftSE.point);
      if (aCmpBLeft < 0)
        return 1;
      if (aCmpBLeft > 0)
        return -1;
      const bCmpARight = b.comparePoint(a.rightSE.point);
      if (bCmpARight !== 0)
        return bCmpARight;
      return -1;
    }
    if (alx > blx) {
      if (aly < bly && aly < bry)
        return -1;
      if (aly > bly && aly > bry)
        return 1;
      const bCmpALeft = b.comparePoint(a.leftSE.point);
      if (bCmpALeft !== 0)
        return bCmpALeft;
      const aCmpBRight = a.comparePoint(b.rightSE.point);
      if (aCmpBRight < 0)
        return 1;
      if (aCmpBRight > 0)
        return -1;
      return 1;
    }
    if (aly < bly)
      return -1;
    if (aly > bly)
      return 1;
    if (arx < brx) {
      const bCmpARight = b.comparePoint(a.rightSE.point);
      if (bCmpARight !== 0)
        return bCmpARight;
    }
    if (arx > brx) {
      const aCmpBRight = a.comparePoint(b.rightSE.point);
      if (aCmpBRight < 0)
        return 1;
      if (aCmpBRight > 0)
        return -1;
    }
    if (arx !== brx) {
      const ay = ary - aly;
      const ax = arx - alx;
      const by = bry - bly;
      const bx = brx - blx;
      if (ay > ax && by < bx)
        return 1;
      if (ay < ax && by > bx)
        return -1;
    }
    if (arx > brx)
      return 1;
    if (arx < brx)
      return -1;
    if (ary < bry)
      return -1;
    if (ary > bry)
      return 1;
    if (a.id < b.id)
      return -1;
    if (a.id > b.id)
      return 1;
    return 0;
  }
  constructor(leftSE, rightSE, rings, windings) {
    this.id = ++segmentId;
    this.leftSE = leftSE;
    leftSE.segment = this;
    leftSE.otherSE = rightSE;
    this.rightSE = rightSE;
    rightSE.segment = this;
    rightSE.otherSE = leftSE;
    this.rings = rings;
    this.windings = windings;
  }
  static fromRing(pt1, pt2, ring) {
    let leftPt, rightPt, winding;
    const cmpPts = SweepEvent.comparePoints(pt1, pt2);
    if (cmpPts < 0) {
      leftPt = pt1;
      rightPt = pt2;
      winding = 1;
    } else if (cmpPts > 0) {
      leftPt = pt2;
      rightPt = pt1;
      winding = -1;
    } else
      throw new Error(`Tried to create degenerate segment at [${pt1.x}, ${pt1.y}]`);
    const leftSE = new SweepEvent(leftPt, true);
    const rightSE = new SweepEvent(rightPt, false);
    return new Segment(leftSE, rightSE, [ring], [winding]);
  }
  replaceRightSE(newRightSE) {
    this.rightSE = newRightSE;
    this.rightSE.segment = this;
    this.rightSE.otherSE = this.leftSE;
    this.leftSE.otherSE = this.rightSE;
  }
  bbox() {
    const y1 = this.leftSE.point.y;
    const y2 = this.rightSE.point.y;
    return {
      ll: {
        x: this.leftSE.point.x,
        y: y1 < y2 ? y1 : y2
      },
      ur: {
        x: this.rightSE.point.x,
        y: y1 > y2 ? y1 : y2
      }
    };
  }
  vector() {
    return {
      x: this.rightSE.point.x - this.leftSE.point.x,
      y: this.rightSE.point.y - this.leftSE.point.y
    };
  }
  isAnEndpoint(pt) {
    return pt.x === this.leftSE.point.x && pt.y === this.leftSE.point.y || pt.x === this.rightSE.point.x && pt.y === this.rightSE.point.y;
  }
  comparePoint(point) {
    if (this.isAnEndpoint(point))
      return 0;
    const lPt = this.leftSE.point;
    const rPt = this.rightSE.point;
    const v = this.vector();
    if (lPt.x === rPt.x) {
      if (point.x === lPt.x)
        return 0;
      return point.x < lPt.x ? 1 : -1;
    }
    const yDist = (point.y - lPt.y) / v.y;
    const xFromYDist = lPt.x + yDist * v.x;
    if (point.x === xFromYDist)
      return 0;
    const xDist = (point.x - lPt.x) / v.x;
    const yFromXDist = lPt.y + xDist * v.y;
    if (point.y === yFromXDist)
      return 0;
    return point.y < yFromXDist ? -1 : 1;
  }
  getIntersection(other) {
    const tBbox = this.bbox();
    const oBbox = other.bbox();
    const bboxOverlap = getBboxOverlap(tBbox, oBbox);
    if (bboxOverlap === null)
      return null;
    const tlp = this.leftSE.point;
    const trp = this.rightSE.point;
    const olp = other.leftSE.point;
    const orp = other.rightSE.point;
    const touchesOtherLSE = isInBbox(tBbox, olp) && this.comparePoint(olp) === 0;
    const touchesThisLSE = isInBbox(oBbox, tlp) && other.comparePoint(tlp) === 0;
    const touchesOtherRSE = isInBbox(tBbox, orp) && this.comparePoint(orp) === 0;
    const touchesThisRSE = isInBbox(oBbox, trp) && other.comparePoint(trp) === 0;
    if (touchesThisLSE && touchesOtherLSE) {
      if (touchesThisRSE && !touchesOtherRSE)
        return trp;
      if (!touchesThisRSE && touchesOtherRSE)
        return orp;
      return null;
    }
    if (touchesThisLSE) {
      if (touchesOtherRSE) {
        if (tlp.x === orp.x && tlp.y === orp.y)
          return null;
      }
      return tlp;
    }
    if (touchesOtherLSE) {
      if (touchesThisRSE) {
        if (trp.x === olp.x && trp.y === olp.y)
          return null;
      }
      return olp;
    }
    if (touchesThisRSE && touchesOtherRSE)
      return null;
    if (touchesThisRSE)
      return trp;
    if (touchesOtherRSE)
      return orp;
    const pt = intersection$1(tlp, this.vector(), olp, other.vector());
    if (pt === null)
      return null;
    if (!isInBbox(bboxOverlap, pt))
      return null;
    return rounder.round(pt.x, pt.y);
  }
  split(point) {
    const newEvents = [];
    const alreadyLinked = point.events !== undefined;
    const newLeftSE = new SweepEvent(point, true);
    const newRightSE = new SweepEvent(point, false);
    const oldRightSE = this.rightSE;
    this.replaceRightSE(newRightSE);
    newEvents.push(newRightSE);
    newEvents.push(newLeftSE);
    const newSeg = new Segment(newLeftSE, oldRightSE, this.rings.slice(), this.windings.slice());
    if (SweepEvent.comparePoints(newSeg.leftSE.point, newSeg.rightSE.point) > 0) {
      newSeg.swapEvents();
    }
    if (SweepEvent.comparePoints(this.leftSE.point, this.rightSE.point) > 0) {
      this.swapEvents();
    }
    if (alreadyLinked) {
      newLeftSE.checkForConsuming();
      newRightSE.checkForConsuming();
    }
    return newEvents;
  }
  swapEvents() {
    const tmpEvt = this.rightSE;
    this.rightSE = this.leftSE;
    this.leftSE = tmpEvt;
    this.leftSE.isLeft = true;
    this.rightSE.isLeft = false;
    for (let i = 0, iMax = this.windings.length;i < iMax; i++) {
      this.windings[i] *= -1;
    }
  }
  consume(other) {
    let consumer = this;
    let consumee = other;
    while (consumer.consumedBy)
      consumer = consumer.consumedBy;
    while (consumee.consumedBy)
      consumee = consumee.consumedBy;
    const cmp = Segment.compare(consumer, consumee);
    if (cmp === 0)
      return;
    if (cmp > 0) {
      const tmp = consumer;
      consumer = consumee;
      consumee = tmp;
    }
    if (consumer.prev === consumee) {
      const tmp = consumer;
      consumer = consumee;
      consumee = tmp;
    }
    for (let i = 0, iMax = consumee.rings.length;i < iMax; i++) {
      const ring = consumee.rings[i];
      const winding = consumee.windings[i];
      const index2 = consumer.rings.indexOf(ring);
      if (index2 === -1) {
        consumer.rings.push(ring);
        consumer.windings.push(winding);
      } else
        consumer.windings[index2] += winding;
    }
    consumee.rings = null;
    consumee.windings = null;
    consumee.consumedBy = consumer;
    consumee.leftSE.consumedBy = consumer.leftSE;
    consumee.rightSE.consumedBy = consumer.rightSE;
  }
  prevInResult() {
    if (this._prevInResult !== undefined)
      return this._prevInResult;
    if (!this.prev)
      this._prevInResult = null;
    else if (this.prev.isInResult())
      this._prevInResult = this.prev;
    else
      this._prevInResult = this.prev.prevInResult();
    return this._prevInResult;
  }
  beforeState() {
    if (this._beforeState !== undefined)
      return this._beforeState;
    if (!this.prev)
      this._beforeState = {
        rings: [],
        windings: [],
        multiPolys: []
      };
    else {
      const seg = this.prev.consumedBy || this.prev;
      this._beforeState = seg.afterState();
    }
    return this._beforeState;
  }
  afterState() {
    if (this._afterState !== undefined)
      return this._afterState;
    const beforeState = this.beforeState();
    this._afterState = {
      rings: beforeState.rings.slice(0),
      windings: beforeState.windings.slice(0),
      multiPolys: []
    };
    const ringsAfter = this._afterState.rings;
    const windingsAfter = this._afterState.windings;
    const mpsAfter = this._afterState.multiPolys;
    for (let i = 0, iMax = this.rings.length;i < iMax; i++) {
      const ring = this.rings[i];
      const winding = this.windings[i];
      const index2 = ringsAfter.indexOf(ring);
      if (index2 === -1) {
        ringsAfter.push(ring);
        windingsAfter.push(winding);
      } else
        windingsAfter[index2] += winding;
    }
    const polysAfter = [];
    const polysExclude = [];
    for (let i = 0, iMax = ringsAfter.length;i < iMax; i++) {
      if (windingsAfter[i] === 0)
        continue;
      const ring = ringsAfter[i];
      const poly = ring.poly;
      if (polysExclude.indexOf(poly) !== -1)
        continue;
      if (ring.isExterior)
        polysAfter.push(poly);
      else {
        if (polysExclude.indexOf(poly) === -1)
          polysExclude.push(poly);
        const index2 = polysAfter.indexOf(ring.poly);
        if (index2 !== -1)
          polysAfter.splice(index2, 1);
      }
    }
    for (let i = 0, iMax = polysAfter.length;i < iMax; i++) {
      const mp = polysAfter[i].multiPoly;
      if (mpsAfter.indexOf(mp) === -1)
        mpsAfter.push(mp);
    }
    return this._afterState;
  }
  isInResult() {
    if (this.consumedBy)
      return false;
    if (this._isInResult !== undefined)
      return this._isInResult;
    const mpsBefore = this.beforeState().multiPolys;
    const mpsAfter = this.afterState().multiPolys;
    switch (operation.type) {
      case "union": {
        const noBefores = mpsBefore.length === 0;
        const noAfters = mpsAfter.length === 0;
        this._isInResult = noBefores !== noAfters;
        break;
      }
      case "intersection": {
        let least;
        let most;
        if (mpsBefore.length < mpsAfter.length) {
          least = mpsBefore.length;
          most = mpsAfter.length;
        } else {
          least = mpsAfter.length;
          most = mpsBefore.length;
        }
        this._isInResult = most === operation.numMultiPolys && least < most;
        break;
      }
      case "xor": {
        const diff = Math.abs(mpsBefore.length - mpsAfter.length);
        this._isInResult = diff % 2 === 1;
        break;
      }
      case "difference": {
        const isJustSubject = (mps) => mps.length === 1 && mps[0].isSubject;
        this._isInResult = isJustSubject(mpsBefore) !== isJustSubject(mpsAfter);
        break;
      }
      default:
        throw new Error(`Unrecognized operation type found ${operation.type}`);
    }
    return this._isInResult;
  }
}

class RingIn {
  constructor(geomRing, poly, isExterior) {
    if (!Array.isArray(geomRing) || geomRing.length === 0) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    this.poly = poly;
    this.isExterior = isExterior;
    this.segments = [];
    if (typeof geomRing[0][0] !== "number" || typeof geomRing[0][1] !== "number") {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    const firstPoint = rounder.round(geomRing[0][0], geomRing[0][1]);
    this.bbox = {
      ll: {
        x: firstPoint.x,
        y: firstPoint.y
      },
      ur: {
        x: firstPoint.x,
        y: firstPoint.y
      }
    };
    let prevPoint = firstPoint;
    for (let i = 1, iMax = geomRing.length;i < iMax; i++) {
      if (typeof geomRing[i][0] !== "number" || typeof geomRing[i][1] !== "number") {
        throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
      }
      let point = rounder.round(geomRing[i][0], geomRing[i][1]);
      if (point.x === prevPoint.x && point.y === prevPoint.y)
        continue;
      this.segments.push(Segment.fromRing(prevPoint, point, this));
      if (point.x < this.bbox.ll.x)
        this.bbox.ll.x = point.x;
      if (point.y < this.bbox.ll.y)
        this.bbox.ll.y = point.y;
      if (point.x > this.bbox.ur.x)
        this.bbox.ur.x = point.x;
      if (point.y > this.bbox.ur.y)
        this.bbox.ur.y = point.y;
      prevPoint = point;
    }
    if (firstPoint.x !== prevPoint.x || firstPoint.y !== prevPoint.y) {
      this.segments.push(Segment.fromRing(prevPoint, firstPoint, this));
    }
  }
  getSweepEvents() {
    const sweepEvents = [];
    for (let i = 0, iMax = this.segments.length;i < iMax; i++) {
      const segment = this.segments[i];
      sweepEvents.push(segment.leftSE);
      sweepEvents.push(segment.rightSE);
    }
    return sweepEvents;
  }
}

class PolyIn {
  constructor(geomPoly, multiPoly) {
    if (!Array.isArray(geomPoly)) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    this.exteriorRing = new RingIn(geomPoly[0], this, true);
    this.bbox = {
      ll: {
        x: this.exteriorRing.bbox.ll.x,
        y: this.exteriorRing.bbox.ll.y
      },
      ur: {
        x: this.exteriorRing.bbox.ur.x,
        y: this.exteriorRing.bbox.ur.y
      }
    };
    this.interiorRings = [];
    for (let i = 1, iMax = geomPoly.length;i < iMax; i++) {
      const ring = new RingIn(geomPoly[i], this, false);
      if (ring.bbox.ll.x < this.bbox.ll.x)
        this.bbox.ll.x = ring.bbox.ll.x;
      if (ring.bbox.ll.y < this.bbox.ll.y)
        this.bbox.ll.y = ring.bbox.ll.y;
      if (ring.bbox.ur.x > this.bbox.ur.x)
        this.bbox.ur.x = ring.bbox.ur.x;
      if (ring.bbox.ur.y > this.bbox.ur.y)
        this.bbox.ur.y = ring.bbox.ur.y;
      this.interiorRings.push(ring);
    }
    this.multiPoly = multiPoly;
  }
  getSweepEvents() {
    const sweepEvents = this.exteriorRing.getSweepEvents();
    for (let i = 0, iMax = this.interiorRings.length;i < iMax; i++) {
      const ringSweepEvents = this.interiorRings[i].getSweepEvents();
      for (let j = 0, jMax = ringSweepEvents.length;j < jMax; j++) {
        sweepEvents.push(ringSweepEvents[j]);
      }
    }
    return sweepEvents;
  }
}

class MultiPolyIn {
  constructor(geom, isSubject) {
    if (!Array.isArray(geom)) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    try {
      if (typeof geom[0][0][0] === "number")
        geom = [geom];
    } catch (ex) {}
    this.polys = [];
    this.bbox = {
      ll: {
        x: Number.POSITIVE_INFINITY,
        y: Number.POSITIVE_INFINITY
      },
      ur: {
        x: Number.NEGATIVE_INFINITY,
        y: Number.NEGATIVE_INFINITY
      }
    };
    for (let i = 0, iMax = geom.length;i < iMax; i++) {
      const poly = new PolyIn(geom[i], this);
      if (poly.bbox.ll.x < this.bbox.ll.x)
        this.bbox.ll.x = poly.bbox.ll.x;
      if (poly.bbox.ll.y < this.bbox.ll.y)
        this.bbox.ll.y = poly.bbox.ll.y;
      if (poly.bbox.ur.x > this.bbox.ur.x)
        this.bbox.ur.x = poly.bbox.ur.x;
      if (poly.bbox.ur.y > this.bbox.ur.y)
        this.bbox.ur.y = poly.bbox.ur.y;
      this.polys.push(poly);
    }
    this.isSubject = isSubject;
  }
  getSweepEvents() {
    const sweepEvents = [];
    for (let i = 0, iMax = this.polys.length;i < iMax; i++) {
      const polySweepEvents = this.polys[i].getSweepEvents();
      for (let j = 0, jMax = polySweepEvents.length;j < jMax; j++) {
        sweepEvents.push(polySweepEvents[j]);
      }
    }
    return sweepEvents;
  }
}

class RingOut {
  static factory(allSegments) {
    const ringsOut = [];
    for (let i = 0, iMax = allSegments.length;i < iMax; i++) {
      const segment = allSegments[i];
      if (!segment.isInResult() || segment.ringOut)
        continue;
      let prevEvent = null;
      let event = segment.leftSE;
      let nextEvent = segment.rightSE;
      const events = [event];
      const startingPoint = event.point;
      const intersectionLEs = [];
      while (true) {
        prevEvent = event;
        event = nextEvent;
        events.push(event);
        if (event.point === startingPoint)
          break;
        while (true) {
          const availableLEs = event.getAvailableLinkedEvents();
          if (availableLEs.length === 0) {
            const firstPt = events[0].point;
            const lastPt = events[events.length - 1].point;
            throw new Error(`Unable to complete output ring starting at [${firstPt.x},` + ` ${firstPt.y}]. Last matching segment found ends at` + ` [${lastPt.x}, ${lastPt.y}].`);
          }
          if (availableLEs.length === 1) {
            nextEvent = availableLEs[0].otherSE;
            break;
          }
          let indexLE = null;
          for (let j = 0, jMax = intersectionLEs.length;j < jMax; j++) {
            if (intersectionLEs[j].point === event.point) {
              indexLE = j;
              break;
            }
          }
          if (indexLE !== null) {
            const intersectionLE = intersectionLEs.splice(indexLE)[0];
            const ringEvents = events.splice(intersectionLE.index);
            ringEvents.unshift(ringEvents[0].otherSE);
            ringsOut.push(new RingOut(ringEvents.reverse()));
            continue;
          }
          intersectionLEs.push({
            index: events.length,
            point: event.point
          });
          const comparator = event.getLeftmostComparator(prevEvent);
          nextEvent = availableLEs.sort(comparator)[0].otherSE;
          break;
        }
      }
      ringsOut.push(new RingOut(events));
    }
    return ringsOut;
  }
  constructor(events) {
    this.events = events;
    for (let i = 0, iMax = events.length;i < iMax; i++) {
      events[i].segment.ringOut = this;
    }
    this.poly = null;
  }
  getGeom() {
    let prevPt = this.events[0].point;
    const points = [prevPt];
    for (let i = 1, iMax = this.events.length - 1;i < iMax; i++) {
      const pt = this.events[i].point;
      const nextPt = this.events[i + 1].point;
      if (compareVectorAngles(pt, prevPt, nextPt) === 0)
        continue;
      points.push(pt);
      prevPt = pt;
    }
    if (points.length === 1)
      return null;
    const pt = points[0];
    const nextPt = points[1];
    if (compareVectorAngles(pt, prevPt, nextPt) === 0)
      points.shift();
    points.push(points[0]);
    const step = this.isExteriorRing() ? 1 : -1;
    const iStart = this.isExteriorRing() ? 0 : points.length - 1;
    const iEnd = this.isExteriorRing() ? points.length : -1;
    const orderedPoints = [];
    for (let i = iStart;i != iEnd; i += step)
      orderedPoints.push([points[i].x, points[i].y]);
    return orderedPoints;
  }
  isExteriorRing() {
    if (this._isExteriorRing === undefined) {
      const enclosing = this.enclosingRing();
      this._isExteriorRing = enclosing ? !enclosing.isExteriorRing() : true;
    }
    return this._isExteriorRing;
  }
  enclosingRing() {
    if (this._enclosingRing === undefined) {
      this._enclosingRing = this._calcEnclosingRing();
    }
    return this._enclosingRing;
  }
  _calcEnclosingRing() {
    let leftMostEvt = this.events[0];
    for (let i = 1, iMax = this.events.length;i < iMax; i++) {
      const evt = this.events[i];
      if (SweepEvent.compare(leftMostEvt, evt) > 0)
        leftMostEvt = evt;
    }
    let prevSeg = leftMostEvt.segment.prevInResult();
    let prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
    while (true) {
      if (!prevSeg)
        return null;
      if (!prevPrevSeg)
        return prevSeg.ringOut;
      if (prevPrevSeg.ringOut !== prevSeg.ringOut) {
        if (prevPrevSeg.ringOut.enclosingRing() !== prevSeg.ringOut) {
          return prevSeg.ringOut;
        } else
          return prevSeg.ringOut.enclosingRing();
      }
      prevSeg = prevPrevSeg.prevInResult();
      prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
    }
  }
}

class PolyOut {
  constructor(exteriorRing) {
    this.exteriorRing = exteriorRing;
    exteriorRing.poly = this;
    this.interiorRings = [];
  }
  addInterior(ring) {
    this.interiorRings.push(ring);
    ring.poly = this;
  }
  getGeom() {
    const geom = [this.exteriorRing.getGeom()];
    if (geom[0] === null)
      return null;
    for (let i = 0, iMax = this.interiorRings.length;i < iMax; i++) {
      const ringGeom = this.interiorRings[i].getGeom();
      if (ringGeom === null)
        continue;
      geom.push(ringGeom);
    }
    return geom;
  }
}

class MultiPolyOut {
  constructor(rings) {
    this.rings = rings;
    this.polys = this._composePolys(rings);
  }
  getGeom() {
    const geom = [];
    for (let i = 0, iMax = this.polys.length;i < iMax; i++) {
      const polyGeom = this.polys[i].getGeom();
      if (polyGeom === null)
        continue;
      geom.push(polyGeom);
    }
    return geom;
  }
  _composePolys(rings) {
    const polys = [];
    for (let i = 0, iMax = rings.length;i < iMax; i++) {
      const ring = rings[i];
      if (ring.poly)
        continue;
      if (ring.isExteriorRing())
        polys.push(new PolyOut(ring));
      else {
        const enclosingRing = ring.enclosingRing();
        if (!enclosingRing.poly)
          polys.push(new PolyOut(enclosingRing));
        enclosingRing.poly.addInterior(ring);
      }
    }
    return polys;
  }
}

class SweepLine {
  constructor(queue) {
    let comparator = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : Segment.compare;
    this.queue = queue;
    this.tree = new z(comparator);
    this.segments = [];
  }
  process(event) {
    const segment = event.segment;
    const newEvents = [];
    if (event.consumedBy) {
      if (event.isLeft)
        this.queue.remove(event.otherSE);
      else
        this.tree.remove(segment);
      return newEvents;
    }
    const node = event.isLeft ? this.tree.add(segment) : this.tree.find(segment);
    if (!node)
      throw new Error(`Unable to find segment #${segment.id} ` + `[${segment.leftSE.point.x}, ${segment.leftSE.point.y}] -> ` + `[${segment.rightSE.point.x}, ${segment.rightSE.point.y}] ` + "in SweepLine tree.");
    let prevNode = node;
    let nextNode = node;
    let prevSeg = undefined;
    let nextSeg = undefined;
    while (prevSeg === undefined) {
      prevNode = this.tree.prev(prevNode);
      if (prevNode === null)
        prevSeg = null;
      else if (prevNode.key.consumedBy === undefined)
        prevSeg = prevNode.key;
    }
    while (nextSeg === undefined) {
      nextNode = this.tree.next(nextNode);
      if (nextNode === null)
        nextSeg = null;
      else if (nextNode.key.consumedBy === undefined)
        nextSeg = nextNode.key;
    }
    if (event.isLeft) {
      let prevMySplitter = null;
      if (prevSeg) {
        const prevInter = prevSeg.getIntersection(segment);
        if (prevInter !== null) {
          if (!segment.isAnEndpoint(prevInter))
            prevMySplitter = prevInter;
          if (!prevSeg.isAnEndpoint(prevInter)) {
            const newEventsFromSplit = this._splitSafely(prevSeg, prevInter);
            for (let i = 0, iMax = newEventsFromSplit.length;i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      let nextMySplitter = null;
      if (nextSeg) {
        const nextInter = nextSeg.getIntersection(segment);
        if (nextInter !== null) {
          if (!segment.isAnEndpoint(nextInter))
            nextMySplitter = nextInter;
          if (!nextSeg.isAnEndpoint(nextInter)) {
            const newEventsFromSplit = this._splitSafely(nextSeg, nextInter);
            for (let i = 0, iMax = newEventsFromSplit.length;i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      if (prevMySplitter !== null || nextMySplitter !== null) {
        let mySplitter = null;
        if (prevMySplitter === null)
          mySplitter = nextMySplitter;
        else if (nextMySplitter === null)
          mySplitter = prevMySplitter;
        else {
          const cmpSplitters = SweepEvent.comparePoints(prevMySplitter, nextMySplitter);
          mySplitter = cmpSplitters <= 0 ? prevMySplitter : nextMySplitter;
        }
        this.queue.remove(segment.rightSE);
        newEvents.push(segment.rightSE);
        const newEventsFromSplit = segment.split(mySplitter);
        for (let i = 0, iMax = newEventsFromSplit.length;i < iMax; i++) {
          newEvents.push(newEventsFromSplit[i]);
        }
      }
      if (newEvents.length > 0) {
        this.tree.remove(segment);
        newEvents.push(event);
      } else {
        this.segments.push(segment);
        segment.prev = prevSeg;
      }
    } else {
      if (prevSeg && nextSeg) {
        const inter = prevSeg.getIntersection(nextSeg);
        if (inter !== null) {
          if (!prevSeg.isAnEndpoint(inter)) {
            const newEventsFromSplit = this._splitSafely(prevSeg, inter);
            for (let i = 0, iMax = newEventsFromSplit.length;i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
          if (!nextSeg.isAnEndpoint(inter)) {
            const newEventsFromSplit = this._splitSafely(nextSeg, inter);
            for (let i = 0, iMax = newEventsFromSplit.length;i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      this.tree.remove(segment);
    }
    return newEvents;
  }
  _splitSafely(seg, pt) {
    this.tree.remove(seg);
    const rightSE = seg.rightSE;
    this.queue.remove(rightSE);
    const newEvents = seg.split(pt);
    newEvents.push(rightSE);
    if (seg.consumedBy === undefined)
      this.tree.add(seg);
    return newEvents;
  }
}
var POLYGON_CLIPPING_MAX_QUEUE_SIZE = typeof process !== "undefined" && process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE || 1e6;
var POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS = typeof process !== "undefined" && process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS || 1e6;

class Operation {
  run(type, geom, moreGeoms) {
    operation.type = type;
    rounder.reset();
    const multipolys = [new MultiPolyIn(geom, true)];
    for (let i = 0, iMax = moreGeoms.length;i < iMax; i++) {
      multipolys.push(new MultiPolyIn(moreGeoms[i], false));
    }
    operation.numMultiPolys = multipolys.length;
    if (operation.type === "difference") {
      const subject = multipolys[0];
      let i = 1;
      while (i < multipolys.length) {
        if (getBboxOverlap(multipolys[i].bbox, subject.bbox) !== null)
          i++;
        else
          multipolys.splice(i, 1);
      }
    }
    if (operation.type === "intersection") {
      for (let i = 0, iMax = multipolys.length;i < iMax; i++) {
        const mpA = multipolys[i];
        for (let j = i + 1, jMax = multipolys.length;j < jMax; j++) {
          if (getBboxOverlap(mpA.bbox, multipolys[j].bbox) === null)
            return [];
        }
      }
    }
    const queue = new z(SweepEvent.compare);
    for (let i = 0, iMax = multipolys.length;i < iMax; i++) {
      const sweepEvents = multipolys[i].getSweepEvents();
      for (let j = 0, jMax = sweepEvents.length;j < jMax; j++) {
        queue.insert(sweepEvents[j]);
        if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) {
          throw new Error("Infinite loop when putting segment endpoints in a priority queue " + "(queue size too big).");
        }
      }
    }
    const sweepLine = new SweepLine(queue);
    let prevQueueSize = queue.size;
    let node = queue.pop();
    while (node) {
      const evt = node.key;
      if (queue.size === prevQueueSize) {
        const seg = evt.segment;
        throw new Error(`Unable to pop() ${evt.isLeft ? "left" : "right"} SweepEvent ` + `[${evt.point.x}, ${evt.point.y}] from segment #${seg.id} ` + `[${seg.leftSE.point.x}, ${seg.leftSE.point.y}] -> ` + `[${seg.rightSE.point.x}, ${seg.rightSE.point.y}] from queue.`);
      }
      if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) {
        throw new Error("Infinite loop when passing sweep line over endpoints " + "(queue size too big).");
      }
      if (sweepLine.segments.length > POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS) {
        throw new Error("Infinite loop when passing sweep line over endpoints " + "(too many sweep line segments).");
      }
      const newEvents = sweepLine.process(evt);
      for (let i = 0, iMax = newEvents.length;i < iMax; i++) {
        const evt = newEvents[i];
        if (evt.consumedBy === undefined)
          queue.insert(evt);
      }
      prevQueueSize = queue.size;
      node = queue.pop();
    }
    rounder.reset();
    const ringsOut = RingOut.factory(sweepLine.segments);
    const result = new MultiPolyOut(ringsOut);
    return result.getGeom();
  }
}
var operation = new Operation;
var union = function(geom) {
  for (var _len = arguments.length, moreGeoms = new Array(_len > 1 ? _len - 1 : 0), _key = 1;_key < _len; _key++) {
    moreGeoms[_key - 1] = arguments[_key];
  }
  return operation.run("union", geom, moreGeoms);
};
var intersection = function(geom) {
  for (var _len2 = arguments.length, moreGeoms = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1;_key2 < _len2; _key2++) {
    moreGeoms[_key2 - 1] = arguments[_key2];
  }
  return operation.run("intersection", geom, moreGeoms);
};
var xor = function(geom) {
  for (var _len3 = arguments.length, moreGeoms = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1;_key3 < _len3; _key3++) {
    moreGeoms[_key3 - 1] = arguments[_key3];
  }
  return operation.run("xor", geom, moreGeoms);
};
var difference = function(subjectGeom) {
  for (var _len4 = arguments.length, clippingGeoms = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1;_key4 < _len4; _key4++) {
    clippingGeoms[_key4 - 1] = arguments[_key4];
  }
  return operation.run("difference", subjectGeom, clippingGeoms);
};
var index = {
  union,
  intersection,
  xor,
  difference
};

// ui/src/boolean.ts
var clip = "union" in exports_polygon_clipping_esm ? exports_polygon_clipping_esm : index;
var { union: clipUnion, difference: clipDiff, intersection: clipIntersect, xor: clipXor } = clip;
function normalizeBoolOp(raw) {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const map = {
    union: "union",
    merge: "union",
    add: "union",
    join: "union",
    unite: "union",
    subtract: "subtract",
    minus: "subtract",
    cut: "subtract",
    difference: "subtract",
    intersect: "intersect",
    intersection: "intersect",
    exclude: "exclude",
    xor: "exclude"
  };
  return map[t] ?? null;
}
function isBoolShape(node) {
  return node.type === "rect" || node.type === "ellipse" || node.type === "triangle" || node.type === "diamond" || node.type === "pentagon" || node.type === "hexagon" || node.type === "star" || node.type === "vector";
}
var r22 = (v) => Math.round(v * 100) / 100;
function roundedRectRing(w, h, radius) {
  const r4 = typeof radius === "number" ? [radius, radius, radius, radius] : Array.isArray(radius) ? radius : [0, 0, 0, 0];
  const [tl, tr, br, bl] = r4.map((v) => Math.max(0, Math.min(v ?? 0, w / 2, h / 2)));
  const ring = [];
  const arc = (cx, cy, r, a0, a1) => {
    const seg = 5;
    for (let i = 0;i <= seg; i++) {
      const a = a0 + (a1 - a0) * i / seg;
      ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  if (tl <= 0)
    ring.push([0, 0]);
  else
    arc(tl, tl, tl, Math.PI, Math.PI * 1.5);
  if (tr <= 0)
    ring.push([w, 0]);
  else
    arc(w - tr, tr, tr, Math.PI * 1.5, Math.PI * 2);
  if (br <= 0)
    ring.push([w, h]);
  else
    arc(w - br, h - br, br, 0, Math.PI * 0.5);
  if (bl <= 0)
    ring.push([0, h]);
  else
    arc(bl, h - bl, bl, Math.PI * 0.5, Math.PI);
  return ring.filter((p, i) => i === 0 || Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) > 0.000001);
}
function ellipseRing(w, h, seg = 64) {
  const ring = [];
  for (let i = 0;i < seg; i++) {
    const a = i / seg * Math.PI * 2;
    ring.push([w / 2 * (1 + Math.cos(a)), h / 2 * (1 + Math.sin(a))]);
  }
  return ring;
}
function pathDRings(d) {
  const tokens = d.match(/[A-DF-Za-df-z]|-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const rings = [];
  let cur = [];
  let cx = 0;
  let cy = 0;
  let cmd = "";
  let i = 0;
  const num = () => {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t))
      throw new Error(`\u5E03\u5C14\u8FD0\u7B97\u6682\u4E0D\u652F\u6301\u66F2\u7EBF\u8DEF\u5F84\uFF08\u542B "${t}"\uFF09\uFF0C\u53EA\u652F\u6301\u76F4\u7EBF\u6BB5`);
    i++;
    return Number(t);
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z" || cmd === "z") {
        if (cur.length)
          rings.push(cur);
        cur = [];
        continue;
      }
    }
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    switch (lower) {
      case "m":
      case "l": {
        let x = num();
        let y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        if (lower === "m" && cur.length) {
          rings.push(cur);
          cur = [];
        }
        cur.push([x, y]);
        cx = x;
        cy = y;
        if (lower === "m")
          cmd = rel ? "l" : "L";
        break;
      }
      case "h": {
        let x = num();
        if (rel)
          x += cx;
        cur.push([x, cy]);
        cx = x;
        break;
      }
      case "v": {
        let y = num();
        if (rel)
          y += cy;
        cur.push([cx, y]);
        cy = y;
        break;
      }
      default:
        throw new Error(`\u5E03\u5C14\u8FD0\u7B97\u6682\u4E0D\u652F\u6301\u66F2\u7EBF\u8DEF\u5F84\uFF08\u542B "${cmd}"\uFF09\uFF0C\u53EA\u652F\u6301\u76F4\u7EBF\u6BB5`);
    }
  }
  if (cur.length)
    rings.push(cur);
  return rings.filter((r) => r.length >= 3);
}
function nodeToPolys(node) {
  let local;
  if (node.type === "rect") {
    local = [roundedRectRing(node.w, node.h, radiusProp(node))];
  } else if (node.type === "ellipse") {
    local = [ellipseRing(node.w, node.h)];
  } else if (node.type === "vector") {
    local = pathDRings(node.path);
  } else {
    const d = shapePath(node.type, node.w, node.h);
    if (!d)
      throw new Error(`\u8282\u70B9\u7C7B\u578B ${node.type} \u4E0D\u652F\u6301\u5E03\u5C14\u8FD0\u7B97`);
    local = pathDRings(d);
  }
  const a = (node.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = node.w / 2;
  const cy = node.h / 2;
  const place = (ring) => ring.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [r22(node.x + cx + dx * cos - dy * sin), r22(node.y + cy + dx * sin + dy * cos)];
  });
  return local.map(place);
}
function booleanPath(op, nodes) {
  if (nodes.length === 0)
    throw new Error("\u5E03\u5C14\u8FD0\u7B97\u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u5F62\u72B6");
  const polys = nodes.map(nodeToPolys);
  let result;
  try {
    if (op === "union") {
      result = clipUnion(polys[0], ...polys.slice(1));
    } else if (op === "subtract") {
      result = clipDiff(polys[0], ...polys.slice(1));
    } else if (op === "intersect") {
      result = clipIntersect(polys[0], ...polys.slice(1));
    } else {
      let acc = polys[0];
      for (const p of polys.slice(1)) {
        acc = clipXor(acc, p);
      }
      result = acc;
    }
  } catch (err) {
    throw new Error(`\u5E03\u5C14\u8FD0\u7B97\u5931\u8D25\uFF1A${err instanceof Error ? err.message : String(err)}`);
  }
  const pts = [];
  for (const poly of result) {
    for (const ring of poly) {
      if (ring.length < 3)
        continue;
      pts.push(...ring);
    }
  }
  if (!pts.length)
    return { d: "", bbox: { x: 0, y: 0, w: 0, h: 0 } };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  let d = "";
  for (const poly of result) {
    for (const ring of poly) {
      if (ring.length < 3)
        continue;
      d += `M${r22(ring[0][0] - x)} ${r22(ring[0][1] - y)}`;
      for (let i = 1;i < ring.length; i++)
        d += `L${r22(ring[i][0] - x)} ${r22(ring[i][1] - y)}`;
      d += "Z";
    }
  }
  return { d, bbox: { x: r22(x), y: r22(y), w: r22(Math.max(...xs) - x), h: r22(Math.max(...ys) - y) } };
}

// ui/src/layout.ts
var clamp2 = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var r23 = (v) => Math.round(v * 100) / 100;
var hasLayout = (n) => n.type === "frame" && n.layout !== undefined;
function hugsAlong(child, outerModeIsH, axis) {
  if (child.type !== "frame" || !child.layout?.hug)
    return false;
  const hug = child.layout.hug;
  if (hug === "both")
    return true;
  const childMainIsX = child.layout.mode === "h";
  const axisIsX = axis === "main" === outerModeIsH;
  return childMainIsX === axisIsX ? axis === "main" : axis === "cross";
}
var padOf = (lo) => {
  const p = lo.padding;
  if (!p)
    return [0, 0, 0, 0];
  return [clamp2(p[0] ?? 0, 0, 1000), clamp2(p[1] ?? 0, 0, 1000), clamp2(p[2] ?? 0, 0, 1000), clamp2(p[3] ?? 0, 0, 1000)];
};
function applyLayoutToFrame(frame) {
  const lo = frame.layout;
  if (!lo)
    return false;
  const [pt, pr, pb, pl] = padOf(lo);
  const kids = frame.children.filter((c) => c.visible !== false);
  if (kids.length === 0)
    return false;
  const fw0 = frame.w;
  const fh0 = frame.h;
  const before = kids.map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
  const gap = clamp2(lo.gap ?? 0, 0, 2000);
  const growOf = (c) => clamp2(c.grow ?? 0, 0, 100);
  const wrap = lo.wrap === true;
  const hug = lo.hug;
  const hugMain = hug === "main" || hug === "both";
  const hugCross = hug === "cross" || hug === "both";
  if (hug && !wrap) {
    if (lo.mode === "h") {
      if (hugMain)
        frame.w = r23(Math.max(1, kids.reduce((s, c) => s + c.w, 0) + gap * (kids.length - 1) + pl + pr));
      if (hugCross)
        frame.h = r23(Math.max(1, Math.max(...kids.map((c) => c.h)) + pt + pb));
    } else {
      if (hugMain)
        frame.h = r23(Math.max(1, kids.reduce((s, c) => s + c.h, 0) + gap * (kids.length - 1) + pt + pb));
      if (hugCross)
        frame.w = r23(Math.max(1, Math.max(...kids.map((c) => c.w)) + pl + pr));
    }
  }
  const innerX = pl;
  const innerY = pt;
  let innerW = Math.max(0, frame.w - pl - pr);
  let innerH = Math.max(0, frame.h - pt - pb);
  let lastGrow = -1;
  kids.forEach((c, i) => {
    if (growOf(c) > 0)
      lastGrow = i;
  });
  const growSum = hugMain ? 0 : kids.reduce((s, c) => s + (hugsAlong(c, lo.mode === "h", "main") ? 0 : growOf(c)), 0);
  if (lo.mode === "h" && wrap) {
    const rows = [];
    let row = [];
    let cursor = innerX;
    for (const c of kids) {
      if (row.length && cursor + c.w > innerX + innerW + 0.01) {
        rows.push(row);
        row = [];
        cursor = innerX;
      }
      row.push(c);
      cursor += c.w + gap;
    }
    if (row.length)
      rows.push(row);
    const rowHs = rows.map((r) => Math.max(...r.map((c) => c.h)));
    const totalH = rowHs.reduce((s, h) => s + h, 0) + gap * (rows.length - 1);
    if (hugCross) {
      frame.h = r23(Math.max(1, totalH + pt + pb));
      innerH = Math.max(0, frame.h - pt - pb);
    }
    let rowY = innerY;
    if (lo.main === "center")
      rowY = innerY + (innerH - totalH) / 2;
    else if (lo.main === "end")
      rowY = innerY + innerH - totalH;
    for (let r = 0;r < rows.length; r++) {
      const items = rows[r];
      const rh = rowHs[r];
      const rowW = items.reduce((s, c) => s + c.w, 0) + gap * (items.length - 1);
      let x = innerX;
      if (lo.main === "center")
        x = innerX + (innerW - rowW) / 2;
      else if (lo.main === "end")
        x = innerX + innerW - rowW;
      for (const c of items) {
        c.x = r23(x);
        if (lo.cross === "stretch" && !hugsAlong(c, true, "cross")) {
          c.h = rh;
          c.y = r23(rowY);
        } else if (lo.cross === "center")
          c.y = r23(rowY + (rh - c.h) / 2);
        else if (lo.cross === "end")
          c.y = r23(rowY + rh - c.h);
        else
          c.y = r23(rowY);
        x += c.w + gap;
      }
      rowY += rh + gap;
    }
  } else if (lo.mode === "h") {
    if (growSum > 0) {
      const fixedSum = kids.reduce((s, c) => s + (growOf(c) > 0 ? 0 : c.w), 0);
      const free = innerW - fixedSum - gap * (kids.length - 1);
      if (free > 0) {
        let allocated = 0;
        for (let i = 0;i < kids.length; i++) {
          const c = kids[i];
          const g = growOf(c);
          if (g <= 0)
            continue;
          c.w = i === lastGrow ? r23(free - allocated) : r23(free * g / growSum);
          allocated += c.w;
        }
      }
    }
    const content = kids.reduce((s, c) => s + c.w, 0) + gap * (kids.length - 1);
    const between = lo.main === "between" && growSum === 0 && kids.length > 1;
    const step = between ? (innerW - (content - gap * (kids.length - 1))) / (kids.length - 1) : gap;
    let cursor = innerX;
    if (lo.main === "center")
      cursor = innerX + (innerW - content) / 2;
    else if (lo.main === "end")
      cursor = innerX + innerW - content;
    for (const c of kids) {
      c.x = r23(cursor);
      cursor += c.w + (between ? step : gap);
      if (lo.cross === "stretch" && !hugsAlong(c, true, "cross")) {
        c.h = innerH;
        c.y = innerY;
      } else if (lo.cross === "center")
        c.y = r23(innerY + (innerH - c.h) / 2);
      else if (lo.cross === "end")
        c.y = r23(innerY + innerH - c.h);
      else
        c.y = innerY;
    }
  } else if (wrap) {
    const cols = [];
    let col = [];
    let cursor = innerY;
    for (const c of kids) {
      if (col.length && cursor + c.h > innerY + innerH + 0.01) {
        cols.push(col);
        col = [];
        cursor = innerY;
      }
      col.push(c);
      cursor += c.h + gap;
    }
    if (col.length)
      cols.push(col);
    const colWs = cols.map((cl) => Math.max(...cl.map((c) => c.w)));
    const totalW = colWs.reduce((s, w) => s + w, 0) + gap * (cols.length - 1);
    if (hugCross) {
      frame.w = r23(Math.max(1, totalW + pl + pr));
      innerW = Math.max(0, frame.w - pl - pr);
    }
    let colX = innerX;
    if (lo.main === "center")
      colX = innerX + (innerW - totalW) / 2;
    else if (lo.main === "end")
      colX = innerX + innerW - totalW;
    for (let r = 0;r < cols.length; r++) {
      const items = cols[r];
      const cw = colWs[r];
      const colH = items.reduce((s, c) => s + c.h, 0) + gap * (items.length - 1);
      let y = innerY;
      if (lo.main === "center")
        y = innerY + (innerH - colH) / 2;
      else if (lo.main === "end")
        y = innerY + innerH - colH;
      for (const c of items) {
        c.y = r23(y);
        if (lo.cross === "stretch" && !hugsAlong(c, false, "cross")) {
          c.w = cw;
          c.x = r23(colX);
        } else if (lo.cross === "center")
          c.x = r23(colX + (cw - c.w) / 2);
        else if (lo.cross === "end")
          c.x = r23(colX + cw - c.w);
        else
          c.x = r23(colX);
        y += c.h + gap;
      }
      colX += cw + gap;
    }
  } else {
    if (growSum > 0) {
      const fixedSum = kids.reduce((s, c) => s + (growOf(c) > 0 ? 0 : c.h), 0);
      const free = innerH - fixedSum - gap * (kids.length - 1);
      if (free > 0) {
        let allocated = 0;
        for (let i = 0;i < kids.length; i++) {
          const c = kids[i];
          const g = growOf(c);
          if (g <= 0)
            continue;
          c.h = i === lastGrow ? r23(free - allocated) : r23(free * g / growSum);
          allocated += c.h;
        }
      }
    }
    const content = kids.reduce((s, c) => s + c.h, 0) + gap * (kids.length - 1);
    const between = lo.main === "between" && growSum === 0 && kids.length > 1;
    const step = between ? (innerH - (content - gap * (kids.length - 1))) / (kids.length - 1) : gap;
    let cursor = innerY;
    if (lo.main === "center")
      cursor = innerY + (innerH - content) / 2;
    else if (lo.main === "end")
      cursor = innerY + innerH - content;
    for (const c of kids) {
      c.y = r23(cursor);
      cursor += c.h + (between ? step : gap);
      if (lo.cross === "stretch" && !hugsAlong(c, false, "cross")) {
        c.w = innerW;
        c.x = innerX;
      } else if (lo.cross === "center")
        c.x = r23(innerX + (innerW - c.w) / 2);
      else if (lo.cross === "end")
        c.x = r23(innerX + innerW - c.w);
      else
        c.x = innerX;
    }
  }
  const kidsChanged = kids.some((c, i) => {
    const b = before[i];
    return b.x !== c.x || b.y !== c.y || b.w !== c.w || b.h !== c.h;
  });
  return kidsChanged || frame.w !== fw0 || frame.h !== fh0;
}
function applyLayoutDeep(frame) {
  let changed = false;
  for (let pass = 0;pass < 4; pass++) {
    const c = layoutPass(frame);
    changed = c || changed;
    if (!c)
      break;
  }
  return changed;
}
function layoutPass(frame) {
  let changed = applyLayoutToFrame(frame);
  const walk = (list) => {
    for (const c of list) {
      if (c.type === "frame" && c.layout)
        changed = applyLayoutToFrame(c) || changed;
      if (c.type === "frame" || c.type === "group")
        walk(c.children);
    }
  };
  walk(frame.children);
  return changed;
}
function findPath(list, id, acc) {
  for (const n of list) {
    const next = [...acc, n];
    if (n.id === id)
      return next;
    if (n.type === "frame" || n.type === "group") {
      const hit = findPath(n.children, id, next);
      if (hit)
        return hit;
    }
  }
  return null;
}
function reflowWithin(nodes, id) {
  const path = findPath(nodes, id, []);
  if (!path)
    return false;
  const start = path.findIndex((n) => hasLayout(n));
  if (start < 0)
    return false;
  let changed = false;
  for (let i = start;i < path.length; i++) {
    const n = path[i];
    if (n.type === "frame" && n.layout)
      changed = applyLayoutDeep(n) || changed;
  }
  return changed;
}

// ui/src/color.ts
var HEX2 = /^#([0-9a-f]{3,8})$/i;
var FUNC = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;
var NAMED = {
  black: "#000000",
  white: "#ffffff",
  gray: "#808080",
  grey: "#808080",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#008000",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  silver: "#c0c0c0",
  navy: "#000080",
  teal: "#008080",
  lime: "#00ff00",
  cyan: "#00ffff",
  magenta: "#ff00ff"
};
var clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));
var clamp01 = (v) => Math.min(1, Math.max(0, v));
var chan = (s) => s.endsWith("%") ? Number(s.slice(0, -1)) / 100 * 255 : Number(s);
function parseColor(input) {
  if (typeof input !== "string")
    return null;
  const s = input.trim().toLowerCase();
  if (!s || s === "transparent" || s === "none" || s.startsWith("var:"))
    return null;
  const hex = HEX2.exec(s) ?? (NAMED[s] ? HEX2.exec(NAMED[s]) : null);
  if (hex) {
    const h = hex[1];
    const dup = (c) => parseInt(c + c, 16);
    const pair = (i) => parseInt(h.slice(i, i + 2), 16);
    if (h.length === 3)
      return { r: dup(h[0]), g: dup(h[1]), b: dup(h[2]), a: 1 };
    if (h.length === 4)
      return { r: dup(h[0]), g: dup(h[1]), b: dup(h[2]), a: pair(3) / 255 };
    if (h.length === 6)
      return { r: pair(0), g: pair(2), b: pair(4), a: 1 };
    if (h.length === 8)
      return { r: pair(0), g: pair(2), b: pair(4), a: pair(6) / 255 };
    return null;
  }
  const m = FUNC.exec(s);
  if (!m)
    return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  return {
    r: clamp255(chan(m[1])),
    g: clamp255(chan(m[2])),
    b: clamp255(chan(m[3])),
    a: clamp01(Number.isFinite(alpha) ? alpha : 1)
  };
}
function relativeLuminance(c) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}
function compositeOver(fg, bg) {
  if (fg.a >= 1)
    return { ...fg, a: 1 };
  const a = fg.a + bg.a * (1 - fg.a);
  if (a <= 0)
    return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a: 1
  };
}
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
function hueOf(c) {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.000001)
    return null;
  let h;
  if (max === r)
    h = (g - b) / d % 6;
  else if (max === g)
    h = (b - r) / d + 2;
  else
    h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
function toHex(c) {
  const p = (v) => clamp255(v).toString(16).padStart(2, "0");
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`;
}
function effectiveContrast(fgRaw, bgRaw) {
  const fg = parseColor(fgRaw);
  const bg = parseColor(bgRaw);
  if (!fg || !bg)
    return null;
  const flat = compositeOver(fg, bg);
  return { ratio: contrastRatio(flat, { ...bg, a: 1 }), fg: toHex(flat), bg: toHex(bg) };
}

// ui/src/lint.ts
var SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
var isContainer = (n) => n.type === "frame" || n.type === "group";
function childrenOf(doc, n) {
  if (isContainer(n))
    return n.children;
  if (n.type === "instance")
    return instanceView(doc, n) ?? [];
  return [];
}
function collectEntries(doc, roots, pageId, pageName) {
  const out = [];
  const walk = (list, parent, depth, rootId, ancestors) => {
    for (const n of list) {
      const rid = depth === 0 ? n.id : rootId;
      out.push({ node: n, parent, depth, pageId, pageName, siblings: list, rootId: rid, ancestors });
      const kids = childrenOf(doc, n);
      if (kids.length)
        walk(kids, n, depth + 1, rid, [n, ...ancestors]);
    }
  };
  walk(roots, null, 0, "", []);
  return out;
}
var visible = (n) => n.visible !== false;
function ownPaint(doc, n) {
  const fills = n.fills;
  if (!fills)
    return null;
  for (const f of fills) {
    if (f.visible === false || f.type !== "solid" || !f.color)
      continue;
    const rgba = parseColor(resolveVarColor(doc, f.color));
    if (rgba && rgba.a > 0.02)
      return rgba;
  }
  return null;
}
var covers = (cover, inner) => cover.x - 0.5 <= inner.x && cover.y - 0.5 <= inner.y && cover.x + cover.w + 0.5 >= inner.x + inner.w && cover.y + cover.h + 0.5 >= inner.y + inner.h;
function backdropChain(doc, e) {
  const chain = [];
  for (let i = e.ancestors.length - 1;i >= 0; i--) {
    const p = ownPaint(doc, e.ancestors[i]);
    if (p)
      chain.push(p);
  }
  const idx = e.siblings.indexOf(e.node);
  if (idx > 0) {
    for (let i = idx - 1;i >= 0; i--) {
      const s = e.siblings[i];
      if (!visible(s) || !covers(s, e.node))
        continue;
      const p = ownPaint(doc, s);
      if (p)
        chain.push(p);
    }
  }
  const self = ownPaint(doc, e.node);
  if (self)
    chain.push(self);
  return chain;
}
function compositeBackdrop(doc, e) {
  const chain = backdropChain(doc, e);
  if (chain.length === 0)
    return null;
  let acc = chain[0];
  for (let i = 1;i < chain.length; i++)
    acc = compositeOver(chain[i], acc);
  return { color: toHex({ ...acc, a: 1 }), rgba: acc };
}
function effectiveBackdrop(doc, e) {
  return compositeBackdrop(doc, e)?.color ?? "#ffffff";
}
function radiusOf(n) {
  const r = n.radius;
  if (typeof r === "number")
    return r;
  if (Array.isArray(r))
    return r[0] ?? 0;
  return 0;
}
var visibleEffects = (n) => (n.effects ?? []).filter((fx) => fx.visible !== false);
var hasShadow = (n) => visibleEffects(n).some((fx) => fx.type !== "layer-blur");
var isLargeText = (size, weight) => size >= 24 || weight >= 600 && size >= 19;
var runSize = (r) => r.size ?? 14;
var runWeight = (r) => r.weight ?? 400;
var runColor = (r) => r.color ?? "#111111";
var BUTTONISH = /(\u6309\u94AE|button|btn|chip|tag|tab)$/i;
function interactiveKind(doc, e) {
  if (hasInteraction(e.node))
    return "interaction";
  if ((e.node.type === "frame" || e.node.type === "rect") && BUTTONISH.test(e.node.name))
    return "buttonish";
  return null;
}
var mk = (e, code, severity, message, suggestion, detail) => ({
  code,
  severity,
  page: e.pageName,
  nodeId: e.node.id,
  nodeName: e.node.name,
  message,
  detail,
  suggestion
});
var ruleTextContrast = {
  code: "text-contrast",
  severity: "error",
  detect: (doc, entries) => {
    const out = [];
    for (const e of entries) {
      const runs = nodeTextRuns(e.node);
      if (runs.length === 0)
        continue;
      const bg = effectiveBackdrop(doc, e);
      let worst = null;
      for (const r of runs) {
        if (!r.text.trim())
          continue;
        const got = effectiveContrast(resolveVarColor(doc, runColor(r)), resolveVarColor(doc, bg));
        if (!got)
          continue;
        if (!worst || got.ratio < worst.ratio)
          worst = { run: r, ratio: got.ratio, fg: got.fg };
      }
      if (!worst)
        continue;
      const need = isLargeText(runSize(worst.run), runWeight(worst.run)) ? 3 : 4.5;
      if (worst.ratio >= need)
        continue;
      const onShape = e.node.type !== "text";
      out.push(mk(e, "text-contrast", "error", `${onShape ? "\u5F62\u72B6\u5185\u5D4C\u6587\u5B57" : "\u6587\u5B57"}\u5BF9\u6BD4\u5EA6 ${worst.ratio.toFixed(2)}:1\uFF0C\u4F4E\u4E8E ${need}:1`, onShape ? `\u6539\u6807\u7B7E\u6587\u5B57\u8272\u6216\u6539\u5F62\u72B6\u586B\u5145\u2014\u2014\u4E24\u8FB9\u81F3\u5C11\u8981\u6709\u4E00\u8FB9\u8BA9\u51FA\u5BF9\u6BD4\u7A7A\u95F4\uFF08\u6DF1\u5E95\u914D\u6D45\u5B57\u3001\u6D45\u5E95\u914D\u6DF1\u5B57\uFF09` : `\u628A\u6587\u5B57\u8272\u6539\u5230\u4E0E\u80CC\u666F\u5BF9\u6BD4 \u2265${need}:1\uFF08\u6DF1\u5E95\u914D\u6D45\u5B57\u3001\u6D45\u5E95\u914D\u6DF1\u5B57\uFF09\uFF0C\u6216\u8C03\u6574\u80CC\u666F\u660E\u5EA6`, {
        fg: worst.fg,
        bg: toHex(parseColor(resolveVarColor(doc, bg)) ?? { r: 255, g: 255, b: 255, a: 1 }),
        ratio: Math.round(worst.ratio * 100) / 100,
        required: need,
        text: worst.run.text.slice(0, 40),
        ...onShape ? { layer: true } : {}
      }));
    }
    return out;
  }
};
var ruleDanglingVar = {
  code: "dangling-var",
  severity: "error",
  detect: (doc, entries) => {
    const known = new Set((doc.variables ?? []).map((v) => v.id));
    const out = [];
    const scan = (e, color) => {
      if (!isVarRef(color))
        return;
      const id = varRefId(color);
      if (known.has(id))
        return;
      out.push(mk(e, "dangling-var", "error", `\u53D8\u91CF\u5F15\u7528 var:${id} \u672A\u5B9A\u4E49`, `\u7528 edit_variables set \u8865\u5EFA\u8BE5\u53D8\u91CF\uFF0C\u6216\u628A\u8BE5\u5904\u989C\u8272\u6539\u6210\u5177\u4F53\u8272\u503C`, {
        variableId: id
      }));
    };
    for (const e of entries) {
      const rec = e.node;
      for (const f of rec.fills ?? []) {
        scan(e, f.color);
        for (const s of f.stops ?? [])
          scan(e, s.color);
      }
      for (const s of rec.strokes ?? [])
        scan(e, s.color);
      for (const fx of rec.effects ?? [])
        if (fx.type !== "layer-blur")
          scan(e, fx.color);
      for (const r of rec.runs ?? [])
        scan(e, r.color);
      scan(e, rec.color);
    }
    return out;
  }
};
var ruleUnknownIcon = {
  code: "unknown-icon",
  severity: "warning",
  detect: (doc, entries) => {
    const out = [];
    for (const e of entries) {
      if (e.node.type !== "icon")
        continue;
      if (resolveIconName(e.node.icon))
        continue;
      out.push(mk(e, "unknown-icon", "warning", `\u56FE\u6807\u540D\u300C${e.node.icon}\u300D\u4E0D\u5728\u5185\u7F6E lucide \u96C6`, `\u5148 list_icons \u641C\u5230\u89C4\u8303\u540D\u518D\u7528 update_nodes \u6539 icon \u5B57\u6BB5`, {
        icon: e.node.icon
      }));
    }
    return out;
  }
};
var ruleTapTarget = {
  code: "tap-target-small",
  severity: "warning",
  detect: (doc, entries) => {
    const out = [];
    const mobileRoots = new Set(entries.filter((e) => e.depth === 0 && e.node.type === "frame" && e.node.w <= 480).map((e) => e.node.id));
    if (mobileRoots.size === 0)
      return out;
    for (const e of entries) {
      const kind = interactiveKind(doc, e);
      if (!kind)
        continue;
      if (!mobileRoots.has(e.rootId))
        continue;
      if (e.node.w >= MIN_TAP_TARGET && e.node.h >= MIN_TAP_TARGET)
        continue;
      out.push(mk(e, "tap-target-small", "warning", `\u53EF\u70B9\u533A\u57DF ${e.node.w}\xD7${e.node.h}\uFF0C\u5C0F\u4E8E ${MIN_TAP_TARGET}\xD7${MIN_TAP_TARGET}`, `\u628A\u8BE5\u8282\u70B9\u653E\u5927\u5230\u81F3\u5C11 ${MIN_TAP_TARGET}\xD7${MIN_TAP_TARGET}\uFF08\u7559\u51FA\u53EF\u70B9\u70ED\u533A\uFF09\uFF0C\u6216\u7528\u7A7A\u767D\u5185\u8FB9\u8DDD\u6491\u5F00`, {
        w: e.node.w,
        h: e.node.h,
        min: MIN_TAP_TARGET,
        by: kind
      }));
    }
    return out;
  }
};
var ruleOverflow = {
  code: "overflow-clipped",
  severity: "warning",
  detect: (doc, entries) => {
    const out = [];
    for (const e of entries) {
      const p = e.parent;
      if (!p || p.type !== "frame" || p.clip === false)
        continue;
      if (!visible(e.node))
        continue;
      const scroll = p.type === "frame" ? p.scroll : undefined;
      const reachable = (axis) => axis === "x" ? scroll === "h" || scroll === "both" : scroll === "v" || scroll === "both";
      const over = [];
      if (e.node.x < -0.5 && !reachable("x"))
        over.push("\u5DE6");
      if (e.node.y < -0.5 && !reachable("y"))
        over.push("\u4E0A");
      if (e.node.x + e.node.w > p.w + 0.5 && !reachable("x"))
        over.push("\u53F3");
      if (e.node.y + e.node.h > p.h + 0.5 && !reachable("y"))
        over.push("\u4E0B");
      if (over.length === 0)
        continue;
      const scrolled = !!scroll;
      out.push(mk(e, "overflow-clipped", "warning", scrolled ? `\u5185\u5BB9\u8D85\u51FA\u753B\u677F${over.join("/")}\u4FA7\uFF1B\u753B\u677F\u867D\u7136\u5F00\u4E86\u6EDA\u52A8\uFF08${scroll}\uFF09\uFF0C\u4F46\u8FD9\u51E0\u4FA7\u4E0D\u5728\u6EDA\u52A8\u8F74\u4E0A\uFF0C\u6EDA\u4E0D\u5230` : `\u5185\u5BB9\u8D85\u51FA\u753B\u677F${over.join("/")}\u4FA7\uFF0C\u4E14\u753B\u677F\u5F00\u542F\u4E86\u88C1\u5207`, scrolled ? `\u628A\u8BE5\u8282\u70B9\u632A\u56DE${scroll === "v" ? "\u5DE6\u53F3" : "\u4E0A\u4E0B"}\u8FB9\u754C\u5185\uFF0C\u6216\u628A\u753B\u677F scroll \u6539\u6210 "both"\uFF08\u957F\u5185\u5BB9\u7528 scroll:"v"\uFF0C\u6A2A\u5411\u6EA2\u51FA\u7528 scroll:"h"\uFF09` : `\u628A\u8BE5\u8282\u70B9\u632A\u56DE\u753B\u677F\u5185\u3001\u7F29\u5C0F\u5C3A\u5BF8\uFF1B\u82E5\u662F\u957F\u9875\u9762\u8BF7\u7ED9\u753B\u677F\u52A0 scroll:"v"\uFF08\u539F\u578B\u9884\u89C8\u91CC\u5C31\u80FD\u6EDA\u4E86\uFF09\uFF0C\u6216\u7ED9\u7236\u753B\u677F\u8BBE clip:false`, { edges: over, frame: p.id, frameName: p.name, scroll: scroll ?? null }));
    }
    return out;
  }
};
var ruleDanglingInteraction = {
  code: "dangling-interaction",
  severity: "error",
  detect: (doc, entries) => {
    const out = [];
    for (const e of entries) {
      const list = nodeInteractions(e.node);
      if (list.length === 0)
        continue;
      const frame = topLevelFrameOf(doc, e.node.id);
      list.forEach((it, i) => {
        const check = checkInteractionTarget(doc, frame, it);
        if (check.ok)
          return;
        const where = list.length > 1 ? `\u7B2C ${i + 1} \u6761\u4EA4\u4E92` : "\u4EA4\u4E92";
        out.push(mk(e, "dangling-interaction", "error", `${where}\uFF08${TRIGGER_LABELS[it.trigger]} \u2192 ${ACTION_LABELS[it.action]}\uFF09\u7684\u76EE\u6807\u4E0D\u53EF\u7528\uFF1A${check.reason}`, it.action === "navigate" || it.action === "overlay" ? "\u628A to \u6539\u6210\u67D0\u5757\u9876\u5C42\u753B\u677F\u7684 id\uFF08read_doc \u770B frames\uFF09\uFF1B\u6D6E\u5C42\u505A\u6CD5\u662F\u628A\u6D6E\u5C42\u4E5F\u505A\u6210\u4E00\u5757\u753B\u677F\u518D overlay \u5230\u5B83" : "scrollTo/toggleVisible \u7684 to \u5FC5\u987B\u662F\u540C\u4E00\u5757\u753B\u677F\u5185\u7684\u8282\u70B9 id", { trigger: it.trigger, action: it.action, to: it.to ?? null, reason: check.reason }));
      });
    }
    return out;
  }
};
var rulePrototypeFlow = {
  code: "prototype-flow",
  severity: "info",
  detect: (doc, entries) => {
    const out = [];
    const frames = allFrames(doc);
    if (frames.length < 2)
      return out;
    const total = entries.reduce((n, e) => n + nodeInteractions(e.node).length, 0);
    if (total === 0)
      return out;
    const inbound = new Map;
    const outbound = new Map;
    for (const f of frames) {
      inbound.set(f.frame.id, 0);
      outbound.set(f.frame.id, 0);
    }
    for (const e of entries) {
      const from = topLevelFrameOf(doc, e.node.id);
      for (const it of nodeInteractions(e.node)) {
        if (from && (it.action === "navigate" || it.action === "overlay" || it.action === "back")) {
          outbound.set(from.id, (outbound.get(from.id) ?? 0) + 1);
        }
        if (!it.to)
          continue;
        if (it.action === "navigate" || it.action === "overlay") {
          if (inbound.has(it.to))
            inbound.set(it.to, (inbound.get(it.to) ?? 0) + 1);
        }
      }
    }
    const entryFrameId = frames[0].frame.id;
    for (const { frame } of frames) {
      const e = entries.find((x) => x.node.id === frame.id && x.depth === 0);
      if (!e)
        continue;
      const orphan = frame.id !== entryFrameId && (inbound.get(frame.id) ?? 0) === 0;
      const deadEnd = (outbound.get(frame.id) ?? 0) === 0;
      if (!orphan && !deadEnd)
        continue;
      const kinds = [orphan ? "unreachable" : null, deadEnd ? "dead-end" : null].filter((k) => !!k);
      const what = orphan && deadEnd ? "\u6CA1\u6709\u4EFB\u4F55\u4EA4\u4E92\u8DF3\u8FDB\u8FD9\u5757\u753B\u677F\uFF0C\u5B83\u4E5F\u6CA1\u6709\u4EFB\u4F55\u51FA\u53E3" : orphan ? "\u6CA1\u6709\u4EFB\u4F55\u4EA4\u4E92\u8DF3\u8FDB\u8FD9\u5757\u753B\u677F\uFF08\u5B64\u513F\u5C4F\uFF09" : "\u8FD9\u5757\u753B\u677F\u6CA1\u6709\u4EFB\u4F55\u51FA\u53E3\u4EA4\u4E92\uFF08\u65AD\u5934\u5C4F\uFF0C\u6F14\u793A\u8D70\u5230\u8FD9\u91CC\u5C31\u8D70\u4E0D\u4E0B\u53BB\u4E86\uFF09";
      const how = orphan ? `\u7ED9\u80FD\u5230\u5B83\u7684\u6309\u94AE\u52A0 interactions\uFF08\u5982 { trigger:"tap", action:"navigate", to:"${frame.id}" }\uFF09\uFF1B\u82E5\u5B83\u53EA\u662F\u5907\u7528\u7A3F\uFF0C\u53EF\u5FFD\u7565` : `\u6309\u6D41\u7A0B\u63A5\u4E0A\uFF1A\u8FD4\u56DE\u7BAD\u5934\u52A0 { trigger:"tap", action:"back" }\uFF0C\u4E3B\u6309\u94AE\u52A0 navigate \u5230\u4E0B\u4E00\u5C4F`;
      out.push(mk(e, "prototype-flow", "info", what, how, { kind: kinds.length === 1 ? kinds[0] : "isolated", kinds }));
    }
    return out;
  }
};
var ruleNesting = {
  code: "nesting-depth",
  severity: "warning",
  detect: (doc, entries) => {
    const MAX = 8;
    const out = [];
    const seenChain = new Set;
    for (const e of entries) {
      if (e.depth <= MAX)
        continue;
      const chain = `${e.pageId}:${e.node.id.slice(0, e.node.id.lastIndexOf("/") + 1)}`;
      if (seenChain.has(chain))
        continue;
      seenChain.add(chain);
      out.push(mk(e, "nesting-depth", "warning", `\u56FE\u5C42\u5D4C\u5957 ${e.depth} \u5C42\uFF0C\u8D85\u8FC7 ${MAX} \u5C42`, `\u628A\u4E2D\u95F4\u7684\u5305\u88F9 frame \u62C6\u5E73\u2014\u2014\u7528 auto layout\uFF08layout \u5B57\u6BB5\uFF09\u4EE3\u66FF\u7EAF\u5B9A\u4F4D\u5D4C\u5957`, {
        depth: e.depth,
        max: MAX
      }));
    }
    return out;
  }
};
var ruleEmptyContainer = {
  code: "empty-container",
  severity: "info",
  detect: (doc, entries) => {
    const out = [];
    for (const e of entries) {
      if (!isContainer(e.node))
        continue;
      if (e.node.w <= 0 || e.node.h <= 0)
        continue;
      const kids = childrenOf(doc, e.node).filter(visible);
      if (kids.length > 0)
        continue;
      out.push(mk(e, "empty-container", "info", "\u5BB9\u5668\u91CC\u6CA1\u6709\u53EF\u89C1\u5B50\u8282\u70B9", `\u8865\u4E0A\u5185\u5BB9\uFF0C\u6216\u5220\u6389\u8FD9\u4E2A\u7A7A\u5BB9\u5668`, {
        children: childrenOf(doc, e.node).length
      }));
    }
    return out;
  }
};
var ruleMixedRadius = {
  code: "mixed-sibling-radius",
  severity: "warning",
  detect: (doc, entries) => {
    const out = [];
    for (const e of entries) {
      if (!isContainer(e.node))
        continue;
      const groups = new Map;
      for (const c of childrenOf(doc, e.node).filter(visible)) {
        if (!isContainer(c) && c.type !== "rect")
          continue;
        const key = `${Math.round(c.w)}x${Math.round(c.h)}`;
        groups.set(key, [...groups.get(key) ?? [], c]);
      }
      for (const [size, group] of groups) {
        if (group.length < 3)
          continue;
        const radii = new Set(group.map(radiusOf));
        if (radii.size <= 1)
          continue;
        out.push(mk(e, "mixed-sibling-radius", "warning", `${group.length} \u4E2A\u540C\u5C3A\u5BF8\uFF08${size}\uFF09\u7684\u5144\u5F1F\u8282\u70B9\u5706\u89D2\u4E0D\u4E00\u81F4\uFF1A${[...radii].join(" / ")}`, `\u7EDF\u4E00\u6210\u540C\u4E00\u4E2A\u5706\u89D2\u503C\u2014\u2014\u540C\u5C3A\u5BF8\u5361\u7247\u770B\u8D77\u6765\u5C31\u662F\u4E00\u5957\uFF0C\u6DF7\u7528\u5706\u89D2\u662F\u6700\u5E38\u89C1\u7684\u5EC9\u4EF7\u611F\u6765\u6E90`, { size, radii: [...radii] }));
      }
    }
    return out;
  }
};
function looksLikeCard(doc, n) {
  if (radiusOf(n) >= 4)
    return true;
  if (hasShadow(n))
    return true;
  return (n.fills ?? []).some((f) => {
    if (f.visible === false || f.type !== "solid" || !f.color)
      return false;
    const c = resolveVarColor(doc, f.color).toLowerCase();
    return c !== "#ffffff" && c !== "#fff";
  });
}
var ruleThreeCardRow = {
  code: "slop-three-card-row",
  severity: "warning",
  detect: (doc, entries) => {
    const out = [];
    const near = (a, b, eps = 1) => Math.abs(a - b) <= eps;
    for (const e of entries) {
      if (!isContainer(e.node))
        continue;
      const kids = childrenOf(doc, e.node).filter(visible);
      if (kids.length < 3)
        continue;
      const sameSize = (a, b, c) => near(a.w, b.w) && near(a.h, b.h) && near(b.w, c.w) && near(b.h, c.h);
      for (let i = 0;i + 2 < kids.length; i++) {
        const [a, b, c] = [kids[i], kids[i + 1], kids[i + 2]];
        if (!sameSize(a, b, c))
          continue;
        if (!looksLikeCard(doc, a) || !looksLikeCard(doc, b) || !looksLikeCard(doc, c))
          continue;
        const g1 = b.x - (a.x + a.w);
        const g2 = c.x - (b.x + b.w);
        if (!near(a.y, b.y) || !near(b.y, c.y))
          continue;
        if (g1 < 1 || g2 < 1)
          continue;
        if (!near(g1, g2))
          continue;
        out.push(mk(e, "slop-three-card-row", "warning", "\u540C\u5C42\u51FA\u73B0 3 \u4E2A\u7B49\u5C3A\u5BF8\u3001\u7B49\u95F4\u8DDD\u7684\u5361\u7247\uFF08\u5178\u578B AI \u751F\u6210\u529F\u80FD\u533A\u5957\u8DEF\uFF09", `\u6253\u7834\u5BF9\u79F0\uFF1A\u6539\u6210 2+1 \u5E03\u5C40\u3001\u62C9\u5F00\u5176\u4E2D\u4E00\u4E2A\u7684\u5C3A\u5BF8\uFF0C\u6216\u8BA9\u5176\u4E2D\u4E00\u5F20\u6210\u4E3A\u4E3B\u89C6\u89C9\uFF08\u66F4\u5927/\u5E26\u56FE\uFF09`, {
          gap: Math.round(g1),
          size: `${Math.round(a.w)}\xD7${Math.round(a.h)}`
        }));
        break;
      }
    }
    return out;
  }
};
var ruleRoundedCardWall = {
  code: "slop-rounded-card-wall",
  severity: "warning",
  detect: (doc, entries) => {
    const out = [];
    for (const e of entries) {
      if (!isContainer(e.node))
        continue;
      const kids = childrenOf(doc, e.node).filter(visible);
      if (kids.length < 4)
        continue;
      const wall = kids.filter((c) => radiusOf(c) >= 16 && hasShadow(c));
      if (wall.length < 4 || wall.length < kids.length)
        continue;
      out.push(mk(e, "slop-rounded-card-wall", "warning", `${wall.length} \u4E2A\u5144\u5F1F\u8282\u70B9\u5168\u90E8\u662F\u300C\u5927\u5706\u89D2 + \u9634\u5F71\u300D\u5361\u7247`, `\u53BB\u6389\u4E00\u90E8\u5206\u5361\u7247\u7684\u5706\u89D2\u6216\u9634\u5F71\uFF0C\u6216\u7528\u5206\u9694\u7EBF/\u7559\u767D\u4EE3\u66FF\u5361\u7247\u2014\u2014\u5C42\u5C42\u5361\u7247\u662F\u5EC9\u4EF7\u611F\u7684\u5934\u53F7\u6765\u6E90`, {
        cards: wall.length
      }));
    }
    return out;
  }
};
var rulePurpleGlow = {
  code: "slop-purple-glow",
  severity: "warning",
  detect: (doc, entries) => {
    const out = [];
    const isPurple = (raw) => {
      if (typeof raw !== "string")
        return false;
      const c = parseColor(resolveVarColor(doc, raw));
      if (!c)
        return false;
      const h = hueOf(c);
      return h !== null && h >= 260 && h <= 320;
    };
    for (const e of entries) {
      const fills = e.node.fills ?? [];
      const grads = fills.filter((f) => f.type === "linear" || f.type === "radial");
      if (grads.length === 0)
        continue;
      const purple = grads.filter((g) => (g.stops ?? []).length > 0 && (g.stops ?? []).every((s) => isPurple(s.color)));
      if (purple.length === 0)
        continue;
      const glow = visibleEffects(e.node).some((fx) => fx.type === "drop-shadow" && (fx.blur ?? 0) >= 24);
      if (!glow)
        continue;
      out.push(mk(e, "slop-purple-glow", "warning", "\u7D2B\u8272\u6E10\u53D8\u53E0\u52A0\u5927\u8303\u56F4\u6A21\u7CCA\u9634\u5F71\uFF08\u5EC9\u4EF7 AI \u5149\u6655\uFF09", `\u6362\u6210\u54C1\u724C\u4E3B\u8272\u6216\u4E2D\u6027\u8272\u7CFB\uFF0C\u5E76\u6536\u7D27\u9634\u5F71\u7684\u6A21\u7CCA\u534A\u5F84\u2014\u2014\u5927\u8303\u56F4\u7D2B\u5149\u6655\u662F\u751F\u6210\u7A3F\u6700\u660E\u663E\u7684\u7834\u7EFD`, {
        stops: (purple[0].stops ?? []).map((s) => s.color)
      }));
    }
    return out;
  }
};
var ruleLayoutDrift = {
  code: "layout-drift",
  severity: "info",
  detect: (doc, entries) => {
    const out = [];
    for (const e of entries) {
      if (!hasLayout(e.node))
        continue;
      if (e.node.children.length === 0)
        continue;
      const clone = structuredClone(e.node);
      applyLayoutToFrame(clone);
      const drifted = [];
      for (const c of clone.children) {
        const orig = e.node.children.find((o) => o.id === c.id);
        if (!orig)
          continue;
        if (Math.abs(orig.x - c.x) > 1 || Math.abs(orig.y - c.y) > 1 || Math.abs(orig.w - c.w) > 1 || Math.abs(orig.h - c.h) > 1)
          drifted.push(c.id);
      }
      if (drifted.length === 0)
        continue;
      out.push(mk(e, "layout-drift", "info", `${drifted.length} \u4E2A\u5B50\u8282\u70B9\u7684\u4F4D\u7F6E\u4E0E\u81EA\u52A8\u5E03\u5C40\u91CD\u7B97\u7ED3\u679C\u4E0D\u4E00\u81F4\uFF08\u88AB\u624B\u52A8\u632A\u8FC7\uFF09`, `\u8981\u4E48\u8C03 layout \u5B57\u6BB5\uFF08gap/padding/main/cross\uFF09\u6765\u8868\u8FBE\u8FD9\u4E2A\u4F4D\u7F6E\uFF0C\u8981\u4E48\u5BF9\u8BE5\u753B\u677F\u8DD1 apply_layout \u8BA9\u6392\u5E03\u56DE\u5F52\u786E\u5B9A\u6027`, {
        drifted: drifted.slice(0, 8)
      }));
    }
    return out;
  }
};
var LINT_RULES = [
  ruleTextContrast,
  ruleDanglingVar,
  ruleTapTarget,
  ruleOverflow,
  ruleNesting,
  ruleMixedRadius,
  ruleThreeCardRow,
  ruleRoundedCardWall,
  rulePurpleGlow,
  ruleUnknownIcon,
  ruleEmptyContainer,
  ruleLayoutDrift,
  ruleDanglingInteraction,
  rulePrototypeFlow
];
var LINT_CODES = LINT_RULES.map((r) => r.code);
var LINT_SEVERITIES = ["error", "warning", "info"];
var MIN_TAP_TARGET = 44;
function lintDoc(doc, opts = {}) {
  const pages = opts.page ? doc.pages.filter((p) => p.id === opts.page || p.name === opts.page) : doc.pages;
  const wanted = opts.codes?.length ? new Set(opts.codes) : null;
  const rules = LINT_RULES.filter((r) => !wanted || wanted.has(r.code));
  const maxOrder = opts.minSeverity ? SEVERITY_ORDER[opts.minSeverity] : Number.POSITIVE_INFINITY;
  const entries = [];
  let frames = 0;
  for (const page of pages) {
    const roots = opts.ids?.length ? page.nodes.filter((n) => opts.ids.includes(n.id)) : page.nodes;
    const got = collectEntries(doc, roots, page.id, page.name);
    for (const e of got)
      if (e.node.type === "frame")
        frames++;
    entries.push(...got);
  }
  const issues = [];
  for (const rule of rules) {
    for (const issue of rule.detect(doc, entries)) {
      if (SEVERITY_ORDER[issue.severity] > maxOrder)
        continue;
      issues.push(issue);
    }
  }
  const seen = new Set;
  const deduped = issues.filter((i) => {
    const k = `${i.code}@${i.nodeId}`;
    if (seen.has(k))
      return false;
    seen.add(k);
    return true;
  });
  deduped.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.page.localeCompare(b.page) || a.nodeId.localeCompare(b.nodeId));
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of deduped)
    counts[i.severity]++;
  return { scanned: { frames, nodes: entries.length }, counts, issues: deduped };
}
function lintSummary(doc, opts = {}, topN = 3) {
  const r = lintDoc(doc, { minSeverity: "warning", ...opts });
  return {
    counts: r.counts,
    top: r.issues.slice(0, topN).map((i) => `${i.code}@${i.nodeId}`)
  };
}

// mcp/script.ts
import { Worker } from "worker_threads";
var SCRIPT_TIMEOUT_DEFAULT = 5000;
var SCRIPT_TIMEOUT_MIN = 500;
var SCRIPT_TIMEOUT_MAX = 30000;
var SCRIPT_MAX_OPS = 2000;
var BOOTSTRAP = `
const { workerData, parentPort } = require("node:worker_threads");
const ops = [];
const logs = [];
let seq = 0;

const I = (parent, spec) => {
  if (typeof parent !== "string" || !parent) throw new Error("I(parentId, spec)\uFF1AparentId \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32");
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("I(parentId, spec)\uFF1Aspec \u5FC5\u987B\u662F\u8282\u70B9\u89C4\u683C\u5BF9\u8C61");
  const id = typeof spec.id === "string" && spec.id ? spec.id : "s" + (++seq);
  ops.push({ kind: "insert", parent, spec: Object.assign({}, spec, { id }) });
  return id;
};
const U = (id, patch) => {
  if (typeof id !== "string" || !id) throw new Error("U(nodeId, patch)\uFF1AnodeId \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("U(nodeId, patch)\uFF1Apatch \u5FC5\u987B\u662F\u5B57\u6BB5\u5BF9\u8C61");
  ops.push({ kind: "update", id, patch });
  return id;
};
const log = (...args) => { logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };

// \u9003\u9038\u6869\u7528 Proxy\uFF1A\u4EFB\u4F55\u5C5E\u6027\u8BBF\u95EE\uFF08process.exit\uFF09\u3001\u8C03\u7528\uFF08require("fs")\uFF09\u3001\u6784\u9020\uFF08new Buffer\uFF09
// \u90FD\u76F4\u63A5\u629B\u51FA\u70B9\u540D\u9053\u59D3\u7684\u9519\u8BEF\uFF0C\u800C\u4E0D\u662F\u8BA9\u811A\u672C\u649E\u4E0A\u4E00\u4E2A undefined \u518D\u62A5\u4E9B\u770B\u4E0D\u61C2\u7684 TypeError\u3002
const blocked = (what) => new Proxy(function () {}, {
  get(_t, prop) { throw new Error("run_design_script \u6C99\u7BB1\u7981\u7528 " + what + "." + String(prop) + "\uFF1A\u811A\u672C\u53EA\u505A\u7EAF\u8BA1\u7B97\uFF0C\u64CD\u4F5C\u4E00\u5F8B\u7528 I()/U() \u8BB0\u5F55"); },
  apply() { throw new Error("run_design_script \u6C99\u7BB1\u7981\u7528 " + what + "()\uFF1A\u811A\u672C\u53EA\u505A\u7EAF\u8BA1\u7B97\uFF0C\u64CD\u4F5C\u4E00\u5F8B\u7528 I()/U() \u8BB0\u5F55"); },
  construct() { throw new Error("run_design_script \u6C99\u7BB1\u7981\u7528 new " + what + "()\uFF1A\u811A\u672C\u53EA\u505A\u7EAF\u8BA1\u7B97\uFF0C\u64CD\u4F5C\u4E00\u5F8B\u7528 I()/U() \u8BB0\u5F55"); },
});
const sandbox = {
  require: blocked("require"),
  process: blocked("process"),
  fetch: blocked("fetch"),
  Buffer: blocked("Buffer"),
};

let result = null;
let failure = null;
try {
  const fn = new Function("I", "U", "log", "require", "process", "fetch", "Buffer", workerData.script);
  const r = fn(I, U, log, sandbox.require, sandbox.process, sandbox.fetch, sandbox.Buffer);
  result = r === undefined ? null : r;
} catch (err) {
  failure = String((err && err.stack) || err);
}
parentPort.postMessage({ ok: failure === null, error: failure, ops, logs, result });
`;
function runDesignScript(script, timeoutMs) {
  if (typeof script !== "string" || !script.trim()) {
    return Promise.reject(new Error("script \u5FC5\u586B\uFF1A\u4E00\u6BB5 JS \u6E90\u7801\uFF08\u53EF\u7528 I()/U()/log()\uFF0C\u53EF return\uFF09"));
  }
  const ms = Math.min(SCRIPT_TIMEOUT_MAX, Math.max(SCRIPT_TIMEOUT_MIN, timeoutMs ?? SCRIPT_TIMEOUT_DEFAULT));
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(BOOTSTRAP, { eval: true, workerData: { script } });
    } catch (err) {
      reject(new Error(`\u65E0\u6CD5\u521B\u5EFA\u811A\u672C\u6C99\u7BB1 worker\uFF1A${err instanceof Error ? err.message : String(err)}` + "\uFF1B\u8BF7\u6539\u7528 add_nodes / update_nodes \u663E\u5F0F\u94FA\u5F00\u8282\u70B9\u3002"));
      return;
    }
    let settled = false;
    let timer;
    const finish = (fn) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      fn();
    };
    timer = setTimeout(() => {
      finish(() => reject(new Error(`\u811A\u672C\u6267\u884C\u8D85\u8FC7 ${ms}ms \u5DF2\u88AB\u5F3A\u5236\u4E2D\u65AD\uFF08\u591A\u534A\u662F\u6B7B\u5FAA\u73AF\uFF09\u3002` + "\u8BF7\u68C0\u67E5\u5FAA\u73AF\u6761\u4EF6\uFF0C\u6216\u62C6\u6210\u591A\u6B21\u8C03\u7528\uFF1B\u4E5F\u53EF\u4EE5\u8C03\u5927 timeoutMs\uFF08\u4E0A\u9650 30000\uFF09\u3002")));
    }, ms);
    worker.on("message", (msg) => {
      finish(() => {
        if (!msg?.ok) {
          reject(new Error(`\u811A\u672C\u62A5\u9519\uFF1A${msg?.error ?? "\u672A\u77E5\u9519\u8BEF"}`));
          return;
        }
        const ops = msg.ops ?? [];
        if (ops.length > SCRIPT_MAX_OPS) {
          reject(new Error(`\u811A\u672C\u4EA7\u751F\u4E86 ${ops.length} \u4E2A\u64CD\u4F5C\uFF0C\u8D85\u8FC7\u4E0A\u9650 ${SCRIPT_MAX_OPS}\uFF1B\u8BF7\u62C6\u6210\u591A\u6B21\u8C03\u7528`));
          return;
        }
        resolve({ ops, logs: msg.logs ?? [], result: msg.result ?? null });
      });
    });
    worker.on("error", (err) => {
      finish(() => reject(new Error(`\u811A\u672C\u6C99\u7BB1\u5F02\u5E38\uFF1A${err instanceof Error ? err.message : String(err)}` + "\uFF1B\u8BF7\u6539\u7528 add_nodes / update_nodes \u663E\u5F0F\u94FA\u5F00\u8282\u70B9\u3002")));
    });
    worker.on("exit", (code) => {
      finish(() => reject(new Error(`\u811A\u672C\u6C99\u7BB1\u610F\u5916\u9000\u51FA\uFF08code ${code}\uFF09\uFF1B\u8BF7\u68C0\u67E5\u811A\u672C\u662F\u5426\u8C03\u7528\u4E86 process.exit \u4E4B\u7C7B\u7684\u65B9\u6CD5`)));
    });
  });
}

// ui/src/stencils.ts
var INK = "#111111";
var MUTED = "#8a8a8e";
var LINE = "#d9d9d9";
var SOFT = "#f5f5f5";
var ACCENT = "#0d99ff";
var FLOW_LINE = "#4a5568";
var FLOW_INK = "#1a202c";
var shapeLabel = (content, st = {}) => {
  const run = { text: content };
  if (st.size !== undefined)
    run.size = st.size;
  if (st.weight !== undefined)
    run.weight = st.weight;
  if (st.color !== undefined)
    run.color = st.color;
  const lt = { runs: [run] };
  if (st.align)
    lt.align = st.align;
  if (st.vAlign)
    lt.vAlign = st.vAlign;
  return lt;
};
var rect = (id, box, extra = {}) => ({ id, type: "rect", ...box, ...extra });
var labelled = (id, box, name, content, extra = {}) => ({
  id,
  type: "rect",
  name,
  ...box,
  ...extra,
  text: shapeLabel(content, extra)
});
var text = (id, box, content, extra = {}) => ({
  id,
  type: "text",
  ...box,
  text: content,
  align: "center",
  vAlign: "middle",
  size: 13,
  color: INK,
  ...extra
});
var icon = (id, box, name, glyph, color = MUTED, strokeWidth = 2) => ({
  id,
  type: "icon",
  name,
  icon: glyph,
  ...box,
  color,
  strokeWidth
});
var BUTTON = {
  id: "button",
  name: "\u6309\u94AE",
  category: "\u57FA\u7840",
  w: 120,
  h: 44,
  keys: ["button", "btn", "\u6309\u94AE", "\u4E3B\u6309\u94AE", "cta"],
  build: (b, id) => [
    labelled(id("btn"), b, "\u6309\u94AE", "\u6309\u94AE", {
      radius: Math.min(b.h / 2, 22),
      fills: [{ type: "solid", color: ACCENT }],
      size: 15,
      weight: 600,
      color: "#ffffff"
    })
  ]
};
var BUTTON_OUTLINE = {
  id: "button-outline",
  name: "\u63CF\u8FB9\u6309\u94AE",
  category: "\u57FA\u7840",
  w: 120,
  h: 44,
  keys: ["button", "\u6B21\u8981\u6309\u94AE", "outline", "ghost", "\u63CF\u8FB9\u6309\u94AE"],
  build: (b, id) => [
    labelled(id("btn"), b, "\u63CF\u8FB9\u6309\u94AE", "\u6309\u94AE", {
      radius: Math.min(b.h / 2, 22),
      fills: [{ type: "solid", color: "#ffffff" }],
      strokes: [{ color: ACCENT, width: 1.5, align: "inside" }],
      size: 15,
      weight: 600,
      color: ACCENT
    })
  ]
};
var TAG = {
  id: "tag",
  name: "\u6807\u7B7E",
  category: "\u57FA\u7840",
  w: 64,
  h: 24,
  keys: ["tag", "chip", "badge", "\u6807\u7B7E", "\u5FBD\u6807"],
  build: (b, id) => [
    labelled(id("tag"), b, "\u6807\u7B7E", "\u6807\u7B7E", {
      radius: Math.min(b.h / 2, 12),
      fills: [{ type: "solid", color: "#eaf4ff" }],
      size: 12,
      color: ACCENT
    })
  ]
};
var PLACEHOLDER = {
  id: "placeholder",
  name: "\u5360\u4F4D\u7B26",
  category: "\u57FA\u7840",
  w: 160,
  h: 120,
  keys: ["placeholder", "\u5360\u4F4D", "\u56FE\u7247\u5360\u4F4D", "image", "graybox"],
  build: (b, id) => {
    const s = Math.min(b.w, b.h) * 0.2;
    return [
      rect(id("ph"), b, {
        name: "\u5360\u4F4D\u7B26",
        radius: Math.min(8, s / 2),
        fills: [{ type: "solid", color: SOFT }],
        strokes: [{ color: LINE, width: 1, align: "inside", style: "dashed" }]
      }),
      icon(id("ic"), { x: b.x + (b.w - s) / 2, y: b.y + (b.h - s) / 2, w: s, h: s }, "\u56FE\u7247", "image", MUTED, 1.5)
    ];
  }
};
var LINK_AREA = {
  id: "link-area",
  name: "\u94FE\u63A5\u533A\u57DF",
  category: "\u57FA\u7840",
  w: 160,
  h: 44,
  keys: ["link", "hotspot", "\u70ED\u533A", "\u94FE\u63A5\u533A\u57DF", "\u70B9\u51FB\u533A\u57DF"],
  build: (b, id) => [
    labelled(id("hot"), b, "\u94FE\u63A5\u533A\u57DF", "\u94FE\u63A5\u533A\u57DF", {
      radius: 6,
      fills: [{ type: "solid", color: "#f0f7ff" }],
      strokes: [{ color: ACCENT, width: 1, align: "inside", style: "dashed" }],
      size: 12,
      color: ACCENT
    })
  ]
};
var TABLE = {
  id: "table",
  name: "\u8868\u683C",
  category: "\u57FA\u7840",
  w: 320,
  h: 160,
  keys: ["table", "\u8868\u683C", "grid", "\u6570\u636E\u8868"],
  build: (b, id) => {
    const rows = 4;
    const cols = 3;
    const rowH = b.h / rows;
    const colW = b.w / cols;
    const out = [];
    for (let r = 0;r < rows; r++) {
      for (let c = 0;c < cols; c++) {
        const cell = { x: b.x + c * colW, y: b.y + r * rowH, w: colW, h: rowH };
        out.push(r === 0 ? labelled(id(`h${c}`), cell, `\u8868\u5934${c + 1}`, c === 0 ? "\u540D\u79F0" : c === 1 ? "\u6570\u503C" : "\u5907\u6CE8", {
          radius: 0,
          fills: [{ type: "solid", color: SOFT }],
          strokes: [{ color: LINE, width: 1, align: "inside" }],
          size: 12,
          weight: 600,
          color: INK
        }) : rect(id(`c${r}${c}`), cell, {
          name: `\u5355\u5143\u683C${r}-${c + 1}`,
          radius: 0,
          fills: [{ type: "solid", color: "#ffffff" }],
          strokes: [{ color: LINE, width: 1, align: "inside" }]
        }));
      }
    }
    return out;
  }
};
var SCROLL_PANEL = {
  id: "scroll-panel",
  name: "\u6EDA\u52A8\u9762\u677F",
  category: "\u57FA\u7840",
  w: 240,
  h: 200,
  keys: ["scroll", "\u6EDA\u52A8", "\u6EDA\u52A8\u533A\u57DF", "scrollarea", "\u957F\u9875\u9762"],
  build: (b, id) => {
    const barW = Math.max(3, b.w * 0.02);
    return [
      {
        id: id("sc"),
        type: "frame",
        name: "\u6EDA\u52A8\u9762\u677F",
        ...b,
        radius: 10,
        fills: [{ type: "solid", color: "#ffffff" }],
        strokes: [{ color: LINE, width: 1, align: "inside" }],
        scroll: "v",
        clip: true,
        children: [
          rect(id("body"), { x: 0, y: 0, w: b.w - barW * 3, h: b.h * 2 }, {
            name: "\u53EF\u6EDA\u52A8\u5185\u5BB9",
            radius: 0,
            fills: [{ type: "solid", color: "#fafafa" }]
          }),
          text(id("tip"), { x: 0, y: 10, w: b.w - barW * 3, h: 18 }, "\u5185\u5BB9\u533A\uFF08\u9884\u89C8\u91CC\u53EF\u6EDA\uFF09", { size: 11, color: MUTED }),
          rect(id("bar"), { x: b.w - barW - 2, y: 4, w: barW, h: b.h * 0.4 }, {
            name: "\u6EDA\u52A8\u6761",
            radius: barW / 2,
            fills: [{ type: "solid", color: "#c9c9cf" }],
            strokes: []
          })
        ]
      }
    ];
  }
};
var DIVIDER = {
  id: "divider",
  name: "\u5206\u5272\u7EBF",
  category: "\u57FA\u7840",
  w: 240,
  h: 1,
  keys: ["divider", "hr", "separator", "\u5206\u5272\u7EBF", "\u5206\u9694\u7EBF"],
  build: (b, id) => [
    { id: id("ln"), type: "line", name: "\u5206\u5272\u7EBF", x: b.x, y: b.y, w: b.w, h: Math.max(0.5, b.h), dir: 0, strokes: [{ color: LINE, width: 1 }] }
  ]
};
var CAPSULE = {
  id: "capsule",
  name: "\u80F6\u56CA",
  category: "\u5F62\u72B6",
  w: 120,
  h: 44,
  keys: ["capsule", "pill", "\u80F6\u56CA", "\u5706\u89D2\u77E9\u5F62"],
  build: (b, id) => [rect(id("cap"), b, { name: "\u80F6\u56CA", radius: Math.min(b.h / 2, b.w / 2), fills: [{ type: "solid", color: SOFT }] })]
};
var POLYGON = {
  id: "polygon",
  name: "\u591A\u8FB9\u5F62",
  category: "\u5F62\u72B6",
  w: 120,
  h: 120,
  keys: ["polygon", "hexagon", "\u591A\u8FB9\u5F62", "\u516D\u8FB9\u5F62"],
  build: (b, id) => [
    { id: id("pg"), type: "hexagon", name: "\u591A\u8FB9\u5F62", ...b, fills: [{ type: "solid", color: SOFT }], strokes: [{ color: MUTED, width: 1, align: "inside" }] }
  ]
};
var BUBBLE = {
  id: "bubble",
  name: "\u6C14\u6CE1\u6846",
  category: "\u5F62\u72B6",
  w: 160,
  h: 64,
  keys: ["bubble", "\u6C14\u6CE1", "\u5BF9\u8BDD\u6846", "tooltip", "\u804A\u5929\u6C14\u6CE1"],
  build: (b, id) => {
    const tail = Math.max(8, Math.min(14, b.h / 3.5));
    const bodyH = b.h - tail;
    return [
      labelled(id("body"), { x: b.x, y: b.y, w: b.w, h: bodyH }, "\u6C14\u6CE1", "\u6C14\u6CE1\u6587\u5B57", {
        radius: 10,
        fills: [{ type: "solid", color: SOFT }],
        strokes: [{ color: LINE, width: 1, align: "inside" }],
        size: 13,
        color: INK
      }),
      {
        id: id("tail"),
        type: "vector",
        name: "\u6C14\u6CE1\u5C16",
        x: b.x + b.w * 0.12,
        y: b.y + bodyH - 1,
        w: tail,
        h: tail,
        path: `M0 0L${tail} 0L0 ${tail}Z`,
        fills: [{ type: "solid", color: SOFT }],
        strokes: []
      }
    ];
  }
};
var WAVE = {
  id: "wave",
  name: "\u6CE2\u6D6A",
  category: "\u5F62\u72B6",
  w: 240,
  h: 40,
  keys: ["wave", "\u6CE2\u6D6A", "\u66F2\u7EBF", "\u88C5\u9970"],
  build: (b, id) => {
    const steps = 4;
    const seg = b.w / (steps * 2);
    let d = `M0 ${b.h * 0.6}`;
    for (let i = 0;i < steps; i++) {
      d += ` Q${seg * (i * 2 + 0.5)} ${b.h * 0.05} ${seg * (i * 2 + 1)} ${b.h * 0.6}`;
      d += ` Q${seg * (i * 2 + 1.5)} ${b.h * 0.95} ${seg * (i * 2 + 2)} ${b.h * 0.6}`;
    }
    d += ` L${b.w} ${b.h} L0 ${b.h}Z`;
    return [{ id: id("wv"), type: "vector", name: "\u6CE2\u6D6A", ...b, path: d, fills: [{ type: "solid", color: SOFT }], strokes: [] }];
  }
};
var FLOW = {
  id: "flow-process",
  name: "\u6D41\u7A0B",
  category: "\u6D41\u7A0B",
  w: 140,
  h: 56,
  keys: ["process", "\u6D41\u7A0B", "\u6B65\u9AA4", "\u77E9\u5F62\u6846"],
  build: (b, id) => [
    labelled(id("n"), b, "\u6D41\u7A0B", "\u6D41\u7A0B", {
      radius: 6,
      fills: [{ type: "solid", color: "#ffffff" }],
      strokes: [{ color: FLOW_LINE, width: 1.5, align: "inside" }],
      size: 13,
      color: FLOW_INK
    })
  ]
};
var FLOW_DECISION = {
  id: "flow-decision",
  name: "\u5224\u5B9A",
  category: "\u6D41\u7A0B",
  w: 140,
  h: 90,
  keys: ["decision", "judge", "\u5224\u5B9A", "\u83F1\u5F62", "\u6761\u4EF6"],
  build: (b, id) => [
    {
      id: id("d"),
      type: "diamond",
      name: "\u5224\u5B9A",
      ...b,
      fills: [{ type: "solid", color: "#ffffff" }],
      strokes: [{ color: FLOW_LINE, width: 1.5, align: "inside" }],
      text: shapeLabel("\u6761\u4EF6\uFF1F", { size: 12, color: FLOW_INK })
    }
  ]
};
var FLOW_TERMINAL = {
  id: "flow-terminal",
  name: "\u5F00\u59CB/\u7ED3\u675F",
  category: "\u6D41\u7A0B",
  w: 140,
  h: 52,
  keys: ["terminal", "start", "end", "\u5F00\u59CB", "\u7ED3\u675F", "\u8D77\u6B62"],
  build: (b, id) => [
    labelled(id("t"), b, "\u5F00\u59CB/\u7ED3\u675F", "\u5F00\u59CB", {
      radius: b.h / 2,
      fills: [{ type: "solid", color: "#ffffff" }],
      strokes: [{ color: FLOW_LINE, width: 1.5, align: "inside" }],
      size: 13,
      color: FLOW_INK
    })
  ]
};
var FLOW_DOCUMENT = {
  id: "flow-document",
  name: "\u6587\u6863",
  category: "\u6D41\u7A0B",
  w: 140,
  h: 80,
  keys: ["document", "\u6587\u6863", "\u6CE2\u6D6A\u5E95"],
  build: (b, id) => {
    const waveH = Math.max(8, Math.min(14, b.h * 0.2));
    const d = `M0 0 L${b.w} 0 L${b.w} ${b.h - waveH}` + ` Q${b.w * 0.75} ${b.h - waveH * 2.2} ${b.w * 0.5} ${b.h - waveH}` + ` Q${b.w * 0.25} ${b.h - waveH * 0.1} 0 ${b.h - waveH} Z`;
    return [
      { id: id("doc"), type: "vector", name: "\u6587\u6863", ...b, path: d, fills: [{ type: "solid", color: "#ffffff" }], strokes: [{ color: FLOW_LINE, width: 1.5 }] },
      text(id("t"), { x: b.x, y: b.y, w: b.w, h: b.h - waveH }, "\u6587\u6863", { size: 12, color: FLOW_INK })
    ];
  }
};
var FLOW_DATA = {
  id: "flow-data",
  name: "\u6570\u636E",
  category: "\u6D41\u7A0B",
  w: 140,
  h: 64,
  keys: ["data", "io", "\u6570\u636E", "\u8F93\u5165\u8F93\u51FA", "\u5E73\u884C\u56DB\u8FB9\u5F62"],
  build: (b, id) => {
    const skew = Math.max(10, Math.min(20, b.w * 0.16));
    return [
      {
        id: id("io"),
        type: "vector",
        name: "\u6570\u636E",
        ...b,
        path: `M${skew} 0 L${b.w} 0 L${b.w - skew} ${b.h} L0 ${b.h} Z`,
        fills: [{ type: "solid", color: "#ffffff" }],
        strokes: [{ color: FLOW_LINE, width: 1.5 }]
      },
      text(id("t"), { x: b.x + skew / 2, y: b.y, w: b.w - skew, h: b.h }, "\u6570\u636E", { size: 12, color: FLOW_INK })
    ];
  }
};
var FLOW_SUBPROCESS = {
  id: "flow-subprocess",
  name: "\u5B50\u6D41\u7A0B",
  category: "\u6D41\u7A0B",
  w: 140,
  h: 56,
  keys: ["subprocess", "\u5B50\u6D41\u7A0B", "\u9884\u5B9A\u4E49\u6D41\u7A0B"],
  build: (b, id) => {
    const rail = Math.max(1.5, b.w * 0.012);
    const inset = Math.max(6, b.w * 0.06);
    return [
      labelled(id("bg"), b, "\u5B50\u6D41\u7A0B", "\u5B50\u6D41\u7A0B", {
        radius: 6,
        fills: [{ type: "solid", color: "#ffffff" }],
        strokes: [{ color: FLOW_LINE, width: 1.5, align: "inside" }],
        size: 13,
        color: FLOW_INK
      }),
      rect(id("l"), { x: b.x + inset, y: b.y, w: rail, h: b.h }, { name: "\u5DE6\u8FB9\u7EBF", radius: 0, fills: [{ type: "solid", color: FLOW_LINE }], strokes: [] }),
      rect(id("r"), { x: b.x + b.w - inset - rail, y: b.y, w: rail, h: b.h }, { name: "\u53F3\u8FB9\u7EBF", radius: 0, fills: [{ type: "solid", color: FLOW_LINE }], strokes: [] })
    ];
  }
};
function polar(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function sectorPath(cx, cy, r, from, to) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}
var CHART_PIE = {
  id: "chart-pie",
  name: "\u997C\u72B6\u56FE",
  category: "\u56FE\u8868",
  w: 160,
  h: 160,
  keys: ["pie", "\u997C\u56FE", "\u997C\u72B6\u56FE", "\u5360\u6BD4"],
  build: (b, id) => {
    const cx = b.w / 2;
    const cy = b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    const cuts = [0, 140, 250, 360];
    const colors = [ACCENT, "#7a5cff", "#ff9f43", "#e6e6e6"];
    return cuts.slice(0, -1).map((from, i) => ({
      id: id(`s${i}`),
      type: "vector",
      name: `\u6247\u533A${i + 1}`,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      path: sectorPath(cx, cy, r, from, cuts[i + 1]),
      fills: [{ type: "solid", color: colors[i] }],
      strokes: [{ color: "#ffffff", width: 2 }]
    }));
  }
};
var CHART_DONUT = {
  id: "chart-donut",
  name: "\u73AF\u5F62\u56FE",
  category: "\u56FE\u8868",
  w: 160,
  h: 160,
  keys: ["donut", "\u73AF\u5F62\u56FE", "\u5706\u73AF\u56FE", "\u5360\u6BD4"],
  build: (b, id) => {
    const r = Math.min(b.w, b.h) / 2;
    const thick = Math.max(10, r * 0.36);
    return [
      { id: id("ring"), type: "ellipse", name: "\u5E95\u73AF", ...b, fills: [], strokes: [{ color: "#eaf2ff", width: thick, align: "inside" }] },
      { id: id("arc"), type: "ellipse", name: "\u6570\u636E\u73AF", ...b, fills: [], strokes: [{ color: ACCENT, width: thick, align: "inside" }] }
    ];
  }
};
var CHART_PROGRESS_RING = {
  id: "chart-progress-ring",
  name: "\u8FDB\u5EA6\u5706\u73AF",
  category: "\u56FE\u8868",
  w: 120,
  h: 120,
  keys: ["progress", "ring", "\u8FDB\u5EA6\u5706\u73AF", "loading", "\u767E\u5206\u6BD4"],
  build: (b, id) => {
    const r = Math.min(b.w, b.h) / 2;
    const thick = Math.max(8, r * 0.16);
    return [
      { id: id("bg"), type: "ellipse", name: "\u5E95\u73AF", ...b, fills: [], strokes: [{ color: "#eef0f3", width: thick, align: "inside" }] },
      { id: id("fg"), type: "ellipse", name: "\u8FDB\u5EA6", ...b, fills: [], strokes: [{ color: ACCENT, width: thick, align: "inside" }] },
      text(id("t"), b, "68%", { size: Math.max(12, Math.round(r * 0.42)), weight: 600, color: INK })
    ];
  }
};
var CHART_BAR = {
  id: "chart-bar",
  name: "\u67F1\u72B6\u56FE",
  category: "\u56FE\u8868",
  w: 200,
  h: 140,
  keys: ["bar", "column", "\u67F1\u72B6\u56FE", "\u6761\u5F62\u56FE"],
  build: (b, id) => {
    const series = [0.45, 0.75, 0.35, 0.9, 0.6];
    const gap = b.w * 0.04;
    const barW = (b.w - gap * (series.length - 1)) / series.length;
    const out = [
      { id: id("axis"), type: "line", name: "\u57FA\u7EBF", x: b.x, y: b.y + b.h, w: b.w, h: 0.5, dir: 1, strokes: [{ color: LINE, width: 1 }] }
    ];
    series.forEach((v, i) => {
      const h = Math.max(2, b.h * v);
      out.push(rect(id(`b${i}`), { x: b.x + i * (barW + gap), y: b.y + b.h - h, w: barW, h }, {
        name: `\u67F1${i + 1}`,
        radius: 3,
        fills: [{ type: "solid", color: i === 3 ? ACCENT : "#b9dcff" }]
      }));
    });
    return out;
  }
};
var CHART_AREA = {
  id: "chart-area",
  name: "\u9762\u79EF\u56FE",
  category: "\u56FE\u8868",
  w: 200,
  h: 140,
  keys: ["area", "line", "\u9762\u79EF\u56FE", "\u6298\u7EBF\u56FE", "\u8D8B\u52BF"],
  build: (b, id) => {
    const vals = [0.3, 0.55, 0.4, 0.8, 1];
    const step = b.w / (vals.length - 1);
    const yOf = (v) => b.h - b.h * v;
    let line = `M0 ${yOf(vals[0])}`;
    for (let i = 1;i < vals.length; i++)
      line += ` L${step * i} ${yOf(vals[i])}`;
    return [
      { id: id("area"), type: "vector", name: "\u9762\u79EF", ...b, path: `${line} L${b.w} ${b.h} L0 ${b.h}Z`, fills: [{ type: "solid", color: "#e3f0ff" }], strokes: [] },
      { id: id("ln"), type: "vector", name: "\u6298\u7EBF", ...b, path: line, fills: [], strokes: [{ color: ACCENT, width: 2 }] }
    ];
  }
};
var CHART_RADAR = {
  id: "chart-radar",
  name: "\u96F7\u8FBE\u56FE",
  category: "\u56FE\u8868",
  w: 160,
  h: 160,
  keys: ["radar", "spider", "\u96F7\u8FBE\u56FE", "\u7EFC\u5408\u8BC4\u4EF7"],
  build: (b, id) => {
    const cx = b.w / 2;
    const cy = b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    const n = 5;
    const out = [];
    for (let ring = 3;ring >= 1; ring--) {
      const rad = r * ring / 3;
      let d = "";
      for (let i = 0;i < n; i++) {
        const [x, y] = polar(cx, cy, rad, 360 / n * i);
        d += `${i === 0 ? "M" : "L"}${x} ${y}`;
      }
      out.push({
        id: id(`g${ring}`),
        type: "vector",
        name: `\u7F51\u683C${ring}`,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        path: `${d}Z`,
        fills: [],
        strokes: [{ color: ring === 1 ? LINE : "#e9e9ec", width: 1 }]
      });
    }
    const shape = [1, 0.72, 0.9, 0.55, 0.8];
    let d = "";
    for (let i = 0;i < n; i++) {
      const [x, y] = polar(cx, cy, r * shape[i], 360 / n * i);
      d += `${i === 0 ? "M" : "L"}${x} ${y}`;
    }
    out.push({
      id: id("data"),
      type: "vector",
      name: "\u6570\u636E",
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      path: `${d}Z`,
      fills: [{ type: "solid", color: "#0d99ff33" }],
      strokes: [{ color: ACCENT, width: 2 }]
    });
    return out;
  }
};
var STATUS_BAR = {
  id: "status-bar",
  name: "\u72B6\u6001\u680F",
  category: "\u754C\u9762",
  w: 390,
  h: 44,
  keys: ["status", "\u72B6\u6001\u680F", "\u4FE1\u53F7", "\u7535\u91CF", "ios"],
  build: (b, id) => {
    const pad = Math.round(b.w * 0.06);
    const dot = Math.min(b.h * 0.34, 16);
    return [
      rect(id("bg"), b, { name: "\u72B6\u6001\u680F", radius: 0, fills: [{ type: "solid", color: "#ffffff" }], strokes: [] }),
      text(id("time"), { x: b.x + pad, y: b.y, w: 60, h: b.h }, "9:41", { align: "left", size: Math.round(dot * 1.1), weight: 600, color: INK }),
      icon(id("sig"), { x: b.x + b.w - pad - dot * 3.2, y: b.y + (b.h - dot) / 2, w: dot, h: dot }, "\u4FE1\u53F7", "signal", INK, 2.4),
      icon(id("wifi"), { x: b.x + b.w - pad - dot * 2.1, y: b.y + (b.h - dot) / 2, w: dot, h: dot }, "\u65E0\u7EBF", "wifi", INK, 2.4),
      rect(id("bat"), { x: b.x + b.w - pad - dot, y: b.y + (b.h - dot * 0.62) / 2, w: dot, h: dot * 0.62 }, {
        name: "\u7535\u91CF",
        radius: 2,
        fills: [{ type: "solid", color: INK }],
        strokes: []
      })
    ];
  }
};
var NAV_BAR = {
  id: "nav-bar",
  name: "\u5BFC\u822A\u680F",
  category: "\u754C\u9762",
  w: 390,
  h: 48,
  keys: ["nav", "navbar", "\u5BFC\u822A\u680F", "\u6807\u9898\u680F", "\u9876\u680F", "appbar"],
  build: (b, id) => {
    const a = Math.min(b.h * 0.34, 20);
    return [
      rect(id("bg"), b, { name: "\u5BFC\u822A\u680F", radius: 0, fills: [{ type: "solid", color: "#ffffff" }], strokes: [] }),
      labelled(id("t"), b, "\u6807\u9898", "\u6807\u9898", { fills: [], size: 16, weight: 600, color: INK }),
      { id: id("back"), type: "arrow", name: "\u8FD4\u56DE", x: b.x + b.w * 0.035, y: b.y + (b.h - a) / 2, w: a, h: a, dir: 2, strokes: [{ color: INK, width: 2 }] }
    ];
  }
};
var TAB_BAR = {
  id: "tab-bar",
  name: "\u5E95\u90E8\u6807\u7B7E\u680F",
  category: "\u754C\u9762",
  w: 390,
  h: 64,
  keys: ["tab", "tabbar", "\u6807\u7B7E\u680F", "\u5E95\u90E8\u5BFC\u822A", "bottomnav"],
  build: (b, id) => {
    const items = [
      { glyph: "home", name: "\u9996\u9875" },
      { glyph: "search", name: "\u53D1\u73B0" },
      { glyph: "heart", name: "\u6536\u85CF" },
      { glyph: "user", name: "\u6211\u7684" }
    ];
    const colW = b.w / items.length;
    const s = Math.min(b.h * 0.3, 24);
    const out = [
      rect(id("bg"), b, { name: "\u6807\u7B7E\u680F", radius: 0, fills: [{ type: "solid", color: "#ffffff" }], strokes: [] }),
      { id: id("ln"), type: "line", name: "\u4E0A\u8FB9\u7EBF", x: b.x, y: b.y, w: b.w, h: 0.5, dir: 0, strokes: [{ color: LINE, width: 1 }] }
    ];
    items.forEach((it, i) => {
      const cx = b.x + colW * (i + 0.5);
      const active = i === 0;
      const color = active ? ACCENT : MUTED;
      out.push(icon(id(`i${i}`), { x: cx - s / 2, y: b.y + b.h * 0.18, w: s, h: s }, it.name, it.glyph, color, 2));
      out.push(text(id(`t${i}`), { x: cx - colW / 2, y: b.y + b.h * 0.6, w: colW, h: b.h * 0.24 }, it.name, { size: 10, color }));
    });
    return out;
  }
};
var SEARCH_BAR = {
  id: "search-bar",
  name: "\u641C\u7D22\u6846",
  category: "\u754C\u9762",
  w: 240,
  h: 36,
  keys: ["search", "\u641C\u7D22\u6846", "\u641C\u7D22\u680F", "searchbar"],
  build: (b, id) => {
    const s = Math.min(b.h * 0.42, 18);
    return [
      rect(id("bg"), b, { name: "\u641C\u7D22\u6846", radius: Math.min(b.h / 2, 18), fills: [{ type: "solid", color: SOFT }], strokes: [] }),
      icon(id("ic"), { x: b.x + b.h * 0.3, y: b.y + (b.h - s) / 2, w: s, h: s }, "\u641C\u7D22", "search", MUTED, 2),
      text(id("t"), { x: b.x + b.h * 0.3 + s + 6, y: b.y, w: b.w - b.h - s, h: b.h }, "\u641C\u7D22", { align: "left", size: 13, color: MUTED })
    ];
  }
};
var LIST_ITEM = {
  id: "list-item",
  name: "\u5217\u8868\u9879",
  category: "\u754C\u9762",
  w: 390,
  h: 56,
  keys: ["listitem", "cell", "\u5217\u8868\u9879", "\u8BBE\u7F6E\u9879", "\u884C"],
  build: (b, id) => {
    const s = Math.min(b.h * 0.34, 20);
    const pad = Math.min(16, b.w * 0.05);
    return [
      rect(id("bg"), b, { name: "\u5217\u8868\u9879", radius: 0, fills: [{ type: "solid", color: "#ffffff" }], strokes: [] }),
      text(id("t"), { x: b.x + pad, y: b.y, w: b.w - pad * 2 - s - 8, h: b.h }, "\u5217\u8868\u9879\u6807\u9898", { align: "left", size: 15, color: INK }),
      icon(id("c"), { x: b.x + b.w - pad - s, y: b.y + (b.h - s) / 2, w: s, h: s }, "\u7BAD\u5934", "chevron-right", MUTED, 2),
      { id: id("ln"), type: "line", name: "\u4E0B\u8FB9\u7EBF", x: b.x + pad, y: b.y + b.h - 0.5, w: b.w - pad, h: 0.5, dir: 0, strokes: [{ color: "#efeff1", width: 1 }] }
    ];
  }
};
var CARD = {
  id: "card",
  name: "\u5361\u7247",
  category: "\u754C\u9762",
  w: 320,
  h: 104,
  keys: ["card", "\u5361\u7247", "\u5185\u5BB9\u5361", "thumbnail"],
  build: (b, id) => {
    const pad = Math.round(Math.min(b.w, b.h) * 0.09);
    const thumb = Math.min(b.h - pad * 2, b.w * 0.28);
    const textW = Math.max(20, b.w - thumb - pad * 3);
    return [
      rect(id("bg"), b, {
        name: "\u5361\u7247",
        radius: 14,
        fills: [{ type: "solid", color: "#ffffff" }],
        strokes: [],
        effects: [{ type: "drop-shadow", color: "#00000014", x: 0, y: 2, blur: 10 }]
      }),
      rect(id("thumb"), { x: b.x + b.w - pad - thumb, y: b.y + (b.h - thumb) / 2, w: thumb, h: thumb }, {
        name: "\u7F29\u7565\u56FE",
        radius: Math.min(10, thumb / 3),
        fills: [{ type: "linear", angle: 135, stops: [{ at: 0, color: "#ff9f43" }, { at: 1, color: "#ff5c8a" }] }],
        strokes: []
      }),
      text(id("t"), { x: b.x + pad, y: b.y + b.h * 0.24, w: textW, h: b.h * 0.26 }, "\u5361\u7247\u6807\u9898", { align: "left", size: 15, weight: 600, color: INK }),
      text(id("s"), { x: b.x + pad, y: b.y + b.h * 0.54, w: textW, h: b.h * 0.26 }, "\u4E00\u53E5\u8BDD\u8BF4\u660E\u6587\u5B57", { align: "left", size: 12, color: MUTED })
    ];
  }
};
var STENCILS = [
  BUTTON,
  BUTTON_OUTLINE,
  TAG,
  PLACEHOLDER,
  LINK_AREA,
  TABLE,
  SCROLL_PANEL,
  DIVIDER,
  CAPSULE,
  POLYGON,
  BUBBLE,
  WAVE,
  FLOW,
  FLOW_DECISION,
  FLOW_TERMINAL,
  FLOW_DOCUMENT,
  FLOW_DATA,
  FLOW_SUBPROCESS,
  CHART_PIE,
  CHART_DONUT,
  CHART_PROGRESS_RING,
  CHART_BAR,
  CHART_AREA,
  CHART_RADAR,
  STATUS_BAR,
  NAV_BAR,
  TAB_BAR,
  SEARCH_BAR,
  LIST_ITEM,
  CARD
];
var STENCIL_CATEGORIES = ["\u57FA\u7840", "\u5F62\u72B6", "\u6D41\u7A0B", "\u56FE\u8868", "\u754C\u9762"];
var findStencil = (id) => STENCILS.find((s) => s.id === id);
function searchStencils(query, limit = 60) {
  const q = query.trim().toLowerCase();
  if (!q)
    return STENCILS.slice(0, limit);
  const scored = [];
  for (const s of STENCILS) {
    let score = 0;
    if (s.id === q)
      score = 100;
    else if (s.name.toLowerCase() === q)
      score = 90;
    else if (s.id.startsWith(q))
      score = 70;
    else if (s.name.toLowerCase().startsWith(q))
      score = 60;
    else if (s.keys.some((k) => k.toLowerCase() === q))
      score = 50;
    else if (s.name.toLowerCase().includes(q))
      score = 30;
    else if (s.keys.some((k) => k.toLowerCase().includes(q)))
      score = 20;
    else if (s.category.includes(q))
      score = 10;
    if (score > 0)
      scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name));
  return scored.slice(0, limit).map((x) => x.s);
}
function buildStencilSpecs(stencil, box, idFn) {
  const w = Math.max(4, Math.round(box.w || stencil.w));
  const h = Math.max(1, Math.round(box.h || stencil.h));
  const k = Math.min(w / stencil.w, h / stencil.h);
  const specs = scaleSpecs(stencil.build({ x: 0, y: 0, w: stencil.w, h: stencil.h }, idFn), k);
  const ox = Math.round((box.x + (w - stencil.w * k) / 2) * 10) / 10;
  const oy = Math.round((box.y + (h - stencil.h * k) / 2) * 10) / 10;
  if (ox === 0 && oy === 0)
    return specs;
  return specs.map((s) => ({
    ...s,
    x: Math.round(((typeof s.x === "number" ? s.x : 0) + ox) * 10) / 10,
    y: Math.round(((typeof s.y === "number" ? s.y : 0) + oy) * 10) / 10
  }));
}
function scaleSpecs(specs, k) {
  if (k === 1)
    return specs;
  const r1 = (v) => Math.round(v * 10) / 10;
  return specs.map((s) => {
    const out = { ...s };
    for (const key of ["x", "y", "w", "h"]) {
      const v = out[key];
      if (typeof v === "number")
        out[key] = r1(v * k);
    }
    if (typeof out.radius === "number")
      out.radius = r1(out.radius);
    else if (Array.isArray(out.radius))
      out.radius = out.radius.map(r1);
    if (Array.isArray(out.strokes)) {
      out.strokes = out.strokes.map((st) => typeof st.width === "number" ? { ...st, width: Math.max(0.5, r1(st.width * k)) } : st);
    }
    if (Array.isArray(out.effects)) {
      out.effects = out.effects.map((fx) => {
        const o = { ...fx };
        for (const key of ["x", "y", "blur"])
          if (typeof o[key] === "number")
            o[key] = r1(o[key] * k);
        return o;
      });
    }
    if (typeof out.size === "number")
      out.size = Math.max(6, Math.round(out.size * k));
    if (typeof out.strokeWidth === "number")
      out.strokeWidth = Math.max(0.5, r1(out.strokeWidth * k));
    if (out.text && typeof out.text === "object" && !Array.isArray(out.text)) {
      const lt = out.text;
      if (Array.isArray(lt.runs)) {
        out.text = { ...lt, runs: lt.runs.map((r) => typeof r.size === "number" ? { ...r, size: Math.max(6, Math.round(r.size * k)) } : r) };
      }
    }
    if (Array.isArray(out.children))
      out.children = scaleSpecs(out.children, k);
    return out;
  });
}

// mcp/tools.ts
var DOC_SUFFIX2 = ".uidesign.json";
var MAX_LIST = 60;
var MAX_LIST_DEPTH = 2;
var str2 = (v) => typeof v === "string" ? v : undefined;
function pickStr2(o, ...keys) {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim())
      return v;
  }
  return;
}
var num2 = (v) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
var SUPPORTS_STROKES = new Set([
  ...SHAPE_TYPES,
  "line",
  "arrow",
  "frame",
  "image",
  "vector"
]);
function pickAny(o, ...keys) {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null)
      return v;
  }
  return;
}
function resolveDocPath(raw, ctx) {
  const p = str2(raw)?.trim();
  if (!p)
    throw new Error("path \u4E0D\u80FD\u4E3A\u7A7A");
  const abs = path3.isAbsolute(p) ? p : path3.resolve(ctx.workspace, p);
  if (!abs.toLowerCase().endsWith(DOC_SUFFIX2)) {
    throw new Error(`path \u5FC5\u987B\u4EE5 ${DOC_SUFFIX2} \u7ED3\u5C3E\uFF08UI \u8BBE\u8BA1\u6863\u7684\u6269\u5C55\u540D\u7EA6\u5B9A\uFF09\uFF1A${p}`);
  }
  return abs;
}
function relPath(abs, ctx) {
  const rel = path3.relative(ctx.workspace, abs);
  return (rel && !rel.startsWith("..") ? rel : abs).split(path3.sep).join("/");
}
function loadDoc(abs) {
  let text;
  try {
    text = readFileSync3(abs, "utf8");
  } catch {
    throw new Error(`\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8BFB\uFF1A${abs}\uFF08\u7528 list_docs \u627E\u6863\uFF0C\u6216 create_doc \u5EFA\u6863\uFF09`);
  }
  const res = parseDesignDoc(text);
  if (res.fatal) {
    throw new Error(`\u6587\u6863\u4E0D\u662F\u5408\u6CD5\u8BBE\u8BA1\u6863 JSON\uFF08${abs}\uFF09\uFF1A${res.warnings.join("\uFF1B")}\u3002\u5148 read \u6587\u4EF6\u4FEE\u590D\uFF0C\u6216\u6362 path`);
  }
  return { doc: res.doc, warnings: res.warnings };
}
function saveDoc(abs, doc) {
  normalizeGroups(doc);
  const out = serializeDoc(doc);
  const tmp = `${abs}.tmp-mcp`;
  writeFileSync2(tmp, out, "utf8");
  renameSync(tmp, abs);
}
function pickPage(doc, page) {
  const key = str2(page)?.trim();
  if (key) {
    const hit = doc.pages.find((p) => p.id === key || p.name === key);
    if (!hit)
      throw new Error(`\u9875\u9762\u4E0D\u5B58\u5728\uFF1A"${key}"\uFF08\u53EF\u7528 id \u6216\u540D\u79F0\uFF1B\u5148 read_doc \u770B\u9875\u9762\u5217\u8868\uFF09`);
    return hit;
  }
  return doc.pages.find((p) => p.id === doc.activePage) ?? doc.pages[0];
}
function findOrThrow(doc, id) {
  const loc = findNode(doc, id);
  if (!loc)
    throw new Error(`\u8282\u70B9\u4E0D\u5B58\u5728\uFF1A${id}\uFF08\u5148 read_doc \u62FF\u6700\u65B0 id\uFF09`);
  return loc;
}
var NODE_TYPES = [
  "frame",
  "group",
  "rect",
  "ellipse",
  "triangle",
  "diamond",
  "pentagon",
  "hexagon",
  "star",
  "line",
  "arrow",
  "text",
  "image",
  "icon",
  "vector",
  "instance"
];
var DEFAULT_BOX = {
  rect: { w: 120, h: 80 },
  ellipse: { w: 120, h: 80 },
  triangle: { w: 100, h: 88 },
  diamond: { w: 100, h: 100 },
  pentagon: { w: 100, h: 96 },
  hexagon: { w: 100, h: 88 },
  star: { w: 100, h: 96 },
  text: { w: 240, h: 24 },
  line: { w: 160, h: 2 },
  arrow: { w: 160, h: 2 },
  image: { w: 240, h: 160 },
  icon: { w: 24, h: 24 },
  vector: { w: 100, h: 100 },
  frame: { w: 390, h: 844 },
  group: { w: 100, h: 100 }
};
function parseRadiusInput(v) {
  if (typeof v === "number" && Number.isFinite(v))
    return v;
  if (Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number")) {
    return [v[0], v[1], v[2], v[3]];
  }
  throw new Error("radius \u9700\u4E3A\u6570\u5B57\u6216 [\u5DE6\u4E0A,\u53F3\u4E0A,\u53F3\u4E0B,\u5DE6\u4E0B] \u56DB\u5143\u6570\u7EC4");
}
function fillColor(v) {
  const s = str2(v);
  return s && s.trim() ? s.trim() : undefined;
}
function parseLayoutInput(v) {
  if (!v || typeof v !== "object")
    throw new Error('layout \u9700\u4E3A\u5BF9\u8C61\uFF0C\u5982 { "mode": "h", "gap": 12, "padding": 16, "main": "between", "cross": "center" }');
  const o = v;
  const modeRaw = str2(o.mode ?? o.direction)?.trim().toLowerCase();
  const mode = modeRaw === "h" || modeRaw === "horizontal" || modeRaw === "row" ? "h" : modeRaw === "v" || modeRaw === "vertical" || modeRaw === "column" ? "v" : null;
  if (!mode)
    throw new Error('layout.mode \u9700\u4E3A "h"\uFF08\u6A2A\u5411\uFF09\u6216 "v"\uFF08\u7EB5\u5411\uFF09');
  const lo = { mode };
  const gap = num2(o.gap ?? o.itemSpacing ?? o.spacing);
  if (gap !== undefined) {
    if (gap < 0 || gap > 2000)
      throw new Error("layout.gap \u9700\u5728 0..2000");
    lo.gap = gap;
  }
  const p = o.padding;
  if (p !== undefined) {
    if (typeof p === "number") {
      if (p < 0 || p > 1000)
        throw new Error("layout.padding \u9700\u5728 0..1000");
      lo.padding = [p, p, p, p];
    } else if (Array.isArray(p) && p.length === 4 && p.every((x) => typeof x === "number")) {
      const q = p;
      if (q.some((x) => x < 0 || x > 1000))
        throw new Error("layout.padding \u5404\u8FB9\u9700\u5728 0..1000");
      lo.padding = [q[0], q[1], q[2], q[3]];
    } else {
      throw new Error("layout.padding \u9700\u4E3A\u6570\u5B57\uFF08\u56DB\u8FB9\u7EDF\u4E00\uFF09\u6216 [\u4E0A,\u53F3,\u4E0B,\u5DE6]");
    }
  }
  const mainMap = {
    start: "start",
    min: "start",
    "flex-start": "start",
    center: "center",
    middle: "center",
    end: "end",
    max: "end",
    "flex-end": "end",
    between: "between",
    "space-between": "between"
  };
  const main = mainMap[str2(o.main ?? o.primaryAxisAlignItems ?? o.justifyContent)?.trim().toLowerCase() ?? ""];
  if (main !== undefined)
    lo.main = main;
  const crossMap = {
    start: "start",
    min: "start",
    "flex-start": "start",
    center: "center",
    middle: "center",
    end: "end",
    max: "end",
    "flex-end": "end",
    stretch: "stretch",
    fill: "stretch"
  };
  const cross = crossMap[str2(o.cross ?? o.counterAxisAlignItems ?? o.alignItems)?.trim().toLowerCase() ?? ""];
  if (cross !== undefined)
    lo.cross = cross;
  if (o.wrap === true)
    lo.wrap = true;
  else if (o.wrap === false || o.wrap === "false")
    delete lo.wrap;
  const hugMap = {
    main: "main",
    cross: "cross",
    both: "both",
    all: "both",
    none: undefined,
    fixed: undefined,
    "": undefined
  };
  const hug = hugMap[str2(o.hug ?? o.sizing)?.trim().toLowerCase() ?? ""];
  if (hug !== undefined)
    lo.hug = hug;
  else if (o.hug === null)
    delete lo.hug;
  return lo;
}
var LAYOUT_SENSITIVE = ["layout", "grow", "w", "h", "visible", "name"];
function parseOnTapInput(v) {
  if (v === null || v === false)
    return null;
  const to = str2(v?.to);
  if (!to || !to.trim())
    throw new Error('onTap \u9700\u4E3A { "to": "\u9876\u5C42\u753B\u677Fid" }\uFF08\u6216 null \u6E05\u9664\uFF09');
  return { to: to.trim().slice(0, 120) };
}
function parseInteractionsInput(v) {
  if (!Array.isArray(v)) {
    throw new Error('interactions \u9700\u4E3A\u6570\u7EC4\uFF0C\u5982 [{ "trigger": "tap", "action": "navigate", "to": "\u753B\u677Fid" }]\uFF08null \u6E05\u9664\uFF09');
  }
  return v.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error(`interactions[${i}] \u9700\u4E3A\u5BF9\u8C61`);
    const o = raw;
    const trigger = normalizeTrigger(o.trigger);
    if (!trigger) {
      throw new Error(`interactions[${i}].trigger \u65E0\u6CD5\u8BC6\u522B\uFF1A"${String(o.trigger)}"\uFF08\u53EF\u7528\uFF1A${INTERACTION_TRIGGERS.join(" / ")}\uFF09`);
    }
    const action = normalizeAction(o.action);
    if (!action) {
      throw new Error(`interactions[${i}].action \u65E0\u6CD5\u8BC6\u522B\uFF1A"${String(o.action)}"\uFF08\u53EF\u7528\uFF1A${INTERACTION_ACTIONS.join(" / ")}\uFF09`);
    }
    const it = { trigger, action };
    const to = str2(o.to);
    if (to && to.trim())
      it.to = to.trim().slice(0, 120);
    if (o.position !== undefined && o.position !== null && o.position !== "") {
      const pos = normalizeOverlayPosition(o.position);
      if (!pos)
        throw new Error(`interactions[${i}].position \u65E0\u6CD5\u8BC6\u522B\uFF1A"${String(o.position)}"\uFF08\u53EF\u7528\uFF1A${OVERLAY_POSITIONS.join(" / ")}\uFF09`);
      it.position = pos;
    }
    if (o.transition !== undefined && o.transition !== null && o.transition !== "") {
      const tr = normalizeTransition(o.transition);
      if (!tr)
        throw new Error(`interactions[${i}].transition \u65E0\u6CD5\u8BC6\u522B\uFF1A"${String(o.transition)}"\uFF08\u53EF\u7528\uFF1A${PROTOTYPE_TRANSITIONS.join(" / ")}\uFF09`);
      it.transition = tr;
    }
    const dur = num2(o.duration);
    if (dur !== undefined && dur > 0)
      it.duration = Math.min(2000, Math.max(40, Math.round(dur)));
    if (o.dismissOnTapOutside === false)
      it.dismissOnTapOutside = false;
    return it;
  });
}
function parseScrollInput(v) {
  if (v === false || v === null || v === undefined || v === "" || v === "none" || v === "off")
    return null;
  const axis = normalizeScrollAxis(v);
  if (!axis)
    throw new Error(`scroll \u65E0\u6CD5\u8BC6\u522B\uFF1A"${String(v)}"\uFF08\u53EF\u7528\uFF1Av / h / both\uFF0C\u6216 false \u5173\u95ED\uFF09`);
  return axis;
}
function firstSolidColor(fills) {
  if (!Array.isArray(fills))
    return;
  for (const f of fills) {
    if (f && typeof f === "object") {
      const o = f;
      if (o.type === "solid" && typeof o.color === "string")
        return o.color;
    }
  }
  return;
}
function asFills(v, label) {
  if (!Array.isArray(v))
    throw new Error(`${label} \u9700\u4E3A\u6570\u7EC4`);
  return v.map((f, i) => {
    if (!f || typeof f !== "object")
      throw new Error(`${label}[${i}] \u9700\u4E3A\u5BF9\u8C61`);
    const o = f;
    if (o.type === "image") {
      const src = [o.src, o.image, o.url].find((x) => typeof x === "string" && x.trim());
      if (typeof src !== "string")
        throw new Error(`${label}[${i}].src \u9700\u4E3A\u56FE\u7247\u8DEF\u5F84\uFF08workspace \u76F8\u5BF9\uFF09`);
      return { ...o, src };
    }
    if (o.type !== "solid" && o.type !== "linear" && o.type !== "radial") {
      throw new Error(`${label}[${i}].type \u9700\u4E3A solid|linear|radial|image`);
    }
    return o;
  });
}
function asStrokes(v, label) {
  if (Array.isArray(v))
    return v;
  const o = v;
  if (o && typeof o === "object") {
    const color = fillColor(o.color) ?? "#111111";
    const width = num2(o.width) ?? 1;
    return [{ ...o, color, width }];
  }
  const color = fillColor(v);
  if (color)
    return [{ color, width: 1 }];
  throw new Error(`${label} \u9700\u4E3A\u989C\u8272\u5B57\u7B26\u4E32\u3001\u63CF\u8FB9\u5BF9\u8C61\u6216\u6570\u7EC4`);
}
function asRuns(spec) {
  if (Array.isArray(spec.runs)) {
    return spec.runs.map((r, i) => {
      if (!r || typeof r !== "object" || typeof r.text !== "string") {
        throw new Error(`runs[${i}] \u9700\u4E3A { text, size?, color?, weight? } \u5BF9\u8C61`);
      }
      return r;
    });
  }
  if (typeof spec.text === "string") {
    const run = { text: spec.text };
    const size = num2(spec.size);
    if (size !== undefined)
      run.size = size;
    const color = fillColor(spec.color);
    if (color !== undefined)
      run.color = color;
    const weight = num2(spec.weight);
    if (weight !== undefined)
      run.weight = weight;
    return [run];
  }
  return [{ text: "\u6587\u672C", size: 16, color: "#111111" }];
}
function mergeRunStyle(node, spec) {
  const color = fillColor(spec.color) ?? fillColor(spec.tint);
  const size = num2(spec.size);
  const weight = num2(spec.weight);
  const italic = typeof spec.italic === "boolean" ? spec.italic : undefined;
  const underline = typeof spec.underline === "boolean" ? spec.underline : undefined;
  if (color === undefined && size === undefined && weight === undefined && italic === undefined && underline === undefined)
    return;
  const runs = node.runs?.length ? node.runs : [{ text: "\u6587\u672C" }];
  node.runs = runs.map((r) => ({
    ...r,
    ...color !== undefined ? { color } : {},
    ...size !== undefined ? { size } : {},
    ...weight !== undefined ? { weight } : {},
    ...italic !== undefined ? { italic } : {},
    ...underline !== undefined ? { underline } : {}
  }));
}
function applyCommon(node, spec) {
  if (spec.radius !== undefined)
    node.radius = parseRadiusInput(spec.radius);
  const rotation = num2(spec.rotation);
  if (rotation !== undefined)
    node.rotation = rotation;
  const opacity = num2(spec.opacity);
  if (opacity !== undefined)
    node.opacity = Math.min(1, Math.max(0, opacity));
  if (typeof spec.visible === "boolean")
    node.visible = spec.visible;
  if (typeof spec.locked === "boolean")
    node.locked = spec.locked;
  if (Array.isArray(spec.effects))
    node.effects = spec.effects;
  if (spec.onTap !== undefined) {
    const t = parseOnTapInput(spec.onTap);
    if (t)
      node.onTap = t;
    else
      delete node.onTap;
  }
}
function buildNode(spec, opts) {
  const type = str2(spec.type)?.trim();
  if (!type || !NODE_TYPES.includes(type)) {
    throw new Error(`type \u5FC5\u987B\u662F ${NODE_TYPES.join(" / ")} \u4E4B\u4E00\uFF0C\u6536\u5230 "${String(spec.type)}"`);
  }
  if (type === "group")
    throw new Error("group \u4E0D\u80FD\u76F4\u63A5\u6784\u9020\uFF1A\u7528 group_nodes \u628A\u73B0\u6709\u8282\u70B9\u6210\u7EC4");
  const id = str2(spec.id)?.trim() || (opts?.id ?? undefined);
  const name = str2(spec.name);
  const bare = !name && !id && type !== "text";
  const x = num2(spec.x) ?? 0;
  const y = num2(spec.y) ?? 0;
  let node;
  if (type === "frame") {
    const presetKey = str2(spec.preset)?.trim();
    const preset = presetKey ? DEVICE_PRESETS[presetKey] : undefined;
    if (presetKey && !preset) {
      throw new Error(`\u672A\u77E5\u8BBE\u5907\u9884\u8BBE "${presetKey}"\uFF08\u53EF\u7528\uFF1A${Object.keys(DEVICE_PRESETS).join(" / ")}\uFF09`);
    }
    node = newFrame({
      name: name ?? preset?.label,
      w: num2(spec.w) ?? preset?.w ?? 390,
      h: num2(spec.h) ?? preset?.h ?? 844,
      x,
      y,
      preset: presetKey,
      background: fillColor(spec.fill) ?? firstSolidColor(spec.fills)
    });
  } else {
    node = newNode(type, { x, y, w: num2(spec.w) ?? DEFAULT_BOX[type]?.w ?? 120, h: num2(spec.h) ?? DEFAULT_BOX[type]?.h ?? 80 }, name);
  }
  if (id)
    node.id = id;
  if (node.type === "vector") {
    const d = pickStr2(spec, "path", "d");
    if (!d)
      throw new Error('vector \u9700\u8981 path \u5B57\u6BB5\uFF08SVG d \u5B57\u7B26\u4E32\uFF0C\u5982 "M0 0L100 0L50 100Z"\uFF09');
    node.path = d.slice(0, 40000);
    if (num2(spec.w) === undefined || num2(spec.h) === undefined) {
      const xs = [];
      const ys = [];
      for (const m of d.matchAll(/(-?\d+(?:\.\d+)?)[, ](-?\d+(?:\.\d+)?)/g)) {
        xs.push(Number(m[1]));
        ys.push(Number(m[2]));
      }
      if (xs.length) {
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        node.w = Math.max(1, Math.round(Math.max(...xs) - x0));
        node.h = Math.max(1, Math.round(Math.max(...ys) - y0));
      }
    }
  }
  if (node.type === "icon") {
    const ic = node;
    const wanted = str2(spec.icon) ?? str2(spec.iconName) ?? str2(spec.glyph) ?? (resolveIconName(name ?? "") ? name : undefined) ?? "";
    const resolved = resolveIconName(wanted);
    ic.icon = resolved ?? wanted ?? DEFAULT_ICON;
    if (!name)
      node.name = resolved ?? "\u56FE\u6807";
    const color = fillColor(spec.color) ?? fillColor(spec.tint);
    if (color)
      ic.color = color;
    const sw = num2(spec.strokeWidth);
    if (sw !== undefined)
      ic.strokeWidth = Math.min(12, Math.max(0.25, sw));
  }
  if (node.type === "instance") {
    const inst = node;
    const ref = pickStr2(spec, "componentId", "component", "componentRef", "mainComponent");
    if (!ref)
      throw new Error("instance \u8282\u70B9\u9700\u8981 componentId \u5B57\u6BB5\uFF08\u7528 list_components \u67E5\u672C\u6863\u7EC4\u4EF6\uFF1B\u6CA1\u6709\u5C31\u5148\u7528 create_component\uFF09");
    inst.componentId = ref.trim();
    if (spec.overrides && typeof spec.overrides === "object" && !Array.isArray(spec.overrides)) {
      inst.overrides = spec.overrides;
    }
  }
  applyCommon(node, spec);
  return node;
}
function applyTypeFields(node, spec) {
  if (spec.interactions !== undefined) {
    if (spec.interactions === null || Array.isArray(spec.interactions) && spec.interactions.length === 0) {
      delete node.interactions;
      delete node.onTap;
    } else {
      node.interactions = parseInteractionsInput(spec.interactions);
      delete node.onTap;
    }
  }
  const gr = num2(spec.grow);
  if (gr !== undefined) {
    if (gr > 0)
      node.grow = Math.min(100, Math.max(0, gr));
    else
      delete node.grow;
  }
  if (typeof spec.mask === "boolean") {
    if (spec.mask)
      node.mask = true;
    else
      delete node.mask;
  }
  if (spec.blendMode !== undefined) {
    const b = normalizeBlendMode(spec.blendMode);
    if (spec.blendMode !== null && b === undefined && spec.blendMode !== "normal" && spec.blendMode !== "") {
      throw new Error(`blendMode \u65E0\u6CD5\u8BC6\u522B\uFF1A"${String(spec.blendMode).slice(0, 40)}"\uFF08\u53EF\u7528 multiply/screen/overlay/darken/lighten/color-dodge/color-burn/hard-light/soft-light/difference/exclusion/hue/saturation/color/luminosity\uFF09`);
    }
    if (b)
      node.blendMode = b;
    else
      delete node.blendMode;
  }
  if (typeof spec.flipX === "boolean") {
    if (spec.flipX)
      node.flipX = true;
    else
      delete node.flipX;
  }
  if (typeof spec.flipY === "boolean") {
    if (spec.flipY)
      node.flipY = true;
    else
      delete node.flipY;
  }
  if (spec.fill !== undefined || spec.fills !== undefined) {
    if (!("fills" in node))
      throw new Error(`${node.type} \u4E0D\u652F\u6301 fill/fills\uFF08\u8282\u70B9 ${node.id}\uFF09`);
    node.fills = spec.fills !== undefined ? asFills(spec.fills, "fills") : [solid(fillColor(spec.fill) ?? "#d9d9d9")];
  }
  if (spec.stroke !== undefined || spec.strokes !== undefined) {
    if (!SUPPORTS_STROKES.has(node.type))
      throw new Error(`${node.type} \u4E0D\u652F\u6301 stroke/strokes\uFF08\u8282\u70B9 ${node.id}\uFF09`);
    node.strokes = spec.strokes !== undefined ? asStrokes(spec.strokes, "strokes") : asStrokes(spec.stroke, "stroke");
  }
  if (node.type !== "text" && SHAPE_TYPES.includes(node.type)) {
    const raw = pickAny(spec, "text", "label", "layerText");
    if (raw !== undefined) {
      const lt = parseLayerText(raw);
      const shape = node;
      if (lt)
        shape.text = lt;
      else
        delete shape.text;
    }
  }
  if (node.type === "text") {
    if (typeof spec.text === "string" || Array.isArray(spec.runs))
      node.runs = asRuns(spec);
    else
      mergeRunStyle(node, spec);
    const align = str2(spec.align);
    if (align) {
      if (align !== "left" && align !== "center" && align !== "right")
        throw new Error("align \u9700\u4E3A left|center|right");
      node.align = align;
    }
    const vAlign = str2(spec.vAlign);
    if (vAlign) {
      if (vAlign !== "top" && vAlign !== "middle" && vAlign !== "bottom")
        throw new Error("vAlign \u9700\u4E3A top|middle|bottom");
      node.vAlign = vAlign;
    }
    const lineHeight = num2(spec.lineHeight);
    if (lineHeight !== undefined)
      node.lineHeight = lineHeight;
    const letterSpacing = num2(spec.letterSpacing);
    if (letterSpacing !== undefined)
      node.letterSpacing = letterSpacing;
  }
  if (node.type === "line" || node.type === "arrow") {
    const dir = num2(spec.dir);
    if (dir !== undefined) {
      if (dir < 0 || dir > 3)
        throw new Error("dir \u9700\u4E3A 0..3\uFF080=\u2198 1=\u2197 2=\u2196 3=\u2199\uFF09");
      node.dir = Math.round(dir);
    }
  }
  if (node.type === "image") {
    const src = str2(spec.src);
    if (src !== undefined)
      node.src = src;
    const fit = str2(spec.fit);
    if (fit) {
      if (fit !== "cover" && fit !== "contain" && fit !== "stretch")
        throw new Error("fit \u9700\u4E3A cover|contain|stretch");
      node.fit = fit;
    }
  }
  if (node.type === "icon") {
    const ic = node;
    const wanted = str2(spec.icon) ?? str2(spec.iconName) ?? str2(spec.glyph);
    if (wanted !== undefined) {
      const resolved = resolveIconName(wanted);
      ic.icon = resolved ?? wanted;
      if (!resolved)
        throw new Error(`\u672A\u77E5\u56FE\u6807\u540D "${wanted}"\uFF1A\u5148\u7528 list_icons \u641C\u53EF\u7528\u540D\u5B57\uFF08\u6A21\u7CCA\u5339\u914D\u4E5F\u884C\uFF09`);
    }
    const color = fillColor(spec.color) ?? fillColor(spec.tint);
    if (color)
      ic.color = color;
    const sw = num2(spec.strokeWidth);
    if (sw !== undefined)
      ic.strokeWidth = Math.min(12, Math.max(0.25, sw));
  }
  if (node.type === "vector") {
    const d = pickStr2(spec, "path", "d");
    if (d !== undefined)
      node.path = d.slice(0, 40000);
  }
  if (node.type === "frame") {
    if (Array.isArray(spec.children)) {
      node.children = spec.children.slice(0, 400).map((child, i) => {
        if (!child || typeof child !== "object")
          throw new Error(`children[${i}] \u9700\u4E3A\u8282\u70B9\u89C4\u683C\u5BF9\u8C61`);
        const built = buildNode(child);
        applyTypeFields(built, child);
        return built;
      });
    }
    if (spec.clip !== undefined && typeof spec.clip === "boolean")
      node.clip = spec.clip;
    if (spec.scroll !== undefined) {
      const axis = parseScrollInput(spec.scroll);
      if (axis)
        node.scroll = axis;
      else
        delete node.scroll;
    }
    if (spec.layout !== undefined) {
      if (spec.layout === null) {
        delete node.layout;
      } else {
        node.layout = parseLayoutInput(spec.layout);
      }
    }
  }
}
function autoPlace(doc, parent, page, node) {
  if (parent && "children" in parent && parent.children.length > 0) {
    const kids = parent.children;
    const bottom = Math.max(...kids.map((k) => k.y + k.h));
    const left = Math.min(...kids.map((k) => k.x));
    return { x: round1(left), y: round1(bottom + 16) };
  }
  if (parent)
    return { x: 0, y: 0 };
  const list = page.nodes;
  if (list.length === 0)
    return { x: 0, y: 0 };
  const right = Math.max(...list.map((n) => n.x + n.w));
  const top = Math.min(...list.map((n) => n.y));
  return { x: round1(right + 80), y: round1(top) };
}
function insertNode(doc, parent, page, node, explicitPos) {
  if (!explicitPos) {
    const pos = autoPlace(doc, parent, page, node);
    node.x = pos.x;
    node.y = pos.y;
  }
  if (parent && "children" in parent)
    parent.children.push(node);
  else
    page.nodes.push(node);
}
function firstFillLabel(fills) {
  const f = fills.find((x) => x.visible !== false);
  if (!f)
    return "(hidden)";
  if (f.type === "image")
    return `image(${(f.src ?? "").slice(0, 40)})`;
  if (f.type === "solid")
    return f.color ?? "#000000";
  const stops = (f.stops ?? []).map((s) => s.color).join("\u2192");
  return `${f.type}(${stops})`;
}
function nodeSummary(n, depth, doc) {
  const out = {
    id: n.id,
    type: n.type,
    name: n.name,
    x: round1(n.x),
    y: round1(n.y),
    w: round1(n.w),
    h: round1(n.h)
  };
  if (n.rotation)
    out.rotation = n.rotation;
  if (n.opacity !== undefined && n.opacity !== 1)
    out.opacity = n.opacity;
  if (n.visible === false)
    out.visible = false;
  if (n.locked === true)
    out.locked = true;
  if (n.mask)
    out.mask = true;
  if (n.radius !== undefined)
    out.radius = n.radius;
  if (n.onTap)
    out.onTap = n.onTap;
  if (hasInteraction(n)) {
    const list = nodeInteractions(n);
    out.interactions = list;
    if (doc) {
      const frame = topLevelFrameOf(doc, n.id);
      const bad = list.map((it, i) => ({ i, check: checkInteractionTarget(doc, frame, it) })).filter((x) => !x.check.ok).map((x) => ({ index: x.i, action: list[x.i].action, to: list[x.i].to, reason: x.check.reason }));
      if (bad.length)
        out.interactionProblems = bad;
    }
  }
  if ("fills" in n && n.fills.length > 0)
    out.fill = firstFillLabel(n.fills);
  if ("strokes" in n && n.strokes && n.strokes.length > 0 && n.strokes[0]) {
    out.stroke = `${n.strokes[0].color}/${n.strokes[0].width}`;
  }
  if (n.type === "text") {
    const text = n.runs.map((r) => r.text).join("");
    out.text = text.length > 80 ? `${text.slice(0, 80)}\u2026` : text;
    out.fontSize = n.runs[0]?.size ?? 16;
  }
  if (n.type !== "text") {
    const lt = layerText(n);
    if (lt)
      out.label = lt.runs.map((r) => r.text).join("").slice(0, 80);
  }
  if (n.type === "line" || n.type === "arrow")
    out.dir = n.dir ?? 0;
  if (n.type === "image")
    out.src = n.src;
  if (n.grow)
    out.grow = n.grow;
  if (n.blendMode)
    out.blendMode = n.blendMode;
  if (n.flipX)
    out.flipX = true;
  if (n.flipY)
    out.flipY = true;
  if (n.type === "frame" && n.layout)
    out.layout = n.layout;
  if (n.type === "frame" && n.scroll)
    out.scroll = n.scroll;
  if (n.type === "vector")
    out.d = `${n.path.slice(0, 80)}${n.path.length > 80 ? "\u2026" : ""}`;
  if (n.type === "icon") {
    out.icon = n.icon;
    out.color = n.color ?? "#111111";
    out.strokeWidth = n.strokeWidth ?? 2;
    if (!resolveIconName(n.icon))
      out.invalidIcon = true;
  }
  if (n.type === "instance") {
    const inst = n;
    out.componentId = inst.componentId;
    const comp = doc ? findComponent(doc, inst.componentId) : null;
    if (comp)
      out.component = comp.name;
    else
      out.missingComponent = true;
    const ovKeys = Object.keys(inst.overrides ?? {});
    if (ovKeys.length)
      out.overridden = ovKeys;
    const view = doc ? instanceView(doc, inst) : null;
    if (view) {
      out.childCount = view.length;
      if (depth > 0)
        out.children = view.map((c) => nodeSummary(c, depth - 1, doc));
      return out;
    }
    return out;
  }
  if ("children" in n && n.children.length > 0) {
    out.childCount = n.children.length;
    if (depth > 0)
      out.children = n.children.map((c) => nodeSummary(c, depth - 1, doc));
  }
  return out;
}
function opListDocs(args, ctx) {
  const dirArg = str2(args.dir)?.trim();
  const root = dirArg ? path3.resolve(ctx.workspace, dirArg) : ctx.workspace;
  const docs = [];
  const walk = (dir, depth) => {
    if (depth > MAX_LIST_DEPTH || docs.length >= MAX_LIST)
      return;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (docs.length >= MAX_LIST)
        return;
      if (name === "node_modules" || name.startsWith("."))
        continue;
      const abs = path3.join(dir, name);
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
      if (!name.toLowerCase().endsWith(DOC_SUFFIX2))
        continue;
      const entry = { path: relPath(abs, ctx) };
      try {
        const { doc } = loadDoc(abs);
        const page = pickPage(doc);
        let nodes = 0;
        for (const _ of walkNodes(page.nodes))
          nodes++;
        entry.name = doc.meta.name;
        entry.pages = doc.pages.length;
        entry.frames = page.nodes.filter((n) => n.type === "frame").length;
        entry.nodes = nodes;
      } catch {
        entry.corrupt = true;
      }
      docs.push(entry);
    }
  };
  walk(root, 0);
  return { workspace: ctx.workspace, dir: relPath(root, ctx), docs, truncated: docs.length >= MAX_LIST };
}
function opReadDoc(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc, warnings } = loadDoc(abs);
  if (args.raw === true)
    return { path: relPath(abs, ctx), warnings, doc };
  if (str2(args.nodeId)) {
    const loc = findOrThrow(doc, str2(args.nodeId));
    return { path: relPath(abs, ctx), warnings, node: JSON.parse(JSON.stringify(loc.node)) };
  }
  const page = pickPage(doc, args.page);
  const depth = num2(args.depth) ?? 3;
  return {
    path: relPath(abs, ctx),
    name: doc.meta.name,
    activePage: doc.activePage,
    warnings,
    pages: doc.pages.map((p) => ({ id: p.id, name: p.name, active: p.id === doc.activePage })),
    page: { id: page.id, name: page.name },
    nodes: page.nodes.map((n) => nodeSummary(n, Math.max(0, Math.round(depth)), doc)),
    ...doc.components?.length ? { components: doc.components.map((c) => ({ id: c.id, name: c.name })) } : {}
  };
}
var vStack = (gap, padding) => ({
  mode: "v",
  gap,
  padding: [padding, padding, padding, padding],
  main: "start",
  cross: "stretch"
});
var TEMPLATES = {
  login: {
    kind: "mobile",
    build: (w, h) => [
      { name: "\u54C1\u724C\u533A", x: 0, y: 0, w, h: Math.round(h * 0.42), layout: vStack(12, 24) },
      { name: "\u8868\u5355\u533A", x: 0, y: Math.round(h * 0.42), w, h: Math.round(h * 0.38), layout: vStack(16, 24) },
      { name: "\u5E95\u90E8\u64CD\u4F5C", x: 0, y: Math.round(h * 0.8), w, h: h - Math.round(h * 0.8), layout: vStack(12, 24) }
    ]
  },
  list: {
    kind: "mobile",
    build: (w, h) => [
      { name: "\u9876\u680F", x: 0, y: 0, w, h: 88, layout: { mode: "h", gap: 12, padding: [16, 16, 16, 16], main: "start", cross: "center" } },
      { name: "\u7B5B\u9009\u680F", x: 0, y: 88, w, h: 56, layout: { mode: "h", gap: 8, padding: [8, 16, 8, 16], main: "start", cross: "center" } },
      { name: "\u5217\u8868", x: 0, y: 144, w, h: h - 144 - 84, layout: vStack(0, 0) },
      { name: "\u5E95\u680F", x: 0, y: h - 84, w, h: 84, layout: { mode: "h", gap: 0, padding: [0, 0, 0, 0], main: "between", cross: "center" } }
    ]
  },
  detail: {
    kind: "mobile",
    build: (w, h) => [
      { name: "\u9876\u680F", x: 0, y: 0, w, h: 88, layout: { mode: "h", gap: 12, padding: [16, 16, 16, 16], main: "between", cross: "center" } },
      { name: "\u5934\u56FE", x: 0, y: 88, w, h: Math.round(h * 0.32), layout: vStack(8, 16) },
      { name: "\u6B63\u6587", x: 0, y: 88 + Math.round(h * 0.32), w, h: Math.round(h * 0.4), layout: vStack(12, 20) },
      { name: "\u5E95\u90E8\u64CD\u4F5C", x: 0, y: h - 96, w, h: 96, layout: { mode: "h", gap: 12, padding: [16, 16, 16, 16], main: "end", cross: "center" } }
    ]
  },
  settings: {
    kind: "mobile",
    build: (w, h) => [
      { name: "\u6807\u9898", x: 0, y: 0, w, h: 96, layout: vStack(8, 20) },
      { name: "\u5206\u7EC4\u4E00", x: 0, y: 96, w, h: Math.round(h * 0.26), layout: vStack(0, 0) },
      { name: "\u5206\u7EC4\u4E8C", x: 0, y: 96 + Math.round(h * 0.26), w, h: Math.round(h * 0.3), layout: vStack(0, 0) },
      { name: "\u5206\u7EC4\u4E09", x: 0, y: 96 + Math.round(h * 0.56), w, h: h - 96 - Math.round(h * 0.56), layout: vStack(0, 0) }
    ]
  },
  dashboard: {
    kind: "desktop",
    build: (w, h) => {
      const side = Math.min(240, Math.round(w * 0.18));
      const top = 72;
      const pad = 24;
      const metricH = 120;
      return [
        { name: "\u4FA7\u680F", x: 0, y: 0, w: side, h, layout: vStack(8, 16) },
        { name: "\u9876\u680F", x: side, y: 0, w: w - side, h: top, layout: { mode: "h", gap: 12, padding: [0, pad, 0, pad], main: "between", cross: "center" } },
        { name: "\u6307\u6807\u884C", x: side, y: top, w: w - side, h: metricH, layout: { mode: "h", gap: 16, padding: [pad, pad, pad, pad], main: "start", cross: "stretch" } },
        { name: "\u4E3B\u533A", x: side, y: top + metricH, w: w - side, h: h - top - metricH, layout: vStack(16, pad) }
      ];
    }
  },
  empty: {
    kind: "mobile",
    build: (w, h) => [{ name: "\u7A7A\u72B6\u6001", x: 0, y: Math.round(h * 0.3), w, h: Math.round(h * 0.4), layout: vStack(12, 24) }]
  }
};
var TEMPLATE_KEYS = ["blank", ...Object.keys(TEMPLATES)];
function buildTemplateFrame(key, w, h) {
  const tpl = TEMPLATES[key];
  if (!tpl)
    return null;
  const frame = newFrame({ name: "\u9996\u9875", w, h, x: 0, y: 0 });
  for (const s of tpl.build(w, h)) {
    const sec = newFrame({
      name: s.name,
      w: Math.max(1, s.w),
      h: Math.max(1, s.h),
      x: s.x,
      y: s.y
    });
    if (s.layout)
      sec.layout = s.layout;
    frame.children.push(sec);
  }
  return frame;
}
function opCreateDoc(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const overwrite = args.overwrite === true;
  if (!overwrite) {
    try {
      statSync(abs);
      throw new Error(`\u6587\u4EF6\u5DF2\u5B58\u5728\uFF1A${relPath(abs, ctx)}\uFF08\u8981\u8986\u76D6\u8BF7\u4F20 overwrite: true\uFF0C\u6216\u6362 path\uFF09`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("\u6587\u4EF6\u5DF2\u5B58\u5728"))
        throw err;
    }
  }
  const name = str2(args.name)?.trim() || path3.basename(abs).replace(/\.uidesign\.json$/i, "");
  const doc = blankDoc(name);
  const page = doc.pages[0];
  const pageName = str2(args.pageName)?.trim();
  if (pageName)
    page.name = pageName;
  const frames = Array.isArray(args.frames) ? args.frames : null;
  if (frames && frames.length > 0) {
    let cursorX = 0;
    for (const f of frames) {
      const node = buildNode({ ...f, type: "frame" });
      applyTypeFields(node, f);
      if (num2(f.x) === undefined)
        node.x = cursorX;
      if (num2(f.y) === undefined)
        node.y = 0;
      cursorX = node.x + node.w + Math.max(80, Math.round(node.w * 0.32));
      page.nodes.push(node);
    }
  } else {
    const presetKey = str2(args.preset)?.trim() || "ios-390";
    const preset = DEVICE_PRESETS[presetKey];
    if (!preset)
      throw new Error(`\u672A\u77E5\u8BBE\u5907\u9884\u8BBE "${presetKey}"\uFF08\u53EF\u7528\uFF1A${Object.keys(DEVICE_PRESETS).join(" / ")}\uFF09`);
    const tplKey = str2(args.template)?.trim();
    if (tplKey && tplKey !== "blank") {
      const frame = buildTemplateFrame(tplKey, preset.w, preset.h);
      if (!frame)
        throw new Error(`\u672A\u77E5\u6A21\u677F "${tplKey}"\uFF08\u53EF\u7528\uFF1A${TEMPLATE_KEYS.join(" / ")}\uFF09`);
      page.nodes.push(frame);
    } else {
      page.nodes.push(newFrame({ name: "\u9996\u9875", w: preset.w, h: preset.h, x: 0, y: 0, preset: presetKey }));
    }
  }
  writeFileSync2(abs, serializeDoc(doc), "utf8");
  return {
    path: relPath(abs, ctx),
    pageId: page.id,
    frames: page.nodes.map((n) => ({ id: n.id, name: n.name, x: n.x, y: n.y, w: n.w, h: n.h })),
    hint: '\u9762\u677F\u672A\u6253\u5F00\u65F6\uFF0C\u53EF\u8C03\u7528 open_plugin_panel(plugin="ui-design", panel="design", path=\u2026) \u8BA9\u7528\u6237\u770B\u5230\u5B83'
  };
}
function opAddNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const page = pickPage(doc, args.page);
  const parentId = str2(args.parent)?.trim();
  let parent = null;
  if (parentId) {
    const loc = findOrThrow(doc, parentId);
    if (!("children" in loc.node))
      throw new Error(`parent ${parentId}\uFF08${loc.node.type}\uFF09\u4E0D\u662F\u53EF\u5BB9\u7EB3\u5B50\u8282\u70B9\u7684\u5BB9\u5668`);
    parent = loc.node;
  }
  const listRaw = Array.isArray(args.nodes) ? args.nodes : args.node !== undefined ? [args.node] : null;
  if (!listRaw || listRaw.length === 0)
    throw new Error("nodes \u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u8282\u70B9\u89C4\u683C\uFF08\u6570\u7EC4\uFF09");
  if (listRaw.length > 80)
    throw new Error("\u5355\u6B21\u6700\u591A\u6DFB\u52A0 80 \u4E2A\u8282\u70B9\uFF0C\u5206\u6279\u8C03\u7528");
  const created = [];
  const reflowIds = new Set;
  let reflowed = false;
  for (const spec of listRaw) {
    const node = buildNode(spec);
    if (findNode(doc, node.id))
      throw new Error(`id \u5DF2\u5B58\u5728\uFF1A${node.id}\uFF08\u6362\u4E00\u4E2A\u6216\u5220\u6389 id \u5B57\u6BB5\uFF09`);
    if (node.type === "instance") {
      const comp = findComponent(doc, node.componentId);
      if (!comp)
        throw new Error(`\u7EC4\u4EF6\u4E0D\u5B58\u5728\uFF1A${node.componentId}\uFF08list_components \u67E5\u73B0\u6709\u7EC4\u4EF6\uFF0C\u6216 create_component \u4ECE\u8282\u70B9\u65B0\u5EFA\uFF09`);
      if (num2(spec.w) === undefined && num2(spec.h) === undefined) {
        const b = componentBounds(comp);
        node.w = Math.max(1, b.w);
        node.h = Math.max(1, b.h);
      }
    }
    applyTypeFields(node, spec);
    const explicit = num2(spec.x) !== undefined && num2(spec.y) !== undefined;
    insertNode(doc, parent, page, node, explicit);
    created.push({ id: node.id, type: node.type, name: node.name, x: node.x, y: node.y, w: node.w, h: node.h });
    reflowIds.add(node.id);
  }
  if (args.reflow !== false) {
    for (const c of created) {
      const rid = str2(c.id);
      if (reflowWithin(page.nodes, rid))
        reflowed = true;
    }
  }
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), pageId: page.id, created, reflowed, lint: lintSummary(doc) };
}
function applyUpdateFields(node, patch, idLabel) {
  if (patch.name !== undefined) {
    const v = str2(patch.name);
    if (v === undefined)
      throw new Error(`${idLabel}: name \u9700\u4E3A\u5B57\u7B26\u4E32`);
    node.name = v;
  }
  for (const key of ["x", "y", "w", "h", "rotation", "opacity"]) {
    const v = patch[key];
    if (v === undefined)
      continue;
    const n = num2(v);
    if (n === undefined)
      throw new Error(`${idLabel}: ${key} \u9700\u4E3A\u6570\u5B57`);
    node[key] = key === "opacity" ? Math.min(1, Math.max(0, n)) : n;
  }
  const dx = num2(patch.dx);
  if (dx !== undefined)
    node.x = round1(node.x + dx);
  const dy = num2(patch.dy);
  if (dy !== undefined)
    node.y = round1(node.y + dy);
  if (patch.visible !== undefined) {
    if (typeof patch.visible !== "boolean")
      throw new Error(`${idLabel}: visible \u9700\u4E3A\u5E03\u5C14`);
    node.visible = patch.visible;
  }
  if (patch.locked !== undefined) {
    if (typeof patch.locked !== "boolean")
      throw new Error(`${idLabel}: locked \u9700\u4E3A\u5E03\u5C14`);
    node.locked = patch.locked;
  }
  if (patch.radius !== undefined)
    node.radius = parseRadiusInput(patch.radius);
  if (patch.effects !== undefined)
    node.effects = patch.effects;
  if (patch.onTap !== undefined) {
    const t = parseOnTapInput(patch.onTap);
    if (t)
      node.onTap = t;
    else
      delete node.onTap;
  }
  applyTypeFields(node, patch);
}
function replaceInstanceInPages(doc, instId, next) {
  const walk = (list) => {
    for (let i = 0;i < list.length; i++) {
      if (list[i].id === instId) {
        list[i] = next;
        return true;
      }
      const kids = list[i].children;
      if (kids && walk(kids))
        return true;
    }
    return false;
  };
  for (const p of doc.pages)
    if (walk(p.nodes))
      return true;
  return false;
}
function updateInstanceInternal(doc, id, patch) {
  const s = id.indexOf("/");
  const ownerId = id.slice(0, s);
  const ownerLoc = findOrThrow(doc, ownerId);
  if (ownerLoc.node.type !== "instance")
    throw new Error(`${ownerId} \u4E0D\u662F\u5B9E\u4F8B\uFF0C\u65E0\u6CD5\u5BFB\u5740\u5176\u5185\u90E8\uFF08\u6B63\u786E\u5F62\u6001\uFF1A"\u5B9E\u4F8Bid/\u5185\u90E8id"\uFF09`);
  const viewLoc = findOrThrow(doc, id);
  const target = { ...viewLoc.node };
  applyUpdateFields(target, patch, id);
  const src = viewLoc.node;
  const dst = target;
  const obj = {};
  for (const k of Object.keys(dst)) {
    if (k === "id" || k === "type" || k === "children")
      continue;
    if (dst[k] !== src[k])
      obj[k] = dst[k];
  }
  if (!Object.keys(obj).length)
    return;
  const next = patchInstancePath(doc, ownerLoc.node, id.slice(s + 1).split("/").filter(Boolean), obj);
  if (!next)
    throw new Error(`${id}\uFF1A\u5185\u90E8\u8DEF\u5F84\u89E3\u6790\u5931\u8D25\uFF08id \u662F\u5426\u6765\u81EA\u6700\u65B0 read_doc\uFF1F\u5B57\u6BB5\u662F\u5426\u53EF\u8986\u76D6\uFF1F\uFF09`);
  if (!replaceInstanceInPages(doc, ownerId, next))
    throw new Error(`\u5B9E\u4F8B ${ownerId} \u4E0D\u5728\u9875\u9762\u6811\u4E2D`);
}
function opUpdateNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const updates = Array.isArray(args.updates) ? args.updates : null;
  if (!updates || updates.length === 0)
    throw new Error("updates \u9700\u8981\u81F3\u5C11\u4E00\u9879\uFF1A[{ id, ...\u8981\u6539\u7684\u5B57\u6BB5 }]");
  const applied = [];
  const reflowIds = new Set;
  for (const patch of updates) {
    const id = str2(patch.id)?.trim();
    if (!id)
      throw new Error("updates \u91CC\u6BCF\u4E00\u9879\u90FD\u9700\u8981 id");
    if (id.includes("/")) {
      updateInstanceInternal(doc, id, patch);
      applied.push(id);
      continue;
    }
    const loc = findOrThrow(doc, id);
    applyUpdateFields(loc.node, patch, id);
    applied.push(id);
    if (LAYOUT_SENSITIVE.some((k) => patch[k] !== undefined))
      reflowIds.add(id);
  }
  let reflowed = false;
  if (args.reflow !== false) {
    for (const pg of doc.pages) {
      for (const id of reflowIds) {
        if (reflowWithin(pg.nodes, id))
          reflowed = true;
      }
    }
  }
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), updated: applied, reflowed, lint: lintSummary(doc) };
}
function opDeleteNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const ids = Array.isArray(args.ids) ? args.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0)
    throw new Error("ids \u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u8282\u70B9 id");
  const removed = [];
  const reflowIds = new Set;
  for (const id of ids) {
    if (id.includes("/"))
      throw new Error(`\u5B9E\u4F8B\u5185\u90E8\u8282\u70B9\u4E0D\u80FD\u5220\u9664\uFF08${id}\uFF09\uFF1A\u62D3\u6251\u7531\u4E3B\u6863\u51B3\u5B9A\uFF1B\u8981\u81EA\u7531\u5220\u6539\u8BF7\u5148\u7528 edit_component \u7684 detach`);
    const loc = findNode(doc, id);
    if (!loc)
      throw new Error(`\u8282\u70B9\u4E0D\u5B58\u5728\uFF1A${id}`);
    const parentId = loc.parent?.id ?? null;
    loc.siblings.splice(loc.index, 1);
    removed.push(id);
    if (parentId)
      reflowIds.add(parentId);
  }
  let reflowed = false;
  if (args.reflow !== false) {
    for (const pg of doc.pages) {
      for (const pid of reflowIds) {
        if (reflowWithin(pg.nodes, pid))
          reflowed = true;
      }
    }
  }
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), removed, reflowed };
}
function opGroupNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const ids = Array.isArray(args.ids) ? args.ids.filter((x) => typeof x === "string") : [];
  if (ids.length < 2)
    throw new Error("group \u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u8282\u70B9 id");
  const locs = ids.map((id) => findOrThrow(doc, id));
  const siblings = locs[0].siblings;
  if (!locs.every((l) => l.siblings === siblings)) {
    throw new Error("\u53EA\u80FD\u628A\u540C\u4E00\u5BB9\u5668\uFF08\u540C\u5C42\uFF09\u91CC\u7684\u8282\u70B9\u6210\u7EC4");
  }
  const boxes = locs.map((l) => aabbRotated({ x: l.node.x, y: l.node.y, w: l.node.w, h: l.node.h }, l.node.rotation ?? 0));
  const box = unionBox(boxes);
  if (!box)
    throw new Error("\u65E0\u6CD5\u8BA1\u7B97\u6210\u7EC4\u5305\u56F4\u76D2");
  const insertAt = Math.min(...locs.map((l) => l.index));
  const group = {
    id: uid("g"),
    type: "group",
    name: str2(args.name)?.trim() || "\u7EC4",
    x: round1(box.x),
    y: round1(box.y),
    w: round1(box.w),
    h: round1(box.h),
    children: []
  };
  const ordered = [...locs].sort((a, b) => a.index - b.index);
  for (const l of ordered) {
    siblings.splice(siblings.indexOf(l.node), 1);
    l.node.x = round1(l.node.x - group.x);
    l.node.y = round1(l.node.y - group.y);
    group.children.push(l.node);
  }
  siblings.splice(insertAt, 0, group);
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), groupId: group.id, children: group.children.map((c) => c.id) };
}
function opUngroupNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const ids = Array.isArray(args.ids) ? args.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0)
    throw new Error("ids \u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u7EC4 id");
  const released = [];
  for (const id of ids) {
    const loc = findOrThrow(doc, id);
    if (loc.node.type !== "group")
      throw new Error(`\u4E0D\u662F\u7EC4\u8282\u70B9\uFF1A${id}\uFF08${loc.node.type}\uFF09`);
    const g = loc.node;
    if (g.rotation)
      throw new Error(`\u7EC4 ${id} \u5E26\u65CB\u8F6C\uFF08${g.rotation}\xB0\uFF09\uFF0C\u5148\u628A rotation \u8BBE\u4E3A 0 \u518D\u62C6\u7EC4`);
    const opacity = g.opacity ?? 1;
    const kids = g.children.map((c) => {
      c.x = round1(c.x + g.x);
      c.y = round1(c.y + g.y);
      if (opacity !== 1)
        c.opacity = round1((c.opacity ?? 1) * opacity * 100) / 100;
      return c;
    });
    loc.siblings.splice(loc.index, 1, ...kids);
    released.push(...kids.map((k) => k.id));
  }
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), children: released };
}
var ALIGN_MODES = ["left", "hcenter", "right", "top", "vcenter", "bottom", "hdist", "vdist"];
function opAlignNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const ids = Array.isArray(args.ids) ? args.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0)
    throw new Error("ids \u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u8282\u70B9 id");
  const mode = str2(args.mode)?.trim();
  if (!mode || !ALIGN_MODES.includes(mode)) {
    throw new Error(`mode \u9700\u4E3A ${ALIGN_MODES.join(" / ")}`);
  }
  let ref = null;
  const refArg = str2(args.ref)?.trim();
  if (refArg && refArg !== "selection") {
    const loc = findOrThrow(doc, refArg);
    ref = worldBoxOf(doc, loc.node.id);
    if (!ref)
      throw new Error(`\u53C2\u7167\u8282\u70B9\u65E0\u6CD5\u8BA1\u7B97\u5305\u56F4\u76D2\uFF1A${refArg}`);
  }
  const moved = applyAlign(doc, ids, mode, ref);
  const unchanged = ids.filter((id) => !moved.includes(id));
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), moved, unchanged };
}
function opStackNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const ids = Array.isArray(args.ids) ? args.ids.filter((x) => typeof x === "string") : [];
  if (ids.length < 2)
    throw new Error("stack \u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u8282\u70B9 id");
  const direction = str2(args.direction)?.trim();
  if (direction !== "row" && direction !== "column")
    throw new Error("direction \u9700\u4E3A row\uFF08\u6A2A\u6392\uFF09| column\uFF08\u7AD6\u6392\uFF09");
  const gap = num2(args.gap) ?? 16;
  const cross = str2(args.cross)?.trim() ?? "start";
  if (cross !== "start" && cross !== "center" && cross !== "end") {
    throw new Error("cross \u9700\u4E3A start|center|end\uFF08\u4EA4\u53C9\u8F74\u5BF9\u9F50\uFF09");
  }
  const entries = ids.map((id) => {
    const loc = findOrThrow(doc, id);
    const wb = worldBoxOf(doc, id);
    if (!wb)
      throw new Error(`\u8282\u70B9\u65E0\u6CD5\u8BA1\u7B97\u5305\u56F4\u76D2\uFF1A${id}`);
    return { loc, wb, dx: 0, dy: 0 };
  });
  if (direction === "row")
    entries.sort((a, b) => a.wb.x - b.wb.x);
  else
    entries.sort((a, b) => a.wb.y - b.wb.y);
  const crossMinX = Math.min(...entries.map((e) => e.wb.x));
  const crossMaxX = Math.max(...entries.map((e) => e.wb.x + e.wb.w));
  const crossMinY = Math.min(...entries.map((e) => e.wb.y));
  const crossMaxY = Math.max(...entries.map((e) => e.wb.y + e.wb.h));
  let cursorX = entries[0].wb.x;
  let cursorY = entries[0].wb.y;
  for (const e of entries) {
    if (direction === "row") {
      e.dx = cursorX - e.wb.x;
      cursorX += e.wb.w + gap;
      if (cross === "start")
        e.dy = crossMinY - e.wb.y;
      else if (cross === "center")
        e.dy = (crossMinY + crossMaxY) / 2 - (e.wb.y + e.wb.h / 2);
      else
        e.dy = crossMaxY - (e.wb.y + e.wb.h);
    } else {
      e.dy = cursorY - e.wb.y;
      cursorY += e.wb.h + gap;
      if (cross === "start")
        e.dx = crossMinX - e.wb.x;
      else if (cross === "center")
        e.dx = (crossMinX + crossMaxX) / 2 - (e.wb.x + e.wb.w / 2);
      else
        e.dx = crossMaxX - (e.wb.x + e.wb.w);
    }
  }
  for (const e of entries) {
    e.loc.node.x = round1(e.loc.node.x + e.dx);
    e.loc.node.y = round1(e.loc.node.y + e.dy);
  }
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), order: entries.map((e) => e.loc.node.id) };
}
var REORDER_MODES = ["front", "back", "forward", "backward"];
function opReorderNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const ids = Array.isArray(args.ids) ? args.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0)
    throw new Error("ids \u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u8282\u70B9 id");
  const mode = str2(args.mode)?.trim();
  if (!mode || !REORDER_MODES.includes(mode))
    throw new Error(`mode \u9700\u4E3A ${REORDER_MODES.join(" / ")}`);
  for (const id of ids) {
    const loc = findOrThrow(doc, id);
    const { siblings, index } = loc;
    const [node] = siblings.splice(index, 1);
    if (!node)
      continue;
    const target = mode === "front" ? siblings.length : mode === "back" ? 0 : mode === "forward" ? Math.min(siblings.length, index + 1) : Math.max(0, index - 1);
    siblings.splice(target, 0, node);
  }
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), reordered: ids, mode };
}
function opEditPages(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const action = str2(args.action)?.trim();
  if (action === "add") {
    const name = str2(args.name)?.trim() || `\u9875\u9762 ${doc.pages.length + 1}`;
    const page = { id: uid("p"), name, nodes: [] };
    doc.pages.push(page);
    saveDoc(abs, doc);
    return { path: relPath(abs, ctx), added: { id: page.id, name: page.name } };
  }
  if (action === "rename" || action === "activate" || action === "remove") {
    const page = pickPage(doc, args.pageId ?? args.page);
    if (action === "rename") {
      const name = str2(args.name)?.trim();
      if (!name)
        throw new Error("rename \u9700\u8981 name");
      page.name = name;
    } else if (action === "activate") {
      doc.activePage = page.id;
    } else {
      if (doc.pages.length <= 1)
        throw new Error("\u6700\u540E\u4E00\u9875\u4E0D\u80FD\u5220\u9664");
      doc.pages = doc.pages.filter((p) => p.id !== page.id);
      if (doc.activePage === page.id)
        doc.activePage = doc.pages[0].id;
    }
    saveDoc(abs, doc);
    return { path: relPath(abs, ctx), pageId: page.id, pages: doc.pages.map((p) => ({ id: p.id, name: p.name, active: p.id === doc.activePage })) };
  }
  throw new Error("action \u9700\u4E3A add|rename|remove|activate");
}
var NODE_SPEC_SCHEMA = {
  type: "object",
  description: "\u8282\u70B9\u89C4\u683C\u3002type \u5FC5\u586B\uFF1Bx/y/w/h \u7701\u7565\u65F6\u81EA\u52A8\u843D\u4F4D/\u53D6\u9ED8\u8BA4\u5C3A\u5BF8\uFF08\u753B\u677F 390\xD7844\u3001\u77E9\u5F62 120\xD780\u3001\u6587\u672C 240\xD724\u2026\uFF09\u3002" + "\u98CE\u683C\u4E24\u5F0F\u7686\u53EF\uFF1Ashorthand\uFF08fill:'#0d99ff'\u3001stroke:{color,width}\u3001text:'\u6309\u94AE' + size/color/weight\uFF09\u6216\u539F\u6837\u6570\u7EC4\uFF08fills/strokes/runs\uFF09\u3002",
  properties: {
    type: { type: "string", enum: NODE_TYPES.filter((t) => t !== "group") },
    id: { type: "string", description: "\u53EF\u9009\uFF1A\u663E\u5F0F\u6307\u5B9A id\uFF08\u5168\u5C40\u552F\u4E00\uFF09" },
    name: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
    rotation: { type: "number", description: "\u5EA6\uFF0C\u7ED5\u76D2\u4E2D\u5FC3" },
    opacity: { type: "number", description: "0..1" },
    visible: { type: "boolean" },
    locked: { type: "boolean" },
    radius: { description: "\u6570\u5B57\u6216 [\u5DE6\u4E0A,\u53F3\u4E0A,\u53F3\u4E0B,\u5DE6\u4E0B]" },
    onTap: { description: '\u65E7\u5F0F\u5355\u51FB\u8DF3\u8F6C\uFF1A{ "to": "\u9876\u5C42\u753B\u677Fid" }\uFF08\u7B49\u4EF7\u4E8E interactions \u91CC\u4E00\u6761 tap\u2192navigate\uFF09\uFF1B\u65B0\u7A3F\u8BF7\u7528 interactions' },
    interactions: {
      type: "array",
      description: "\u539F\u578B\u4EA4\u4E92\u8868\uFF08\u6574\u8868\u66FF\u6362\uFF1Bnull/[] \u6E05\u9664\uFF09\u3002\u6BCF\u6761 { trigger, action, to?, position?, transition?, duration?, dismissOnTapOutside? }\u3002" + `trigger: ${INTERACTION_TRIGGERS.join("/")}\uFF1Baction: ${INTERACTION_ACTIONS.join("/")}\uFF1B` + `transition: ${PROTOTYPE_TRANSITIONS.join("/")}\uFF08\u7F3A\u7701\u6309 \u52A8\u4F5C+\u505C\u9760\u4F4D \u81EA\u52A8\u9009\uFF09\uFF1Bposition: ${OVERLAY_POSITIONS.join("/")}\u3002` + "navigate/overlay \u7684 to = \u9876\u5C42\u753B\u677F id\uFF1BscrollTo/toggleVisible \u7684 to = \u540C\u753B\u677F\u5185\u8282\u70B9 id\u3002\u589E\u5220\u5355\u6761\u7528 edit_interactions\u3002",
      items: {
        type: "object",
        properties: {
          trigger: { type: "string", enum: [...INTERACTION_TRIGGERS] },
          action: { type: "string", enum: [...INTERACTION_ACTIONS] },
          to: { type: "string" },
          position: { type: "string", enum: [...OVERLAY_POSITIONS] },
          transition: { type: "string", enum: [...PROTOTYPE_TRANSITIONS] },
          duration: { type: "number" },
          dismissOnTapOutside: { type: "boolean" }
        },
        required: ["trigger", "action"]
      }
    },
    fill: { type: "string", description: "\u7EAF\u8272\u7B80\u5199\uFF1A#rgb/#rrggbb/#rrggbbaa" },
    fills: { type: "array", description: "Fill[]\uFF08solid/linear/radial\uFF0C\u89C1 SKILL.md\uFF09" },
    stroke: { description: "\u63CF\u8FB9\u7B80\u5199\uFF1A\u989C\u8272\u5B57\u7B26\u4E32\u6216 { color, width, align, style }" },
    strokes: { type: "array" },
    effects: { type: "array", description: "Effect[]\uFF08drop-shadow/inner-shadow/layer-blur\uFF09" },
    text: { type: "string", description: "text \u8282\u70B9\u7B80\u5199\uFF1A\u5355 run \u6587\u672C" },
    runs: { type: "array", description: "text \u8282\u70B9\uFF1ATextRun[] \u6DF7\u6392" },
    size: { type: "number", description: "text \u7B80\u5199\u5B57\u53F7\uFF08\u914D text \u7528\uFF09" },
    color: { type: "string", description: "text \u7B80\u5199\u989C\u8272\uFF08\u914D text \u7528\uFF09" },
    weight: { type: "number", description: "text \u7B80\u5199\u5B57\u91CD\uFF08\u914D text \u7528\uFF09" },
    align: { type: "string", enum: ["left", "center", "right"] },
    vAlign: { type: "string", enum: ["top", "middle", "bottom"] },
    lineHeight: { type: "number" },
    letterSpacing: { type: "number" },
    dir: { type: "number", enum: [0, 1, 2, 3], description: "line/arrow \u8D70\u5411\uFF1A0=\u2198 1=\u2197 2=\u2196 3=\u2199" },
    src: { type: "string", description: "image\uFF1Aworkspace \u76F8\u5BF9\u8DEF\u5F84" },
    fit: { type: "string", enum: ["cover", "contain", "stretch"] },
    preset: { type: "string", description: "frame\uFF1A\u8BBE\u5907\u9884\u8BBE\u952E\uFF08ios-390 / android-360 / desktop-1440\u2026\uFF09" },
    clip: { type: "boolean", description: "frame\uFF1A\u662F\u5426\u88C1\u5207\u8D85\u6846\u5185\u5BB9\uFF08\u7F3A\u7701 true\uFF09" },
    scroll: {
      type: "string",
      enum: [...SCROLL_AXES],
      description: "frame\uFF1A\u6EDA\u52A8\u533A\u57DF\uFF08v \u7EB5\u5411/h \u6A2A\u5411/both \u53CC\u5411\uFF1Bfalse \u5173\u95ED\uFF09\u3002\u5185\u5BB9\u8D85\u6846\u65F6\u5728\u539F\u578B\u9884\u89C8\u4E0E HTML \u5BFC\u51FA\u91CC\u53EF\u6EDA\u52A8\uFF0C" + "\u753B\u5E03\u4E0E\u9759\u6001\u5BFC\u51FA\u4ECD\u6309\u9876\u90E8\u4E00\u5C4F\u5448\u73B0\u3002\u957F\u9875\u9762\uFF08\u5185\u5BB9\u9AD8\u4E8E\u753B\u677F\uFF09\u5FC5\u987B\u5F00\u5B83\uFF0C\u5426\u5219 lint \u4F1A\u62A5 overflow-clipped\u3002"
    },
    componentId: { type: "string", description: "instance\uFF1A\u4E3B\u6863\u7EC4\u4EF6 id\uFF08list_components \u53EF\u67E5\uFF09\uFF1Bw/h \u7701\u7565\u65F6\u53D6\u4E3B\u6863\u5305\u56F4\u76D2" },
    overrides: { description: 'instance\uFF1A\u5185\u90E8\u8282\u70B9\u8986\u76D6\u8868 { "\u5185\u90E8id": { \u5B57\u6BB5: \u503C } }\uFF08\u5982 { "t1": { "text": "\u63D0\u4EA4" } }\uFF09' }
  },
  required: ["type"]
};
function targetTopLevelIds(page, raw) {
  const wanted = Array.isArray(raw) ? raw.map(str2).filter((s) => !!s) : [];
  return wanted.length > 0 ? wanted : page.nodes.filter((n) => n.visible !== false).map((n) => n.id);
}
function countUnknownIcons(nodes) {
  let n = 0;
  const walk = (list) => {
    for (const nd of list) {
      if (nd.type === "icon" && !resolveIconName(nd.icon))
        n++;
      if (nd.type === "frame" || nd.type === "group")
        walk(nd.children);
    }
  };
  walk(nodes);
  return n;
}
function opBooleanNodes(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const page = pickPage(doc, args.page);
  const ids = Array.isArray(args.ids) ? args.ids.map(str2).filter((x) => !!x) : [];
  if (ids.length < 2)
    throw new Error("\u5E03\u5C14\u8FD0\u7B97\u9700\u8981\u81F3\u5C11 2 \u4E2A\u8282\u70B9 id\uFF08\u540C\u5BB9\u5668\u540C\u5C42\uFF09");
  const op = normalizeBoolOp(args.operation ?? args.op ?? "union");
  if (!op)
    throw new Error(`operation \u9700\u4E3A union/subtract/intersect/exclude\uFF08\u6536\u5230 "${String(args.operation)}"\uFF09`);
  const locs = ids.map((id) => findOrThrow(doc, id));
  if (locs.some((l) => l.siblings !== locs[0].siblings)) {
    throw new Error("\u53EA\u80FD\u5BF9\u540C\u4E00\u5BB9\u5668\uFF08\u540C\u5C42\uFF09\u91CC\u7684\u5F62\u72B6\u505A\u5E03\u5C14\u8FD0\u7B97");
  }
  for (const l of locs) {
    if (!isBoolShape(l.node)) {
      throw new Error(`\u8282\u70B9 ${l.node.id}\uFF08${l.node.type}\uFF09\u4E0D\u652F\u6301\u5E03\u5C14\u8FD0\u7B97\uFF1A\u652F\u6301 rect/ellipse/triangle/diamond/pentagon/hexagon/star/vector`);
    }
  }
  const first = locs[0].node;
  const { d, bbox } = booleanPath(op, locs.map((l) => l.node));
  if (!d)
    throw new Error("\u5E03\u5C14\u7ED3\u679C\u4E3A\u7A7A\uFF08\u5F62\u72B6\u88AB\u5B8C\u5168\u51CF\u6CA1/\u65E0\u4EA4\u96C6\uFF09\uFF0C\u672A\u521B\u5EFA\u8282\u70B9");
  const vector = {
    id: uid("v"),
    type: "vector",
    name: str2(args.name)?.trim() || { union: "\u5E76\u96C6", subtract: "\u51CF\u53BB", intersect: "\u4EA4\u96C6", exclude: "\u6392\u9664" }[op],
    x: bbox.x,
    y: bbox.y,
    w: bbox.w,
    h: bbox.h,
    path: d,
    fills: JSON.parse(JSON.stringify(first.fills ?? [{ type: "solid", color: "#d9d9d9" }])),
    strokes: JSON.parse(JSON.stringify(first.strokes ?? []))
  };
  const insertAt = Math.min(...locs.map((l) => l.index));
  for (const l of locs)
    l.siblings.splice(l.siblings.indexOf(l.node), 1);
  locs[0].siblings.splice(insertAt, 0, vector);
  saveDoc(abs, doc);
  return { path: relPath(abs, ctx), operation: op, id: vector.id, x: vector.x, y: vector.y, w: vector.w, h: vector.h, replaced: ids };
}
function opApplyLayout(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const page = pickPage(doc, args.page);
  const targetId = str2(args.id)?.trim();
  const reflowedFrames = [];
  let changed = false;
  const targets = targetId ? [targetId] : page.nodes.flatMap((n) => n.type === "frame" && n.layout ? [n.id] : []);
  if (targetId) {
    const loc = findOrThrow(doc, targetId);
    if (loc.node.type !== "frame")
      throw new Error(`id ${targetId}\uFF08${loc.node.type}\uFF09\u4E0D\u662F\u753B\u677F\uFF08frame\uFF09`);
  }
  for (const tid of targets) {
    if (reflowWithin(page.nodes, tid))
      changed = true;
    const f = page.nodes.find((n) => n.id === tid);
    if (f)
      reflowedFrames.push(tid);
  }
  if (changed)
    saveDoc(abs, doc);
  return { path: relPath(abs, ctx), reflowed: reflowedFrames, changed };
}
function opLintDoc(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const ids = Array.isArray(args.ids) ? args.ids.filter((x) => typeof x === "string") : undefined;
  const codeList = Array.isArray(args.codes) ? args.codes.filter((x) => typeof x === "string") : Array.isArray(args.code) ? args.code.filter((x) => typeof x === "string") : undefined;
  for (const c of codeList ?? []) {
    if (!LINT_CODES.includes(c))
      throw new Error(`\u672A\u77E5\u89C4\u5219 "${c}"\uFF08\u53EF\u7528\uFF1A${LINT_CODES.join(" / ")}\uFF09`);
  }
  const sevRaw = str2(args.severity)?.trim().toLowerCase();
  if (sevRaw && !LINT_SEVERITIES.includes(sevRaw)) {
    throw new Error(`severity \u9700\u4E3A ${LINT_SEVERITIES.join(" / ")} \u4E4B\u4E00\uFF0C\u6536\u5230 "${sevRaw}"`);
  }
  const report = lintDoc(doc, {
    page: str2(args.page)?.trim(),
    ids,
    minSeverity: sevRaw,
    codes: codeList
  });
  return {
    path: relPath(abs, ctx),
    scanned: report.scanned,
    counts: report.counts,
    summary: report.issues.length === 0 ? "\u672A\u53D1\u73B0\u95EE\u9898" : `${report.counts.error} \u9519 / ${report.counts.warning} \u8B66\u544A / ${report.counts.info} \u63D0\u793A`,
    issues: report.issues
  };
}
async function opRunDesignScript(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const script = str2(args.script);
  if (!script)
    throw new Error("script \u5FC5\u586B\uFF1A\u4E00\u6BB5 JS \u6E90\u7801");
  const pageArg = str2(args.page)?.trim();
  const { ops, logs, result } = await runDesignScript(script, num2(args.timeoutMs));
  const { doc } = loadDoc(abs);
  const page = pickPage(doc, pageArg);
  const inserted = [];
  const updated = [];
  const reflowIds = new Set;
  for (const op of ops) {
    if (op.kind === "insert") {
      const parentNode = findOrThrow(doc, op.parent).node;
      if (!("children" in parentNode)) {
        throw new Error(`I \u7684 parent ${op.parent}\uFF08${parentNode.type}\uFF09\u4E0D\u662F\u53EF\u5BB9\u7EB3\u5B50\u8282\u70B9\u7684\u5BB9\u5668`);
      }
      const node = buildNode(op.spec);
      if (findNode(doc, node.id))
        throw new Error(`id \u5DF2\u5B58\u5728\uFF1A${node.id}\uFF08\u811A\u672C\u91CC\u6362\u4E00\u4E2A\uFF0C\u6216\u5220\u6389 id \u8BA9\u6C99\u7BB1\u81EA\u52A8\u5206\u914D\uFF09`);
      applyTypeFields(node, op.spec);
      const explicit = num2(op.spec.x) !== undefined && num2(op.spec.y) !== undefined;
      insertNode(doc, parentNode, page, node, explicit);
      inserted.push({ id: node.id, type: node.type, name: node.name, x: node.x, y: node.y, w: node.w, h: node.h });
      reflowIds.add(node.id);
    } else {
      if (op.id.includes("/")) {
        updateInstanceInternal(doc, op.id, op.patch);
        updated.push(op.id);
        continue;
      }
      const loc = findOrThrow(doc, op.id);
      applyUpdateFields(loc.node, op.patch, op.id);
      updated.push(op.id);
      for (const k of LAYOUT_SENSITIVE)
        if (op.patch[k] !== undefined)
          reflowIds.add(op.id);
    }
  }
  let reflowed = false;
  if (args.reflow !== false) {
    for (const rid of reflowIds) {
      if (reflowWithin(page.nodes, rid))
        reflowed = true;
    }
  }
  saveDoc(abs, doc);
  return {
    path: relPath(abs, ctx),
    pageId: page.id,
    inserted,
    updated,
    reflowed,
    logs,
    result,
    lint: lintSummary(doc)
  };
}
function opListIcons(args) {
  const q = str2(args.query)?.trim() ?? "";
  const limit = Math.min(Math.max(num2(args.limit) ?? 40, 1), 100);
  const icons = searchIcons(q, limit);
  return { query: q, count: icons.length, icons };
}
function bgOf(raw, def) {
  const t = str2(raw)?.trim().toLowerCase();
  if (!t)
    return def;
  if (t === "transparent" || t === "none")
    return null;
  return t;
}
function parseFormats(raw) {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : undefined;
  if (!arr)
    return;
  const set = new Set;
  for (const v of arr) {
    const s = str2(v)?.trim().toLowerCase();
    if (s === "png" || s === "svg" || s === "html" || s === "source" || s === "code")
      set.add(s);
  }
  return set.size ? [...set] : undefined;
}
async function opScreenshotDoc(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const page = pickPage(doc, args.page);
  const ids = targetTopLevelIds(page, args.ids);
  const maxDim = Math.min(Math.max(num2(args.maxDim) ?? 1600, 320), 4096);
  const scale = Math.min(Math.max(num2(args.scale) ?? 2, 0.5), 4);
  const r = await renderDocPng(ctx.workspace, doc, ids, {
    maxDim,
    scale,
    background: bgOf(args.background, "#ffffff")
  });
  if (!r)
    throw new Error(`\u9875\u9762\u300C${page.name}\u300D\u6CA1\u6709\u53EF\u89C1\u7684\u9876\u5C42\u8282\u70B9\u53EF\u622A\u56FE\uFF08hidden \u8282\u70B9\u4F1A\u88AB\u8DF3\u8FC7\uFF09`);
  const parts = [
    `\u753B\u5E03\u622A\u56FE\uFF1A\u9875\u9762\u300C${page.name}\u300D${ids.length} \u4E2A\u9876\u5C42\u8282\u70B9\uFF0C\u8BBE\u8BA1\u76D2 ${r.boxW}\xD7${r.boxH}\uFF0C` + `\u8F93\u51FA PNG ${r.width}\xD7${r.height}\uFF08${Math.max(1, Math.round(r.png.byteLength / 1024))}KB\uFF09`
  ];
  if (r.missingImages > 0)
    parts.push(`${r.missingImages} \u5F20\u4F4D\u56FE\u8D44\u4EA7\u8BFB\u4E0D\u5230\uFF0C\u5DF2\u753B\u5360\u4F4D`);
  const badIcons = countUnknownIcons(ids.map((id) => findNode(doc, id)?.node).filter((n) => !!n && n.visible !== false));
  if (badIcons > 0)
    parts.push(`${badIcons} \u4E2A icon \u8282\u70B9\u7684\u56FE\u6807\u540D\u65E0\u6548\uFF08\u753B\u7684\u662F\u5360\u4F4D\uFF0C\u7528 list_icons \u67E5\u6B63\u786E\u540D\u5B57\u540E update_nodes \u6539 icon \u5B57\u6BB5\uFF09`);
  const save = str2(args.saveTo)?.trim();
  if (save)
    parts.push(`\u5DF2\u4FDD\u5B58\u5230 ${saveToWorkspace(ctx.workspace, save, Buffer.from(r.png))}`);
  return {
    mcpContent: [
      { type: "text", text: parts.join("\uFF1B") },
      { type: "image", data: Buffer.from(r.png).toString("base64"), mimeType: "image/png" }
    ]
  };
}
async function opExportDoc(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const page = pickPage(doc, args.page);
  const ids = targetTopLevelIds(page, args.ids);
  const maxDim = Math.min(Math.max(num2(args.maxDim) ?? 4096, 320), 16384);
  const scale = Math.min(Math.max(num2(args.scale) ?? 2, 0.5), 8);
  const summary = await exportBundle(ctx.workspace, abs, doc, page, ids, {
    dir: str2(args.dir)?.trim() || undefined,
    formats: parseFormats(args.format),
    maxDim,
    scale,
    background: bgOf(args.background, null)
  });
  return {
    ...summary,
    hint: `\u5DF2\u5BFC\u51FA\u5230\u76EE\u5F55\u300C${summary.dir}/\u300D\uFF0C\u5171 ${summary.files.length} \u4E2A\u6587\u4EF6\uFF1Bindex.html \u53EF\u76F4\u63A5\u7528\u6D4F\u89C8\u5668\u6253\u5F00\u4F53\u9A8C\u539F\u578B\u3002`
  };
}
function reidNode(n) {
  const c = { ...n, id: uid(n.type[0]) };
  if ("children" in c)
    c.children = c.children.map(reidNode);
  return c;
}
function countInstances(doc, compId) {
  let n = 0;
  const walk = (list) => {
    for (const x of list) {
      if (x.type === "instance" && (!compId || x.componentId === compId))
        n++;
      if ("children" in x)
        walk(x.children);
    }
  };
  for (const p of doc.pages)
    walk(p.nodes);
  for (const c of doc.components ?? [])
    walk(c.nodes);
  return n;
}
function findInMaster(list, id) {
  for (let i = 0;i < list.length; i++) {
    const n = list[i];
    if (n.id === id)
      return { node: n, siblings: list, index: i };
    if ("children" in n) {
      const hit = findInMaster(n.children, id);
      if (hit)
        return hit;
    }
  }
  return null;
}
function opListComponents(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  return {
    path: relPath(abs, ctx),
    components: (doc.components ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      nodeCount: c.nodes.length,
      masterNodeIds: c.nodes.map((n) => n.id),
      bounds: componentBounds(c),
      instances: countInstances(doc, c.id)
    })),
    hint: (doc.components?.length ?? 0) === 0 ? "\u672C\u6863\u8FD8\u6CA1\u6709\u7EC4\u4EF6\uFF1Acreate_component \u53EF\u628A\u73B0\u6709\u8282\u70B9\u8F6C\u6210\u7EC4\u4EF6\uFF08\u539F\u4F4D\u53D8\u5B9E\u4F8B\uFF09" : undefined
  };
}
function opCreateComponent(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const ids = Array.isArray(args.ids) ? args.ids.map(str2).filter((x) => !!x) : [];
  if (!ids.length)
    throw new Error("ids \u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u8282\u70B9 id\uFF08\u653E\u8FDB\u7EC4\u4EF6\u7684\u8282\u70B9\uFF09");
  if (ids.some((id) => id.includes("/")))
    throw new Error("\u4E0D\u80FD\u53D6\u5B9E\u4F8B\u5185\u90E8\u8282\u70B9\u521B\u5EFA\u7EC4\u4EF6\uFF08\u5148 detach\uFF09");
  const locs = ids.map((id) => findOrThrow(doc, id));
  if (!locs.every((l) => l.siblings === locs[0].siblings))
    throw new Error("\u591A\u8282\u70B9\u521B\u5EFA\u7EC4\u4EF6\u65F6\u5FC5\u987B\u5728\u540C\u4E00\u5BB9\u5668\u540C\u5C42");
  const name = str2(args.name)?.trim() || locs[0].node.name || "\u7EC4\u4EF6";
  const master = locs.map((l) => structuredClone(l.node));
  const b = unionBox(master.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h })));
  if (!b)
    throw new Error("\u65E0\u6CD5\u8BA1\u7B97\u7EC4\u4EF6\u5305\u56F4\u76D2");
  const comp = { id: uid("c"), name, nodes: master };
  const inst = {
    id: str2(args.instanceId)?.trim() || uid("i"),
    type: "instance",
    name,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    componentId: comp.id
  };
  const insertAt = Math.min(...locs.map((l) => l.index));
  for (const l of locs)
    l.siblings.splice(l.siblings.indexOf(l.node), 1);
  locs[0].siblings.splice(insertAt, 0, inst);
  doc.components = [...doc.components ?? [], comp];
  saveDoc(abs, doc);
  return {
    path: relPath(abs, ctx),
    componentId: comp.id,
    instanceId: inst.id,
    name,
    bounds: b,
    masterNodeIds: master.map((m) => m.id),
    hint: `\u6539\u5B9E\u4F8B\u5185\u90E8\uFF1Aupdate_nodes id="${inst.id}/<\u5185\u90E8id>"\uFF08\u5B57\u6BB5\u662F\u663E\u793A\u5750\u6807/\u89C6\u56FE\u53E3\u5F84\uFF0C\u81EA\u52A8\u5B58\u4E3A\u8986\u76D6\uFF09\uFF1B\u6539\u4E3B\u6863\uFF1Aedit_component action=patch_master\uFF1B\u518D\u63D2\u4E00\u4E2A\u5B9E\u4F8B\uFF1Aedit_component action=insert`
  };
}
function opEditComponent(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const action = str2(args.action)?.trim();
  if (action === "insert") {
    const compId = str2(args.componentId)?.trim();
    if (!compId)
      throw new Error("insert \u9700\u8981 componentId");
    const comp = findComponent(doc, compId);
    if (!comp)
      throw new Error(`\u7EC4\u4EF6\u4E0D\u5B58\u5728\uFF1A${compId}\uFF08list_components \u67E5 id\uFF09`);
    const page = pickPage(doc, args.page);
    const b = componentBounds(comp);
    const inst = {
      id: str2(args.instanceId)?.trim() || uid("i"),
      type: "instance",
      name: comp.name,
      x: 0,
      y: 0,
      w: Math.max(1, b.w),
      h: Math.max(1, b.h),
      componentId: comp.id
    };
    const hasPos = num2(args.x) !== undefined && num2(args.y) !== undefined;
    if (hasPos) {
      inst.x = num2(args.x);
      inst.y = num2(args.y);
    } else {
      const pos = autoPlace(doc, null, page, inst);
      inst.x = pos.x;
      inst.y = pos.y;
    }
    page.nodes.push(inst);
    saveDoc(abs, doc);
    return { path: relPath(abs, ctx), inserted: { id: inst.id, name: inst.name, x: inst.x, y: inst.y, w: inst.w, h: inst.h }, pageId: page.id };
  }
  if (action === "detach") {
    const id = str2(args.nodeId)?.trim();
    if (!id || id.includes("/"))
      throw new Error("detach \u9700\u8981\u9876\u5C42\u5B9E\u4F8B\u7684 nodeId\uFF08\u4E0D\u542B / \u5185\u90E8\u8DEF\u5F84\uFF09");
    const loc = findOrThrow(doc, id);
    if (loc.node.type !== "instance")
      throw new Error(`\u4E0D\u662F\u5B9E\u4F8B\uFF1A${id}\uFF08${loc.node.type}\uFF09`);
    const baked = bakeInstanceNodes(doc, loc.node);
    if (!baked || !baked.length)
      throw new Error(`\u5B9E\u4F8B ${id} \u7684\u4E3B\u6863\u7F3A\u5931\uFF0C\u65E0\u6CD5\u5206\u79BB`);
    const flat = baked.map(reidNode);
    loc.siblings.splice(loc.index, 1, ...flat);
    saveDoc(abs, doc);
    return { path: relPath(abs, ctx), detached: id, nodeIds: flat.map((n) => n.id) };
  }
  if (action === "reset_overrides") {
    const id = str2(args.nodeId)?.trim();
    if (!id || id.includes("/"))
      throw new Error("reset_overrides \u9700\u8981\u9876\u5C42\u5B9E\u4F8B\u7684 nodeId");
    const loc = findOrThrow(doc, id);
    if (loc.node.type !== "instance")
      throw new Error(`\u4E0D\u662F\u5B9E\u4F8B\uFF1A${id}\uFF08${loc.node.type}\uFF09`);
    delete loc.node.overrides;
    saveDoc(abs, doc);
    return { path: relPath(abs, ctx), reset: id };
  }
  if (action === "patch_master") {
    const compId = str2(args.componentId)?.trim();
    const nodeId = str2(args.nodeId)?.trim();
    if (!compId || !nodeId)
      throw new Error("patch_master \u9700\u8981 componentId \u4E0E nodeId\uFF08\u4E3B\u6863\u5185\u8282\u70B9 id\uFF09");
    const comp = findComponent(doc, compId);
    if (!comp)
      throw new Error(`\u7EC4\u4EF6\u4E0D\u5B58\u5728\uFF1A${compId}`);
    const hit = findInMaster(comp.nodes, nodeId);
    if (!hit)
      throw new Error(`\u4E3B\u6863 ${compId} \u91CC\u6CA1\u6709\u8282\u70B9 ${nodeId}\uFF08read_doc \u7684 masterNodeIds \u6216 list_components \u67E5\uFF09`);
    applyUpdateFields(hit.node, args, `${compId}/${nodeId}`);
    saveDoc(abs, doc);
    return { path: relPath(abs, ctx), patchedMaster: nodeId, componentId: compId, instancesAffected: countInstances(doc, compId) };
  }
  if (action === "rename") {
    const compId = str2(args.componentId)?.trim();
    const name = str2(args.name)?.trim();
    if (!compId || !name)
      throw new Error("rename \u9700\u8981 componentId \u4E0E name");
    const comp = findComponent(doc, compId);
    if (!comp)
      throw new Error(`\u7EC4\u4EF6\u4E0D\u5B58\u5728\uFF1A${compId}`);
    comp.name = name.slice(0, 120);
    saveDoc(abs, doc);
    return { path: relPath(abs, ctx), componentId: compId, name: comp.name };
  }
  if (action === "remove") {
    const compId = str2(args.componentId)?.trim();
    if (!compId)
      throw new Error("remove \u9700\u8981 componentId");
    const comp = findComponent(doc, compId);
    if (!comp)
      throw new Error(`\u7EC4\u4EF6\u4E0D\u5B58\u5728\uFF1A${compId}`);
    let refs = 0;
    if (args.detach === true) {
      const bakeList = (list) => {
        for (let i = 0;i < list.length; i++) {
          const n = list[i];
          if (n.type === "instance" && n.componentId === compId) {
            const baked = bakeInstanceNodes(doc, n);
            if (baked) {
              list.splice(i, 1, ...baked.map(reidNode));
              refs++;
              i += baked.length - 1;
              continue;
            }
          }
          if ("children" in n)
            bakeList(n.children);
        }
      };
      for (const p of doc.pages)
        bakeList(p.nodes);
    } else {
      refs = countInstances(doc, compId);
    }
    doc.components = (doc.components ?? []).filter((c) => c.id !== compId);
    saveDoc(abs, doc);
    return {
      path: relPath(abs, ctx),
      removed: compId,
      instances: refs,
      note: args.detach === true ? "\u5F15\u7528\u5B9E\u4F8B\u5DF2\u70D8\u7119\u4E3A\u666E\u901A\u56FE\u5C42" : refs > 0 ? `${refs} \u4E2A\u5F15\u7528\u5B9E\u4F8B\u5C06\u663E\u793A\u4E3A\u300C\u7EC4\u4EF6\u7F3A\u5931\u300D\u5360\u4F4D\uFF08\u8981\u4FDD\u7559\u5185\u5BB9\u8BF7\u5E26 detach:true \u91CD\u505A\uFF09` : undefined
    };
  }
  throw new Error("action \u9700\u4E3A insert|detach|reset_overrides|patch_master|rename|remove");
}
function opImportDoc(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const fromAbs = resolveDocPath(args.from, ctx);
  if (path3.resolve(abs) === path3.resolve(fromAbs))
    throw new Error("\u5BFC\u5165\u6E90\u4E0E\u76EE\u6807\u4E0D\u80FD\u662F\u540C\u4E00\u4EFD\u6587\u4EF6");
  const { doc: target } = loadDoc(abs);
  const { doc: incoming } = loadDoc(fromAbs);
  const pageNames = Array.isArray(args.pageNames) ? args.pageNames.map(str2).filter((x) => !!x) : undefined;
  const merged = mergeImportedDoc(target, incoming, pageNames?.length ? { pageNames } : undefined);
  saveDoc(abs, merged.doc);
  return {
    path: relPath(abs, ctx),
    from: relPath(fromAbs, ctx),
    importedPages: merged.pages,
    importedComponents: merged.components,
    importedNodes: merged.nodes,
    warnings: merged.warnings,
    hint: "\u65B0\u9875\u8FFD\u52A0\u5728\u672B\u5C3E\u3001activePage \u672A\u5207\u6362\uFF1B\u9762\u677F\u534A\u79D2\u5185\u81EA\u52A8\u5237\u65B0\u3002\u7528\u6237\u4FA7\u8FD9\u662F\u4E00\u6B65\u53EF\u64A4\u9500\u7684\u5916\u90E8\u5199\uFF08\u2318Z \u53EF\u56DE\u9000\u672C\u6B21\u5BFC\u5165\uFF09"
  };
}
var PATH_SCHEMA = { type: "string", description: `\u8BBE\u8BA1\u6863\u8DEF\u5F84\uFF08*.uidesign.json\uFF1B\u7EDD\u5BF9\u6216\u76F8\u5BF9\u5DE5\u4F5C\u533A\uFF09` };
function opListStencils(args) {
  const query = str2(args.query) ?? "";
  const category = str2(args.category);
  let list = searchStencils(query, 200);
  if (category)
    list = list.filter((s) => s.category === category);
  return {
    total: STENCILS.length,
    categories: STENCIL_CATEGORIES.map((c) => ({ name: c, count: STENCILS.filter((s) => s.category === c).length })),
    stencils: list.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      size: `${s.w}\xD7${s.h}`,
      keys: s.keys.slice(0, 6)
    })),
    hint: '\u7528 insert_stencil \u843D\u76D8\uFF1A{ path, stencil:"<id>", parent:"<\u753B\u677Fid>", x, y, w?, h? }\u3002w/h \u6309\u7B49\u6BD4\u7F29\u653E\uFF08\u4E0D\u62C9\u4F38\uFF09\uFF0C\u7701\u7565 = \u7528\u7D20\u6750\u6807\u79F0\u5C3A\u5BF8\u3002'
  };
}
function opInsertStencil(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const wanted = (str2(args.stencil) ?? "").trim();
  if (!wanted)
    throw new Error("stencil \u4E0D\u80FD\u4E3A\u7A7A\uFF08\u5148\u7528 list_stencils \u641C\u53EF\u7528 id\uFF09");
  let st = findStencil(wanted);
  if (!st) {
    const hits = searchStencils(wanted, 5);
    const names = hits.map((h) => `${h.id}(${h.name})`).join("\u3001");
    throw new Error(`\u6CA1\u6709\u8FD9\u4E2A\u7D20\u6750\uFF1A"${wanted}"${names ? `\u3002\u4F60\u662F\u60F3\u627E\uFF1A${names}` : "\uFF08list_stencils \u770B\u5168\u96C6\uFF09"}`);
  }
  const page = pickPage(doc, args.page);
  const parentId = str2(args.parent)?.trim();
  let parent = null;
  if (parentId) {
    const loc = findNode(doc, parentId);
    if (!loc)
      throw new Error(`\u7236\u5BB9\u5668\u4E0D\u5B58\u5728\uFF1A${parentId}\uFF08\u5148 read_doc \u62FF\u6700\u65B0 id\uFF09`);
    if (!("children" in loc.node))
      throw new Error(`\u7236\u5BB9\u5668 ${parentId}\uFF08${loc.node.type}\uFF09\u4E0D\u80FD\u5BB9\u7EB3\u5B50\u8282\u70B9`);
    parent = loc.node;
  }
  const w = num2(args.w);
  const h = num2(args.h);
  const at = { x: num2(args.x) ?? 0, y: num2(args.y) ?? 0, ...w !== undefined ? { w } : {}, ...h !== undefined ? { h } : {} };
  const specs = buildStencilSpecs(st, at, (hint) => uid(hint[0] ?? "s"));
  const built = specs.map((spec) => {
    const node = buildNode(spec);
    applyTypeFields(node, spec);
    return node;
  });
  const created = built.map((n) => n.id);
  if (parent && "children" in parent)
    parent.children.push(...built);
  else
    page.nodes.push(...built);
  saveDoc(abs, doc);
  return {
    path: relPath(abs, ctx),
    stencil: st.id,
    name: st.name,
    added: created,
    count: built.length,
    parent: parentId ?? null,
    ...parentId ? {} : { note: "\u672A\u7ED9 parent\uFF1A\u7D20\u6750\u843D\u5728\u9875\u9762\u9876\u5C42\uFF08absolute \u5750\u6807\uFF09" },
    hint: "\u7D20\u6750\u662F\u666E\u901A\u8282\u70B9\uFF0C\u53EF\u76F4\u63A5 update_nodes \u6539\u8272/\u6539\u5B57\uFF1B\u6210\u7EC4\u7528 group_nodes\u3002"
  };
}
function opEditInteractions(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const nodeId = str2(args.node)?.trim();
  if (!nodeId)
    throw new Error('node \u9700\u8981\u8282\u70B9 id\uFF08read_doc \u62FF\uFF1B\u5B9E\u4F8B\u5185\u90E8\u8282\u70B9\u5199 "\u5B9E\u4F8Bid/\u5185\u90E8id"\uFF09');
  const op = (str2(args.op) ?? "set").trim();
  const loc = findOrThrow(doc, nodeId);
  let next;
  if (op === "set") {
    next = parseInteractionsInput(args.list ?? []);
  } else if (op === "add") {
    const add = parseInteractionsInput(args.list ?? []);
    if (add.length === 0)
      throw new Error("add \u9700\u8981 list \u91CC\u81F3\u5C11\u4E00\u6761\u4EA4\u4E92");
    next = [...nodeInteractions(loc.node), ...add];
  } else if (op === "clear") {
    next = [];
  } else if (op === "remove") {
    const current = nodeInteractions(loc.node);
    const idx = num2(args.index);
    if (idx !== undefined) {
      if (idx < 0 || idx >= current.length)
        throw new Error(`index ${idx} \u8D8A\u754C\uFF08\u8BE5\u8282\u70B9\u6709 ${current.length} \u6761\u4EA4\u4E92\uFF09`);
      next = current.filter((_, i) => i !== idx);
    } else {
      const trig = normalizeTrigger(args.trigger);
      if (!trig)
        throw new Error("remove \u9700\u8981 trigger\uFF08\u6216 index\uFF09\uFF1A\u5148 read_doc \u770B\u73B0\u6709\u4EA4\u4E92\u7684 trigger/a \u53EF\u9009\u503C");
      const act = args.action === undefined ? undefined : normalizeAction(args.action);
      if (args.action !== undefined && !act) {
        throw new Error(`action \u65E0\u6CD5\u8BC6\u522B\uFF1A"${String(args.action)}"\uFF08\u53EF\u7528\uFF1A${INTERACTION_ACTIONS.join(" / ")}\uFF09`);
      }
      const kept = current.filter((it) => !(it.trigger === trig && (act === undefined || it.action === act)));
      if (kept.length === current.length)
        throw new Error(`\u8BE5\u8282\u70B9\u6CA1\u6709 trigger="${trig}"${act ? ` + action="${act}"` : ""} \u7684\u4EA4\u4E92`);
      next = kept;
    }
  } else {
    throw new Error("op \u9700\u4E3A set\uFF08\u6574\u8868\u66FF\u6362\uFF09| add\uFF08\u8FFD\u52A0\uFF09| remove\uFF08\u6309 index \u6216 trigger[+action] \u5220\uFF09| clear\uFF08\u6E05\u7A7A\uFF09");
  }
  const patch = { interactions: next.length ? next : null };
  if (nodeId.includes("/"))
    updateInstanceInternal(doc, nodeId, patch);
  else
    applyUpdateFields(loc.node, patch, nodeId);
  saveDoc(abs, doc);
  const after = findOrThrow(doc, nodeId).node;
  const list = nodeInteractions(after);
  const frame = topLevelFrameOf(doc, nodeId);
  const problems = list.map((it, i) => {
    const check = checkInteractionTarget(doc, frame, it);
    return check.ok ? null : { index: i, trigger: it.trigger, action: it.action, to: it.to, reason: check.reason };
  }).filter((x) => !!x);
  return {
    path: relPath(abs, ctx),
    node: nodeId,
    interactions: list,
    ...problems.length ? {
      problems,
      hint: "\u8FD9\u4E9B\u4EA4\u4E92\u7684\u76EE\u6807\u4E0D\u53EF\u7528\uFF1A\u9884\u89C8/\u5BFC\u51FA\u91CC\u70B9\u4E86\u4E0D\u4F1A\u6709\u53CD\u5E94\uFF08\u4F1A\u753B\u7EA2\u5708\uFF09\u3002navigate/overlay \u7684 to \u5FC5\u987B\u662F\u9876\u5C42\u753B\u677F id\uFF08read_doc \u770B frames\uFF09\uFF0CscrollTo/toggleVisible \u7684 to \u5FC5\u987B\u5728\u540C\u4E00\u5757\u753B\u677F\u5185\u3002"
    } : { hint: '\u76EE\u6807\u5168\u90E8\u53EF\u89E3\u6790\uFF1B\u9762\u677F\u6309 P \u5373\u53EF\u9884\u89C8\uFF08\u7F3A\u7701\u8F6C\u573A\u5DF2\u6309 \u52A8\u4F5C+\u505C\u9760\u4F4D \u81EA\u52A8\u9009\u597D\uFF0C\u5199 transition:"none" \u53EF\u5173\uFF09' }
  };
}
function opEditVariables(args, ctx) {
  const abs = resolveDocPath(args.path, ctx);
  const { doc } = loadDoc(abs);
  const action = str2(args.action) ?? "list";
  if (action === "list") {
    const usage = collectVarRefs(doc);
    const variables = (doc.variables ?? []).map((v) => ({ ...v, usage: usage.get(v.id) ?? 0 }));
    const dangling = [...usage.keys()].filter((id) => !(doc.variables ?? []).some((v) => v.id === id));
    return {
      path: relPath(abs, ctx),
      variables,
      ...dangling.length ? { danglingRefs: dangling.map((id) => `var:${id}`), note: "\u8FD9\u4E9B\u5F15\u7528\u6CA1\u6709\u5BF9\u5E94\u53D8\u91CF\uFF08\u753B\u5E03\u663E\u793A\u8B66\u793A\u7C89\uFF09\uFF1B\u91CD\u65B0 set \u540C id \u53EF\u63A5\u56DE\uFF0C\u6216\u5220\u5F15\u7528\u6539\u56DE\u666E\u901A\u8272\u503C" } : {},
      hint: '\u7ED1\u5B9A\u65B9\u5F0F\uFF1Aupdate_nodes \u628A\u989C\u8272\u5B57\u6BB5\u5199\u6210 "var:<\u53D8\u91CFid>"\uFF1Bset \u6539 value \u5373\u5168\u7A3F\u6362\u8272'
    };
  }
  if (action === "set") {
    const name = (str2(args.name) ?? "").trim();
    const value = str2(args.value);
    const id = str2(args.id);
    const vars = [...doc.variables ?? []];
    if (id) {
      const hit = vars.find((v) => v.id === id);
      if (!hit)
        throw new Error(`\u53D8\u91CF\u4E0D\u5B58\u5728\uFF1A${id}\uFF08edit_variables action:list \u67E5\u73B0\u6709 id\uFF09`);
      if (value !== undefined)
        hit.value = value;
      if (name)
        hit.name = name.slice(0, 60);
      if (args.desc !== undefined) {
        const d = str2(args.desc);
        if (d)
          hit.desc = d.slice(0, 200);
        else
          delete hit.desc;
      }
      saveDoc(abs, doc);
      return { path: relPath(abs, ctx), variable: hit, usage: collectVarRefs(doc).get(hit.id) ?? 0, note: "\u503C\u6539\u52A8\u5B9E\u65F6\u8054\u52A8\u5168\u90E8\u7ED1\u5B9A\u5904\uFF08\u753B\u5E03\u534A\u79D2\u5185\u5237\u65B0\uFF09" };
    }
    if (!name)
      throw new Error("\u65B0\u5EFA\u53D8\u91CF\u9700\u8981 name\uFF08\u6216\u7ED9 id \u66F4\u65B0\u73B0\u6709\u53D8\u91CF\uFF09");
    const taken = new Set(vars.map((v) => v.name));
    if (taken.has(name))
      throw new Error(`\u53D8\u91CF\u540D\u5DF2\u5B58\u5728\uFF1A${name}\uFF08list \u67E5\u91CD\u540D\u53D8\u91CF\u7684 id \u540E\u7528 id \u66F4\u65B0\uFF0C\u6216\u6362\u4E2A\u540D\u5B57\uFF09`);
    const desc = str2(args.desc);
    const def = {
      id: uid("v"),
      name: name.slice(0, 60),
      value: value ?? "#0d99ff",
      ...desc ? { desc: desc.slice(0, 200) } : {}
    };
    vars.push(def);
    saveDoc(abs, { ...doc, variables: vars });
    return { path: relPath(abs, ctx), variable: def, note: `\u7ED1\u5B9A\uFF1A\u989C\u8272\u5B57\u6BB5\u5199 "var:${def.id}"` };
  }
  if (action === "delete") {
    const id = str2(args.id);
    if (!id)
      throw new Error("delete \u9700\u8981\u53D8\u91CF id\uFF08edit_variables action:list \u67E5\uFF09");
    const vars = doc.variables ?? [];
    const hit = vars.find((v) => v.id === id);
    if (!hit)
      throw new Error(`\u53D8\u91CF\u4E0D\u5B58\u5728\uFF1A${id}`);
    const usage = collectVarRefs(doc).get(id) ?? 0;
    let note;
    if (args.detach === true && usage > 0) {
      const map = new Map([[id, hit.value]]);
      for (const p of doc.pages)
        remapVarColors(p.nodes, map);
      for (const c of doc.components ?? [])
        remapVarColors(c.nodes, map);
      note = `\u5DF2\u628A ${usage} \u5904\u5F15\u7528\u70D8\u7119\u4E3A\u8272\u503C ${hit.value} \u540E\u5220\u9664\u53D8\u91CF`;
    } else {
      note = usage > 0 ? `${usage} \u5904\u5F15\u7528\u5C06\u663E\u793A\u4E3A\u8B66\u793A\u7C89\uFF08\u8981\u4FDD\u8272\u503C\u5148 detach:true\uFF09` : "\u8BE5\u53D8\u91CF\u6CA1\u6709\u88AB\u5F15\u7528";
    }
    saveDoc(abs, { ...doc, variables: vars.filter((v) => v.id !== id) });
    return { path: relPath(abs, ctx), removed: id, usage, note };
  }
  throw new Error("action \u9700\u4E3A list|set|delete");
}
var TOOL_DEFS = [
  {
    name: "list_docs",
    description: "\u5217\u51FA\u5DE5\u4F5C\u533A\u91CC\u7684 UI \u8BBE\u8BA1\u6863\uFF08*.uidesign.json\uFF0C\u6839\u76EE\u5F55 + \u4E24\u5C42\u5B50\u76EE\u5F55\uFF0C\u6700\u591A 60 \u4EFD\uFF09\uFF0C\u5E26\u753B\u677F/\u8282\u70B9\u8BA1\u6570\u4E0E\u635F\u574F\u6807\u8BB0\u3002\u627E\u4E0D\u5230\u76EE\u6807\u6587\u6863\u65F6\u5148\u7528\u5B83\u3002",
    inputSchema: {
      type: "object",
      properties: { dir: { type: "string", description: "\u53EF\u9009\uFF1A\u9650\u5B9A\u5B50\u76EE\u5F55\uFF08\u76F8\u5BF9\u5DE5\u4F5C\u533A\uFF09" } }
    },
    run: opListDocs
  },
  {
    name: "read_doc",
    description: '\u8BFB\u8BBE\u8BA1\u6863\uFF1A\u9ED8\u8BA4\u8FD4\u56DE\u5F53\u524D\u9875\u7684\u56FE\u5C42\u6811\u6458\u8981\uFF08id/\u7C7B\u578B/\u540D\u5B57/\u76D2/\u586B\u5145/\u6587\u5B57\u2026\uFF0Cdepth \u63A7\u5236\u5C55\u5F00\u5C42\u6570\uFF09\uFF1B\u7ED9 nodeId \u8FD4\u56DE\u8BE5\u8282\u70B9\u5B8C\u6574 JSON\uFF1Braw:true \u8FD4\u56DE\u6574\u6863\u3002\u7F16\u8F91\u524D\u5148\u8BFB\uFF0C\u62FF\u6700\u65B0 id\u3002\u5B9E\u4F8B\u8282\u70B9\u4F1A\u5C55\u5F00\u5176\u89E3\u6790\u89C6\u56FE\uFF0Cchildren \u7684 id \u5F62\u5982 "\u5B9E\u4F8Bid/\u5185\u90E8id" \u53EF\u76F4\u63A5\u7528\u4E8E update_nodes \u6539\u8986\u76D6\u3002',
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        page: { type: "string", description: "\u9875\u9762 id \u6216\u540D\u79F0\uFF08\u7F3A\u7701\u5F53\u524D\u6D3B\u8DC3\u9875\uFF09" },
        nodeId: { type: "string", description: "\u53EA\u770B\u67D0\u4E2A\u8282\u70B9\uFF08\u542B\u5B50\u6811\u5B8C\u6574 JSON\uFF09" },
        depth: { type: "number", description: "\u5B50\u8282\u70B9\u5C55\u5F00\u5C42\u6570\uFF0C\u7F3A\u7701 3" },
        raw: { type: "boolean", description: "true = \u8FD4\u56DE\u6574\u6863\u539F\u59CB JSON" }
      },
      required: ["path"]
    },
    run: opReadDoc
  },
  {
    name: "create_doc",
    description: "\u65B0\u5EFA\u4E00\u4EFD *.uidesign.json\uFF1A\u9ED8\u8BA4\u6309\u8BBE\u5907\u9884\u8BBE\uFF08\u7F3A\u7701 ios-390\uFF09\u5EFA\u4E00\u5757\u300C\u9996\u9875\u300D\u753B\u677F\uFF1B\u4E5F\u53EF\u7ED9 frames \u4E00\u6B21\u5EFA\u591A\u5757\uFF08x \u7701\u7565\u65F6\u81EA\u52A8\u6A2A\u6392\u3001\u95F4\u8DDD\u6309\u753B\u677F\u5BBD 32%\uFF09\u3002\u5DF2\u5B58\u5728\u540C\u540D\u6587\u4EF6\u4F1A\u62A5\u9519\uFF08\u9664\u975E overwrite:true\uFF09\u3002" + "\u5206\u5C42\u5DE5\u4F5C\u6D41\u7B2C\u4E00\u6B65\u53EF\u7528 template \u76F4\u63A5\u94FA\u51FA**\u9875\u9762\u9AA8\u67B6**\uFF08\u53EA\u542B\u547D\u540D\u5206\u533A\u4E0E\u6805\u683C\u3001\u6CA1\u6709\u771F\u5B9E\u5185\u5BB9\uFF09\uFF0C" + "\u518D\u7528 run_design_script \u5F80\u5404\u5206\u533A\u91CC\u6279\u91CF\u586B\u5185\u5BB9\u2014\u2014\u6BD4\u4E00\u4E0A\u6765\u5C31\u585E\u6EE1\u6574\u5C4F\u518D\u56DE\u5934\u8C03\u7ED3\u6784\u7A33\u5F97\u591A\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        name: { type: "string", description: "\u6587\u6863\u540D\uFF08\u7F3A\u7701\u53D6\u6587\u4EF6\u540D\uFF09" },
        preset: { type: "string", description: "\u8BBE\u5907\u9884\u8BBE\u952E\uFF1Aios-375/ios-390/android-360/tablet-768/desktop-1440/watch-168" },
        template: {
          type: "string",
          enum: TEMPLATE_KEYS,
          description: `\u9875\u9762\u9AA8\u67B6\u6A21\u677F\uFF08\u4E0E preset \u642D\u914D\u4F7F\u7528\uFF09\uFF1A${TEMPLATE_KEYS.join(" / ")}\u3002` + "login=\u54C1\u724C\u533A/\u8868\u5355\u533A/\u5E95\u90E8\u64CD\u4F5C\uFF1Blist=\u9876\u680F/\u7B5B\u9009\u680F/\u5217\u8868/\u5E95\u680F\uFF1Bdetail=\u9876\u680F/\u5934\u56FE/\u6B63\u6587/\u5E95\u90E8\u64CD\u4F5C\uFF1B" + "settings=\u6807\u9898/\u5206\u7EC4\u4E00\u4E8C\u4E09\uFF08\u9002\u5408 run_design_script \u94FA\u8BBE\u7F6E\u884C\uFF09\uFF1Bdashboard=\u4FA7\u680F/\u9876\u680F/\u6307\u6807\u884C/\u4E3B\u533A\uFF08\u914D desktop-1440\uFF09\uFF1Bempty=\u7A7A\u72B6\u6001\u3002" + "blank = \u7A7A\u767D\u753B\u677F\u3002"
        },
        pageName: { type: "string" },
        frames: { type: "array", description: "\u753B\u677F\u5217\u8868 [{ name?, preset?, w?, h?, x?, y?, fill? }]", items: NODE_SPEC_SCHEMA },
        overwrite: { type: "boolean", description: "true = \u8986\u76D6\u5DF2\u5B58\u5728\u7684\u6587\u4EF6" }
      },
      required: ["path"]
    },
    run: opCreateDoc
  },
  {
    name: "add_nodes",
    description: "\u5F80\u8BBE\u8BA1\u6863\u52A0\u8282\u70B9\uFF08\u4E00\u6B21\u6700\u591A 80 \u4E2A\uFF0C\u539F\u5B50\u843D\u76D8\uFF09\u3002parent \u7ED9\u753B\u677F/\u7EC4 id \u5219\u5750\u6807\u662F**\u753B\u677F\u5185\u5C40\u90E8\u5750\u6807**\uFF08\u76F8\u5BF9\u753B\u677F\u5DE6\u4E0A\u89D2\uFF09\uFF1B\u7701\u7565 parent \u5219\u52A0\u5728\u9875\u9762\u9876\u5C42\u3002x/y \u90FD\u7701\u7565\u65F6\u81EA\u52A8\u843D\u4F4D\uFF08\u5BB9\u5668\u5185\u53E0\u5728\u6700\u540E\u4E00\u4E2A\u5B50\u8282\u70B9\u4E0B\u65B9 +16\uFF0C\u9875\u9762\u7EA7\u6392\u5728\u73B0\u6709\u8282\u70B9\u53F3\u4FA7 +80\uFF09\u3002\u98CE\u683C\u5B57\u6BB5\u89C1 node \u89C4\u683C\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        page: { type: "string", description: "\u9875\u9762 id \u6216\u540D\u79F0\uFF08\u7F3A\u7701\u6D3B\u8DC3\u9875\uFF09" },
        parent: { type: "string", description: "\u7236\u5BB9\u5668\u8282\u70B9 id\uFF08frame/group\uFF09\uFF1B\u7701\u7565=\u9875\u9762\u9876\u5C42" },
        nodes: { type: "array", items: NODE_SPEC_SCHEMA, description: "\u8282\u70B9\u89C4\u683C\u6570\u7EC4" },
        node: NODE_SPEC_SCHEMA
      },
      required: ["path"]
    },
    run: opAddNodes
  },
  {
    name: "update_nodes",
    description: "\u6309 id \u6279\u91CF\u6539\u8282\u70B9\uFF08\u539F\u5B50\uFF09\uFF1Ax/y \u662F\u7EDD\u5BF9\u5C40\u90E8\u5750\u6807\uFF0Cdx/dy \u662F\u76F8\u5BF9\u4F4D\u79FB\uFF1B\u53EF\u6539 name/w/h/rotation/opacity/visible/locked/radius/effects/onTap \u4E0E\u7C7B\u578B\u5B57\u6BB5\uFF08fill/fills/stroke/strokes/text/runs/align/vAlign/lineHeight/letterSpacing/dir/src/fit/clip\uFF09\u3002" + 'id \u4E5F\u652F\u6301\u5B9E\u4F8B\u5185\u90E8\u5BFB\u5740 "\u5B9E\u4F8Bid/\u5185\u90E8id[/\u66F4\u6DF1\u2026]"\uFF08read_doc \u4F1A\u5C55\u5F00\u5B9E\u4F8B\u5E76\u7ED9\u51FA\u8FD9\u4E9B id\uFF09\uFF1A\u5B57\u6BB5\u7528**\u663E\u793A\u5750\u6807**\uFF0C\u6539\u52A8\u81EA\u52A8\u5B58\u4E3A\u8BE5\u5B9E\u4F8B\u7684\u8986\u76D6\uFF0C\u4E0D\u5F71\u54CD\u5176\u4ED6\u5B9E\u4F8B\u3002',
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        updates: {
          type: "array",
          description: "\u66F4\u65B0\u9879\u6570\u7EC4 [{ id, ...\u8981\u6539\u7684\u5B57\u6BB5 }]",
          items: { type: "object", properties: { id: { type: "string" }, ...NODE_SPEC_SCHEMA.properties }, required: ["id"] }
        }
      },
      required: ["path", "updates"]
    },
    run: opUpdateNodes
  },
  {
    name: "delete_nodes",
    description: "\u6309 id \u5220\u9664\u8282\u70B9\uFF08\u542B\u5B50\u6811\uFF09\u3002",
    inputSchema: {
      type: "object",
      properties: { path: PATH_SCHEMA, ids: { type: "array", items: { type: "string" } } },
      required: ["path", "ids"]
    },
    run: opDeleteNodes
  },
  {
    name: "group_nodes",
    description: "\u628A\u540C\u5C42\uFF08\u540C\u4E00\u5BB9\u5668\uFF09\u7684\u591A\u4E2A\u8282\u70B9\u6253\u6210\u7EC4\uFF1B\u5B50\u8282\u70B9\u5750\u6807\u81EA\u52A8\u6362\u7B97\u4E3A\u7EC4\u5185\u5C40\u90E8\u5750\u6807\uFF0C\u7EC4\u76D2\u7531\u5B50\u8282\u70B9\u5E76\u96C6\u6D3E\u751F\u3002",
    inputSchema: {
      type: "object",
      properties: { path: PATH_SCHEMA, ids: { type: "array", items: { type: "string" } }, name: { type: "string" } },
      required: ["path", "ids"]
    },
    run: opGroupNodes
  },
  {
    name: "ungroup_nodes",
    description: "\u62C6\u7EC4\uFF1A\u5B50\u8282\u70B9\u5750\u6807\u6362\u7B97\u56DE\u7236\u5BB9\u5668\u5C40\u90E8\u7CFB\uFF0C\u7EC4\u900F\u660E\u5EA6\u4E58\u5165\u5B50\u8282\u70B9\u3002\u5E26\u65CB\u8F6C\u7684\u7EC4\u8BF7\u5148\u628A rotation \u8BBE\u4E3A 0\u3002",
    inputSchema: {
      type: "object",
      properties: { path: PATH_SCHEMA, ids: { type: "array", items: { type: "string" } } },
      required: ["path", "ids"]
    },
    run: opUngroupNodes
  },
  {
    name: "align_nodes",
    description: "\u5BF9\u9F50/\u5206\u5E03\uFF1Aleft|hcenter|right|top|vcenter|bottom\uFF08\u22652 \u4E2A\u8282\u70B9\uFF09\uFF0Chdist|vdist\uFF08\u22653 \u4E2A\uFF0C\u7B49\u95F4\u8DDD\u5206\u5E03\uFF09\u3002ref \u7701\u7565=\u6309\u9009\u62E9\u96C6\u5E76\u76D2\u5BF9\u9F50\uFF1B\u7ED9\u8282\u70B9 id=\u6309\u8BE5\u8282\u70B9\uFF08\u5982\u753B\u677F\uFF09\u8FB9\u754C\u5BF9\u9F50\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        ids: { type: "array", items: { type: "string" } },
        mode: { type: "string", enum: ALIGN_MODES },
        ref: { type: "string", description: "\u53C2\u7167\u8282\u70B9 id\uFF08\u5982\u753B\u677F\uFF09\uFF1B'selection' \u6216\u7701\u7565 = \u9009\u62E9\u96C6\u5E76\u76D2" }
      },
      required: ["path", "ids", "mode"]
    },
    run: opAlignNodes
  },
  {
    name: "stack_nodes",
    description: "\u628A\u4E00\u7EC4\u8282\u70B9\u6309\u5F53\u524D\u987A\u5E8F\u6392\u6210\u4E00\u884C/\u4E00\u5217\uFF08\u4E3B\u8F74\u9996\u8282\u70B9\u4FDD\u6301\u539F\u4F4D\uFF0C\u4F9D\u6B21\u4EE5 gap \u6392\u5F00\uFF1B\u4EA4\u53C9\u8F74\u6309\u5E76\u76D2 start|center|end \u5BF9\u9F50\uFF09\u3002\u5217\u8868/\u5BFC\u822A\u680F/\u5361\u7247\u6D41\u6392\u7248\u7528\u5B83\uFF0C\u6BD4\u624B\u7B97\u5750\u6807\u7A33\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        ids: { type: "array", items: { type: "string" } },
        direction: { type: "string", enum: ["row", "column"] },
        gap: { type: "number", description: "\u95F4\u8DDD\uFF0C\u7F3A\u7701 16" },
        cross: { type: "string", enum: ["start", "center", "end"], description: "\u4EA4\u53C9\u8F74\u5BF9\u9F50\uFF0C\u7F3A\u7701 start" }
      },
      required: ["path", "ids", "direction"]
    },
    run: opStackNodes
  },
  {
    name: "reorder_nodes",
    description: "\u8C03\u6574\u5C42\u7EA7\uFF08z \u5E8F\uFF09\uFF1Afront \u7F6E\u9876 / back \u7F6E\u5E95 / forward \u4E0A\u79FB\u4E00\u5C42 / backward \u4E0B\u79FB\u4E00\u5C42\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        ids: { type: "array", items: { type: "string" } },
        mode: { type: "string", enum: REORDER_MODES }
      },
      required: ["path", "ids", "mode"]
    },
    run: opReorderNodes
  },
  {
    name: "edit_pages",
    description: "\u9875\u9762\u7BA1\u7406\uFF1Aadd \u65B0\u5EFA / rename \u6539\u540D / activate \u5207\u6362\u6D3B\u8DC3\u9875 / remove \u5220\u9664\uFF08\u6700\u540E\u4E00\u9875\u4E0D\u53EF\u5220\uFF09\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        action: { type: "string", enum: ["add", "rename", "activate", "remove"] },
        pageId: { type: "string", description: "\u9875\u9762 id\uFF08rename/activate/remove \u7528\uFF09" },
        name: { type: "string", description: "add/rename \u7528" }
      },
      required: ["path", "action"]
    },
    run: opEditPages
  },
  {
    name: "screenshot_doc",
    description: "\u628A\u753B\u5E03\u5185\u5BB9\u6E32\u67D3\u6210 PNG \u622A\u56FE\u5E76\u4EE5 image \u5757\u8FD4\u56DE\uFF08\u4F60\u76F4\u63A5\u770B\u5230\u6E32\u67D3\u6548\u679C\uFF0C\u975E\u5C4F\u5E55\u622A\u56FE\uFF09\u3002" + "\u7F3A\u7701\u622A\u5F53\u524D\u9875\u5168\u90E8\u53EF\u89C1\u9876\u5C42\u8282\u70B9\uFF08\u4E16\u754C\u76D2\u4E3A\u753B\u5E45\uFF09\uFF1B\u7ED9 ids \u53EA\u622A\u6307\u5B9A\u8282\u70B9\uFF08\u5982\u5355\u4E2A\u753B\u677F\uFF09\u3002" + "\u7528\u4E8E\u6539\u7A3F\u540E\u89C6\u89C9\u81EA\u68C0\uFF1A\u6784\u56FE/\u914D\u8272/\u6587\u5B57\u6392\u5E03\u4E00\u773C\u6838\u5BF9\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u7EE7\u7EED\u5FAE\u8C03\u3002" + "\u7ED9 saveTo \u65F6\u540C\u65F6\u628A PNG \u5199\u8FDB\u5DE5\u4F5C\u533A\u8DEF\u5F84\u5E76\u56DE\u62A5\u3002" + "\u6CE8\u610F\uFF1A\u6587\u5B57\u6298\u884C\u4E3A\u8FD1\u4F3C\u6D4B\u91CF\uFF0C\u4E0E\u9762\u677F\u53EF\u80FD\u6709\u8F7B\u5FAE\u5DEE\u5F02\uFF1B\u4F4D\u56FE\u8D44\u4EA7\u8BFB\u4E0D\u5230\u4F1A\u753B\u7070\u8272\u5360\u4F4D\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        page: { type: "string", description: "\u9875\u9762 id \u6216\u540D\u79F0\uFF08\u7F3A\u7701\u5F53\u524D\u6D3B\u8DC3\u9875\uFF09" },
        ids: { type: "array", items: { type: "string" }, description: "\u53EA\u622A\u8FD9\u4E9B\u8282\u70B9\uFF08\u7F3A\u7701 = \u9875\u9762\u5168\u90E8\u53EF\u89C1\u9876\u5C42\u8282\u70B9\uFF09" },
        maxDim: { type: "number", description: "\u8F93\u51FA\u6700\u957F\u8FB9\u50CF\u7D20\u4E0A\u9650\uFF0C\u7F3A\u7701 1600\uFF08320\u20134096\uFF09" },
        scale: { type: "number", description: "\u500D\u7387\u4E0A\u9650\uFF0C\u7F3A\u7701 2\uFF080.5\u20134\uFF09" },
        background: { type: "string", description: "\u753B\u5E45\u5E95\u8272\uFF0C\u7F3A\u7701 #ffffff\uFF1Btransparent/none = \u900F\u660E" },
        saveTo: { type: "string", description: "\u53EF\u9009\uFF1A\u628A\u8FD9\u5F20 PNG \u53E6\u5B58\u5230\u5DE5\u4F5C\u533A\u76F8\u5BF9\u8DEF\u5F84\uFF08\u7236\u76EE\u5F55\u81EA\u52A8\u5EFA\uFF09" }
      },
      required: ["path"]
    },
    run: opScreenshotDoc
  },
  {
    name: "export_doc",
    description: "\u5BFC\u51FA**\u5DE5\u7A0B\u5305**\u5230\u5DE5\u4F5C\u533A\u76EE\u5F55\uFF08\u591A\u6587\u4EF6\u4EA7\u7269\uFF0C\u975E\u5355\u6587\u4EF6\uFF09\uFF1A\u6E90\u6863\u526F\u672C + \u9010\u753B\u677F PNG\uFF08\u53EF\u9009 SVG\uFF09+ " + "\u5916\u94FE\u4F4D\u56FE assets/ + index.html \u4EA4\u4E92\u539F\u578B\uFF08\u5916\u94FE assets/\uFF0C\u975E dataURL \u5185\u8054\uFF09+ manifest.json\u3002" + "\u7F3A\u7701\u76EE\u5F55 `<\u6863\u540D>-export/`\uFF08dir \u53EF\u6539\uFF09\uFF1B\u7F3A\u7701\u683C\u5F0F png,html,source\uFF08format \u6570\u7EC4\u53EF\u542B svg\uFF09\u3002" + "\u8FD4\u56DE\u5168\u90E8\u9759\u6001\u6587\u4EF6\u7684\u5DE5\u4F5C\u533A\u76F8\u5BF9\u8DEF\u5F84\u6E05\u5355\u2014\u2014\u4EA4\u4ED8/\u5C55\u793A\u65F6\u636E\u6B64\u5F15\u7528\u3002index.html \u6D4F\u89C8\u5668\u6253\u5F00\u5373\u53EF\u70B9\u539F\u578B\u3002" + "\u26A0\uFE0F \u4F1A\u5411\u5DE5\u4F5C\u533A\u5199\u6587\u4EF6\uFF08\u4E0D\u5F39\u5BA1\u6279\u7684 write \u901A\u9053\u4E4B\u5916\uFF09\uFF1B\u4EA7\u7269\u76EE\u5F55\u82E5\u5DF2\u5B58\u5728\u4F1A\u88AB\u8986\u76D6\u540C\u540D\u6587\u4EF6\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        page: { type: "string", description: "\u9875\u9762 id \u6216\u540D\u79F0\uFF08\u7F3A\u7701\u5F53\u524D\u6D3B\u8DC3\u9875\uFF1B\u5305\u6309\u6B64\u9875\u7684\u753B\u677F\u5BFC\u51FA\uFF09" },
        ids: { type: "array", items: { type: "string" }, description: "\u53EA\u5BFC\u8FD9\u4E9B\u9876\u5C42\u8282\u70B9\uFF08\u7F3A\u7701 = \u9875\u9762\u5168\u90E8\u53EF\u89C1\u9876\u5C42\u8282\u70B9\uFF09" },
        dir: { type: "string", description: "\u5305\u76EE\u5F55\uFF08\u5DE5\u4F5C\u533A\u76F8\u5BF9\uFF09\uFF0C\u7F3A\u7701 `<\u6863\u540D>-export`" },
        format: {
          type: "array",
          items: { type: "string", enum: ["png", "svg", "html", "source", "code"] },
          description: "\u8981\u4EA7\u51FA\u7684\u6587\u4EF6\u7C7B\u578B\uFF0C\u7F3A\u7701 [png,html,source]\uFF1Bcode = \u6BCF\u753B\u677F\u4E00\u4EFD CSS \u6807\u6CE8\uFF08Dev Mode\uFF09\uFF1Bmanifest/\u6E90\u6863\u6052\u542B"
        },
        maxDim: { type: "number", description: "PNG \u6700\u957F\u8FB9\u50CF\u7D20\u4E0A\u9650\uFF0C\u7F3A\u7701 4096\uFF08\u6587\u4EF6\u4E0D\u53D7\u5185\u8054 2MiB \u7EA6\u675F\uFF09" },
        scale: { type: "number", description: "PNG \u500D\u7387\u4E0A\u9650\uFF0C\u7F3A\u7701 2\uFF080.5\u20138\uFF09" },
        background: { type: "string", description: "PNG/SVG \u753B\u5E45\u5E95\u8272\uFF1B\u7F3A\u7701\u900F\u660E\uFF08\u753B\u677F\u81EA\u7ED8\u5E95\uFF09\uFF1B\u7ED9\u8272\u503C\u5219\u94FA\u5E95" }
      },
      required: ["path"]
    },
    run: opExportDoc
  },
  {
    name: "list_icons",
    description: "\u641C\u7D22\u5185\u7F6E lucide \u56FE\u6807\u540D\uFF081848 \u4E2A\uFF0Cicon \u8282\u70B9\u7684 icon \u5B57\u6BB5\u53D6\u503C\uFF09\uFF1Aquery \u524D\u7F00/\u5B50\u4E32\u5339\u914D\u5E76\u6298\u7B97\u522B\u540D" + "\uFF08home\u2192house\uFF09\u3002add_nodes/ update_nodes \u7684 icon \u5B57\u6BB5\u5FC5\u987B\u662F\u8FD9\u91CC\u7684\u540D\u5B57\uFF0C\u672A\u77E5\u540D\u5B57\u4F1A\u753B\u5360\u4F4D\u3002",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "\u5173\u952E\u8BCD\uFF0C\u5982 home / cart / arrow-left / user\uFF1B\u7701\u7565\u8FD4\u56DE\u5B57\u6BCD\u5E8F\u524D 40 \u4E2A" },
        limit: { type: "number", description: "\u8FD4\u56DE\u6570\u91CF\u4E0A\u9650\uFF0C\u7F3A\u7701 40\uFF0C\u6700\u5927 100" }
      }
    },
    run: opListIcons
  },
  {
    name: "apply_layout",
    description: "\u5BF9\u753B\u677F\u91CD\u6392**\u81EA\u52A8\u5E03\u5C40**\uFF1A\u6309 frame \u7684 layout \u5B57\u6BB5\uFF08mode/gap/padding/main/cross\uFF09\u4E0E\u5B50\u8282\u70B9 grow \u91CD\u65B0\u8BA1\u7B97" + "\u5168\u90E8\u5B50\u8282\u70B9\u4F4D\u7F6E\u5C3A\u5BF8\uFF08\u542B\u5D4C\u5957\u5E03\u5C40\u753B\u677F\u4E0E\u7956\u5148\u94FE\uFF09\u3002\u6539\u7ED3\u6784\u540E\u60F3\u5F3A\u5236\u91CD\u6392\u3001\u6216\u624B\u52A8\u632A\u8FC7\u5B50\u9879\u540E\u6062\u590D\u6392\u5E03\u65F6\u7528\u3002" + "\u7ED9 id \u53EA\u6392\u90A3\u4E00\u5757\uFF1B\u7701\u7565 = \u91CD\u6392\u5F53\u524D\u9875\u6240\u6709\u5E03\u5C40\u753B\u677F\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        id: { type: "string", description: "\u753B\u677F id\uFF08\u987B\u662F frame\uFF09\uFF1B\u7F3A\u7701\u91CD\u6392\u5F53\u524D\u9875\u5168\u90E8\u5E03\u5C40\u753B\u677F" },
        page: { type: "string", description: "\u9875\u9762 id \u6216\u540D\u79F0\uFF08\u7F3A\u7701\u5F53\u524D\u6D3B\u8DC3\u9875\uFF09" }
      },
      required: ["path"]
    },
    run: opApplyLayout
  },
  {
    name: "run_design_script",
    description: "\u7528\u4E00\u6BB5 JS \u6279\u91CF\u5EFA/\u6539\u8282\u70B9\u2014\u2014**\u91CD\u590D\u7ED3\u6784\uFF08\u5217\u8868\u884C\u3001\u5361\u7247\u7F51\u683C\u3001\u5BFC\u822A\u9879\u3001\u8868\u683C\u884C\uFF09\u9996\u9009\u8FD9\u4E2A**\uFF0C" + `\u800C\u4E0D\u662F\u624B\u5199 N \u6BB5\u51E0\u4E4E\u4E00\u6837\u7684 JSON\u3002\u652F\u6301 for/while/map/\u6A21\u677F\u5B57\u7B26\u4E32/\u7B97\u672F\uFF0C\u51E0\u5341\u4E2A\u8282\u70B9\u4E00\u6B21\u6210\u578B\u3002
` + `\u811A\u672C\u91CC\u53EA\u6709\u4E09\u4E2A\u8BB0\u5F55\u5668\uFF0C\u5B83\u4EEC\u4E0D\u76F4\u63A5\u6539\u6587\u6863\uFF0C\u53EA\u5F80\u64CD\u4F5C\u5F55\u91CC\u8FFD\u52A0\uFF0C\u6267\u884C\u5B8C\u7531\u672C\u5DE5\u5177\u7EDF\u4E00\u843D\u76D8\uFF1A
` + `  I(parentId, spec) \u2014\u2014 \u5EFA\u8282\u70B9\uFF0Cspec \u4E0E add_nodes \u7684\u8282\u70B9\u89C4\u683C**\u5B8C\u5168\u540C\u6784**\uFF1B\u8FD4\u56DE\u65B0 id\uFF08\u53EF\u7EE7\u7EED\u5F53 parent \u4F20\u7ED9\u4E0B\u4E00\u6B21 I\uFF09
` + `  U(nodeId, patch)  \u2014\u2014 \u6539\u5B57\u6BB5\uFF0Cpatch \u4E0E update_nodes \u7684\u4E00\u81F4\uFF08\u4E5F\u652F\u6301 "\u5B9E\u4F8Bid/\u5185\u90E8id" \u5BFB\u5740\uFF09
` + `  log(...)          \u2014\u2014 \u628A\u4E2D\u95F4\u91CF\u6536\u8FDB\u8FD4\u56DE\u503C\uFF0C\u65B9\u4FBF\u4F60\u56DE\u8BFB
` + `\u811A\u672C\u53EF\u4EE5 return\uFF0C\u6700\u7EC8\u539F\u6837\u51FA\u73B0\u5728\u8FD4\u56DE\u503C\u7684 result \u91CC\u3002
` + `\u793A\u4F8B\uFF08\u753B 12 \u884C\u8BBE\u7F6E\u5217\u8868\uFF09\uFF1A
` + `  const items = ["\u84DD\u7259","Wi-Fi","\u8702\u7A9D\u7F51\u7EDC"];
` + `  for (let i = 0; i < items.length; i++) {
` + '    const row = I("\u753B\u677Fid", { type:"frame", name:`\u884C${i}`, y:160+i*56, h:48 });\n' + `    I(row, { type:"text", text: items[i], w: 300 });
` + `  }
` + "\u7EA6\u675F\uFF1A\u811A\u672C\u5728\u72EC\u7ACB worker \u91CC\u8DD1\uFF0C\u786C\u8D85\u65F6\u9ED8\u8BA4 5 \u79D2\uFF08timeoutMs \u53EF\u8C03\u5230 30000\uFF09\uFF0C\u6B7B\u5FAA\u73AF\u4F1A\u88AB\u5F3A\u5236\u4E2D\u65AD\uFF1B" + "\u5355\u6B21\u6700\u591A 2000 \u4E2A\u64CD\u4F5C\uFF1Brequire/process/fetch/Buffer \u662F\u629B\u9519\u6869\uFF0C\u811A\u672C\u53EA\u505A\u7EAF\u8BA1\u7B97\u3002" + "\uFF08\u4E00\u6B21\u8C03\u7528 = \u4E00\u6B21\u539F\u5B50\u843D\u76D8\uFF0C\u4E2D\u9014\u51FA\u9519\u4E0D\u4F1A\u5199\u534A\u622A\uFF1B\u4EA7\u7269\u4E0E\u76F4\u63A5\u8C03 add_nodes/update_nodes \u540C\u6784\u3002\uFF09",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        page: { type: "string", description: "\u9875\u9762 id \u6216\u540D\u79F0\uFF08\u7F3A\u7701\u5F53\u524D\u6D3B\u8DC3\u9875\uFF09\u2014\u2014\u7701\u7565 parent \u65F6\u8282\u70B9\u52A0\u5728\u8FD9\u4E00\u9875\u9876\u5C42" },
        script: { type: "string", description: "JS \u6E90\u7801\u3002\u53EF\u7528 I()/U()/log()\uFF0C\u53EF return\uFF1B\u652F\u6301\u5FAA\u73AF\u4E0E\u6A21\u677F\u5B57\u7B26\u4E32" },
        timeoutMs: { type: "number", description: "\u786C\u8D85\u65F6\u6BEB\u79D2\uFF0C\u7F3A\u7701 5000\uFF08500\u201330000\uFF09" },
        reflow: { type: "boolean", description: "\u9ED8\u8BA4 true\uFF1A\u843D\u76D8\u524D\u5BF9\u6D89\u53CA\u7684\u81EA\u52A8\u5E03\u5C40\u753B\u677F\u91CD\u6392" }
      },
      required: ["path", "script"]
    },
    run: opRunDesignScript
  },
  {
    name: "lint_doc",
    description: `\u8BBE\u8BA1\u4F53\u68C0\uFF1A\u626B\u5168\u6863\uFF08\u6216\u6307\u5B9A\u9875/\u753B\u677F\uFF09\u8FD4\u56DE**\u53EF\u9A8C\u8BC1\u7684\u95EE\u9898\u6E05\u5355**\uFF0C\u6BCF\u6761\u5E26 nodeId / code / message / suggestion\u3002
` + `\u8FD9\u662F\u7ED9\u751F\u6210\u7A3F\u6536\u5C3E\u7528\u7684\u5224\u636E\u2014\u2014skills \u91CC\u7684\u89C4\u8303\u662F\u5EFA\u8BAE\uFF0C\u8FD9\u91CC\u662F\u80FD\u8DD1\u7684\u68C0\u67E5\u3002\u6539\u5B8C\u7A3F\u8DD1\u4E00\u6B21\uFF0C\u6309 suggestion \u6539\u5230\u5E72\u51C0\u3002
` + "12 \u6761\u89C4\u5219\uFF1Atext-contrast\uFF08\u6587\u5B57\u5BF9\u6BD4\u5EA6\uFF0CWCAG AA\uFF09\u3001dangling-var\uFF08\u53D8\u91CF\u5F15\u7528\u672A\u5B9A\u4E49\uFF09\u3001tap-target-small\uFF08\u89E6\u63A7\u533A <44\uFF09\u3001" + "overflow-clipped\uFF08\u5185\u5BB9\u88AB\u753B\u677F\u88C1\u6389\uFF09\u3001nesting-depth\uFF08\u5D4C\u5957\u8FC7\u6DF1\uFF09\u3001mixed-sibling-radius\uFF08\u540C\u5C3A\u5BF8\u5144\u5F1F\u5706\u89D2\u4E0D\u4E00\u81F4\uFF09\u3001" + "slop-three-card-row\uFF08AI \u4E09\u5361\u529F\u80FD\u533A\uFF09\u3001slop-rounded-card-wall\uFF08\u6EE1\u5C4F\u5706\u89D2\u5361\u7247\uFF09\u3001slop-purple-glow\uFF08\u7D2B\u6E10\u53D8+\u5927\u5149\u6655\uFF09\u3001" + `unknown-icon\uFF08\u56FE\u6807\u540D\u975E\u6CD5\uFF09\u3001empty-container\uFF08\u7A7A\u5BB9\u5668\uFF09\u3001layout-drift\uFF08\u81EA\u52A8\u5E03\u5C40\u91CC\u624B\u52A8\u632A\u8FC7\u5B50\u9879\uFF09\u3002
` + `\u53EA\u62A5\u4E0D\u4FEE\uFF08\u4E0D\u4F1A\u81EA\u52A8\u6539\u4F60\u7684\u7A3F\u5B50\uFF09\u3002\u5B9E\u4F8B\u5185\u90E8\u8282\u70B9\u4E00\u5E76\u4F53\u68C0\uFF0CnodeId \u5F62\u5982 "\u5B9E\u4F8Bid/\u5185\u90E8id"\uFF0C\u53EF\u76F4\u63A5\u5582\u7ED9 update_nodes\u3002
` + "usage\uFF1A\u5168\u6863\u626B\u4E00\u904D\u770B counts\uFF1B\u6539\u67D0\u4E00\u5904\u65F6\u7ED9 ids \u53EA\u770B\u90A3\u5757\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        page: { type: "string", description: "\u53EA\u4F53\u68C0\u67D0\u4E00\u9875\uFF08\u9875 id \u6216\u540D\u79F0\uFF09\uFF1B\u7701\u7565 = \u5168\u90E8\u9875" },
        ids: { type: "array", items: { type: "string" }, description: "\u53EA\u4F53\u68C0\u8FD9\u4E9B\u9876\u5C42\u8282\u70B9\uFF08\u5B50\u6811\u6574\u4F53\u7EB3\u5165\uFF09" },
        severity: { type: "string", enum: ["error", "warning", "info"], description: "\u4FDD\u7559\u5230\u54EA\u4E00\u7EA7\uFF1Awarning = \u53EA\u770B error+warning\uFF08\u9ED8\u8BA4\u5168\u7ED9\uFF09" },
        codes: { type: "array", items: { type: "string" }, description: `\u89C4\u5219\u767D\u540D\u5355\uFF0C\u5982 ["text-contrast"]\uFF1B\u53EF\u7528\uFF1A${LINT_CODES.join(" / ")}` }
      },
      required: ["path"]
    },
    run: opLintDoc
  },
  {
    name: "boolean_nodes",
    description: "\u5E03\u5C14\u8FD0\u7B97\uFF1A\u628A 2+ \u4E2A**\u540C\u5BB9\u5668\u540C\u5C42**\u7684\u5F62\u72B6\u5408\u5E76\u6210\u4E00\u4E2A\u65B0\u7684 vector \u77E2\u91CF\u8282\u70B9\u3002" + "operation\uFF1Aunion \u5E76\u96C6\uFF08\u522B\u540D merge/add\uFF09\u3001subtract \u51CF\u53BB\uFF08\u7B2C\u4E00\u4E2A\u8282\u70B9\u51CF\u5176\u4F59\uFF0C\u522B\u540D minus\uFF09\u3001" + "intersect \u4EA4\u96C6\u3001exclude \u6392\u9664\uFF08\u522B\u540D xor\uFF09\u3002\u652F\u6301 rect/ellipse/\u4E09\u89D2/\u83F1\u5F62/\u4E94\u8FB9/\u516D\u8FB9/\u661F\u5F62/vector\uFF1B" + "\u7ED3\u679C\u70E4\u5E73\u4E3A\u8DEF\u5F84\uFF08\u542B\u7B2C\u4E00\u4E2A\u8282\u70B9\u7684\u586B\u5145\u63CF\u8FB9\uFF09\uFF0C\u4E0D\u518D\u968F\u539F\u5F62\u72B6\u8054\u52A8\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        ids: { type: "array", items: { type: "string" }, description: "\u53C2\u4E0E\u8FD0\u7B97\u7684\u8282\u70B9 id\uFF08\u22652\uFF0C\u540C\u5BB9\u5668\u540C\u5C42\uFF1Bsubtract \u65F6\u7B2C\u4E00\u4E2A\u4E3A\u88AB\u4FDD\u7559\u7684\u5E95\u5F62\uFF09" },
        operation: { type: "string", enum: ["union", "subtract", "intersect", "exclude"], description: "\u7F3A\u7701 union" },
        name: { type: "string", description: "\u7ED3\u679C\u56FE\u5C42\u540D\uFF08\u7F3A\u7701\u6309\u8FD0\u7B97\u547D\u540D\uFF09" },
        page: { type: "string", description: "\u9875\u9762 id \u6216\u540D\u79F0\uFF08\u7F3A\u7701\u5F53\u524D\u6D3B\u8DC3\u9875\uFF09" }
      },
      required: ["path", "ids"]
    },
    run: opBooleanNodes
  },
  {
    name: "list_components",
    description: "\u5217\u51FA\u8BBE\u8BA1\u6863\u7684\u7EC4\u4EF6\u4E3B\u6863\uFF08doc.components \u8D44\u4EA7\u8868\uFF09\uFF1Aid/\u540D\u5B57/\u5185\u90E8\u8282\u70B9 id \u5217\u8868/\u5305\u56F4\u76D2/\u5B9E\u4F8B\u6570\u3002" + '\u914D\u5408 add_nodes \u7684 instance \u8282\u70B9\u4E0E update_nodes \u7684 "\u5B9E\u4F8Bid/\u5185\u90E8id" \u5BFB\u5740\u4F7F\u7528\u3002',
    inputSchema: {
      type: "object",
      properties: { path: PATH_SCHEMA },
      required: ["path"]
    },
    run: opListComponents
  },
  {
    name: "create_component",
    description: "\u628A 1+ \u4E2A**\u540C\u5BB9\u5668\u540C\u5C42**\u7684\u73B0\u6709\u8282\u70B9\u8F6C\u6210\u7EC4\u4EF6\uFF1A\u8282\u70B9\u6574\u4F53\u79FB\u5165\u4E3B\u6863\u8D44\u4EA7\u8868\uFF08\u4FDD\u7559\u539F id \u4F9B\u8986\u76D6\u5BFB\u5740\uFF09\uFF0C" + "\u539F\u4F4D\u66FF\u6362\u4E3A\u4E00\u4E2A 1:1 \u5B9E\u4F8B\u3002\u4E4B\u540E\u6539\u6240\u6709\u5B9E\u4F8B\u7684\u5171\u540C\u5916\u89C2\u5C31 patch_master\uFF0C\u6539\u67D0\u4E2A\u5B9E\u4F8B\u7684\u6587\u6848/\u989C\u8272\u7528 " + 'update_nodes \u7684 "\u5B9E\u4F8Bid/\u5185\u90E8id" \u8DEF\u5F84\uFF08\u81EA\u52A8\u5B58\u4E3A\u8986\u76D6\uFF09\u3002',
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        ids: { type: "array", items: { type: "string" }, description: "\u653E\u8FDB\u7EC4\u4EF6\u7684\u8282\u70B9 id\uFF08\u22651\uFF0C\u540C\u5BB9\u5668\u540C\u5C42\uFF1B\u4E0D\u80FD\u662F\u5B9E\u4F8B\u5185\u90E8\uFF09" },
        name: { type: "string", description: "\u7EC4\u4EF6\u540D\uFF08\u7F3A\u7701\u53D6\u7B2C\u4E00\u4E2A\u8282\u70B9\u540D\uFF09" },
        instanceId: { type: "string", description: "\u53EF\u9009\uFF1A\u663E\u5F0F\u6307\u5B9A\u539F\u4F4D\u5B9E\u4F8B id" }
      },
      required: ["path", "ids"]
    },
    run: opCreateComponent
  },
  {
    name: "edit_component",
    description: "\u7EC4\u4EF6\u4E0E\u5B9E\u4F8B\u7684\u64CD\u4F5C\u96C6\u3002action \u4E94\u9009\u4E00\u4E4B\u5916\u8FD8\u9700\uFF1A" + "insert = \u4ECE\u4E3B\u6863\u518D\u63D2\u4E00\u4E2A\u5B9E\u4F8B\u5230\u9875\u9762\uFF08componentId\uFF1Bx/y \u7701\u7565\u81EA\u52A8\u843D\u4F4D\uFF09\uFF1B" + "detach = \u5206\u79BB\u5B9E\u4F8B\u4E3A\u666E\u901A\u56FE\u5C42\uFF08nodeId\uFF0C\u5D4C\u5957\u5B9E\u4F8B\u4E00\u5E76\u70D8\u7119\uFF09\uFF1B" + "reset_overrides = \u6E05\u9664\u5B9E\u4F8B\u5168\u90E8\u8986\u76D6\u56DE\u5230\u4E3B\u6863\u539F\u6837\uFF08nodeId\uFF09\uFF1B" + "patch_master = \u6539\u4E3B\u6863\u8282\u70B9\u3001\u5168\u90E8\u5B9E\u4F8B\u5B9E\u65F6\u8054\u52A8\uFF08componentId + nodeId + \u8981\u6539\u7684\u5B57\u6BB5\uFF0C\u5B57\u6BB5\u662F\u4E3B\u6863\u539F\u59CB\u5750\u6807\uFF09\uFF1B" + "rename / remove\uFF08remove \u5E26 detach:true \u65F6\u628A\u5F15\u7528\u5B9E\u4F8B\u5148\u70D8\u7119\uFF0C\u907F\u514D\u7559\u5360\u4F4D\u6846\uFF09\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        action: { type: "string", enum: ["insert", "detach", "reset_overrides", "patch_master", "rename", "remove"] },
        componentId: { type: "string" },
        nodeId: { type: "string", description: "detach/reset_overrides=\u9876\u5C42\u5B9E\u4F8B id\uFF1Bpatch_master=\u4E3B\u6863\u5185\u8282\u70B9 id" },
        name: { type: "string" },
        page: { type: "string", description: "insert\uFF1A\u76EE\u6807\u9875 id/\u540D\u79F0\uFF08\u7F3A\u7701\u6D3B\u8DC3\u9875\uFF09" },
        x: { type: "number", description: "insert\uFF1A\u663E\u5F0F\u843D\u4F4D" },
        y: { type: "number" },
        detach: { type: "boolean", description: "remove\uFF1Atrue = \u5F15\u7528\u5B9E\u4F8B\u70D8\u7119\u4E3A\u9759\u6001\u56FE\u5C42" },
        instanceId: { type: "string", description: "insert\uFF1A\u663E\u5F0F\u5B9E\u4F8B id" }
      },
      required: ["path", "action"]
    },
    run: opEditComponent
  },
  {
    name: "import_doc",
    description: "\u628A\u53E6\u4E00\u4EFD *.uidesign.json \u5E76\u5165\u76EE\u6807\u6863\uFF1A\u9875\u9762\u8FFD\u52A0\u5230\u76EE\u6807\u6863\u5C3E\u90E8\uFF08pageNames \u53EF\u6309\u9875 id/\u540D\u79F0\u6311\u5B50\u96C6\uFF09\uFF0C" + "\u7EC4\u4EF6\u8868\u4E00\u5E76\u5408\u5165\uFF1B\u5168\u90E8 id \u91CD\u53D1\u3001\u5B9E\u4F8B componentId \u4E0E\u8986\u76D6 key \u5F15\u7528\u540C\u6B65\u91CD\u6620\u5C04\u2014\u2014\u9762\u677F\u300C\u5BFC\u5165\u8BBE\u8BA1\u6863\u300D\u540C\u6B3E\u8BED\u4E49\u3002" + "activePage \u4E0D\u53D8\uFF1B\u9762\u677F\u7EA6\u534A\u79D2\u5185\u8F6E\u8BE2\u5230\u5E76\u81EA\u52A8\u5237\u65B0\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        from: { type: "string", description: "\u6765\u6E90\u8BBE\u8BA1\u6863\u8DEF\u5F84\uFF08*.uidesign.json\uFF1B\u7EDD\u5BF9\u6216\u76F8\u5BF9\u5DE5\u4F5C\u533A\uFF09" },
        pageNames: { type: "array", items: { type: "string" }, description: "\u53EA\u5BFC\u5165\u6765\u6E90\u6863\u8FD9\u4E9B\u9875\uFF08id \u6216\u540D\u79F0\uFF09\uFF1B\u7701\u7565 = \u5168\u90E8" }
      },
      required: ["path", "from"]
    },
    run: opImportDoc
  },
  {
    name: "list_stencils",
    description: "\u7D20\u6750\u5E93\u76D8\u70B9/\u68C0\u7D22\uFF1A\u5185\u7F6E\u7684\u73B0\u6210\u56FE\u5F62\u4E0E\u90E8\u4EF6\uFF08\u6309\u94AE/\u6807\u7B7E/\u5360\u4F4D\u7B26/\u94FE\u63A5\u533A\u57DF/\u8868\u683C/\u6EDA\u52A8\u9762\u677F/\u5206\u5272\u7EBF\u3001\u80F6\u56CA/\u591A\u8FB9\u5F62/\u6C14\u6CE1\u6846/\u6CE2\u6D6A\u3001" + "\u6D41\u7A0B\u56FE\u5168\u5957\uFF08\u6D41\u7A0B/\u5224\u5B9A/\u5F00\u59CB\u7ED3\u675F/\u6587\u6863/\u6570\u636E/\u5B50\u6D41\u7A0B\uFF09\u3001\u56FE\u8868\uFF08\u997C\u56FE/\u73AF\u5F62\u56FE/\u8FDB\u5EA6\u5706\u73AF/\u67F1\u72B6\u56FE/\u9762\u79EF\u56FE/\u96F7\u8FBE\u56FE\uFF09\u3001" + '\u754C\u9762\u4EF6\uFF08\u72B6\u6001\u680F/\u5BFC\u822A\u680F/\u6807\u7B7E\u680F/\u641C\u7D22\u6846/\u5217\u8868\u9879/\u5361\u7247\uFF09\uFF09\u3002query \u652F\u6301\u4E2D\u82F1\u6587\uFF08"\u6309\u94AE"/"button"\uFF09\uFF0Ccategory \u53EF\u9009\u3002',
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "\u68C0\u7D22\u8BCD\uFF08id/\u540D\u79F0/\u5173\u952E\u8BCD/\u5206\u7C7B\uFF0C\u4E2D\u82F1\u6587\u7686\u53EF\uFF09\uFF1B\u7701\u7565 = \u5217\u5168\u90E8" },
        category: { type: "string", enum: [...STENCIL_CATEGORIES], description: "\u53EA\u8981\u67D0\u4E00\u7C7B" }
      }
    },
    run: opListStencils
  },
  {
    name: "insert_stencil",
    description: "\u628A\u4E00\u4E2A\u5185\u7F6E\u7D20\u6750\u843D\u5230\u753B\u677F\uFF08\u4E00\u6B21\u8C03\u7528\u4EA7\u51FA\u6574\u68F5\u5B50\u6811\uFF0C\u542B\u5D4C\u5957\u5B50\u8282\u70B9\uFF09\u3002w/h \u6309**\u7B49\u6BD4**\u7F29\u653E\u5230\u76EE\u6807\u6846\u5185\u5E76\u5C45\u4E2D\uFF08\u4E0D\u62C9\u4F38\uFF0C\u56FE\u8868/\u56FE\u6807\u4E0D\u4F1A\u53D8\u5F62\uFF09\uFF1B" + "\u7701\u7565 w/h = \u7528\u7D20\u6750\u6807\u79F0\u5C3A\u5BF8\u3002\u843D\u70B9\u662F\u753B\u677F\u5C40\u90E8\u5750\u6807\uFF08\u4E0E add_nodes \u540C\u53E3\u5F84\uFF09\u3002\u7D20\u6750\u5C31\u662F\u666E\u901A\u8282\u70B9\uFF0C\u843D\u76D8\u540E\u7167\u5E38 update_nodes \u6539\u8272\u6539\u5B57\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        stencil: { type: "string", description: "\u7D20\u6750 id\uFF08list_stencils \u67E5\uFF1B\u540D\u79F0/\u5173\u952E\u8BCD\u5199\u9519\u4F1A\u7ED9\u51FA\u8FD1\u4F3C\u5019\u9009\uFF09" },
        parent: { type: "string", description: "\u7236\u753B\u677F/\u5BB9\u5668 id\uFF08\u7701\u7565 = \u9875\u9762\u9876\u5C42\uFF0C\u5750\u6807\u4E3A\u753B\u5E03\u7EDD\u5BF9\u5750\u6807\uFF09" },
        page: { type: "string", description: "\u9875\u9762 id \u6216\u540D\u79F0\uFF08\u7F3A\u7701\u6D3B\u8DC3\u9875\uFF1B\u4EC5 parent \u7701\u7565\u65F6\u751F\u6548\uFF09" },
        x: { type: "number", description: "\u76EE\u6807\u6846\u5DE6\u4E0A\u89D2 x\uFF08\u7236\u5BB9\u5668\u5C40\u90E8\u5750\u6807\uFF0C\u7F3A\u7701 0\uFF09" },
        y: { type: "number", description: "\u76EE\u6807\u6846\u5DE6\u4E0A\u89D2 y\uFF08\u7F3A\u7701 0\uFF09" },
        w: { type: "number", description: "\u76EE\u6807\u6846\u5BBD\uFF08\u7B49\u6BD4\u7F29\u653E\u5230\u6846\u5185\uFF1B\u7701\u7565 = \u7D20\u6750\u6807\u79F0\u5BBD\uFF09" },
        h: { type: "number", description: "\u76EE\u6807\u6846\u9AD8\uFF08\u7701\u7565 = \u7D20\u6750\u6807\u79F0\u9AD8\uFF09" }
      },
      required: ["path", "stencil"]
    },
    run: opInsertStencil
  },
  {
    name: "edit_interactions",
    description: "\u539F\u578B\u4EA4\u4E92\u589E\u5220\u6539\uFF08\u5355\u8282\u70B9\uFF0C\u539F\u5B50\u843D\u76D8\uFF09\uFF1Aop=set\uFF08\u6574\u8868\u66FF\u6362\uFF09/ add\uFF08\u8FFD\u52A0\uFF09/ remove\uFF08\u6309 index \u6216 trigger[+action] \u5220\uFF09/ clear\u3002" + "\u6BCF\u6761\u4EA4\u4E92 = { trigger, action, to?, position?, transition?, duration?, dismissOnTapOutside? }\u3002" + `trigger ${INTERACTION_TRIGGERS.join("/")}\uFF1Baction ${INTERACTION_ACTIONS.join("/")}\u3002` + "navigate/overlay \u7684 to \u5FC5\u987B\u6307\u5411**\u9876\u5C42\u753B\u677F**\uFF08\u505A\u5F39\u7A97/\u5E95\u90E8\u62BD\u5C49\uFF1A\u628A\u6D6E\u5C42\u5355\u72EC\u505A\u6210\u4E00\u5757\u753B\u677F\uFF0Coverlay + position:bottom\uFF09\uFF1B" + "back \u56DE\u4E0A\u4E00\u5C4F\u3001closeOverlay \u5173\u6700\u4E0A\u5C42\u6D6E\u5C42\uFF08\u4E0D\u9700\u8981 to\uFF09\uFF1BscrollTo/toggleVisible \u4F5C\u7528\u4E8E\u540C\u4E00\u753B\u677F\u5185\u8282\u70B9\u3002" + '\u7F3A\u7701\u8F6C\u573A\u6309 \u52A8\u4F5C+\u505C\u9760\u4F4D \u81EA\u52A8\u9009\uFF08\u8DF3\u8F6C\u5DE6\u63A8\u3001\u8FD4\u56DE\u53F3\u63A8\u3001\u5C45\u4E2D\u6D6E\u5C42\u7F29\u653E\u3001\u5E95\u90E8\u62BD\u5C49\u4E0A\u6ED1\uFF09\uFF0C\u5199 transition:"none" \u53EF\u5173\u3002' + "\u8FD4\u56DE\u91CC\u5E26 problems \u5217\u8868 = \u76EE\u6807\u4E0D\u53EF\u89E3\u6790\u7684\u4EA4\u4E92\uFF08\u9884\u89C8\u91CC\u70B9\u4E86\u6CA1\u53CD\u5E94\uFF09\uFF0C\u6309 reason \u4FEE\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        node: { type: "string", description: '\u8282\u70B9 id\uFF08read_doc \u62FF\uFF09\uFF1B\u4E5F\u652F\u6301\u5B9E\u4F8B\u5185\u90E8 "\u5B9E\u4F8Bid/\u5185\u90E8id"' },
        op: { type: "string", enum: ["set", "add", "remove", "clear"], description: "set \u6574\u8868\u66FF\u6362 / add \u8FFD\u52A0 / remove \u5220\u9664 / clear \u6E05\u7A7A\uFF08\u7F3A\u7701 set\uFF09" },
        list: {
          type: "array",
          description: "set / add \u7684\u4EA4\u4E92\u6570\u7EC4",
          items: {
            type: "object",
            properties: {
              trigger: { type: "string", enum: [...INTERACTION_TRIGGERS] },
              action: { type: "string", enum: [...INTERACTION_ACTIONS] },
              to: { type: "string", description: "\u76EE\u6807 id\uFF08navigate/overlay = \u9876\u5C42\u753B\u677F\uFF1BscrollTo/toggleVisible = \u540C\u753B\u677F\u5185\u8282\u70B9\uFF09" },
              position: { type: "string", enum: [...OVERLAY_POSITIONS], description: "overlay \u505C\u9760\u4F4D\uFF08\u7F3A\u7701 center\uFF09" },
              transition: { type: "string", enum: [...PROTOTYPE_TRANSITIONS] },
              duration: { type: "number", description: "\u8F6C\u573A\u65F6\u957F ms\uFF0840..2000\uFF09" },
              dismissOnTapOutside: { type: "boolean", description: "overlay\uFF1A\u70B9\u906E\u7F69\u5173\u95ED\uFF08\u7F3A\u7701 true\uFF09" }
            },
            required: ["trigger", "action"]
          }
        },
        index: { type: "number", description: "remove\uFF1A\u6309\u5E8F\u53F7\u5220\uFF080 \u8D77\uFF0Cread_doc \u7684 interactions \u987A\u5E8F\uFF09" },
        trigger: { type: "string", description: "remove\uFF1A\u6309\u89E6\u53D1\u5668\u5220\uFF08\u53EF\u914D action \u518D\u6536\u7A84\uFF09" },
        action: { type: "string", description: "remove\uFF1A\u914D\u5408 trigger \u6536\u7A84" }
      },
      required: ["path", "node"]
    },
    run: opEditInteractions
  },
  {
    name: "edit_variables",
    description: "\u5171\u4EAB\u989C\u8272\u53D8\u91CF\uFF08\u8BBE\u8BA1 token\uFF09\uFF1Alist \u76D8\u70B9\uFF08\u542B\u6BCF\u53D8\u91CF\u7684\u5F15\u7528\u6B21\u6570\uFF09/ set \u65B0\u5EFA\u6216\u66F4\u65B0\uFF08\u4E00\u6B21\u6539\u52A8\u5168\u7A3F\u8054\u52A8\u2014\u2014" + '\u6240\u6709\u7ED1\u5B9A "var:<id>" \u7684\u586B\u5145/\u63CF\u8FB9/\u6587\u5B57/\u56FE\u6807\u989C\u8272\u5B9E\u65F6\u6362\u8272\uFF09/ delete \u5220\u9664\uFF08\u9ED8\u8BA4\u5F15\u7528\u5C31\u5730\u53D8\u8B66\u793A\u7C89\uFF0C' + 'detach:true \u628A\u5F15\u7528\u70D8\u7119\u4E3A\u5F53\u524D\u8272\u503C\u540E\u5220\uFF09\u3002\u8282\u70B9\u4FA7\u7ED1\u5B9A\u8D70 update_nodes \u628A\u989C\u8272\u5B57\u6BB5\u5199\u6210 "var:<\u53D8\u91CFid>" \u5373\u53EF\uFF0C' + "\u753B\u5E03/\u5BFC\u51FA/CSS \u4E09\u7AEF\u4E00\u81F4\u89E3\u6790\u3002set \u6309 id \u66F4\u65B0\uFF1B\u65B0\u5EFA\u65F6 name \u4E0D\u5F97\u4E0E\u73B0\u6709\u91CD\u540D\uFF08\u4F1A\u81EA\u52A8\u52A0\u5E8F\u53F7\u53BB\u91CD\uFF09\u3002",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_SCHEMA,
        action: { type: "string", enum: ["list", "set", "delete"], description: "list \u76D8\u70B9 / set \u65B0\u5EFA\u6216\u66F4\u65B0 / delete \u5220\u9664" },
        id: { type: "string", description: "set\uFF1A\u8981\u66F4\u65B0\u7684\u53D8\u91CF id\uFF08\u7701\u7565\u5219\u65B0\u5EFA\uFF09\uFF1Bdelete\uFF1A\u8981\u5220\u7684\u53D8\u91CF id" },
        name: { type: "string", description: "set\uFF1A\u53D8\u91CF\u540D\uFF08\u226460 \u5B57\u7B26\uFF09" },
        value: { type: "string", description: 'set\uFF1A\u989C\u8272\u503C\uFF08hex/rgb()/\u8272\u540D\uFF1B\u4E5F\u53EF "var:<\u53E6\u4E00\u53D8\u91CFid>" \u94FE\u5F0F\u5F15\u7528\uFF09' },
        desc: { type: "string", description: "set\uFF1A\u53EF\u9009\u8BF4\u660E" },
        detach: { type: "boolean", description: "delete\uFF1Atrue = \u5148\u628A\u5168\u90E8\u5F15\u7528\u70D8\u7119\u4E3A\u53D8\u91CF\u5F53\u524D\u503C\u518D\u5220\uFF08\u4E0D\u7559\u574F\u5F15\u7528\uFF09" }
      },
      required: ["path", "action"]
    },
    run: opEditVariables
  }
];
var TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

// mcp/server.ts
var SERVER_NAME = "ui-design";
var SERVER_VERSION = "0.1.0";
var FALLBACK_PROTOCOL = "2025-06-18";
var KNOWN_PROTOCOLS = new Set([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
  "2024-10-07"
]);
var workspace = process.env.KOVA_WORKSPACE?.trim() || process.cwd();
var ctx = { workspace };
var log = (text) => {
  process.stderr.write(`[ui-design-mcp] ${text}
`);
};
var send = (msg) => {
  process.stdout.write(`${JSON.stringify(msg)}
`);
};
var reply = (id, result) => {
  send({ jsonrpc: "2.0", id, result });
};
var replyError = (id, code, message) => {
  send({ jsonrpc: "2.0", id, error: { code, message } });
};
function handle(message) {
  handleAsync(message).catch((err) => {
    const message2 = err instanceof Error ? err.message : String(err);
    log(`\u5904\u7406\u5931\u8D25\uFF1A${err instanceof Error ? err.stack ?? message2 : message2}`);
  });
}
async function handleAsync(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null)
    return;
  switch (method) {
    case "initialize": {
      const p = params ?? {};
      const requested = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      reply(id, {
        protocolVersion: KNOWN_PROTOCOLS.has(requested) ? requested : FALLBACK_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: "UI \u8BBE\u8BA1\u753B\u5E03\uFF08*.uidesign.json\uFF09\u63A7\u5236\u9762\uFF1A\u5148 list_docs / read_doc \u4E86\u89E3\u73B0\u72B6\u62FF id\uFF0C" + "\u518D\u7528 add_nodes / update_nodes / stack_nodes / align_nodes / group_nodes \u7B49\u7ED3\u6784\u5316\u4FEE\u6539\u3002" + `\u6539\u52A8\u76F4\u63A5\u843D\u76D8\uFF0C\u6253\u5F00\u7684\u9762\u677F\u7EA6\u534A\u79D2\u5185\u81EA\u52A8\u5237\u65B0\u3002
` + "\u91CD\u590D\u7ED3\u6784\uFF08\u5217\u8868\u884C/\u5361\u7247\u7F51\u683C/\u5BFC\u822A\u9879/\u8868\u683C\u884C\uFF09\u7528 run_design_script\uFF1A\u5199\u4E00\u6BB5 JS\uFF0C\u7528 " + `I(parentId, spec)/U(id, patch) \u8BB0\u5F55\u64CD\u4F5C\uFF0C\u652F\u6301\u5FAA\u73AF\u2014\u2014\u6BD4\u624B\u5199 N \u6BB5\u8FD1\u4F3C JSON \u7A33\u5F97\u591A\u3002
` + "\u6536\u5C3E\u95ED\u73AF\uFF1Alint_doc \u62FF\u5230\u5E26 nodeId \u4E0E suggestion \u7684\u95EE\u9898\u6E05\u5355\uFF08\u5BF9\u6BD4\u5EA6\u3001AI \u4E09\u5361\u5957\u8DEF\u3001\u6EE1\u5C4F\u5706\u89D2\u5361\u7247\u3001" + "\u7D2B\u6E10\u53D8\u5149\u6655\u3001\u89E6\u63A7\u533A\u8FC7\u5C0F\u3001\u5185\u5BB9\u88AB\u88C1\u2026\uFF09\u6539\u5230 error/warning \u5F52\u96F6\uFF0C\u518D\u7528 screenshot_doc \u628A\u753B\u5E03\u6E32\u6210 PNG " + "\u76F4\u63A5\u770B\u6548\u679C\u505A\u89C6\u89C9\u81EA\u68C0\uFF08\u975E\u5C4F\u5E55\u622A\u56FE\uFF0C\u622A\u7684\u662F\u6587\u6863\u5185\u5BB9\uFF1BsaveTo \u53EF\u987A\u5E26\u843D\u76D8\uFF09\u3002" + `lint \u7BA1\u300C\u6709\u6BDB\u75C5\u300D\uFF0C\u622A\u56FE\u7BA1\u300C\u4E0D\u597D\u770B\u300D\uFF0C\u4E24\u8005\u914D\u5957\u3002
` + "\u5B9A\u7A3F\u4EA4\u4ED8\u7528 export_doc \u5BFC\u51FA\u591A\u6587\u4EF6\u5DE5\u7A0B\u5305\uFF08\u6E90\u6863\u526F\u672C + \u9010\u753B\u677F PNG/SVG + \u5916\u94FE assets/ + " + "index.html \u539F\u578B + manifest.json\uFF09\uFF0C\u8FD4\u56DE\u5168\u90E8\u9759\u6001\u6587\u4EF6\u8DEF\u5F84\u6E05\u5355\u3002"
      });
      return;
    }
    case "ping":
      reply(id, {});
      return;
    case "tools/list":
      reply(id, {
        tools: TOOL_DEFS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
      });
      return;
    case "tools/call": {
      const p = params ?? {};
      const name = typeof p.name === "string" ? p.name : "";
      const tool = TOOL_DEFS.find((t) => t.name === name);
      if (!tool) {
        replyError(id, -32602, `\u672A\u77E5\u5DE5\u5177 "${name}"\uFF1B\u53EF\u7528\uFF1A${TOOL_DEFS.map((t) => t.name).join(", ")}`);
        return;
      }
      const args = p.arguments && typeof p.arguments === "object" && !Array.isArray(p.arguments) ? p.arguments : {};
      try {
        const payload = await tool.run(args, ctx);
        if (payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray(payload.mcpContent)) {
          reply(id, { content: payload.mcpContent });
          return;
        }
        reply(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply(id, { content: [{ type: "text", text: `\u9519\u8BEF\uFF1A${message}` }], isError: true });
      }
      return;
    }
    default:
      replyError(id, -32601, `Method not found: ${String(method)}`);
  }
}
var rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const text = line.trim();
  if (!text)
    return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    log("\u5FFD\u7565\u65E0\u6CD5\u89E3\u6790\u7684\u8F93\u5165\u884C");
    return;
  }
  if (!message || typeof message !== "object")
    return;
  handle(message);
});
rl.on("close", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
