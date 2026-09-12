export const INITIAL_BALANCE_TIME_ZONES = ["America/New_York", "America/Chicago", "UTC"] as const;
export type InitialBalanceSettings = {
  startTime: string;
  timeZone: (typeof INITIAL_BALANCE_TIME_ZONES)[number];
  durationMinutes: number;
  sessionEndTime?: string;
  showMidpoint?: boolean;
  showQuarters?: boolean;
  showBox?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  showLabels?: boolean;
  showExpansions?: boolean;
  showHistory?: boolean;
  showDashboard?: boolean;
};
export const DEFAULT_INITIAL_BALANCE: Required<InitialBalanceSettings> = {
  startTime: "09:30",
  timeZone: "America/New_York",
  durationMinutes: 60,
  sessionEndTime: "16:00",
  showMidpoint: true,
  showQuarters: true,
  showBox: true,
  backgroundColor: "#4caf50",
  backgroundOpacity: 0.05,
  showLabels: true,
  showExpansions: true,
  showHistory: true,
  showDashboard: true,
};
export function resolveInitialBalanceSettings(
  settings: InitialBalanceSettings,
): Required<InitialBalanceSettings> {
  return {
    ...settings,
    sessionEndTime: settings.sessionEndTime ?? DEFAULT_INITIAL_BALANCE.sessionEndTime,
    showMidpoint: settings.showMidpoint ?? true,
    showQuarters: settings.showQuarters ?? true,
    showBox: settings.showBox ?? true,
    backgroundColor:
      typeof settings.backgroundColor === "string" &&
      /^#[a-f\d]{6}$/i.test(settings.backgroundColor)
        ? settings.backgroundColor
        : DEFAULT_INITIAL_BALANCE.backgroundColor,
    backgroundOpacity:
      typeof settings.backgroundOpacity === "number" &&
      Number.isFinite(settings.backgroundOpacity) &&
      settings.backgroundOpacity >= 0 &&
      settings.backgroundOpacity <= 1
        ? settings.backgroundOpacity
        : DEFAULT_INITIAL_BALANCE.backgroundOpacity,
    showLabels: settings.showLabels ?? true,
    showExpansions: settings.showExpansions ?? true,
    showHistory: settings.showHistory ?? true,
    showDashboard: settings.showDashboard ?? true,
  };
}
export function isValidInitialBalanceSettings(value: unknown): value is InitialBalanceSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<InitialBalanceSettings>;
  const endTime = settings.sessionEndTime ?? "16:00";
  const startMinutes =
    typeof settings.startTime === "string"
      ? Number(settings.startTime.slice(0, 2)) * 60 + Number(settings.startTime.slice(3))
      : NaN;
  const endMinutes =
    typeof endTime === "string" ? Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3)) : NaN;
  return (
    (settings.backgroundColor === undefined ||
      (typeof settings.backgroundColor === "string" &&
        /^#[a-f\d]{6}$/i.test(settings.backgroundColor))) &&
    (settings.backgroundOpacity === undefined ||
      (typeof settings.backgroundOpacity === "number" &&
        Number.isFinite(settings.backgroundOpacity) &&
        settings.backgroundOpacity >= 0 &&
        settings.backgroundOpacity <= 1)) &&
    typeof endTime === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime) &&
    startMinutes + (settings.durationMinutes ?? NaN) <= endMinutes &&
    (
      [
        "showMidpoint",
        "showQuarters",
        "showBox",
        "showLabels",
        "showExpansions",
        "showHistory",
        "showDashboard",
      ] as const
    ).every((key) => settings[key] === undefined || typeof settings[key] === "boolean") &&
    typeof settings.startTime === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(settings.startTime) &&
    INITIAL_BALANCE_TIME_ZONES.some((zone) => zone === settings.timeZone) &&
    typeof settings.durationMinutes === "number" &&
    Number.isInteger(settings.durationMinutes) &&
    settings.durationMinutes >= 1 &&
    settings.durationMinutes <= 240
  );
}
