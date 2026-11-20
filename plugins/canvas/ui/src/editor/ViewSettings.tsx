/**
 * 视图设置（左下 pill 尾部齿轮弹层）：点阵网格 / agent 新内容自动跟随 / 小地图。
 * 开关状态 localStorage 持久化（按面板 origin 隔离，跨会话保留）。
 */
import { useCallback, useState, type FC } from "react";
import { Settings2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";

export type ViewFlags = {
  /** 点阵网格背景 */
  grid: boolean;
  /** agent 落盘新内容时视口自动跟随 */
  follow: boolean;
  /** 右下小地图 */
  minimap: boolean;
};

const DEFAULTS: ViewFlags = { grid: true, follow: true, minimap: true };
const KEYS: Record<keyof ViewFlags, string> = {
  grid: "canvas.grid",
  follow: "canvas.followExternal",
  minimap: "canvas.minimap",
};

function readFlag(key: keyof ViewFlags): boolean {
  try {
    const raw = window.localStorage.getItem(KEYS[key]);
    return raw === null ? DEFAULTS[key] : raw === "1";
  } catch {
    return DEFAULTS[key];
  }
}

/** 面板各处共享的视图开关（App 持有，往 CanvasStage 传布尔） */
export function useViewFlags(): [ViewFlags, (key: keyof ViewFlags, on: boolean) => void] {
  const [flags, setFlags] = useState<ViewFlags>(() => ({
    grid: readFlag("grid"),
    follow: readFlag("follow"),
    minimap: readFlag("minimap"),
  }));
  const setFlag = useCallback((key: keyof ViewFlags, on: boolean) => {
    setFlags((prev) => ({ ...prev, [key]: on }));
    try {
      window.localStorage.setItem(KEYS[key], on ? "1" : "0");
    } catch {
      /* 隐私模式等：仅会话内生效 */
    }
  }, []);
  return [flags, setFlag];
}

export const ViewSettings: FC<{
  flags: ViewFlags;
  onToggle: (key: keyof ViewFlags, on: boolean) => void;
}> = ({ flags, onToggle }) => {
  const item = (key: keyof ViewFlags, label: string, hint: string) => (
    <DropdownMenuCheckboxItem
      checked={flags[key]}
      onCheckedChange={(v) => onToggle(key, v === true)}
      onSelect={(e) => e.preventDefault()}
    >
      <span className="min-w-0">
        {label}
        <span className="text-muted-foreground block text-[10px] leading-tight">{hint}</span>
      </span>
    </DropdownMenuCheckboxItem>
  );

  return (
    <DropdownMenu>
      <Hint label="视图设置：网格 / 跟随 agent / 小地图" side="top">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="sc-tool" aria-label="视图设置">
            <Settings2Icon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="start" className="w-56">
        {item("grid", "点阵网格", "淡色点阵辅助排版对齐")}
        {item("follow", "跟随 agent 新内容", "agent 落盘新元素时视口自动移过去")}
        {item("minimap", "小地图", "右下角缩略导航，可拖动视口")}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
