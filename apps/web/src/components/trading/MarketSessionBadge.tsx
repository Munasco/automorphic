import { useEffect, useState } from "react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { MarketStatusIcon } from "./MarketStatusIcon";
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
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${isOpen ? "text-emerald-400" : "text-zinc-400"}`}
      >
        <MarketStatusIcon open={isOpen} />
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
