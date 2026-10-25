import { useId, useRef, type ReactNode } from "react";
import { TerminalSquare, XIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { TradingIcon } from "./trading/TradingIcon";
import { cn } from "../lib/utils";

export type BottomDockTab = "terminal" | "trading";
export function clampBottomDockHeight(height: number, viewportHeight: number) {
  return Math.min(
    Math.max(180, Math.round(height)),
    Math.max(180, Math.floor(viewportHeight * 0.75)),
  );
}

export function BottomDock({
  open,
  tab,
  onSelectTab,
  onClose,
  height,
  onHeightChange,
  terminalAvailable,
  children,
}: {
  open: boolean;
  tab: BottomDockTab;
  onSelectTab: (tab: BottomDockTab) => void;
  onClose: () => void;
  height: number;
  onHeightChange: (height: number) => void;
  terminalAvailable: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const drag = useRef<{ pointerId: number; y: number; height: number } | null>(null);
  return (
    <section
      aria-label="Bottom dock"
      hidden={!open}
      className={cn(
        "relative shrink-0 border-t border-border bg-background [&_[data-terminal-owner=drawer]>.cursor-row-resize]:hidden",
        !open && "hidden",
      )}
    >
      <div
        role="separator"
        aria-label="Resize bottom dock"
        aria-orientation="horizontal"
        aria-valuemin={180}
        aria-valuenow={height}
        tabIndex={0}
        className="absolute inset-x-0 -top-1 z-30 h-2 cursor-row-resize outline-none focus-visible:bg-primary/30"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          drag.current = { pointerId: event.pointerId, y: event.clientY, height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start?.pointerId !== event.pointerId) return;
          onHeightChange(
            clampBottomDockHeight(start.height + start.y - event.clientY, window.innerHeight),
          );
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          onHeightChange(
            clampBottomDockHeight(
              height + (event.key === "ArrowUp" ? 20 : -20),
              window.innerHeight,
            ),
          );
        }}
      />
      <header className="flex h-9 shrink-0 items-center gap-1 px-2">
        <div role="tablist" aria-label="Bottom dock views" className="flex items-center gap-1">
          {(["terminal", "trading"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              id={`${id}-${item}`}
              aria-controls={`${id}-content`}
              aria-selected={tab === item}
              tabIndex={tab === item ? 0 : -1}
              disabled={item === "terminal" && !terminalAvailable}
              onClick={() => onSelectTab(item)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                const next = item === "terminal" ? "trading" : "terminal";
                if (next === "terminal" && !terminalAvailable) return;
                event.preventDefault();
                onSelectTab(next);
                document.getElementById(`${id}-${next}`)?.focus();
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium disabled:opacity-40",
                tab === item
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {item === "terminal" ? (
                <TerminalSquare className="size-3.5" />
              ) : (
                <TradingIcon className="size-3.5" />
              )}
              {item === "terminal" ? "Terminal" : "Trading"}
            </button>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                className="ml-auto"
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={onClose}
                aria-label="Close bottom dock"
              />
            }
          >
            <XIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup>Close bottom dock</TooltipPopup>
        </Tooltip>
      </header>
      <div
        id={`${id}-content`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
        className="min-h-0"
      >
        {children}
      </div>
    </section>
  );
}
