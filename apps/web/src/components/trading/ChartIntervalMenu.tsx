import { useRef, useSyncExternalStore } from "react";
import { CheckIcon, ChevronDownIcon, StarIcon } from "lucide-react";
import { Menu, MenuTrigger, MenuPopup, MenuGroup, MenuGroupLabel, MenuItem } from "../ui/menu";
import { useChartPreferences } from "./chartPreferences";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import {
  CHART_MENU_INTERVALS,
  chartIntervalKey,
  formatChartInterval,
  type ChartInterval,
} from "./tradingIntervals";

const groups = (["Seconds", "Minutes", "Hours", "Days", "Weeks", "Months"] as const).map(
  (group) => ({
    group,
    items: CHART_MENU_INTERVALS.filter((item) =>
      group === "Seconds"
        ? item.unit === "second"
        : group === "Days"
          ? item.unit === "day"
          : group === "Weeks"
            ? item.unit === "week"
            : group === "Months"
              ? item.unit === "month"
              : item.unit === "minute" &&
                (group === "Minutes" ? item.value < 60 : item.value >= 60),
    ).map((interval) => {
      const count = group === "Hours" ? interval.value / 60 : interval.value;
      return {
        interval,
        key: chartIntervalKey(interval),
        label: `${count} ${group.toLowerCase().slice(0, -1)}${count === 1 ? "" : "s"}`,
      };
    }),
  }),
);
const allItems = groups.flatMap((group) => group.items);

export function ChartIntervalMenu({
  interval,
  onChange,
}: {
  interval: ChartInterval;
  onChange: (interval: ChartInterval) => void;
}) {
  const favorites = useChartPreferences((state) => state.favoriteChartIntervals);
  const toggleFavorite = useChartPreferences((state) => state.toggleFavoriteChartInterval);
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const starItems = useRef(new Map<string, HTMLElement>());
  const favoritesGroup = {
    group: "Favorites",
    items: favorites.flatMap((key) => allItems.filter((item) => item.key === key)),
  };
  return (
    <Menu>
      <MenuTrigger
        aria-label="Chart interval"
        className="flex h-9 shrink-0 items-center gap-1 rounded-none px-2 text-sm text-zinc-400 hover:bg-white/5"
      >
        {formatChartInterval(interval)}
        <ChevronDownIcon className="size-3 opacity-50" />
      </MenuTrigger>
      <MenuPopup
        align="end"
        sideOffset={0}
        className="w-56 max-h-[min(var(--available-height),32rem)] overflow-y-auto rounded-none"
      >
        {[favoritesGroup, ...groups]
          .filter((group) => group.items.length)
          .map(({ group, items }) => (
            <MenuGroup key={group} aria-label={group}>
              <MenuGroupLabel>{group}</MenuGroupLabel>
              {items.map((item) => {
                const favorite = favorites.includes(item.key);
                const selected = chartIntervalKey(interval) === item.key;
                return (
                  <div key={item.key} className="group/interval flex items-center">
                    <MenuItem
                      aria-label={item.label}
                      aria-current={selected ? "true" : undefined}
                      className="min-w-0 flex-1 rounded-none"
                      onClick={() => onChange(item.interval)}
                    >
                      <CheckIcon className={selected ? "size-3.5" : "invisible size-3.5"} />
                      {item.label}
                    </MenuItem>
                    <MenuItem
                      ref={(node) => {
                        if (group !== "Favorites") {
                          if (node) starItems.current.set(item.key, node);
                          else starItems.current.delete(item.key);
                        }
                      }}
                      aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${item.label}`}
                      disabled={!workspace.ready}
                      closeOnClick={false}
                      className="w-8 shrink-0 justify-center rounded-none px-0 opacity-0 group-hover/interval:opacity-100 group-focus-within/interval:opacity-100 data-highlighted:opacity-100 [@media(hover:none)]:opacity-100"
                      style={favorite ? { opacity: 1 } : undefined}
                      onClick={() => {
                        toggleFavorite(item.key);
                        if (group === "Favorites")
                          requestAnimationFrame(() => starItems.current.get(item.key)?.focus());
                      }}
                    >
                      <StarIcon
                        className={favorite ? "size-3.5 fill-amber-400 text-amber-400" : "size-3.5"}
                      />
                    </MenuItem>
                  </div>
                );
              })}
            </MenuGroup>
          ))}
      </MenuPopup>
    </Menu>
  );
}
