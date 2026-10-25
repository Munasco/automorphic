import { MarketInstrumentIcon } from "./MarketInstrumentIcon";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { useRef, useState } from "react";
import { CheckIcon, SearchIcon } from "lucide-react";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { INSTRUMENTS } from "./tradingInstruments";
import { cn } from "../../lib/utils";

export interface FuturesContract {
  id: number;
  name: string;
  root: keyof typeof INSTRUMENTS;
}

export function SymbolPicker({
  open,
  onOpenChange,
  contracts,
  selected,
  loading,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contracts: Pick<FuturesContract, "root" | "name">[];
  selected: string;
  loading: boolean;
  onSelect: (contract: Pick<FuturesContract, "root" | "name">) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "gold" | "nasdaq">("all");
  const filtered = contracts.filter(
    (contract) =>
      (filter === "all" || INSTRUMENTS[contract.root].family === filter) &&
      `${contract.name} ${contract.name.startsWith("@") ? "continuous" : "contract"} ${INSTRUMENTS[contract.root].name} ${INSTRUMENTS[contract.root].exchange}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        initialFocus={inputRef}
        bottomStickOnMobile={false}
        className="w-full max-w-xl overflow-hidden"
      >
        <DialogHeader className="pb-4">
          <DialogTitle>Symbol search</DialogTitle>
          <DialogDescription>Choose a market.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 border-y border-border px-6 py-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            aria-label="Search symbols"
            placeholder="Search symbol, name or exchange"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered[0]) {
                onSelect(filtered[0]);
                onOpenChange(false);
              }
            }}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex gap-2 px-6 py-3" aria-label="Symbol categories">
          {(["all", "gold", "nasdaq"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={value === filter}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                value === filter
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {value === "all" ? "All futures" : value === "gold" ? "Gold" : "Nasdaq"}
            </button>
          ))}
        </div>
        <div className="max-h-[min(50vh,360px)] overflow-y-auto px-3 pb-3">
          {filtered.map((contract) => (
            <Tooltip key={contract.name}>
              <TooltipTrigger
                type="button"
                onClick={() => {
                  onSelect(contract);
                  onOpenChange(false);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <MarketInstrumentIcon root={contract.root} className="size-6 shrink-0" />
                <span className="w-16 shrink-0 text-sm font-semibold">{contract.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {INSTRUMENTS[contract.root].name}
                  {contract.name.startsWith("@") ? " · Continuous" : " · Contract"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {INSTRUMENTS[contract.root].exchange}
                </span>
                {selected === contract.name ? (
                  <CheckIcon className="size-4 text-foreground" aria-label="Selected" />
                ) : (
                  <span className="size-4" />
                )}
              </TooltipTrigger>
              <TooltipPopup>
                {contract.name.startsWith("@")
                  ? "Continuous history across contract rolls. Choose a dated contract to place orders."
                  : contract.name}
              </TooltipPopup>
            </Tooltip>
          ))}
          {filtered.length === 0 ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              {loading ? "Loading contracts…" : "No matching contracts"}
            </p>
          ) : null}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
