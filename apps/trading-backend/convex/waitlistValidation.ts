export function normalizeWaitlistEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function allowedWaitlistOrigin(origin: string | null, configured: string): string | null {
  return origin &&
    configured
      .split(",")
      .map((entry) => entry.trim())
      .includes(origin)
    ? origin
    : null;
}
