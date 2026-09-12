import { GaugeIcon, NewspaperIcon } from "lucide-react";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
} from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { cn } from "../../lib/utils";

export type ChartView = "chart" | "technicals" | "news";
function ViewIcon({ view }: { view: ChartView }) {
  return view === "technicals" ? (
    <GaugeIcon className="size-5" />
  ) : view === "news" ? (
    <NewspaperIcon className="size-5" />
  ) : (
    <svg
      viewBox="0 0 18 18"
      width="18"
      height="18"
      fill="none"
      className="size-5"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M17 8.2 9 16 1 8.2 3.667 3h10.666zM2.226 8 9 14.602 15.773 8l-2.05-4H4.277zM9.5 7H11v3H9.5v2h-1v-2H7V7h1.5V5h1z"
      />
    </svg>
  );
}
export function ChartViewMenu({
  view,
  onChange,
  technicalsAvailable = false,
}: {
  view: ChartView;
  onChange: (view: ChartView) => void;
  technicalsAvailable?: boolean;
}) {
  const item = (value: ChartView, label: string) => (
    <MenuItem
      onClick={() => onChange(value)}
      aria-current={view === value ? "page" : undefined}
      className={cn(
        "min-h-10 gap-3 rounded-lg px-3 text-sm [&>svg]:text-current data-highlighted:bg-white/10 data-highlighted:text-zinc-100",
        view === value &&
          "bg-zinc-100 text-zinc-950 data-highlighted:bg-zinc-100 data-highlighted:text-zinc-950",
      )}
    >
      <ViewIcon view={value} />
      {label}
    </MenuItem>
  );
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              aria-label="Chart views"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10 data-popup-open:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            />
          }
        >
          <ViewIcon view={view} />
        </TooltipTrigger>
        <TooltipPopup>Chart views</TooltipPopup>
      </Tooltip>
      <MenuPopup
        align="start"
        className="w-52 rounded-xl border border-white/10 !bg-[#202020] !backdrop-filter-none"
      >
        {item("chart", "Chart")}
        <MenuSeparator />
        <MenuGroup className="space-y-1 pb-1">
          <MenuGroupLabel className="px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Analysis
          </MenuGroupLabel>
          {technicalsAvailable ? item("technicals", "Technicals") : null}
          {item("news", "News")}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
