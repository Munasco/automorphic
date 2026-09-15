import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import type { Candle } from "./chartIndicators";
import { createReplayHistory, replayIndex, replayIndexAt, replayPrefix } from "./replayHistory";
import { formatReplayDateTime, parseReplayDateTime } from "./replayDateTime";
import { TradingSelect } from "./TradingSelect";
import { useChartPreferences, type ChartReplaySpeed } from "./chartPreferences";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";

export function useChartReplay(context: string) {
  const [session, setSession] = useState<{
    context: string;
    bars: readonly Candle[];
    index: number;
    start: number;
    seekVersion: number;
    playing: boolean;
  } | null>(null);
  const speed = useChartPreferences((state) => state.replaySpeed);
  const setSpeed = useChartPreferences((state) => state.setReplaySpeed);
  const active = session?.context === context ? session : null;
  if (session && session.context !== context) setSession(null);
  useEffect(() => {
    if (!active?.playing) return;
    const timer = window.setInterval(() => {
      setSession((current) => {
        if (!current || current.context !== context || !current.playing) return current;
        const index = replayIndex(current.index + 1, current.bars.length);
        return { ...current, index, playing: index < current.bars.length - 1 };
      });
    }, 1000 / speed);
    return () => window.clearInterval(timer);
  }, [active?.playing, context, speed]);
  const history = active?.bars;
  const index = active?.index;
  const visible = useMemo(
    () => (history && index !== undefined ? replayPrefix(history, index) : null),
    [history, index],
  );
  return {
    session: active,
    visible,
    speed,
    setSpeed,
    start(bars: readonly Candle[]) {
      const frozen = createReplayHistory(bars);
      if (frozen.length < 2) return false;
      const index = Math.max(0, frozen.length - 101);
      setSession({ context, bars: frozen, index, start: index, seekVersion: 0, playing: false });
      return true;
    },
    exit: () => setSession(null),
    pause: () =>
      setSession((current) => (current?.playing ? { ...current, playing: false } : current)),
    seek(index: number) {
      setSession((current) =>
        current
          ? {
              ...current,
              index: replayIndex(index, current.bars.length),
              seekVersion: current.seekVersion + 1,
              playing: false,
            }
          : null,
      );
    },
    toggle() {
      setSession((current) =>
        current && current.index < current.bars.length - 1
          ? { ...current, playing: !current.playing }
          : current,
      );
    },
  };
}

