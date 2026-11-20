/**
 * 小地图导航（右下浮卡）：全画布元素盒按类型着色缩略渲染 + 当前视口框。
 * 拖视口框/点按任意位置即把该画布点置于主视口中心（保持当前缩放）。
 * 纯展示层（pointer-events 只在浮卡上），不参与导出。
 */
import { useCallback, useMemo, useRef, type FC, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasDoc } from "../doc";
import { boxOf, unionBox } from "../geometry";
import type { View } from "../CanvasStage";

const W = 168;
const H = 116;
const PAD = 10;

/** 类型 → 缩略着色（与画布上元素的观感对应，低饱和可叠） */
const KIND_COLOR: Record<string, string> = {
  text: "#8e8e93",
  shape: "#0a84ff",
  image: "#ff9f0a",
  mermaid: "#bf5af2",
  draw: "#8e8e93",
  embed: "#ff375f",
  svg: "#bf5af2",
  table: "#30d158",
  chart: "#30d158",
};

type MapBox = { left: number; top: number; width: number; height: number };

export const MiniMap: FC<{
  doc: CanvasDoc;
  view: View;
  /** 主画布容器尺寸（state 值，避免 render 路径里 getBoundingClientRect 强制 reflow） */
  hostSize: { w: number; h: number };
  onPanTo: (x: number, y: number) => void;
}> = ({ doc, view, hostSize, onPanTo }) => {
  const dragRef = useRef(false);

  // 全画布并盒 → 小地图内适配制（盒外留白）；scale 上限避免小画布被放得过大
  const geo = useMemo(() => {
    const world = unionBox(doc.objects.map(boxOf));
    if (!world || doc.objects.length === 0) return null;
    const ms = Math.min(0.5, (W - PAD * 2) / world.w, (H - PAD * 2) / world.h);
    return { world, ms, mx: (W - world.w * ms) / 2, my: (H - world.h * ms) / 2 };
  }, [doc.objects]);

  const toMap = useCallback(
    (b: { x: number; y: number; w: number; h: number }): MapBox => {
      if (!geo) return { left: 0, top: 0, width: 0, height: 0 };
      return {
        left: geo.mx + (b.x - geo.world.x) * geo.ms,
        top: geo.my + (b.y - geo.world.y) * geo.ms,
        width: Math.max(2.5, b.w * geo.ms),
        height: Math.max(2.5, b.h * geo.ms),
      };
    },
    [geo],
  );

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }, node: HTMLElement) => {
      if (!geo) return { x: 0, y: 0 };
      const r = node.getBoundingClientRect();
      return {
        x: geo.world.x + (e.clientX - r.left - geo.mx) / geo.ms,
        y: geo.world.y + (e.clientY - r.top - geo.my) / geo.ms,
      };
    },
    [geo],
  );

  const startDrag = useCallback(
    (e: ReactPointerEvent) => {
      if (!geo) return;
      const node = e.currentTarget as HTMLElement;
      node.setPointerCapture(e.pointerId);
      dragRef.current = true;
      const at = toWorld(e, node);
      onPanTo(at.x, at.y);
      const move = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const p = toWorld(ev, node);
        onPanTo(p.x, p.y);
      };
      const up = () => {
        dragRef.current = false;
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
      node.addEventListener("pointercancel", up);
    },
    [geo, onPanTo, toWorld],
  );

  if (!geo) return null;

  // 当前视口的画布矩形 → 小地图框（越界部分由 overflow-hidden 裁掉）
  const vpRect = toMap({ x: -view.tx / view.s, y: -view.ty / view.s, w: hostSize.w / view.s, h: hostSize.h / view.s });

  return (
    <div
      aria-label="画布小地图"
      className="sc-float pointer-events-auto absolute right-3 bottom-16 z-10 cursor-crosshair overflow-hidden rounded-xl border border-black/8 shadow-sm dark:border-white/10"
      style={{ width: W, height: H, touchAction: "none" }}
      onPointerDown={startDrag}
    >
      {doc.objects.map((el) => {
        const r = toMap(boxOf(el));
        const fill = el.kind === "shape" && el.fill && el.fill !== "none" ? el.fill : (KIND_COLOR[el.kind] ?? "#8e8e93");
        return (
          <div
            key={el.id}
            className="absolute rounded-[1.5px]"
            style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: fill, opacity: 0.55 }}
          />
        );
      })}
      {/* 视口框：只描边不填色，压在缩略之上 */}
      <div
        className="pointer-events-none absolute rounded-[3px] border-[1.5px] border-foreground/70"
        style={{ left: vpRect.left, top: vpRect.top, width: Math.max(10, vpRect.width), height: Math.max(10, vpRect.height) }}
      />
    </div>
  );
};
