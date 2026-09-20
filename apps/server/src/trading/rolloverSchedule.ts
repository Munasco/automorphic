// @effect-diagnostics globalDate:off - Rollover schedule operates on absolute calendar rules.

export interface RollEvent {
  readonly id: string;
  readonly root: string;
  readonly timestamp: number; // UTC seconds
  readonly fromContract: string;
  readonly toContract: string;
  readonly spread: number; // delta = close(new) - close(old)
  readonly formattedDate: string;
}

const CME_INDEX_MONTHS = [
  { code: "H", month: 2 }, // March (0-indexed 2)
  { code: "M", month: 5 }, // June (0-indexed 5)
  { code: "U", month: 8 }, // September (0-indexed 8)
  { code: "Z", month: 11 }, // December (0-indexed 11)
] as const;

const COMEX_GOLD_MONTHS = [
  { code: "G", month: 1 }, // February (0-indexed 1)
  { code: "J", month: 3 }, // April (0-indexed 3)
  { code: "M", month: 5 }, // June (0-indexed 5)
  { code: "Q", month: 7 }, // August (0-indexed 7)
  { code: "V", month: 9 }, // October (0-indexed 9)
  { code: "Z", month: 11 }, // December (0-indexed 11)
] as const;

/**
 * Finds the 3rd Friday of a given year and month (0-indexed).
 */
export function getThirdFridayOfMonth(year: number, month: number): Date {
  const date = new Date(Date.UTC(year, month, 1, 13, 30, 0));
  let fridaysSeen = 0;
  for (let day = 1; day <= 31; day++) {
    date.setUTCDate(day);
    if (date.getUTCMonth() !== month) break;
    if (date.getUTCDay() === 5) {
      // Friday
      fridaysSeen++;
      if (fridaysSeen === 3) return new Date(date.getTime());
    }
  }
  return date;
}

/**
 * CME Equity Index futures roll on the second Thursday before the 3rd Friday (8 calendar days before expiration).
 */
export function getCmeIndexRollDate(year: number, month: number): Date {
  const thirdFriday = getThirdFridayOfMonth(year, month);
  const rollDate = new Date(thirdFriday.getTime());
  rollDate.setUTCDate(thirdFriday.getUTCDate() - 8); // Previous Thursday
  return rollDate;
}

/**
 * COMEX Gold futures roll in the last week of the month preceding the active delivery month.
 */
export function getComexGoldRollDate(year: number, activeMonth: number): Date {
  // 1 month before active month, around the 26th
  const prevMonth = (activeMonth + 11) % 12;
  const rollYear = prevMonth === 11 ? year - 1 : year;
  return new Date(Date.UTC(rollYear, prevMonth, 26, 13, 30, 0));
}

/**
 * Format contract code for a given year digit (e.g. 2026 -> '6', 2027 -> '7').
 */
function contractYearDigit(year: number): string {
  return String(year % 10);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDate(date: Date): string {
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/**
 * Generates historical and upcoming rollover events for a given root.
 */
export function generateRollEvents(
  root: string,
  startYear = 2022,
  endYear = 2027,
): readonly RollEvent[] {
  const normalizedRoot = root
    .toUpperCase()
    .replace(/^@/, "")
    .replace(/[12]!$/, "");
  const isGold = normalizedRoot === "GC" || normalizedRoot === "MGC";
  const events: RollEvent[] = [];

  if (isGold) {
    for (let year = startYear; year <= endYear; year++) {
      for (let i = 0; i < COMEX_GOLD_MONTHS.length; i++) {
        const current = COMEX_GOLD_MONTHS[i]!;
        const next = COMEX_GOLD_MONTHS[(i + 1) % COMEX_GOLD_MONTHS.length]!;
        const nextYear = i === COMEX_GOLD_MONTHS.length - 1 ? year + 1 : year;
        const rollDate = getComexGoldRollDate(year, current.month);
        const fromContract = `${normalizedRoot}${current.code}${contractYearDigit(year)}`;
        const toContract = `${normalizedRoot}${next.code}${contractYearDigit(nextYear)}`;
        // Gold carry is typically in mild contango (~ +$12.50 to +$22.00)
        const spread = normalizedRoot === "MGC" ? 14.5 : 15.0;

        events.push({
          id: `roll-${fromContract}-${toContract}`,
          root: normalizedRoot,
          timestamp: Math.floor(rollDate.getTime() / 1000),
          fromContract,
          toContract,
          spread,
          formattedDate: formatDate(rollDate),
        });
      }
    }
  } else {
    // CME Equity Index (NQ, MNQ, ES, MES)
    for (let year = startYear; year <= endYear; year++) {
      for (let i = 0; i < CME_INDEX_MONTHS.length; i++) {
        const current = CME_INDEX_MONTHS[i]!;
        const next = CME_INDEX_MONTHS[(i + 1) % CME_INDEX_MONTHS.length]!;
        const nextYear = i === CME_INDEX_MONTHS.length - 1 ? year + 1 : year;
        const rollDate = getCmeIndexRollDate(year, current.month);
        const fromContract = `${normalizedRoot}${current.code}${contractYearDigit(year)}`;
        const toContract = `${normalizedRoot}${next.code}${contractYearDigit(nextYear)}`;
        // Nasdaq futures trade at typical cost of carry spread (~ +38.50 pts)
        const spread = 38.5;

        events.push({
          id: `roll-${fromContract}-${toContract}`,
          root: normalizedRoot,
          timestamp: Math.floor(rollDate.getTime() / 1000),
          fromContract,
          toContract,
          spread,
          formattedDate: formatDate(rollDate),
        });
      }
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}
