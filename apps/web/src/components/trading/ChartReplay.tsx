import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import type { Candle } from "./chartIndicators";
import { createReplayHistory, replayIndex, replayIndexAt, replayPrefix } from "./replayHistory";
import { formatReplayDateTime, parseReplayDateTime } from "./replayDateTime";
import { TradingSelect } from "./TradingSelect";
import { useChartPreferences, type ChartReplaySpeed } from "./chartPreferences";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function useChartReplay(context: string) {
  const [session, setSession] = useState<{
    context: string;
    bars: readonly Candle[];
    index: number;
    start: number;
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
        if (!current || current.context !== context) return current;
        const index = replayIndex(current.index + 1, current.bars.length);
        return { ...current, index, playing: index < current.bars.length - 1 };
      });
    }, 1000 / speed);
    return () => window.clearInterval(timer);
  }, [active?.playing, context, speed]);
  const visible = useMemo(
    () => (active ? replayPrefix(active.bars, active.index) : null),
    [active],
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
      setSession({ context, bars: frozen, index, start: index, playing: false });
      return true;
    },
    exit: () => setSession(null),
    seek(index: number) {
      setSession((current) =>
        current
          ? { ...current, index: replayIndex(index, current.bars.length), playing: false }
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
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-blue-400/20 bg-[#101723] px-2 py-1.5 text-xs text-zinc-300"
    >
      {controls.map(({ id, label, icon: Icon, action, disabled }) => (
        <Tooltip key={id}>
          <TooltipTrigger
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={action}
            className="flex size-8 items-center justify-center rounded hover:bg-white/10 disabled:opacity-30"
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
          ["0.5", "0.5×"],
          ["1", "1×"],
          ["2", "2×"],
          ["5", "5×"],
          ["10", "10×"],
        ]}
        onChange={(value) => replay.setSpeed(Number(value) as ChartReplaySpeed)}
        variant="ghost"
        className="h-8 w-16 rounded-none"
      />
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-white/10" />
      <time dateTime={new Date(timestamp(current) * 1000).toISOString()} className="tabular-nums">
        {new Date(timestamp(current) * 1000).toLocaleString([], {
          timeZone,
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </time>
      <input
        aria-label="Replay position"
        aria-valuetext={`${index + 1} of ${bars.length} bars`}
        type="range"
        min={0}
        max={bars.length - 1}
        value={index}
        onChange={(event) => replay.seek(Number(event.target.value))}
        className="min-w-24 max-w-56 flex-1 accent-blue-400"
      />
      <span className="text-zinc-500 tabular-nums">
        {index + 1}/{bars.length}
        {atEnd ? " · End" : ""}
      </span>
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          const timestamp = parseReplayDateTime(date, timeZone);
          if (timestamp === null) {
            setError(`Choose a valid, unambiguous time in ${timeZone}.`);
            return;
          }
          const next = replayIndexAt(bars, timestamp);
          if (next === null) {
            setError("Choose a time within the loaded replay history.");
            return;
          }
          setError("");
          replay.seek(next);
        }}
      >
        <input
          aria-label="Replay start date and time"
          aria-description={`Time zone: ${timeZone}`}
          type="datetime-local"
          step="1"
          min={formatReplayDateTime(timestamp(bars[0]!), timeZone)}
          max={formatReplayDateTime(timestamp(bars.at(-1)!), timeZone)}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-8 w-44 border border-white/10 bg-transparent px-2 text-[11px] [color-scheme:dark]"
        />
        <Tooltip>
          <TooltipTrigger
            type="submit"
            aria-label="Jump to replay date"
            disabled={!date}
            className="flex size-8 items-center justify-center hover:bg-white/10 disabled:opacity-30"
          >
            <ArrowRight className="size-4" />
          </TooltipTrigger>
          <TooltipPopup>Jump to date in loaded history</TooltipPopup>
        </Tooltip>
      </form>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label="Exit replay and return to live chart"
          onClick={replay.exit}
          className="ml-auto flex size-8 items-center justify-center rounded hover:bg-white/10"
        >
          <X className="size-4" />
        </TooltipTrigger>
        <TooltipPopup>Exit replay and return to live chart</TooltipPopup>
      </Tooltip>
      {error && (
        <p role="alert" className="basis-full text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
