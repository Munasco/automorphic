import { useEffect, useState } from "react";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { getFuturesSession } from "./marketSession";

export function MarketSessionBadge({ root }: { root: "MGC" | "NQ" }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const session = getFuturesSession(root, now);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${session.label}, view session hours`}
        className="inline-flex items-center gap-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="flex size-3 items-center justify-center rounded-full bg-muted"
        >
          <span className="h-0.5 w-1.5 rounded bg-current" />
        </span>
        {session.label}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-72">
        <PopoverTitle className="text-sm">{session.label}</PopoverTitle>
        <p className="mt-2 text-xs text-muted-foreground">{session.reason}</p>
        {session.nextOpen ? <p className="mt-2 text-xs">{session.nextOpen}</p> : null}
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          {session.scheduleNote}
        </p>
      </PopoverPopup>
    </Popover>
  );
}
