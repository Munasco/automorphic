export interface FuturesSession {
  status: "closed" | "break" | "scheduled-open";
  label: "Market closed" | "Session break" | "Scheduled session";
  reason: string;
  nextOpen: string | null;
  scheduleNote: string;
}

const chicagoClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const scheduleNote =
  "Regular Chicago-time schedule. Holidays, expiry and exchange halts may change these hours.";

// Regular hours: https://www.cmegroup.com/markets/microsuite/metals.html
// Equity pause: https://www.cmegroup.com/trading/equity-index/e-mini-s-and-p-select-sector-futures-faq.html
// Overrides: https://www.cmegroup.com/trading-hours.html
export function getFuturesSession(root: "MGC" | "NQ", now: Date): FuturesSession {
  const parts = chicagoClock.formatToParts(now);
  const day = parts.find((part) => part.type === "weekday")?.value;
  const minute =
    Number(parts.find((part) => part.type === "hour")?.value) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value);

  if (
    day === "Sat" ||
    (day === "Fri" && minute >= 16 * 60) ||
    (day === "Sun" && minute < 17 * 60)
  ) {
    return {
      status: "closed",
      label: "Market closed",
      reason: "Weekend closure",
      nextOpen: "Scheduled to reopen Sunday at 5:00 p.m. CT",
      scheduleNote,
    };
  }

  if (minute >= 16 * 60 && minute < 17 * 60) {
    return {
      status: "break",
      label: "Session break",
      reason: "Daily maintenance, 4:00–5:00 p.m. CT",
      nextOpen: "Scheduled to resume at 5:00 p.m. CT",
      scheduleNote,
    };
  }

  if (root === "NQ" && day !== "Sun" && minute >= 15 * 60 + 15 && minute < 15 * 60 + 30) {
    return {
      status: "break",
      label: "Session break",
      reason: "Equity index pause, 3:15–3:30 p.m. CT",
      nextOpen: "Scheduled to resume at 3:30 p.m. CT",
      scheduleNote,
    };
  }

  return {
    status: "scheduled-open",
    label: "Scheduled session",
    reason: "Within regular trading hours",
    nextOpen: null,
    scheduleNote,
  };
}
