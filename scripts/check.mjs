#!/usr/bin/env node
/**
 * 零依赖自检：校验 marketplace.json 与各插件清单的一致性。
 * 只读，不联网。用法：node scripts/check.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const PANEL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PERMISSIONS = new Set(["document", "export", "agent", "notify"]);

let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  failed++;
  console.error(`  ✗ ${m}`);
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    bad(`${path}: JSON 解析失败（${err.message}）`);
    return null;
  }
}

function checkPlugin(entry, catalogDir) {
  console.log(`\nplugin: ${entry.name}`);
  if (!NAME_RE.test(entry.name ?? "")) bad(`名字不合法（需匹配 ${NAME_RE.source}）`);

  const source = typeof entry.source === "string" ? entry.source : entry.source?.path;
  if (!source) return bad("缺少 source");
  const dir = resolve(catalogDir, source);
  if (!dir.startsWith(catalogDir + sep) && dir !== catalogDir) return bad(`source 逃出仓库：${source}`);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return bad(`source 目录不存在：${source}`);

  const manifestPath = join(dir, ".kova-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return bad("缺少 .kova-plugin/plugin.json");
  const manifest = readJson(manifestPath);
  if (!manifest) return;

  if (manifest.name !== entry.name) bad(`清单 name（${manifest.name}）与市场条目名（${entry.name}）不一致`);
  if (manifest.name && manifest.name !== dir.split(sep).pop()) {
    bad(`清单 name（${manifest.name}）须与目录名（${dir.split(sep).pop()}）一致`);
  }
  if (entry.version && manifest.version !== entry.version) {
    bad(`市场条目 version（${entry.version}）与清单 version（${manifest.version}）不一致`);
  }
  if (manifest.icon && !existsSync(join(dir, manifest.icon))) bad(`icon 不存在：${manifest.icon}`);
  ok("清单字段一致");

  for (const key of ["skills", "hooks", "subagents"]) {
    if (!manifest[key]) continue;
    if (existsSync(join(dir, manifest[key]))) ok(`${key} → ${manifest[key]}`);
    else bad(`${key} 声明的路径不存在：${manifest[key]}`);
  }
  if (manifest.mcpServers && !existsSync(join(dir, manifest.mcpServers))) {
    bad(`mcpServers 声明的文件不存在：${manifest.mcpServers}`);
  }

  if (manifest.skills) {
    const skillsDir = join(dir, manifest.skills);
    if (existsSync(skillsDir)) {
      for (const name of readdirSync(skillsDir)) {
        const skillMd = join(skillsDir, name, "SKILL.md");
        if (!existsSync(skillMd)) {
          bad(`技能 ${name} 缺少 SKILL.md`);
          continue;
        }
        const text = readFileSync(skillMd, "utf8");
        const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fm) bad(`技能 ${name} 缺少 frontmatter`);
        else if (!/^name:/m.test(fm[1]) || !/^description:/m.test(fm[1])) {
          bad(`技能 ${name} 的 frontmatter 缺少 name 或 description`);
        } else ok(`技能 ${name}`);
      }
    }
  }

  if (!manifest.panels) return;
  const panelsPath = join(dir, manifest.panels);
  if (!existsSync(panelsPath)) return bad(`panels 声明的文件不存在：${manifest.panels}`);
  const panels = readJson(panelsPath);
  if (!Array.isArray(panels)) return bad("panels.json 顶层必须是数组");
  for (const [i, p] of panels.entries()) {
    if (!PANEL_ID_RE.test(p?.id ?? "")) bad(`panels[${i}].id 不合法`);
    if (typeof p?.entry !== "string" || !/\.html?$/i.test(p.entry)) {
      bad(`panels[${i}].entry 必须是 .html`);
      continue;
    }
    const entryPath = join(dir, p.entry);
    if (!existsSync(entryPath)) bad(`panels[${i}].entry 不存在：${p.entry}`);
    else {
      const html = readFileSync(entryPath, "utf8");
      // 桥协议常量在手写 HTML 里是引号字符串，vite/esbuild 单文件构建产物里
      // 可能被压成反引号模板串，所以只认裸子串。
      if (!html.includes("kova-ui-plugin/1")) bad(`面板 ${p.entry} 没有实现 kova-ui-plugin/1 桥`);
      // 只拦真实的静态外部引用（相对/绝对路径与 http URL）。运行时字符串拼接
      // （如压缩产物里的 `<script src="\`+i+\`">`）不是 blob iframe 下的静态引用，
      // 不算 404 风险。
      if (/<(script|link)[^>]+(src|href)=["'](\/|\.\.?\/|https?:)/i.test(html)) {
        bad(`面板 ${p.entry} 引用了外部资源（宿主用 blob iframe，相对路径会 404）`);
      }
      ok(`面板 ${p.id} → ${p.entry}`);
    }
    for (const perm of p.permissions ?? []) {
      if (!PERMISSIONS.has(perm)) bad(`panels[${i}] 未知权限：${perm}`);
    }
    for (const glob of p.opens ?? []) {
      if (typeof glob !== "string" || !glob.trim()) bad(`panels[${i}].opens 含非法条目`);
    }
  }
}

console.log("marketplace.json");
const catalog = readJson(join(root, "marketplace.json"));
if (!catalog) process.exit(1);
if (typeof catalog.name !== "string" || !catalog.name) bad("缺少 name");
else ok(`name = ${catalog.name}`);
if (!Array.isArray(catalog.plugins) || catalog.plugins.length === 0) bad("plugins 必须是非空数组");
for (const entry of catalog.plugins ?? []) checkPlugin(entry, root);

console.log(failed === 0 ? "\n全部通过" : `\n失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
