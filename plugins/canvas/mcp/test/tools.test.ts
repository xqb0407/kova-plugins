/**
 * 无限画布 MCP 工具集单测：全部走真实文件读写（临时工作区），验证
 * 六件套往返（create → patch → read → watch → write）与校验边界
 * （kind 白名单、规模上限、deck 档隔离、原子落盘不留临时文件）。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TOOL_DEFS, type ToolCtx } from "../tools";
import { parseDoc, type CanvasDoc } from "../../ui/src/doc";

let ws = "";
let ctx: ToolCtx;

function run(name: string, args: Record<string, unknown>): any {
  const tool = TOOL_DEFS.find((t) => t.name === name);
  expect(tool).toBeDefined();
  return tool!.run(args, ctx);
}

/** 断言同步工具抛错（async 工具如 watch_doc 请用 `await expect(...).rejects.toThrow()`） */
function expectFail(name: string, args: Record<string, unknown>): void {
  try {
    run(name, args);
  } catch {
    return;
  }
  throw new Error(`预期报错但成功：${name} ${JSON.stringify(args)}`);
}

const loadDoc = (p: string): CanvasDoc => {
  const doc = parseDoc(JSON.parse(readFileSync(path.join(ws, p), "utf8")));
  expect(doc).not.toBeNull();
  return doc!;
};

beforeAll(() => {
  ws = mkdtempSync(path.join(tmpdir(), "canvas-mcp-"));
  ctx = { workspace: ws };
});

