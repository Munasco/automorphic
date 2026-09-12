export function expirationDateText(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseExpirationDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1) return null;
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function parseExpirationDateTime(dateText: string, timeText: string): number | null {
  const date = parseExpirationDate(dateText);
  const match = /^(\d{2}):(\d{2})$/.exec(timeText);
  if (!date || !match) return null;
  const hours = Number(match[1]),
    minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  date.setHours(hours, minutes, 0, 0);
  // Reject dates normalized across a daylight-saving gap instead of silently
  // scheduling the alert for a different local time.
  return expirationDateText(date) === dateText &&
    date.getHours() === hours &&
    date.getMinutes() === minutes
    ? date.getTime()
    : null;
}

export function expirationMonthDays(month: Date): Array<Date | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return Array.from({ length: 42 }, (_, index) =>
    index < offset || index >= offset + count
      ? null
      : new Date(month.getFullYear(), month.getMonth(), index - offset + 1),
  );
}