const timestamp = (bar: Candle) => bar.actualTime ?? bar.time;
export function ChartReplayControls({
  replay,
  timeZone = "UTC",
}: {
  replay: ReturnType<typeof useChartReplay>;
  timeZone?: string;
}) {
  const session = replay.session;
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  if (!session) return null;
  const { bars, index, playing, start } = session;
  const current = bars[index]!;
  const atEnd = index === bars.length - 1;
  const controls = [
    {
      id: "restart",
      label: "Restart replay",
      icon: RotateCcw,
      action: () => replay.seek(start),
      disabled: false,
    },
    {
      id: "previous",
      label: "Previous replay bar",
      icon: SkipBack,
      action: () => replay.seek(index - 1),
      disabled: index === 0,
    },
    {
      id: "playback",
      label: playing ? "Pause replay" : "Play replay",
      icon: playing ? Pause : Play,
      action: replay.toggle,
      disabled: atEnd,
    },
    {
      id: "next",
      label: "Next replay bar",
      icon: SkipForward,
      action: () => replay.seek(index + 1),
      disabled: atEnd,
    },
  ];
  return (
    <div
      aria-label="Bar replay controls"
      className="flex shrink-0 flex-col gap-1 border-b border-blue-400/20 bg-[#101723] px-2 py-1.5 text-xs text-zinc-300"
    >
      <div
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        data-replay-row="playback"
      >
        <span className="mr-1 shrink-0 text-[11px] font-medium text-blue-300">Replay</span>
        {controls.map(({ id, label, icon: Icon, action, disabled }) => (
          <Tooltip key={id}>
            <TooltipTrigger
              type="button"
              aria-label={label}
              disabled={disabled}
              onClick={action}
              className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10 disabled:opacity-30"
            >
              <Icon className="size-4" />
            </TooltipTrigger>
            <TooltipPopup>{label}</TooltipPopup>
          </Tooltip>
        ))}
        <TradingSelect
          label="Replay speed"
          value={String(replay.speed)}
          options={[
            ["0.5", "0.5 bars/s"],
            ["1", "1 bar/s"],
            ["2", "2 bars/s"],
            ["5", "5 bars/s"],
            ["10", "10 bars/s"],
          ]}
          onChange={(value) => replay.setSpeed(Number(value) as ChartReplaySpeed)}
          variant="ghost"
          className="h-7 w-24 shrink-0 rounded-none"
        />
        <Tooltip>
          <TooltipTrigger
            type="button"
            aria-label="Exit replay and return to live chart"
            onClick={replay.exit}
            className="ml-auto flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10"
          >
            <X className="size-4" />
          </TooltipTrigger>
          <TooltipPopup>Exit replay and return to live chart</TooltipPopup>
        </Tooltip>
      </div>
      <div className="flex min-w-0 items-center gap-2" data-replay-row="position">
        <input
          aria-label="Replay position"
          aria-valuetext={`${index + 1} of ${bars.length} bars`}
          type="range"
          min={0}
          max={bars.length - 1}
          value={index}
          onChange={(event) => replay.seek(Number(event.target.value))}
          className="min-w-8 flex-1 accent-blue-400"
        />
        <span className="shrink-0 whitespace-nowrap text-[11px] text-zinc-500 tabular-nums">
          {index + 1}/{bars.length}
          {atEnd ? " · End" : ""}
        </span>
        <Popover
          open={dateOpen}
          onOpenChange={(open) => {
            setDateOpen(open);
            if (open) {
              replay.pause();
              setDate(formatReplayDateTime(timestamp(current), timeZone));
              setError("");
            }
          }}
        >
          <PopoverTrigger
            aria-label="Choose replay date"
            className="flex h-7 min-w-0 shrink items-center gap-1 rounded px-1 text-[11px] hover:bg-white/10"
          >
            <CalendarDays className="size-3.5 shrink-0" />
            <time
              dateTime={new Date(timestamp(current) * 1000).toISOString()}
              className="truncate tabular-nums"
            >
              {new Date(timestamp(current) * 1000).toLocaleString([], {
                timeZone,
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <ChevronDown className="size-3 shrink-0" />
          </PopoverTrigger>
          <PopoverPopup align="end" className="w-72" viewportClassName="p-3">
            <PopoverTitle className="mb-2 text-sm">Go to replay date</PopoverTitle>
            <form
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const target = parseReplayDateTime(date, timeZone);
                if (target === null) {
                  setError(`Choose a valid, unambiguous time in ${timeZone}.`);
                  return;
                }
                const next = replayIndexAt(bars, target);
                if (next === null) {
                  setError("Choose a time within the loaded replay history.");
                  return;
                }
                setError("");
                replay.seek(next);
                setDateOpen(false);
              }}
            >
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Date and time · {timeZone}
                <input
                  aria-label="Replay start date and time"
                  aria-description={`Time zone: ${timeZone}`}
                  type="datetime-local"
                  step="1"
                  min={formatReplayDateTime(timestamp(bars[0]!), timeZone)}
                  max={formatReplayDateTime(timestamp(bars.at(-1)!), timeZone)}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-9 min-w-0 w-full rounded border border-white/15 bg-transparent px-2 text-xs text-zinc-200 [color-scheme:dark]"
                />
              </label>
              <button
                type="submit"
                aria-label="Jump to replay date"
                disabled={!date}
                className="h-8 rounded bg-blue-500 px-3 text-xs text-white hover:bg-blue-400 disabled:opacity-30"
              >
                Go to date
              </button>
              {error && (
                <p role="alert" className="text-xs text-red-400">
                  {error}
                </p>
              )}
            </form>
          </PopoverPopup>
        </Popover>
      </div>
    </div>
  );
}
