import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import {
  expirationDateText,
  expirationMonthDays,
  parseExpirationDate,
  parseExpirationDateTime,
} from "./drawingAlertDates";

const fieldClass =
  "h-[34px] min-w-0 w-full rounded-md border border-[#575757] bg-transparent pl-[9px] pr-[30px] text-sm outline-none focus:border-[#2962ff] aria-invalid:border-red-400";
const navClass =
  "flex size-[34px] shrink-0 items-center justify-center rounded-md hover:bg-white/10 focus-visible:outline-blue-500 disabled:opacity-30";
const periodClass =
  "h-[34px] rounded-md text-base outline-offset-1 focus-visible:outline-blue-500 disabled:text-[#505050]";
const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const quarterHours = Array.from(
  { length: 96 },
  (_, quarter) =>
    `${String(Math.floor(quarter / 4)).padStart(2, "0")}:${String((quarter % 4) * 15).padStart(2, "0")}`,
);

export function DrawingAlertExpiration({
  value,
  onBack,
  onSelect,
}: {
  value: number;
  onBack: () => void;
  onSelect: (timestamp: number) => void;
}) {
  const initial = new Date(value);
  const [now, setNow] = useState(Date.now);
  const [dateText, setDateText] = useState(() => expirationDateText(initial));
  const [timeText, setTimeText] = useState(
    () =>
      `${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`,
  );
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [focused, setFocused] = useState(dateText);
  const [periodFocus, setPeriodFocus] = useState("");
  const [timeOpen, setTimeOpen] = useState(false);
  const [activeTime, setActiveTime] = useState(timeText);
  const focusPending = useRef(false);
  const periodFocusPending = useRef(false);
  const calendar = useRef<HTMLDivElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const timeWrapper = useRef<HTMLDivElement>(null);
  const timeList = useRef<HTMLDivElement>(null);
  const timeListId = useId();
  const todayText = expirationDateText(new Date(now));
  const today = parseExpirationDate(todayText)!;
  const selected = parseExpirationDate(dateText);
  const timestamp = parseExpirationDateTime(dateText, timeText);
  const valid = timestamp !== null && timestamp > now;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearPage = Math.floor(month.getFullYear() / 20) * 20;
  const previousAllowed =
    view === "days"
      ? month > monthStart
      : view === "months"
        ? month.getFullYear() > today.getFullYear()
        : yearPage > today.getFullYear();
  const days = expirationMonthDays(month);
  const focusedDay = days.some((date) => date && expirationDateText(date) === focused)
    ? focused
    : days.find((date) => date && date >= today);
  const dayTabStop = focusedDay instanceof Date ? expirationDateText(focusedDay) : focusedDay;
  const periodStart = view === "months" ? month.getFullYear() * 12 : yearPage;
  const periodCount = view === "months" ? 12 : 20;
  const hasPeriodFocus = Array.from(
    { length: periodCount },
    (_, offset) => `${view}-${periodStart + offset}`,
  ).includes(periodFocus);
  const timeOptions =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(timeText) && !quarterHours.includes(timeText)
      ? [...quarterHours, timeText].sort()
      : quarterHours;

  useLayoutEffect(() => {
    dateInput.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!focusPending.current) return;
    calendar.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
    focusPending.current = false;
  }, [focused]);
  useLayoutEffect(() => {
    if (!periodFocusPending.current) return;
    calendar.current?.querySelector<HTMLButtonElement>(`[data-period="${periodFocus}"]`)?.focus();
    periodFocusPending.current = false;
  }, [periodFocus]);
  useLayoutEffect(() => {
    if (timeOpen) {
      timeList.current
        ?.querySelector<HTMLElement>(`[data-time="${activeTime}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [activeTime, timeOpen]);
  useEffect(() => {
    if (!timeOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !timeWrapper.current?.contains(event.target)) {
        setTimeOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [timeOpen]);

  function choose(date: Date) {
    const text = expirationDateText(date);
    setDateText(text);
    setFocused(text);
  }
  function moveFocus(date: Date, key: string, shift: boolean) {
    const next = new Date(date);
    if (key === "ArrowLeft") next.setDate(next.getDate() - 1);
    else if (key === "ArrowRight") next.setDate(next.getDate() + 1);
    else if (key === "ArrowUp") next.setDate(next.getDate() - 7);
    else if (key === "ArrowDown") next.setDate(next.getDate() + 7);
    else if (key === "Home") next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
    else if (key === "End") next.setDate(next.getDate() + 6 - ((next.getDay() + 6) % 7));
    else if (key === "PageUp" || key === "PageDown") {
      const day = next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + (key === "PageUp" ? -1 : 1) * (shift ? 12 : 1));
      next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    } else return false;
    if (next < today) next.setTime(today.getTime());
    focusPending.current = true;
    setFocused(expirationDateText(next));
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    return true;
  }
  function movePeriodFocus(number: number, key: string) {
    const columns = view === "months" ? 3 : 4;
    const pageSize = view === "months" ? 12 : 20;
    const offset =
      key === "ArrowLeft"
        ? -1
        : key === "ArrowRight"
          ? 1
          : key === "ArrowUp"
            ? -columns
            : key === "ArrowDown"
              ? columns
              : key === "PageUp"
                ? -pageSize
                : key === "PageDown"
                  ? pageSize
                  : null;
    if (offset === null && key !== "Home" && key !== "End") return false;
    const pageStart = view === "months" ? month.getFullYear() * 12 : yearPage;
    let next = offset === null ? pageStart + (key === "End" ? pageSize - 1 : 0) : number + offset;
    const minimum =
      view === "months" ? today.getFullYear() * 12 + today.getMonth() : today.getFullYear();
    next = Math.max(minimum, Math.min(view === "months" ? 9999 * 12 + 11 : 9999, next));
    setMonth(
      view === "months" ? new Date(Math.floor(next / 12), next % 12, 1) : new Date(next, 0, 1),
    );
    periodFocusPending.current = true;
    setPeriodFocus(`${view}-${next}`);
    return true;
  }
  function changePage(direction: number) {
    setMonth(
      new Date(
        month.getFullYear(),
        month.getMonth() + direction * (view === "days" ? 1 : view === "months" ? 12 : 240),
        1,
      ),
    );
  }
  function selectTime(text: string) {
    setTimeText(text);
    setActiveTime(text);
    setTimeOpen(false);
    setNow(Date.now());
  }
  const selectedClass = (isSelected: boolean) =>
    isSelected ? "bg-[#f2f2f2] font-semibold text-[#131313]" : "hover:bg-white/10";

  return (
    <div className="w-[286px] max-w-full pb-3 pl-3 pr-[11px] pt-3 text-sm text-[#dbdbdb]">
      <div className="flex h-[34px] items-center gap-1">
        <button
          type="button"
          aria-label="Back to expiration presets"
          className={navClass}
          onClick={onBack}
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-base font-semibold">Set custom date</span>
      </div>
      <div className="mb-3 mt-5 grid grid-cols-2 gap-3">
        <div className="relative min-w-0">
          <input
            ref={dateInput}
            aria-label="Expiration date"
            placeholder="YYYY-MM-DD"
            className={fieldClass}
            value={dateText}
            aria-invalid={!selected}
            onChange={(event) => {
              const text = event.target.value;
              setDateText(text);
              setNow(Date.now());
              const date = parseExpirationDate(text);
              if (date) {
                setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                setFocused(text);
              }
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Show expiration calendar"
            className="absolute right-[3px] top-[3px] flex size-7 items-center justify-center text-[#8c8c8c]"
            onClick={() => {
              setView("days");
              dateInput.current?.focus();
            }}
          >
            <CalendarDays className="size-5" />
          </button>
        </div>
        <div ref={timeWrapper} className="relative min-w-0">
          <input
            role="combobox"
            aria-label="Expiration time"
            aria-expanded={timeOpen}
            aria-controls={timeListId}
            aria-autocomplete="list"
            aria-activedescendant={timeOpen ? `${timeListId}-${activeTime}` : undefined}
            placeholder="HH:mm"
            autoComplete="off"
            maxLength={5}
            className={fieldClass}
            value={timeText}
            aria-invalid={timestamp === null && !!selected}
            onChange={(event) => {
              setTimeText(event.target.value);
              setNow(Date.now());
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                event.stopPropagation();
                const current = timeOptions.indexOf(timeOpen ? activeTime : timeText);
                const next = Math.max(
                  0,
                  Math.min(timeOptions.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)),
                );
                setActiveTime(timeOptions[next]!);
                setTimeOpen(true);
              } else if (timeOpen && event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                selectTime(activeTime);
              } else if (event.key === "Tab") setTimeOpen(false);
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Choose expiration time"
            aria-expanded={timeOpen}
            aria-controls={timeListId}
            className="absolute right-[3px] top-[3px] flex size-7 items-center justify-center text-[#8c8c8c]"
            onClick={() => {
              setActiveTime(timeOptions.includes(timeText) ? timeText : "00:00");
              setTimeOpen(!timeOpen);
              timeWrapper.current?.querySelector("input")?.focus();
            }}
          >
            <Clock3 className="size-[22px]" />
          </button>
          {timeOpen && (
            <div
              id={timeListId}
              ref={timeList}
              role="listbox"
              aria-label="Expiration times"
              className="absolute left-0 top-full z-10 h-[231px] w-full overflow-y-auto rounded-md bg-[#1f1f1f] py-1.5 shadow-[0_2px_8px_#0008]"
            >
              {timeOptions.map((text) => (
                <div
                  key={text}
                  id={`${timeListId}-${text}`}
                  data-time={text}
                  role="option"
                  aria-selected={text === activeTime}
                  className={`flex h-8 cursor-default items-center px-2 hover:bg-[#353535] ${text === activeTime ? "bg-[#353535]" : ""}`}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => selectTime(text)}
                >
                  {text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={calendar} className="h-[306px]">
        <div className="flex h-[34px] items-center justify-between px-[3px]">
          <button
            type="button"
            aria-label={
              view === "days"
                ? "Previous month"
                : view === "months"
                  ? "Previous year"
                  : "Previous 20 years"
            }
            className={navClass}
            disabled={!previousAllowed}
            onClick={() => changePage(-1)}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label={
              view === "days"
                ? "Switch to months"
                : view === "months"
                  ? "Switch to years"
                  : "Switch to days"
            }
            className="h-[34px] rounded-md px-2 text-base hover:bg-white/10"
            onClick={() =>
              setView(view === "days" ? "months" : view === "months" ? "years" : "days")
            }
          >
            {view === "days"
              ? month.toLocaleDateString(undefined, { month: "long", year: "numeric" })
              : view === "months"
                ? month.getFullYear()
                : `${yearPage} - ${yearPage + 19}`}
          </button>
          <button
            type="button"
            aria-label={
              view === "days" ? "Next month" : view === "months" ? "Next year" : "Next 20 years"
            }
            className={navClass}
            disabled={
              view === "days"
                ? month.getFullYear() === 9999 && month.getMonth() === 11
                : month.getFullYear() >= (view === "months" ? 9999 : 9980)
            }
            onClick={() => changePage(1)}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div
          aria-hidden="true"
          className={`my-3 grid h-[22px] grid-cols-7 items-center rounded-md text-center text-sm text-[#8c8c8c] ${view === "days" ? "bg-[#2e2e2e]" : "invisible"}`}
        >
          {weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        {view === "days" ? (
          <div
            aria-label="Expiration calendar"
            className="grid h-[226px] grid-cols-7 auto-rows-[34px] content-between justify-items-center"
          >
            {days.map((date, slot) => {
              // Empty cells are fixed calendar positions, never reordered records.
              // eslint-disable-next-line react/no-array-index-key
              if (!date) return <span key={`empty-calendar-slot-${slot}`} />;
              const text = expirationDateText(date);
              return (
                <button
                  key={text}
                  type="button"
                  data-date={text}
                  aria-label={date.toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  aria-pressed={text === dateText}
                  aria-current={text === todayText ? "date" : undefined}
                  disabled={date < today}
                  tabIndex={text === dayTabStop ? 0 : -1}
                  className={`${periodClass} w-[34px] ${selectedClass(text === dateText)}`}
                  onFocus={() => setFocused(text)}
                  onClick={() => {
                    choose(date);
                    setNow(Date.now());
                  }}
                  onKeyDown={(event) => {
                    if (moveFocus(date, event.key, event.shiftKey)) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        ) : (
          <div
            aria-label={view === "months" ? "Expiration months" : "Expiration years"}
            className={`grid h-[226px] auto-rows-[34px] content-between gap-x-[3px] ${view === "months" ? "grid-cols-3" : "grid-cols-4"}`}
          >
            {Array.from({ length: view === "months" ? 12 : 20 }, (_, offset) => {
              const number =
                view === "months" ? month.getFullYear() * 12 + offset : yearPage + offset;
              const date =
                view === "months"
                  ? new Date(month.getFullYear(), offset, 1)
                  : new Date(number, 0, 1);
              const key = `${view}-${number}`;
              const isSelected =
                !!selected &&
                selected.getFullYear() === date.getFullYear() &&
                (view === "years" || selected.getMonth() === date.getMonth());
              const isCurrent =
                view === "months" ? offset === month.getMonth() : number === month.getFullYear();
              return (
                <button
                  key={key}
                  type="button"
                  data-period={key}
                  tabIndex={periodFocus === key || (!hasPeriodFocus && isCurrent) ? 0 : -1}
                  aria-label={
                    view === "months"
                      ? date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
                      : String(number)
                  }
                  aria-pressed={isSelected}
                  disabled={view === "months" ? date < monthStart : number < today.getFullYear()}
                  className={`${periodClass} ${selectedClass(isSelected)}`}
                  onFocus={() => setPeriodFocus(key)}
                  onKeyDown={(event) => {
                    if (movePeriodFocus(number, event.key)) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                  onClick={() => {
                    setMonth(date);
                    setView(view === "months" ? "days" : "months");
                    setPeriodFocus("");
                  }}
                >
                  {view === "months"
                    ? date.toLocaleDateString(undefined, { month: "short" })
                    : number}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={!valid}
        className="mt-3 h-10 w-full rounded-md bg-[#f2f2f2] text-base text-[#131313] hover:bg-white disabled:bg-[#353535] disabled:text-[#777]"
        onClick={() => {
          const current = Date.now();
          setNow(current);
          if (timestamp !== null && timestamp > current) onSelect(timestamp);
        }}
      >
        Set {selected ? expirationDateText(selected) : "date"}
      </button>
    </div>
  );
}
