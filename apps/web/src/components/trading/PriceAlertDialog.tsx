import { cn } from "../../lib/utils";
import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { DrawingSelect, inputClass } from "./DrawingStyleControls";
import {
  ALERT_CONDITIONS,
  DEFAULT_CHART_ALERT_NOTIFICATIONS,
  type AlertCondition,
  type ChartPriceAlert,
  type NewChartAlert,
} from "./chartAlerts";
import { parseExpirationDateTime } from "./drawingAlertDates";

type Page = "main" | "message" | "notifications" | "expiration";
const conditions: Record<AlertCondition, string> = {
  crossing: "Crossing",
  "crossing-up": "Crossing up",
  "crossing-down": "Crossing down",
  above: "Above",
  below: "Below",
};
const actionClass =
  "h-[34px] rounded-md border border-[#575757] px-[11px] text-base leading-6 hover:bg-white/10 disabled:opacity-50";
const rowClass =
  "inline-flex min-h-[30px] max-w-full items-center gap-1 rounded text-left text-sm hover:bg-white/5 focus-visible:outline focus-visible:outline-blue-500";
function localDateTime(timestamp: number | null | undefined) {
  if (timestamp == null) return "";
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function PriceAlertDialog({
  alert,
  initialValues,
  symbol,
  initialPrice,
  lastPrice,
  available = true,
  onSubmit,
  onClose,
}: {
  alert?: ChartPriceAlert | undefined;
  initialValues?: NewChartAlert | undefined;
  symbol: string;
  initialPrice?: number | undefined;
  lastPrice?: number | undefined;
  available?: boolean;
  onSubmit: (input: NewChartAlert) => string | null | Promise<string | null>;
  onClose: () => void;
}) {
  const initial = alert ?? initialValues;
  const id = useId();
  const [page, setPage] = useState<Page>("main");
  const [target, setTarget] = useState(() => {
    const price = initial?.price ?? initialPrice;
    return price === undefined ? "" : String(price);
  });
  const [condition, setCondition] = useState<AlertCondition>(initial?.condition ?? "crossing");
  const [repeat, setRepeat] = useState(initial?.repeat ?? false);
  const [cooldownMs, setCooldownMs] = useState(initial?.cooldownMs ?? 60_000);
  const [message, setMessage] = useState({
    name: initial?.name ?? "",
    message: initial?.message ?? "",
  });
  const [messageDraft, setMessageDraft] = useState(message);
  const [notifications, setNotifications] = useState(
    initial?.notifications ?? { ...DEFAULT_CHART_ALERT_NOTIFICATIONS },
  );
  const [notificationDraft, setNotificationDraft] = useState(notifications);
  const [expiration, setExpiration] = useState(() => localDateTime(initial?.expiresAt));
  const [expirationDraft, setExpirationDraft] = useState(expiration);
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
  function changePage(next: Page) {
    setError(null);
    if (next === "message") setMessageDraft({ ...message });
    if (next === "notifications") setNotificationDraft({ ...notifications });
    if (next === "expiration") setExpirationDraft(expiration);
    setPage(next);
  }
  function parseExpiration(value: string) {
    const timestamp = value
      ? parseExpirationDateTime(value.slice(0, 10), value.slice(11, 16))
      : null;
    if (value && (timestamp === null || timestamp <= Date.now())) {
      throw Error("Choose an expiration in the future.");
    }
    return timestamp;
  }
  async function submit() {
    if (submitting.current) return;
    setError(null);
    try {
      if (page !== "main") {
        if (page === "message") setMessage({ ...messageDraft });
        if (page === "notifications") setNotifications({ ...notificationDraft });
        if (page === "expiration") {
          parseExpiration(expirationDraft);
          setExpiration(expirationDraft);
        }
        setPage("main");
        return;
      }
      if (!available)
        throw Error("This alert is no longer available. Close this editor and reopen the alert.");
      if (!target.trim() || !Number.isFinite(Number(target))) throw Error("Enter a target price.");
      const expiresAt = parseExpiration(expiration);
      submitting.current = true;
      setPending(true);
      const failure = await onSubmit({
        price: Number(target),
        condition,
        repeat,
        cooldownMs,
        expiresAt,
        notifications,
        ...(initial?.showLine === undefined ? {} : { showLine: initial.showLine }),
        ...message,
      });
      if (failure) setError(failure);
      else onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the alert.");
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
        backdropStyle={{ background: "transparent", backdropFilter: "none", transition: "none" }}
        showCloseButton={false}
        bottomStickOnMobile={false}
        className="flex w-[480px] max-w-full flex-col overflow-hidden rounded-md border-0 bg-[#1f1f1f] p-0 text-[#dbdbdb] shadow-xl"
      >
        <div className="flex min-h-[71px] shrink-0 items-center gap-3 border-b border-[#434343] px-5">
          {page !== "main" ? (
            <button
              type="button"
              aria-label="Back"
              className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10"
              onClick={() => changePage("main")}
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}
          <DialogTitle className="min-w-0 flex-1 truncate text-xl font-semibold leading-7">
            {page === "main" ? (
              <>
                {alert ? "Edit alert on" : "Create alert on"}{" "}
                <span className="text-base font-medium">{symbol}</span>
              </>
            ) : page === "message" ? (
              "Edit message"
            ) : page === "notifications" ? (
              "Notifications"
            ) : (
              "Expiration"
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
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="min-h-0 overflow-y-auto px-5 py-4 text-sm">
            <fieldset disabled={pending} className="min-w-0">
              {page === "main" ? (
                <>
                  <div className="grid grid-cols-[minmax(80px,30%)_minmax(0,1fr)] items-center gap-y-2">
                    <span className="text-[#8c8c8c]">Condition</span>
                    <div className={`${inputClass} flex items-center`}>Price</div>
                    <span />
                    <DrawingSelect
                      label="Condition"
                      value={condition}
                      options={ALERT_CONDITIONS.map((value) => [value, conditions[value]] as const)}
                      className="h-[34px] w-full"
                      onChange={(value) => {
                        if (ALERT_CONDITIONS.includes(value as AlertCondition))
                          setCondition(value as AlertCondition);
                      }}
                    />
                    <label className="text-[#8c8c8c]" htmlFor={`${id}-price`}>
                      Price
                    </label>
                    <input
                      id={`${id}-price`}
                      className={`${inputClass} w-full`}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      required
                      value={target}
                      onChange={(event) => setTarget(event.target.value)}
                    />
                    {available && Number.isFinite(lastPrice) ? (
                      <>
                        <span />
                        <button
                          type="button"
                          className="text-left text-xs text-blue-400 hover:text-blue-300"
                          onClick={() => setTarget(String(lastPrice))}
                        >
                          Use last price ·{" "}
                          {lastPrice!.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div className="my-5 border-t border-white/10" />
                  <div className="grid grid-cols-[minmax(80px,30%)_minmax(0,1fr)] items-center gap-y-1">
                    <span className="text-[#8c8c8c]">Trigger</span>
                    <DrawingSelect
                      label="Frequency"
                      value={repeat ? "repeat" : "once"}
                      options={[
                        ["once", "Only once"],
                        ["repeat", "Repeating"],
                      ]}
                      variant="ghost"
                      className="h-[30px] min-h-0 w-full border-0 bg-transparent p-0 sm:min-h-0"
                      onChange={(value) => setRepeat(value === "repeat")}
                    />
                    {repeat ? (
                      <>
                        <span className="text-[#8c8c8c]">Cooldown</span>
                        <DrawingSelect
                          label="Time between alerts"
                          value={String(cooldownMs)}
                          options={[
                            ...(![60000, 300000, 900000].includes(cooldownMs)
                              ? [[String(cooldownMs), `${cooldownMs / 1000} seconds`] as const]
                              : []),
                            ["60000", "1 minute"],
                            ["300000", "5 minutes"],
                            ["900000", "15 minutes"],
                          ]}
                          variant="ghost"
                          className="h-[30px] min-h-0 w-full border-0 bg-transparent p-0 sm:min-h-0"
                          onChange={(value) => setCooldownMs(Number(value))}
                        />
                      </>
                    ) : null}
                    <span className="text-[#8c8c8c]">Expiration</span>
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() => changePage("expiration")}
                    >
                      <span className="truncate">
                        {expiration ? new Date(expiration).toLocaleString() : "Open-ended"}
                      </span>
                      <ChevronRight className="size-3 shrink-0" />
                    </button>
                    <span className="text-[#8c8c8c]">Message</span>
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() => changePage("message")}
                    >
                      <span className="truncate">
                        {message.name || message.message || "Edit message"}
                      </span>
                      <ChevronRight className="size-3 shrink-0" />
                    </button>
                    <span className="text-[#8c8c8c]">Notifications</span>
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() => changePage("notifications")}
                    >
                      <span className="truncate">{notificationSummary}</span>
                      <ChevronRight className="size-3 shrink-0" />
                    </button>
                  </div>
                </>
              ) : page === "message" ? (
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-[#8c8c8c]">Alert name</span>
                    <input
                      className={`${inputClass} block w-full`}
                      maxLength={80}
                      placeholder="Optional"
                      value={messageDraft.name}
                      onChange={(event) =>
                        setMessageDraft({ ...messageDraft, name: event.target.value })
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-[#8c8c8c]">Message</span>
                    <textarea
                      className="block h-[180px] w-full resize-y rounded-md border border-[#575757] bg-transparent p-2 text-sm leading-[18px] outline-none focus:border-blue-500"
                      maxLength={2000}
                      placeholder="Optional reminder when this alert triggers"
                      value={messageDraft.message}
                      onChange={(event) =>
                        setMessageDraft({ ...messageDraft, message: event.target.value })
                      }
                    />
                  </label>
                </div>
              ) : page === "notifications" ? (
                <div className="space-y-5 py-2">
                  {(
                    [
                      [
                        "desktop",
                        "Desktop notification",
                        "Displays a notification on your computer.",
                      ],
                      [
                        "toast",
                        "Show toast notification",
                        "Displays a notification in the page corner.",
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
                            setNotificationDraft({
                              ...notificationDraft,
                              [key]: event.target.checked,
                            })
                          }
                        />
                        <span>{title}</span>
                      </label>
                      <p className="text-[#8c8c8c]">{description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  <label className="block space-y-2">
                    <span className="text-[#8c8c8c]">Expiration</span>
                    <input
                      aria-label="Expiration"
                      type="datetime-local"
                      className={`${inputClass} w-full`}
                      value={expirationDraft}
                      onChange={(event) => setExpirationDraft(event.target.value)}
                    />
                  </label>
                  <p className="text-xs text-[#8c8c8c]">
                    {expirationDraft ? "Your local time" : "Open-ended"}
                  </p>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => setExpirationDraft("")}
                  >
                    Open-ended
                  </button>
                </div>
              )}
            </fieldset>
            {!available || error ? (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {!available
                  ? "This alert is no longer available. Close this editor and reopen the alert."
                  : error}
              </p>
            ) : null}
          </div>
          <div className="flex min-h-[67px] shrink-0 items-center justify-end gap-3 border-t border-[#434343] px-5 py-4">
            <button
              type="button"
              className={actionClass}
              disabled={pending}
              onClick={() => (page === "main" ? onClose() : changePage("main"))}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={cn(
                actionClass,
                "border-[#f2f2f2] bg-[#f2f2f2] text-[#131313] hover:bg-white",
              )}
              disabled={pending || !symbol || !available}
            >
              {pending ? "Saving…" : page === "main" ? (alert ? "Save" : "Create") : "Apply"}
            </button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
