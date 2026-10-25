import {
  ArrowUpRightIcon,
  FlaskConicalIcon,
  WorkflowIcon,
  ScanLineIcon,
  BookOpenIcon,
} from "lucide-react";

export const TRADING_STARTERS = [
  {
    id: "backtest",
    title: "Backtest an idea",
    detail: "Put a setup to the test",
    icon: FlaskConicalIcon,
    prompt:
      "Help me backtest a trading idea. Ask me for the instrument, timeframe, entry and exit rules, and risk limits. Use available historical data, include costs and an out-of-sample check, and show me what would invalidate the idea.",
  },
  {
    id: "algo",
    title: "Turn a backtest into an algo",
    detail: "Build from a tested strategy",
    icon: WorkflowIcon,
    prompt:
      "Help me turn an existing backtest into a runnable trading algorithm. First ask me which backtest or strategy to use. Preserve the rules, add position sizing and risk limits, and prepare a paper-trading run with clear validation before any live execution.",
  },
  {
    id: "setup",
    title: "Research my next setup",
    detail: "Connect technicals and macro",
    icon: ScanLineIcon,
    prompt:
      "Help me research my next trading setup. Ask which instrument and timeframe I am watching, combine the available chart and macro context, and lay out the confirmation, invalidation, re-entry and target conditions. Separate sourced facts from interpretation.",
  },
  {
    id: "journal",
    title: "Review my trading",
    detail: "Build a stronger playbook",
    icon: BookOpenIcon,
    prompt:
      "Help me review and journal my trades. Ask which trades or session to review. Compare my entries and risk with my intended setups, identify impulsive decisions and repeatable patterns, and suggest testable improvements to my playbook.",
  },
] as const;

export function TradingStarters({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div aria-label="Start a trading workflow" className="mt-3 grid grid-cols-2 gap-2">
      {TRADING_STARTERS.map(({ id, title, detail, icon: Icon, prompt }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(prompt)}
          className="group flex min-w-0 items-start gap-2.5 rounded-xl border border-border/60 bg-background/60 px-3 py-3 text-left transition-colors hover:border-blue-400/35 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Icon
            className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-blue-400"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium leading-5">{title}</span>
            <span className="mt-0.5 hidden text-[11px] leading-4 text-muted-foreground sm:block">
              {detail}
            </span>
          </span>
          <ArrowUpRightIcon
            className="mt-1 size-3 shrink-0 text-muted-foreground/50 group-hover:text-blue-400"
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
