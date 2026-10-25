/** Only inspect authorization sent to Tradovate's exact account API origins. */
export function tradovateTarget(url: string): "demo" | "live" | null {
  try {
    const value = new URL(url);
    if (
      value.username ||
      value.password ||
      value.port ||
      !["https:", "wss:"].includes(value.protocol)
    )
      return null;
    return value.hostname === "demo.tradovateapi.com"
      ? "demo"
      : value.hostname === "live.tradovateapi.com"
        ? "live"
        : null;
  } catch {
    return null;
  }
}
export function tradovateAuthorization(payload: string): string | null {
  const match = /^authorize\r?\n\d+\r?\n\r?\n([A-Za-z0-9._~-]{30,4096})\s*$/.exec(payload);
  return match?.[1] ?? null;
}
export function tradovateBearer(headers: Record<string, unknown>): string | null {
  for (const [name, value] of Object.entries(headers))
    if (name.toLowerCase() === "authorization" && typeof value === "string")
      return /^Bearer ([A-Za-z0-9._~-]{30,4096})$/i.exec(value)?.[1] ?? null;
  return null;
}
