import { useEffect, useState } from "react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
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
  const isOpen = session.status === "scheduled-open";
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={isOpen ? "Market open, regular schedule" : session.label}
        className={`shrink-0 rounded px-1.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${isOpen ? "text-emerald-400" : "text-zinc-400"}`}
      >
        {isOpen ? "Open" : "Closed"}
      </TooltipTrigger>
      <TooltipPopup className="max-w-72">
        <p className="font-semibold">{session.label}</p>
        <p className="mt-1">{session.reason}</p>
        {session.nextOpen ? <p className="mt-1">{session.nextOpen}</p> : null}
        <p className="mt-2 text-muted-foreground">{session.scheduleNote}</p>
      </TooltipPopup>
    </Tooltip>
  );
}