afterAll(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("create_doc / list_docs", () => {
  test("建档落骨架，list 能列出并给版本", () => {
    const created = run("create_doc", { name: "头脑风暴" });
    expect(created.path).toBe("头脑风暴.canvas.json");
    expect(created.objects).toBe(0);
    expect(created.version).toBeTruthy();
    expect(existsOnDisk("头脑风暴.canvas.json")).toBe(true);

    const list = run("list_docs", {});
    const entry = list.docs.find((d: any) => d.path === "头脑风暴.canvas.json");
    expect(entry).toBeDefined();
    expect(entry.name).toBe("头脑风暴");
    expect(entry.objects).toBe(0);
    expect(entry.version).toBe(created.version);
    expect(entry.corrupt).toBeUndefined();
  });

  test("重名建档拒绝；名字清洗（空格转 -、去非法字符）；后缀边界", () => {
    expectFail("create_doc", { name: "头脑风暴" });
    const made = run("create_doc", { name: "Q3 计划/草稿*1" });
    expect(made.path).toBe("Q3-计划草稿1.canvas.json");
    // 造出来就进不了自家工具的档：这两种名字在建档前就拒绝
    expectFail("create_doc", { name: "slide.deck" });
    expectFail("create_doc", { name: "已带后缀.canvas.json" });
  });

  test("路径信任根：绝对路径与 .. 越界一律拒绝（所有带 path 的工具）", async () => {
    expectFail("read_doc", { path: "/etc/hosts.canvas.json" });
    expectFail("read_doc", { path: "../outside.canvas.json" });
    expectFail("write_doc", { path: "sub/../../escape.canvas.json", doc: { version: 3, meta: {}, objects: [] } });
    await expect(Promise.resolve().then(() => run("watch_doc", { path: "/tmp/abs.canvas.json", timeoutMs: 1000 }))).rejects.toThrow(/工作区相对路径/);
    expectFail("list_docs", { dir: "/绝对" });
    expectFail("list_docs", { dir: ".." });
  });

  test("list 排除 deck 档与资产目录；两层子目录可达", () => {
    writeFileSync(path.join(ws, "deck.deck.canvas.json"), JSON.stringify({ version: 3, meta: {}, objects: [] }));
    writeFileSync(path.join(ws, "note.canvas.json"), JSON.stringify({ broken: true }));
    mkdirSync(path.join(ws, "sub/深一层"), { recursive: true });
    writeFileSync(path.join(ws, "sub/深一层/nested.canvas.json"), JSON.stringify({ version: 3, meta: { name: "深层" }, objects: [] }));
    mkdirSync(path.join(ws, "头脑风暴-assets"), { recursive: true });

    const list = run("list_docs", {});
    const paths = list.docs.map((d: any) => d.path);
    expect(paths).not.toContain("deck.deck.canvas.json");
    expect(paths).toContain("sub/深一层/nested.canvas.json");
    expect(paths).toContain("note.canvas.json");
    const note = list.docs.find((d: any) => d.path === "note.canvas.json");
    expect(note.corrupt).toBe(true);
  });
});

describe("read_doc", () => {
  const seed = (): void => {
    run("create_doc", { name: "读档样例" });
    run("patch_canvas", {
      path: "读档样例.canvas.json",
      ops: [
        { op: "add", el: { kind: "text", x: 0, y: 0, w: 200, h: 40, runs: ["季度主题", " · 备注"] } },
        { op: "add", el: { kind: "shape", shape: "arrow", x: 10, y: 60, w: 120, h: 80, label: "调用", route: "orth" } },
        { op: "add", el: { kind: "table", x: 0, y: 200, w: 300, h: 120, rows: [["列A", "列B"], ["1", "2"]] } },
        { op: "add", el: { kind: "chart", chart: "bar", x: 0, y: 360, w: 300, h: 200, labels: ["一", "二"], series: [{ name: "系列A", data: [1, 2] }] } },
      ],
    });
  };

  test("summary 给类型预览；elementId 给完整元素", () => {
    seed();
    const doc = loadDoc("读档样例.canvas.json");
    const summary = run("read_doc", { path: "读档样例.canvas.json" });
    expect(summary.objects).toHaveLength(4);
    expect(summary.total).toBe(4);
    const text = summary.objects.find((o: any) => o.kind === "text");
    expect(text.text).toBe("季度主题 · 备注");
    const table = summary.objects.find((o: any) => o.kind === "table");
    expect(table.rows).toBe(2);
    expect(table.cols).toBe(2);
    const chart = summary.objects.find((o: any) => o.kind === "chart");
    expect(chart.series).toContain("系列A");

    const el = run("read_doc", { path: "读档样例.canvas.json", elementId: doc.objects[1]!.id });
    expect(el.element.kind).toBe("shape");
    expect(el.element.label).toBe("调用");
  });

  test("elementId 不存在报错并提示拿 id 的方法", () => {
    expectFail("read_doc", { path: "读档样例.canvas.json", elementId: "nope" });
  });

  test("full 视图返回整档", () => {
    const full = run("read_doc", { path: "读档样例.canvas.json", view: "full" });
    expect(full.doc.objects).toHaveLength(4);
    expect(full.chars).toBeGreaterThan(0);
  });
});

describe("patch_canvas", () => {
  test("add 自动生成 id / 指定 id 重名拒绝；update 白名单与范围校验", () => {
    run("create_doc", { name: "patch样例" });
    const p = "patch样例.canvas.json";
    const added = run("patch_canvas", { path: p, ops: [{ op: "add", el: { kind: "text", x: 0, y: 0, w: 100, h: 30, runs: ["标题"] } }] });
    expect(added.addedIds).toHaveLength(1);
    expect(added.addedIds[0]).toBeTruthy();

    // update：合法字段生效，白名单外忽略并回报
    const id = added.addedIds[0]!;
    const updated = run("patch_canvas", { path: p, ops: [{ op: "update", id, patch: { runs: ["新标题"], size: 40, kind: "svg", bogus: 1 } }] });
    expect(updated.updatedIds).toContain(id);
    const upResult = updated.results.find((r: any) => r.op === "update");
    expect(upResult.ignored).toContain("kind");
    expect(upResult.ignored).toContain("bogus");
    const doc = loadDoc(p);
    const el = doc.objects.find((e) => e.id === id)! as any;
    expect(el.runs[0].text).toBe("新标题");

    // 范围越界：chart.size 500 拒绝（text 的字号在 runs 里，size 是 table/chart 字段），整批不落盘
    const chartId = run("patch_canvas", {
      path: p,
      ops: [{ op: "add", el: { kind: "chart", chart: "bar", x: 0, y: 400, w: 200, h: 150, labels: ["一"], series: [{ name: "s", data: [1] }] } }],
    }).addedIds[0]!;
    const before = loadDoc(p).objects.length;
    expectFail("patch_canvas", { path: p, ops: [{ op: "update", id: chartId, patch: { size: 500 } }] });
    expect(loadDoc(p).objects.length).toBe(before);
    expectFail("patch_canvas", { path: p, ops: [{ op: "update", id, patch: { opacity: 2 } }] });
    expectFail("patch_canvas", { path: p, ops: [{ op: "update", id, patch: { w: 0 } }] });
  });

  test("delete / z / move；id 不存在报错", () => {
    const p = "patch样例.canvas.json";
    const added = run("patch_canvas", {
      path: p,
      ops: [
        { op: "add", els: [
          { kind: "shape", shape: "rect", x: 0, y: 0, w: 50, h: 50 },
          { kind: "shape", shape: "rect", x: 60, y: 0, w: 50, h: 50 },
          { kind: "shape", shape: "rect", x: 120, y: 0, w: 50, h: 50 },
        ] },
      ],
    });
    const [a, b, c] = added.addedIds;
    // z: front 把 a 提到顶层（数组末尾）
    run("patch_canvas", { path: p, ops: [{ op: "z", id: a, mode: "front" }] });
    let doc = loadDoc(p);
    expect(doc.objects.at(-1)!.id).toBe(a);
    // move 相对 + 绝对
    run("patch_canvas", { path: p, ops: [{ op: "move", id: b, dx: 5, dy: -5 }] });
    doc = loadDoc(p);
    const moved = doc.objects.find((e) => e.id === b)!;
    expect(moved.x).toBe(65);
    expect(moved.y).toBe(-5);
    // delete
    run("patch_canvas", { path: p, ops: [{ op: "delete", ids: [c] }] });
    doc = loadDoc(p);
    expect(doc.objects.some((e) => e.id === c)).toBe(false);
    // null 清除字段：落盘删属性而不是 "groupId": null
    run("patch_canvas", { path: p, ops: [
      { op: "update", id: a, patch: { groupId: "g9" } },
      { op: "update", id: a, patch: { groupId: null } },
    ] });
    doc = loadDoc(p);
    const grouped = doc.objects.find((e) => e.id === a)! as Record<string, unknown>;
    expect("groupId" in grouped).toBe(false);
    // 不存在的 id
    expectFail("patch_canvas", { path: p, ops: [{ op: "update", id: "ghost", patch: { x: 1 } }] });
    expectFail("patch_canvas", { path: p, ops: [{ op: "z", id: "ghost", mode: "front" }] });
  });

  test("元素数上限与 ops 数量上限", () => {
    const p = "patch样例.canvas.json";
    const many = Array.from({ length: 101 }, (_, i) => ({ op: "add", el: { kind: "shape", shape: "rect", x: i, y: 0, w: 10, h: 10 } }));
    expectFail("patch_canvas", { path: p, ops: many });
    expectFail("patch_canvas", { path: p, ops: [] });
  });

  test("image src 与 embed url 安全校验", () => {
    const p = "patch样例.canvas.json";
    expectFail("patch_canvas", { path: p, ops: [{ op: "add", el: { kind: "image", x: 0, y: 0, w: 10, h: 10, src: "../escape.png" } }] });
    expectFail("patch_canvas", { path: p, ops: [{ op: "add", el: { kind: "image", x: 0, y: 0, w: 10, h: 10, src: "/abs.png" } }] });
    expectFail("patch_canvas", { path: p, ops: [{ op: "add", el: { kind: "embed", x: 0, y: 0, w: 10, h: 10, url: "javascript:alert(1)" } }] });
    const ok = run("patch_canvas", { path: p, ops: [{ op: "add", el: { kind: "image", x: 0, y: 0, w: 10, h: 10, src: "样例-assets/shot.png" } }] });
    expect(ok.addedIds).toHaveLength(1);
  });

  test("add 路径规模上限（与 update 同规，绕过白名单路径也不放行）", () => {
    const p = "patch样例.canvas.json";
    // 合法结构的超长 svg：add 走 parseDoc 容错，无此防线会直落 19MB 进档卡死面板
    expectFail("patch_canvas", { path: p, ops: [{ op: "add", el: { kind: "svg", x: 0, y: 0, w: 10, h: 10, code: `<svg>${"A".repeat(150_000)}</svg>` } }] });
    expectFail("patch_canvas", { path: p, ops: [{ op: "add", el: { kind: "mermaid", x: 0, y: 0, w: 10, h: 10, code: `graph TD\n${"A".repeat(101_000)}` } }] });
    // 合法体量正常进档
    const ok = run("patch_canvas", { path: p, ops: [{ op: "add", el: { kind: "svg", x: 0, y: 0, w: 10, h: 10, code: `<svg>${"A".repeat(5000)}</svg>` } }] });
    expect(ok.addedIds).toHaveLength(1);
  });
});

describe("write_doc / watch_doc", () => {
  test("write_doc 整档写入 + 容错解析；临时文件不残留", () => {
    const p = "整档.canvas.json";
    run("create_doc", { name: "整档" });
    const res = run("write_doc", {
      path: p,
      doc: {
        version: 3,
        meta: { name: "重写后" },
        objects: [{ kind: "text", x: 0, y: 0, w: 100, h: 30, runs: ["整档"] }],
      },
    });
    expect(res.objects).toBe(1);
    expect(res.name).toBe("重写后");
    expect(loadDoc(p)!.objects).toHaveLength(1);
    const leftovers = readdirSync(ws).filter((n) => n.includes(".tmp-mcp"));
    expect(leftovers).toHaveLength(0);
  });

  test("write_doc 拒绝非文档对象", () => {
    expectFail("write_doc", { path: "整档.canvas.json", doc: { hello: "world" } });
  });

  test("watch_doc 长轮询：变更即返回摘要；无变更 timedOut", async () => {
    const p = "整档.canvas.json";
    const before = run("read_doc", { path: p }) as { version: string };
    // 无变更：1.5s 超时
    const idle = (await run("watch_doc", { path: p, since: before.version, timeoutMs: 1500 })) as any;
    expect(idle.changed).toBe(false);
    expect(idle.timedOut).toBe(true);
    // 后台写盘 → watch 立刻返回（opWatchDoc 是 async，直接拿 Promise）
    const finish = run("watch_doc", { path: p, since: before.version, timeoutMs: 8000 }) as Promise<any>;
    await new Promise((r) => setTimeout(r, 500));
    const doc = loadDoc(p);
    (doc.objects[0] as any).x = 42;
    const { writeFileSync: wfs } = await import("node:fs");
    wfs(path.join(ws, p), JSON.stringify(doc));
    const changed = await finish;
    expect(changed.changed).toBe(true);
    expect(changed.version).not.toBe(before.version);
    expect(changed.objects[0].x).toBe(42);
  });

  test("watch_doc 拒绝 deck 档路径", async () => {
    await expect(Promise.resolve().then(() => run("watch_doc", { path: "x.deck.canvas.json", timeoutMs: 1000 }))).rejects.toThrow(/幻灯片/);
  });
});

function existsOnDisk(rel: string): boolean {
  try {
    readFileSync(path.join(ws, rel), "utf8");
    return true;
  } catch {
    return false;
  }
}
