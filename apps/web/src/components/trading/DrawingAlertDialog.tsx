import { cn } from "../../lib/utils";
import { useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { DrawingAlertExpiration } from "./DrawingAlertExpiration";
import { AlertIcon } from "./AlertIcon";
import { DrawingSelect, inputClass } from "./DrawingStyleControls";
import { defaultDrawingLevels, type ChartDrawing } from "./drawingGeometry";
import {
  isChannelRegionCondition,
  isRectangleRegionCondition,
  isRectangleAlertCondition,
  isFibAlertLevel,
} from "./drawingAlerts";
import type {
  DrawingAlert,
  NewDrawingAlert,
  DrawingAlertCondition,
  DrawingAlertTrigger,
  DrawingAlertChannelBoundary,
} from "./drawingAlerts";

export type DrawingAlertDialogInput = {
  drawingId: string;
  channelBoundary?: DrawingAlertChannelBoundary;
  fibLevel?: number;
  condition: DrawingAlertCondition;
  trigger: DrawingAlertTrigger;
  expiresAt: number | null;
  name: string;
  message: string;
  notifications: { toast: boolean; sound: boolean; desktop: boolean };
};

type Page = "main" | "message" | "notifications";
type MessageDraft = Pick<DrawingAlertDialogInput, "name" | "message">;
const conditions: readonly (readonly [DrawingAlertCondition, string])[] = [
  ["crossing", "Crossing"],
  ["crossing-up", "Crossing Up"],
  ["crossing-down", "Crossing Down"],
  ["above", "Greater Than"],
  ["below", "Less Than"],
  ["entering-channel", "Entering channel"],
  ["exiting-channel", "Exiting channel"],
  ["inside-channel", "Inside channel"],
  ["outside-channel", "Outside channel"],
  ["entering-rectangle", "Entering rectangle"],
  ["exiting-rectangle", "Exiting rectangle"],
  ["inside-rectangle", "Inside rectangle"],
  ["outside-rectangle", "Outside rectangle"],
  ["above-rectangle", "Greater Than"],
  ["below-rectangle", "Less Than"],
];
const triggers: readonly (readonly [DrawingAlertTrigger, string])[] = [
  ["once", "Once only"],
  ["once-per-bar", "Once per bar"],
  ["once-per-bar-close", "Once per bar close"],
  ["once-per-minute", "Once per minute"],
];
const actionClass =
  "h-[34px] rounded-md border border-[#575757] px-[11px] text-base leading-6 hover:bg-white/10 disabled:cursor-wait disabled:opacity-50";
const rowButtonClass =
  "inline-flex h-[30px] max-w-full items-center gap-1 rounded text-left text-sm leading-[18px] hover:bg-white/5 focus-visible:outline focus-visible:outline-blue-500";
const drawingLabels: Partial<Record<ChartDrawing["kind"], string>> = {
  trend: "Trendline",
  "info-line": "Info line",
  "extended-line": "Extended line",
  "trend-angle": "Trend angle",
  ray: "Ray",
  arrow: "Arrow",
  horizontal: "Horizontal line",
  "horizontal-ray": "Horizontal ray",
  vertical: "Vertical line",
  channel: "Parallel channel",
  rectangle: "Rectangle",
  fib: "Fib retracement",
};

function monthAhead(now = Date.now()) {
  const date = new Date(now);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  date.setSeconds(0, 0);
  return date.getTime();
}

function expirationLabel(timestamp: number | null) {
  return timestamp === null
    ? "Open-ended"
    : new Intl.DateTimeFormat(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(timestamp);
}

/** Each subpage edits a separate draft; only the final save calls the persistence boundary. */
export function DrawingAlertDialog({
  drawing,
  alert,
  initialValues,
  symbol,
  intervalLabel,
  onClose,
  onSubmit,
}: {
  drawing: ChartDrawing;
  alert?: DrawingAlert | undefined;
  initialValues?: NewDrawingAlert | undefined;
  symbol: string;
  intervalLabel: string;
  onClose: () => void;
  onSubmit: (input: DrawingAlertDialogInput) => string | null | Promise<string | null>;
}) {
  const initial = alert ?? initialValues;
  const vertical = drawing.kind === "vertical";
  const rectangle = drawing.kind === "rectangle";
  const fib = drawing.kind === "fib";
  const configuredLevels = (drawing.levels ?? defaultDrawingLevels(drawing.kind)).filter((level) =>
    isFibAlertLevel(level.value),
  );
  const [fibLevel, setFibLevel] = useState(
    initial?.fibLevel ??
      configuredLevels.find((level) => level.value === 0.618)?.value ??
      configuredLevels[0]?.value ??
      0.618,
  );
  const fibOptions: Array<readonly [string, string]> = [
    ...new Map(
      configuredLevels.map((level) => [
        level.value,
        [String(level.value), `${level.value}${level.visible ? "" : " (hidden)"}`] as const,
      ]),
    ).values(),
  ];
  if (!fibOptions.some(([value]) => value === String(fibLevel)))
    fibOptions.push([String(fibLevel), `${fibLevel} (saved)`]);
  const messageInterval = /^\d+m$/.test(intervalLabel) ? intervalLabel.slice(0, -1) : intervalLabel;
  const [page, setPage] = useState<Page>("main");
  const [condition, setCondition] = useState<DrawingAlertCondition>(
    initial?.condition ?? (rectangle ? "entering-rectangle" : "crossing"),
  );
  const [trigger, setTrigger] = useState<DrawingAlertTrigger>(initial?.trigger ?? "once");
  const [expiresAt, setExpiresAt] = useState<number | null>(() =>
    initial ? initial.expiresAt : monthAhead(),
  );
  const channel = drawing.kind === "channel";
  const [channelBoundary, setChannelBoundary] = useState<DrawingAlertChannelBoundary>(
    initial?.channelBoundary ?? "upper",
  );
  const baseLabel = drawing.name || drawingLabels[drawing.kind] || "Drawing";
  const targetLabel = (
    value: DrawingAlertCondition,
    boundary = channelBoundary,
    ratio = fibLevel,
  ) =>
    fib
      ? `${baseLabel} ${ratio} level`
      : value === "above-rectangle"
        ? `${baseLabel} upper boundary`
        : value === "below-rectangle"
          ? `${baseLabel} lower boundary`
          : channel && !isChannelRegionCondition(value)
            ? `${baseLabel} ${boundary} boundary`
            : baseLabel;
  const defaultMessage = (
    value: DrawingAlertCondition,
    boundary = channelBoundary,
    ratio = fibLevel,
  ) => {
    const conditionLabel = conditions.find(([key]) => key === value)![1];
    const region = isChannelRegionCondition(value) || isRectangleRegionCondition(value);
    const suffix =
      region && !drawing.name ? "" : ` ${targetLabel(value, boundary, ratio).toLowerCase()}`;
    return `${symbol}, ${messageInterval} ${conditionLabel}${suffix}`;
  };
  const [message, setMessage] = useState<MessageDraft>(() => ({
    name: initial?.name ?? "",
    message: initial ? (initial.message ?? "") : defaultMessage(condition),
  }));
  const [messageDraft, setMessageDraft] = useState(message);
  const [notifications, setNotifications] = useState(() =>
    initial
      ? {
          toast: initial.notifications?.toast !== false,
          sound: initial.notifications?.sound ?? false,
          desktop: initial.notifications?.desktop ?? false,
        }
      : { toast: true, sound: true, desktop: true },
  );
  const [notificationDraft, setNotificationDraft] = useState(notifications);
  const [expirationOpen, setExpirationOpen] = useState(false);
  const [expirationNow, setExpirationNow] = useState(Date.now);
  const [customExpiration, setCustomExpiration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const notificationSummary =
    [
      notifications.desktop && "Desktop",
      notifications.toast && "Toasts",
      notifications.sound && "Sound",
    ]
      .filter(Boolean)
      .join(", ") || "None";

  function changeCondition(next: DrawingAlertCondition) {
    const previousDefault = defaultMessage(condition);
    setMessage((current) =>
      current.message === previousDefault
        ? {
            ...current,
            message: defaultMessage(next),
          }
        : current,
    );
    setCondition(next);
  }

  function setExpiration(value: number | null) {
    setExpiresAt(value);
    setExpirationOpen(false);
    setCustomExpiration(false);
  }

  async function create() {
    if (submitting.current) return;
    if (expiresAt !== null && expiresAt <= Date.now()) {
      setError("Choose an expiration in the future.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const failure = await onSubmit({
        drawingId: drawing.id,
        ...(channel && !isChannelRegionCondition(condition) ? { channelBoundary } : {}),
        ...(fib ? { fibLevel } : {}),
        condition: vertical ? "crossing" : condition,
        trigger: vertical ? "once" : trigger,
        expiresAt,
        ...message,
        notifications,
      });
      if (failure) setError(failure);
      else onClose();
    } catch {
      setError("Could not save the alert. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose();
      }}
    >
      <DialogPopup
        showCloseButton={false}
        bottomStickOnMobile={false}
        backdropStyle={{ background: "transparent", backdropFilter: "none" }}
        className="w-[480px] max-w-[calc(100vw-32px)] translate-y-0 scale-100 overflow-hidden rounded-md border-0 bg-[#1f1f1f] p-0 text-[#dbdbdb] shadow-xl transition-none data-starting-style:scale-100 data-ending-style:scale-100 data-starting-style:opacity-100 data-ending-style:opacity-100"
        style={{
          maxHeight: "calc(100dvh - 40px)",
          fontFamily: '-apple-system, "system-ui", "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        }}
      >
        <div className="flex h-[71px] shrink-0 items-center gap-3 border-b border-[#434343] px-5">
          {page !== "main" ? (
            <button
              type="button"
              aria-label="Back"
              className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10"
              onClick={() => setPage("main")}
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}
          <DialogTitle className="min-w-0 flex-1 truncate text-xl font-semibold leading-7">
            {page === "main" ? (
              <>
                {alert ? "Edit alert on" : "Create alert on"}{" "}
                <span className="text-base font-medium">
                  {symbol}, {intervalLabel}
                </span>
              </>
            ) : page === "message" ? (
              "Edit message"
            ) : (
              "Notifications"
            )}
          </DialogTitle>
          <button
            type="button"
            aria-label="Close alert dialog"
            disabled={pending}
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded hover:bg-white/10 disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto text-sm">
          {page === "main" ? (
            <div
              className={`${vertical ? "min-h-[307px]" : fib || (channel && !isChannelRegionCondition(condition)) ? "min-h-[379px]" : "min-h-[337px]"} px-5 py-4`}
            >
              <div className="grid grid-cols-[minmax(90px,30%)_minmax(0,1fr)] gap-x-0 gap-y-2 pr-[5px]">
                <span className="self-center text-[#8c8c8c]">Condition</span>
                <div className={`${inputClass} flex items-center`}>Price</div>
                <span />
                {vertical ? (
                  <button
                    type="button"
                    aria-label="Alert condition"
                    disabled
                    aria-disabled="true"
                    className={`${inputClass} flex w-full items-center gap-2 text-left`}
                    style={{ backgroundColor: "#2e2e2e", color: "#dbdbdb" }}
                  >
                    <AlertIcon name="crossing" size={22} />
                    <span className="flex-1">Crossing</span>
                    <ChevronDown className="size-3 text-[#8c8c8c]" />
                  </button>
                ) : (
                  <DrawingSelect
                    label="Alert condition"
                    value={condition}
                    options={conditions.filter(([value]) =>
                      rectangle
                        ? isRectangleAlertCondition(value)
                        : !isRectangleAlertCondition(value) &&
                          (channel || !isChannelRegionCondition(value)),
                    )}
                    className="h-[34px] w-full"
                    onChange={(value) => {
                      const next = conditions.find(([key]) => key === value);
                      if (next) changeCondition(next[0]);
                    }}
                  />
                )}
                <span />
                <input
                  aria-label="Drawing"
                  className={`${inputClass} w-full bg-white/5`}
                  value={rectangle ? targetLabel(condition) : baseLabel}
                  readOnly
                />
                {fib ? (
                  <>
                    <span className="self-center text-[#8c8c8c]">Level</span>
                    <DrawingSelect
                      label="Fibonacci level"
                      value={String(fibLevel)}
                      options={fibOptions}
                      className="h-[34px] w-full"
                      onChange={(value) => {
                        const next = Number(value);
                        if (!isFibAlertLevel(next)) return;
                        const previousDefault = defaultMessage(condition);
                        setMessage((current) =>
                          current.message === previousDefault
                            ? {
                                ...current,
                                message: defaultMessage(condition, channelBoundary, next),
                              }
                            : current,
                        );
                        setFibLevel(next);
                      }}
                    />
                  </>
                ) : null}
                {channel && !isChannelRegionCondition(condition) ? (
                  <>
                    <span className="self-center text-[#8c8c8c]">Boundary</span>
                    <DrawingSelect
                      label="Channel boundary"
                      value={channelBoundary}
                      options={[
                        ["upper", "Upper boundary"],
                        ["lower", "Lower boundary"],
                      ]}
                      className="h-[34px] w-full"
                      onChange={(value) => {
                        if (value !== "upper" && value !== "lower") return;
                        const previousDefault = defaultMessage(condition);
                        setMessage((current) =>
                          current.message === previousDefault
                            ? {
                                ...current,
                                message: defaultMessage(condition, value),
                              }
                            : current,
                        );
                        setChannelBoundary(value);
                      }}
                    />
                  </>
                ) : null}
              </div>
              <div className="mb-4 mt-[50px] border-t border-white/10" />
              <div className="grid grid-cols-[minmax(90px,30%)_minmax(0,1fr)] items-center pr-[5px] leading-[18px]">
                {!vertical ? (
                  <>
                    <span className="text-[#8c8c8c]">Trigger</span>
                    <DrawingSelect
                      label="Alert trigger"
                      value={trigger}
                      options={triggers}
                      variant="ghost"
                      className="h-[30px] min-h-0 w-fit max-w-full border-0 bg-transparent p-0 text-sm shadow-none sm:min-h-0"
                      onChange={(value) => {
                        const next = triggers.find(([key]) => key === value);
                        if (next) setTrigger(next[0]);
                      }}
                    />
                  </>
                ) : null}
                <span className="text-[#8c8c8c]">Expiration</span>
                <Popover
                  open={expirationOpen}
                  onOpenChange={(open) => {
                    setExpirationOpen(open);
                    if (open) setExpirationNow(Date.now());
                    if (!open) {
                      setCustomExpiration(false);
                    }
                  }}
                >
                  <PopoverTrigger className={rowButtonClass}>
                    <span className="truncate">{expirationLabel(expiresAt)}</span>
                    <ChevronDown className="size-3 shrink-0" />
                  </PopoverTrigger>
                  <PopoverPopup
                    align="start"
                    side={customExpiration ? "top" : "bottom"}
                    sideOffset={-2}
                    className={`${customExpiration ? "w-[286px]" : "w-[209px]"} max-w-[calc(100vw-24px)] rounded-md border-0 bg-[#1f1f1f] p-0 text-[#dbdbdb] shadow-xl`}
                    style={{ background: "#1f1f1f", backdropFilter: "none", border: 0 }}
                    viewportClassName="p-0"
                    instant
                    alignOffset={-8}
                  >
                    {customExpiration ? (
                      <DrawingAlertExpiration
                        value={expiresAt ?? monthAhead()}
                        onBack={() => setCustomExpiration(false)}
                        onSelect={setExpiration}
                      />
                    ) : (
                      <div className="flex flex-col gap-0.5 p-1.5">
                        {(
                          [
                            ["Open-ended", null],
                            [
                              "End of day",
                              (() => {
                                const date = new Date(expirationNow);
                                date.setHours(23, 59, 59, 999);
                                return date.getTime();
                              })(),
                            ],
                            [
                              "1 week",
                              (() => {
                                const date = new Date(expirationNow);
                                date.setDate(date.getDate() + 7);
                                return date.getTime();
                              })(),
                            ],
                            ["1 month", monthAhead(expirationNow)],
                          ] as const
                        ).map(([text, value]) => (
                          <button
                            key={text}
                            type="button"
                            className="flex h-8 w-full items-center justify-between gap-2 rounded px-1 text-left text-sm hover:bg-white/10"
                            onClick={() => setExpiration(value)}
                          >
                            <span>{text}</span>
                            <span className="text-xs text-[#8c8c8c]">
                              {value === null
                                ? "Won’t expire"
                                : `${new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${String(new Date(value).getHours()).padStart(2, "0")}:${String(new Date(value).getMinutes()).padStart(2, "0")}`}
                            </span>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="flex h-8 w-full items-center justify-between rounded px-1 text-left text-sm hover:bg-white/10"
                          onClick={() => setCustomExpiration(true)}
                        >
                          Custom date <ChevronRight className="size-[18px]" />
                        </button>
                      </div>
                    )}
                  </PopoverPopup>
                </Popover>
                <span className="text-[#8c8c8c]">Message</span>
                <button
                  type="button"
                  className={rowButtonClass}
                  onClick={() => {
                    setMessageDraft({ ...message });
                    setPage("message");
                  }}
                >
                  <span className="truncate">
                    {message.name || message.message || "Edit message"}
                  </span>
                  <ChevronRight className="size-3 shrink-0" />
                </button>
                <span className="text-[#8c8c8c]">Notifications</span>
                <button
                  type="button"
                  className={rowButtonClass}
                  onClick={() => {
                    setNotificationDraft({ ...notifications });
                    setPage("notifications");
                  }}
                >
                  <span className="truncate">{notificationSummary}</span>
                  <ChevronRight className="size-3 shrink-0" />
                </button>
              </div>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-red-400">
                  {error}
                </p>
              ) : null}
            </div>
          ) : page === "message" ? (
            <div className="min-h-[370px] space-y-4 px-5 py-4">
              <label className="block space-y-2">
                <span className="text-[#8c8c8c]">Alert name</span>
                <input
                  className={`${inputClass} block w-full`}
                  maxLength={100}
                  value={messageDraft.name}
                  onChange={(event) =>
                    setMessageDraft({ ...messageDraft, name: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-2">
                <span className="text-[#8c8c8c]">Message</span>
                <textarea
                  className="block h-[200px] w-full resize-none rounded-md border border-[#575757] bg-transparent p-2 text-sm leading-[18px] outline-none focus:border-blue-500"
                  maxLength={2000}
                  value={messageDraft.message}
                  onChange={(event) =>
                    setMessageDraft({ ...messageDraft, message: event.target.value })
                  }
                />
              </label>
            </div>
          ) : (
            <div className="space-y-6 px-5 py-6">
              {(
                [
                  ["desktop", "Desktop notification", "Displays a notification on your computer."],
                  [
                    "toast",
                    "Show toast notification",
                    "Displays an onsite notification in the page corner.",
                  ],
                  ["sound", "Play sound", "Plays an audio cue when your alert triggers."],
                ] as const
              ).map(([key, title, description]) => (
                <div key={key} className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-[18px] accent-[#dbdbdb]"
                      checked={notificationDraft[key]}
                      onChange={(event) =>
                        setNotificationDraft({ ...notificationDraft, [key]: event.target.checked })
                      }
                    />
                    <span>{title}</span>
                  </label>
                  <p className="text-[#8c8c8c]">{description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex h-[67px] shrink-0 items-center justify-end gap-3 border-t border-[#434343] px-5 py-4">
          <button
            type="button"
            className={actionClass}
            disabled={pending}
            onClick={() => (page === "main" ? onClose() : setPage("main"))}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              actionClass,
              "border-[#f2f2f2] bg-[#f2f2f2] text-[#131313] hover:bg-white",
            )}
            disabled={pending}
            onClick={() => {
              if (page === "main") void create();
              else {
                if (page === "message") setMessage({ ...messageDraft });
                else setNotifications({ ...notificationDraft });
                setPage("main");
              }
            }}
          >
            {pending ? "Saving…" : page === "main" ? (alert ? "Save" : "Create") : "Apply"}
          </button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
