import { useEffect, useState } from "react";
import { ArrowDownAZIcon, MoreHorizontalIcon, PlusIcon, XIcon } from "lucide-react";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuCheckboxItem } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import {
  INSTRUMENTS,
  INSTRUMENT_ROOTS,
  isInstrumentRoot,
  rootFromSymbol,
  type InstrumentRoot,
} from "./tradingInstruments";
import { useTradingPreferences } from "./tradingPreferences";
import { openTradingStream } from "./tradingTransport";
import { MarketInstrumentIcon } from "./MarketInstrumentIcon";
import type { FuturesContract } from "./SymbolPicker";
import type { MarketQuote } from "./InstrumentHeader";
import { cn } from "../../lib/utils";

const iconButton =
  "flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground";
const price = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percentage = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function WatchlistPanel({
  contracts,
  selected,
  onSelect,
  onClose,
}: {
  contracts: FuturesContract[];
  selected: string;
  onSelect: (contract: FuturesContract) => void;
  onClose: () => void;
}) {
  const roots = useTradingPreferences((state) => state.watchlistRoots);
  const setRoots = useTradingPreferences((state) => state.setWatchlistRoots);
  const [quotes, setQuotes] = useState<Partial<Record<InstrumentRoot, MarketQuote>>>({});
  const [activeContracts, setActiveContracts] = useState<
    Partial<Record<InstrumentRoot, FuturesContract>>
  >({});
  const [status, setStatus] = useState("Connecting prices…");
  const key = roots.join(",");
  useEffect(() => {
    // A changed subscription must discard prices from the previous contract set.
    // eslint-disable-next-line react/set-state-in-effect
    setQuotes({});
    setActiveContracts({});
    if (!key) {
      setStatus("");
      return;
    }
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stream: ReturnType<typeof openTradingStream> | undefined;
    const connect = () => {
      setStatus("Connecting prices…");
      stream = openTradingStream(`/api/trading/watchlist-stream?roots=${encodeURIComponent(key)}`, {
        onMessage(data) {
          if (disposed) return;
          let message;
          try {
            message = JSON.parse(data);
          } catch {
            return;
          }
          if (message?.type === "contracts" && Array.isArray(message.contracts)) {
            const next: Partial<Record<InstrumentRoot, FuturesContract>> = {};
            for (const contract of message.contracts) {
              const root: unknown = contract?.root;
              if (
                contract &&
                isInstrumentRoot(root) &&
                Number.isSafeInteger(contract.id) &&
                contract.id > 0 &&
                typeof contract.name === "string" &&
                rootFromSymbol(contract.name) === root
              )
                next[root] = contract;
            }
            setActiveContracts(next);
          } else if (
            message?.type === "quote" &&
            isInstrumentRoot(message.root) &&
            message.quote &&
            Number.isFinite(message.quote.last) &&
            rootFromSymbol(message.quote.symbol) === message.root
          ) {
            setQuotes((current) => ({ ...current, [message.root]: message.quote }));
            setStatus("");
          } else if (message?.type === "unavailable") {
            setStatus("Some prices are unavailable.");
          }
        },
        onError() {
          if (disposed) return;
          setStatus("Reconnecting prices…");
          retry = setTimeout(connect, 5000);
        },
      });
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      stream?.close();
    };
  }, [key]);

  const move = (root: InstrumentRoot, direction: -1 | 1) => {
    const index = roots.indexOf(root);
    const target = index + direction;
    if (target < 0 || target >= roots.length) return;
    const next = [...roots];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRoots(next);
  };
  return (
    <section aria-label="Watchlist" className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <h2 className="mr-auto px-1 text-sm font-medium">Watchlist</h2>
        <Menu>
          <MenuTrigger className={iconButton} aria-label="Add markets to watchlist">
            <PlusIcon className="size-[18px]" />
          </MenuTrigger>
          <MenuPopup align="end">
            {INSTRUMENT_ROOTS.map((root) => (
              <MenuCheckboxItem
                key={root}
                checked={roots.includes(root)}
                onCheckedChange={(checked) =>
                  setRoots(checked ? [...roots, root] : roots.filter((item) => item !== root))
                }
              >
                <span className="flex items-center gap-2">
                  <MarketInstrumentIcon root={root} className="size-4" /> {root}
                </span>
              </MenuCheckboxItem>
            ))}
          </MenuPopup>
        </Menu>
        <Tooltip>
          <TooltipTrigger
            className={iconButton}
            aria-label="Sort watchlist alphabetically"
            onClick={() => setRoots([...roots].sort())}
          >
            <ArrowDownAZIcon className="size-[18px]" />
          </TooltipTrigger>
          <TooltipPopup>Sort alphabetically</TooltipPopup>
        </Tooltip>
        <button className={iconButton} aria-label="Close watchlist" onClick={onClose}>
          <XIcon className="size-[18px]" />
        </button>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_80px_66px_24px] gap-1 border-b border-border px-2 py-2 text-[10px] text-muted-foreground">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right">From open</span>
        <span />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {roots.map((root, index) => {
          const contract = activeContracts[root] ?? contracts.find((item) => item.root === root);
          const quote = quotes[root];
          const change =
            quote && Number.isFinite(quote.open) && quote.open! > 0
              ? ((quote.last - quote.open!) / quote.open!) * 100
              : null;
          return (
            <div
              key={root}
              className={cn("group flex items-center", contract?.name === selected && "bg-accent")}
            >
              <Tooltip>
                <TooltipTrigger
                  aria-label={`Show ${root} chart`}
                  aria-pressed={contract?.name === selected}
                  disabled={!contract}
                  onClick={() => {
                    if (contract) onSelect(contract);
                  }}
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_80px_66px] items-center gap-1 px-2 py-3 text-xs hover:bg-accent/60 disabled:opacity-50"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <MarketInstrumentIcon root={root} className="size-5 shrink-0" />
                    <span className="font-medium">{root}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    {quote ? price.format(quote.last) : "—"}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums",
                      change === null || change === 0
                        ? "text-muted-foreground"
                        : change > 0
                          ? "text-emerald-400"
                          : "text-red-400",
                    )}
                  >
                    {change === null ? "—" : `${percentage.format(change)}%`}
                  </span>
                </TooltipTrigger>
                <TooltipPopup>
                  {INSTRUMENTS[root].name} · {contract?.name ?? "Loading contract"}
                  {quote?.timestamp ? ` · ${new Date(quote.timestamp).toLocaleString()}` : ""}
                </TooltipPopup>
              </Tooltip>
              <Menu>
                <MenuTrigger
                  aria-label={`${root} watchlist options`}
                  className="mr-1 flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                >
                  <MoreHorizontalIcon className="size-4" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem disabled={index === 0} onClick={() => move(root, -1)}>
                    Move up
                  </MenuItem>
                  <MenuItem disabled={index === roots.length - 1} onClick={() => move(root, 1)}>
                    Move down
                  </MenuItem>
                  <MenuItem onClick={() => setRoots(roots.filter((item) => item !== root))}>
                    Remove from watchlist
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </div>
          );
        })}
        {!roots.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Add markets to your watchlist.
          </p>
        )}
      </div>
      {status && (
        <p role="status" className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {status}
        </p>
      )}
    </section>
  );
}
