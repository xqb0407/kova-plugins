/**
 * 图层树大纲面板（右侧可折叠列）：按 z 序倒序列出全部元素（顶层在前）。
 * 单击选中（⌘/Ctrl 追加多选）、双击飞到视口（fitBox）、行内 ↑↓ 调 z 序、顶部搜索过滤。
 * 数据源直接读 doc.objects（数组顺序即 z 序），选中态走 store.sel。
 */
import { useMemo, useState, type FC } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartColumnIcon,
  CircleIcon,
  CodeXmlIcon,
  DiamondIcon,
  GlobeIcon,
  HexagonIcon,
  ImagePlusIcon,
  LockIcon,
  PanelRightCloseIcon,
  PenIcon,
  PentagonIcon,
  SearchIcon,
  SquareIcon,
  StarIcon,
  TableIcon,
  TriangleIcon,
  WorkflowIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CANVAS_ROOT, type El } from "../doc";
import { boxOf } from "../geometry";
import type { CanvasStore } from "../state";
import type { ZoomApi } from "../CanvasStage";

/** 形状名 → 中文（右键菜单同族文案） */
const SHAPE_LABEL: Record<string, string> = {
  rect: "矩形",
  ellipse: "椭圆",
  diamond: "菱形",
  triangle: "三角",
  trapezoid: "梯形",
  pentagon: "五边形",
  hexagon: "六边形",
  star: "星形",
  line: "直线",
  arrow: "箭头",
  "double-arrow": "双箭头",
};

function iconOf(el: El) {
  switch (el.kind) {
    case "text":
      return null; // 文本用首字预览当图标位
    case "shape": {
      const map: Record<string, typeof SquareIcon> = {
        rect: SquareIcon,
        ellipse: CircleIcon,
        diamond: DiamondIcon,
        triangle: TriangleIcon,
        trapezoid: PentagonIcon,
        pentagon: PentagonIcon,
        hexagon: HexagonIcon,
        star: StarIcon,
        line: SquareIcon,
        arrow: SquareIcon,
        "double-arrow": SquareIcon,
      };
      return map[el.shape] ?? SquareIcon;
    }
    case "image":
      return ImagePlusIcon;
    case "mermaid":
      return WorkflowIcon;
    case "draw":
      return PenIcon;
    case "embed":
      return GlobeIcon;
    case "svg":
      return CodeXmlIcon;
    case "table":
      return TableIcon;
    case "chart":
      return ChartColumnIcon;
    default:
      return SquareIcon;
  }
}

/** 行标签：类型名 + 内容摘要 */
function labelOf(el: El): string {
  switch (el.kind) {
    case "text":
      return el.runs.map((r) => (typeof r === "string" ? r : r.text)).join("") || "文本";
    case "shape":
      return el.label ? `连线 · ${el.label}` : (SHAPE_LABEL[el.shape] ?? "形状");
    case "image":
      return `图片 · ${el.src.split("/").pop() ?? ""}`;
    case "mermaid":
      return "Mermaid 图";
    case "draw":
      return "钢笔笔迹";
    case "embed":
      return `网页 · ${(() => {
        try {
          return new URL(el.url).hostname;
        } catch {
          return el.url;
        }
      })()}`;
    case "svg":
      return "SVG 矢量";
    case "table":
      return `表格 ${el.rows.length}×${el.rows[0]?.length ?? 0}`;
    case "chart":
      return `图表 · ${el.chart}`;
    default:
      return "元素";
  }
}

export const LayersPanel: FC<{
  store: CanvasStore;
  zoomApi: { current: ZoomApi | null };
  onClose: () => void;
}> = ({ store, zoomApi, onClose }) => {
  const { doc, sel, setSel } = store;
  const [query, setQuery] = useState("");

  // 组徽标：groupId → 首元素 id（一次扫表，避免每行 find 的 O(n²)）
  const groupFirstIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of doc.objects) if (o.groupId && !map.has(o.groupId)) map.set(o.groupId, o.id);
    return map;
  }, [doc.objects]);

  // z 顶层在前 = 数组倒序；搜索按行标签过滤
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = doc.objects.map((el) => ({ el, label: labelOf(el) }));
    const filtered = q ? list.filter((r) => r.label.toLowerCase().includes(q)) : list;
    return filtered.reverse();
  }, [doc.objects, query]);

  const onRowClick = (el: El, additive: boolean) => {
    if (!additive) {
      setSel({ containerId: CANVAS_ROOT, elIds: [el.id] });
      return;
    }
    const base = sel?.containerId === CANVAS_ROOT ? (sel?.elIds ?? []) : [];
    const next = base.includes(el.id) ? base.filter((id) => id !== el.id) : [...base, el.id];
    setSel(next.length > 0 ? { containerId: CANVAS_ROOT, elIds: next } : null);
  };

  const onRowDoubleClick = (el: El) => {
    zoomApi.current?.fitBox(boxOf(el), { maxScale: 1 });
  };

  return (
    <div className="bg-background/60 flex h-full w-60 shrink-0 flex-col border-l text-xs">
      <div className="flex items-center gap-1 px-2 pt-2">
        <span className="text-muted-foreground px-1 font-medium">图层</span>
        <span className="text-muted-foreground/70 text-[10px]">顶层在上 · 双击定位</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="收起图层树" onClick={onClose}>
          <PanelRightCloseIcon className="size-4" />
        </Button>
      </div>
      <div className="relative px-2 py-1.5">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索元素…"
          className="h-7 pl-7 text-xs"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center leading-relaxed">
            {doc.objects.length === 0 ? "画布还是空的" : "没有匹配的元素"}
          </p>
        ) : (
          rows.map(({ el, label }) => {
            const Icon = iconOf(el);
            const selected = sel?.containerId === CANVAS_ROOT && sel.elIds.includes(el.id);
            const firstOfGroup = !!el.groupId && doc.objects.find((o) => o.groupId === el.groupId)?.id === el.id;
            return (
              <div
                key={el.id}
                className={[
                  "group mx-1.5 flex cursor-default items-center gap-1.5 rounded-md px-2 py-1.5",
                  selected ? "bg-secondary" : "hover:bg-secondary/60",
                ].join(" ")}
                onClick={(e) => onRowClick(el, e.metaKey || e.ctrlKey)}
                onDoubleClick={() => onRowDoubleClick(el)}
              >
                {Icon ? (
                  <Icon className="text-muted-foreground size-3.5 shrink-0" />
                ) : (
                  <span className="text-muted-foreground flex size-3.5 shrink-0 items-center justify-center font-semibold">
                    {label.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {el.groupId && groupFirstIds.get(el.groupId) === el.id && (
                  <span className="text-muted-foreground/70 rounded bg-black/5 px-1 text-[9px] dark:bg-white/10">组</span>
                )}
                {el.locked && <LockIcon className="text-muted-foreground/70 size-3 shrink-0" />}
                {/* z 序步进：显行内按钮（hover 才出现，不占常驻宽度） */}
                <span className="hidden items-center gap-0.5 group-hover:flex">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-5"
                    aria-label="上移一层"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.reorderZ(el.id, "up");
                    }}
                  >
                    <ArrowUpIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-5"
                    aria-label="下移一层"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.reorderZ(el.id, "down");
                    }}
                  >
                    <ArrowDownIcon className="size-3" />
                  </Button>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
