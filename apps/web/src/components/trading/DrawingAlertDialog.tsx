import { useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { DrawingSelect, inputClass } from "./DrawingStyleControls";
import type { ChartDrawing } from "./drawingGeometry";
import type { DrawingAlertCondition, DrawingAlertTrigger } from "./drawingAlerts";

export type DrawingAlertDialogInput = {
  drawingId: string;
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
  "inline-flex max-w-full items-center gap-1 rounded text-left text-sm leading-[18px] hover:bg-white/5 focus-visible:outline focus-visible:outline-blue-500";
const drawingLabels: Partial<Record<ChartDrawing["kind"], string>> = {
  trend: "Trendline",
  "info-line": "Info line",
  "extended-line": "Extended line",
  "trend-angle": "Trend angle",
  ray: "Ray",
  arrow: "Arrow",
  horizontal: "Horizontal line",
  "horizontal-ray": "Horizontal ray",
};

function monthAhead() {
  const date = new Date();
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  date.setSeconds(0, 0);
  return date.getTime();
}

function localDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

/** Each subpage edits a separate draft; only Create calls the persistence boundary. */
export function DrawingAlertDialog({
  drawing,
  symbol,
  intervalLabel,
  onClose,
  onCreate,
}: {
  drawing: ChartDrawing;
  symbol: string;
  intervalLabel: string;
  onClose: () => void;
  onCreate: (input: DrawingAlertDialogInput) => string | null | Promise<string | null>;
}) {
  const [page, setPage] = useState<Page>("main");
  const [condition, setCondition] = useState<DrawingAlertCondition>("crossing");
  const [trigger, setTrigger] = useState<DrawingAlertTrigger>("once");
  const [expiresAt, setExpiresAt] = useState<number | null>(monthAhead);
  const label = drawing.name || drawingLabels[drawing.kind] || "Drawing";
  const [message, setMessage] = useState<MessageDraft>(() => ({
    name: "",
    message: `${symbol}, ${intervalLabel} Crossing ${label.toLowerCase()}`,
  }));
  const [messageDraft, setMessageDraft] = useState(message);
  const [notifications, setNotifications] = useState({ toast: true, sound: true, desktop: true });
  const [notificationDraft, setNotificationDraft] = useState(notifications);
  const [expirationOpen, setExpirationOpen] = useState(false);
  const [customExpiration, setCustomExpiration] = useState(false);
  const [dateDraft, setDateDraft] = useState(() => localDateTime(expiresAt!));
  const [dateError, setDateError] = useState<string | null>(null);
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
    const previousLabel = conditions.find(([key]) => key === condition)![1];
    const nextLabel = conditions.find(([key]) => key === next)![1];
    const previousDefault = `${symbol}, ${intervalLabel} ${previousLabel} ${label.toLowerCase()}`;
    setMessage((current) =>
      current.message === previousDefault
        ? { ...current, message: `${symbol}, ${intervalLabel} ${nextLabel} ${label.toLowerCase()}` }
        : current,
    );
    setCondition(next);
  }

  function setExpiration(value: number | null) {
    setExpiresAt(value);
    setDateError(null);
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
      const failure = await onCreate({
        drawingId: drawing.id,
        condition,
        trigger,
        expiresAt,
        ...message,
        notifications,
      });
      if (failure) setError(failure);
      else onClose();
    } catch {
      setError("Could not create the alert. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const height = page === "main" ? 475 : page === "message" ? 508 : 406;
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
        className="fixed left-1/2 w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 translate-y-0 scale-100 overflow-hidden rounded-md border-0 bg-[#1f1f1f] p-0 text-[#dbdbdb] shadow-xl transition-opacity data-starting-style:scale-100 data-ending-style:scale-100"
        style={{
          top: `max(20px, min(calc(50dvh - 237.5px), calc(100dvh - ${height}px - 20px)))`,
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
                Create alert on{" "}
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
            <div className="min-h-[337px] px-5 py-4">
              <div className="grid grid-cols-[minmax(90px,30%)_minmax(0,1fr)] gap-x-0 gap-y-2 pr-[5px]">
                <span className="self-center text-[#8c8c8c]">Condition</span>
                <div className={`${inputClass} flex items-center`}>Price</div>
                <span />
                <DrawingSelect
                  label="Alert condition"
                  value={condition}
                  options={conditions}
                  className="h-[34px] w-full"
                  onChange={(value) => {
                    const next = conditions.find(([key]) => key === value);
                    if (next) changeCondition(next[0]);
                  }}
                />
                <span />
                <input
                  aria-label="Drawing"
                  className={`${inputClass} w-full bg-white/5`}
                  value={label}
                  readOnly
                />
              </div>
              <div className="mb-4 mt-[50px] border-t border-white/10" />
              <div className="grid grid-cols-[minmax(90px,30%)_minmax(0,1fr)] items-center gap-y-3 pr-[5px] leading-[18px]">
                <span className="text-[#8c8c8c]">Trigger</span>
                <DrawingSelect
                  label="Alert trigger"
                  value={trigger}
                  options={triggers}
                  variant="ghost"
                  className="h-[18px] min-h-0 w-fit max-w-full border-0 bg-transparent p-0 text-sm shadow-none sm:min-h-0"
                  onChange={(value) => {
                    const next = triggers.find(([key]) => key === value);
                    if (next) setTrigger(next[0]);
                  }}
                />
                <span className="text-[#8c8c8c]">Expiration</span>
                <Popover
                  open={expirationOpen}
                  onOpenChange={(open) => {
                    setExpirationOpen(open);
                    if (!open) {
                      setCustomExpiration(false);
                      setDateError(null);
                    }
                  }}
                >
                  <PopoverTrigger className={rowButtonClass}>
                    <span className="truncate">{expirationLabel(expiresAt)}</span>
                    <ChevronDown className="size-3 shrink-0" />
                  </PopoverTrigger>
                  <PopoverPopup
                    align="start"
                    sideOffset={4}
                    className="w-[285px] rounded-md border-0 bg-[#1f1f1f] p-1.5 text-[#dbdbdb] shadow-xl"
                  >
                    {customExpiration ? (
                      <div className="space-y-3 p-1.5">
                        <div className="font-medium">Set custom date</div>
                        <input
                          aria-label="Expiration date and time"
                          type="datetime-local"
                          className={`${inputClass} w-full [color-scheme:dark]`}
                          value={dateDraft}
                          onChange={(event) => setDateDraft(event.target.value)}
                        />
                        {dateError ? (
                          <p role="alert" className="text-xs text-red-400">
                            {dateError}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className={`${actionClass} w-full`}
                          onClick={() => {
                            const date = new Date(dateDraft).getTime();
                            if (!Number.isFinite(date) || date <= Date.now())
                              setDateError("Choose a date and time in the future.");
                            else setExpiration(date);
                          }}
                        >
                          Set date
                        </button>
                      </div>
                    ) : (
                      [
                        ["Open-ended", () => setExpiration(null)],
                        [
                          "End of day",
                          () => {
                            const date = new Date();
                            date.setHours(23, 59, 59, 999);
                            setExpiration(date.getTime());
                          },
                        ],
                        [
                          "1 week",
                          () => {
                            const date = new Date();
                            date.setDate(date.getDate() + 7);
                            setExpiration(date.getTime());
                          },
                        ],
                        ["1 month", () => setExpiration(monthAhead())],
                        [
                          "Custom date",
                          () => {
                            setDateDraft(localDateTime(expiresAt ?? monthAhead()));
                            setCustomExpiration(true);
                          },
                        ],
                      ].map(([text, action]) => (
                        <button
                          key={String(text)}
                          type="button"
                          className="flex h-[34px] w-full items-center rounded px-2 text-left text-sm hover:bg-white/10"
                          onClick={action as () => void}
                        >
                          {String(text)}
                        </button>
                      ))
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
            className={`${actionClass} border-[#f2f2f2] bg-[#f2f2f2] text-[#131313] hover:bg-white`}
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
            {pending ? "Creating…" : page === "main" ? "Create" : "Apply"}
          </button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
