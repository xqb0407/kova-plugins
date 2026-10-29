/**
 * 字符串提取与 IOC 分类。
 *
 * 两种编码：
 * - ascii：可打印 ASCII + 合法 UTF-8 多字节序列（中文等非英文串不会被切成乱码）；
 * - utf16le：ASCII 范围的 UTF-16 小端（Windows 二进制里的宽字符串常见）。
 *
 * 分类只是线索（URL / 域名 / IP / 路径 / 注册表 / 编码特征 / 可疑关键字），
 * 结论要回到具体偏移复核。
 */

export type StringHit = {
  offset: number;
  encoding: "ascii" | "utf16le";
  value: string;
  classes: string[];
};

export type ExtractOptions = {
  minLength: number;
  encoding: "ascii" | "utf16le" | "both";
  /** 只在文件 [offset, offset + size) 区间里找 */
  windowStart?: number;
  windowEnd?: number;
};

/** 解码一个可打印字符；不可打印返回 null。用于 ascii/UTF-8 混排扫描 */
function charAt(buf: Buffer, i: number): { ch: string; len: number } | null {
  const b = buf[i];
  if (b >= 0x20 && b <= 0x7e) return { ch: String.fromCharCode(b), len: 1 };
  if (b < 0x80) return null;
  // UTF-8 多字节
  let len = 0;
  let cp = 0;
  if (b >= 0xc2 && b <= 0xdf) {
    len = 2;
    cp = b & 0x1f;
  } else if (b >= 0xe0 && b <= 0xef) {
    len = 3;
    cp = b & 0x0f;
  } else if (b >= 0xf0 && b <= 0xf4) {
    len = 4;
    cp = b & 0x07;
  } else {
    return null;
  }
  if (i + len > buf.length) return null;
  for (let k = 1; k < len; k++) {
    const cb = buf[i + k];
    if ((cb & 0xc0) !== 0x80) return null;
    cp = (cp << 6) | (cb & 0x3f);
  }
  if (cp < 0x80) return null; // 过长编码
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return null; // 控制字符
  if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null; // 非法码位
  try {
    return { ch: String.fromCodePoint(cp), len };
  } catch {
    return null;
  }
}

const URL_RE = /^https?:\/\/[^\s"'<>]{4,}/i;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|cn|ru|gov|edu|info|biz|xyz|top|club|site|online|shop|app|dev|cloud|onion)$/i;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;
const WINPATH_RE = /^[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\?)*/;
const POSIXPATH_RE = /^\/(?:usr|etc|bin|sbin|tmp|var|opt|home|root|Library|System|private|Applications|proc|dev)\b/;
const REGISTRY_RE = /^(?:HKLM|HKCU|HKCR|HKU|HKEY_[A-Z_]+)\\/i;
const B64_RE = /^[A-Za-z0-9+/]{20,}={0,2}$/;
const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const PEM_RE = /^-----BEGIN [A-Z ]+-----/;
const FORMAT_RE = /%[-+ #0]*\d*(?:\.\d+)?(?:hh|h|ll|l|z|j|t)?[diouxXeEfgGaAcspSn]/;
const CMD_RE = /\b(?:cmd\.exe|powershell(?:\.exe)?|\/bin\/(?:ba|z)?sh|\bwget\b|\bcurl\b|chmod\s+\+x|base64\s+-d|nc\s+-[el])\b/i;
const SECRET_RE = /(?:password|passwd|pwd|secret|token|api[_-]?key|private[_-]?key|credential|access[_-]?key)/i;
const SUSPICIOUS_WORD_RE = /(?:ransom|encrypt|decrypt|inject|keylog|backdoor|rootkit|worm|payload|exploit|bypass|anti[-_ ]?debug|vmware|sandbox|virtualbox)/i;

function classify(value: string, classes: Set<string>): void {
  if (URL_RE.test(value)) classes.add("url");
  else if (DOMAIN_RE.test(value)) classes.add("domain");
  else if (EMAIL_RE.test(value)) classes.add("email");

  if (IPV4_RE.test(value)) {
    const parts = value.split(".").map(Number);
    if (parts.every((n) => n >= 0 && n <= 255)) classes.add("ipv4");
  }
  if (WINPATH_RE.test(value)) classes.add("winpath");
  if (POSIXPATH_RE.test(value)) classes.add("posixpath");
  if (REGISTRY_RE.test(value)) classes.add("registry");
  if (B64_RE.test(value) && value.length % 4 === 0) classes.add("base64?");
  if (JWT_RE.test(value)) classes.add("jwt");
  if (PEM_RE.test(value)) classes.add("pem");
  if (FORMAT_RE.test(value)) classes.add("format-string");
  if (CMD_RE.test(value)) classes.add("command");
  if (SECRET_RE.test(value)) classes.add("secret-keyword");
  if (SUSPICIOUS_WORD_RE.test(value)) classes.add("suspicious-keyword");
}

/** 提取字符串；返回全部命中（上限由调用方控制输出量） */
export function extractStrings(buf: Buffer, opts: ExtractOptions): StringHit[] {
  const hits: StringHit[] = [];
  const start = Math.max(0, opts.windowStart ?? 0);
  const end = Math.min(buf.length, opts.windowEnd ?? buf.length);
  if (end <= start) return hits;

  if (opts.encoding !== "utf16le") {
    let i = start;
    while (i < end) {
      const first = charAt(buf, i);
      if (!first) {
        i++;
        continue;
      }
      let text = first.ch;
      let bytes = first.len;
      let j = i + first.len;
      while (j < end) {
        const c = charAt(buf, j);
        if (!c) break;
        text += c.ch;
        bytes += c.len;
        j += c.len;
      }
      if (bytes >= opts.minLength) {
        const classes = new Set<string>();
        classify(text, classes);
        hits.push({ offset: i, encoding: "ascii", value: text, classes: [...classes] });
      }
      i = j > i ? j : i + 1;
    }
  }

  if (opts.encoding !== "ascii") {
    let i = start;
    while (i + 1 < end) {
      // UTF-16LE 的 ASCII 范围：低字节可打印、高字节为 0
      if (!(buf[i] >= 0x20 && buf[i] <= 0x7e && buf[i + 1] === 0)) {
        i += 2;
        continue;
      }
      const begin = i;
      let text = "";
      while (i + 1 < end && buf[i] >= 0x20 && buf[i] <= 0x7e && buf[i + 1] === 0) {
        text += String.fromCharCode(buf[i]);
        i += 2;
      }
      if (text.length >= opts.minLength) {
        const classes = new Set<string>();
        classify(text, classes);
        hits.push({ offset: begin, encoding: "utf16le", value: text, classes: [...classes] });
      }
    }
  }

  return hits;
}
