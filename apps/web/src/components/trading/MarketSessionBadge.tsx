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
  if (session.status === "scheduled-open") return null;
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={session.label}
        className="inline-flex h-5 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 outline-none hover:bg-zinc-300 focus-visible:ring-2 focus-visible:ring-ring dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
      >
        <span aria-hidden="true" className="h-1 w-3 rounded-full bg-current" />
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
