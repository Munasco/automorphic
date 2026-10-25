import type { TelegramChannel } from "@t3tools/contracts";

export type TelegramChannelSelection = { added: string[]; removed: string[] };

/** Match trading words and common FX handles without treating every “fx” substring as finance. */
export function isTradingTelegramChannel(channel: Pick<TelegramChannel, "title" | "username">) {
  return [channel.title, channel.username ?? ""].some((name) => {
    const words = name
      .normalize("NFKC")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase();
    return (
      /(?:^|[^a-z])(?:trade|trades|trader|traders|trading|forex|fx|futures|stocks|crypto|nasdaq|xauusd)(?:$|[^a-z])/.test(
        words,
      ) ||
      /(?:trades?|traders?|trading|forex|fx)$/.test(words) ||
      /^fx(?:signals?|trades?|traders?|trading|markets?)(?:$|[^a-z])/.test(words)
    );
  });
}

export function readTelegramChannelSelection(value: string | null): TelegramChannelSelection {
  try {
    const saved: unknown = JSON.parse(value ?? "null");
    const ids = (value: unknown) =>
      Array.isArray(value)
        ? [
            ...new Set(
              value.filter((id): id is string => typeof id === "string" && /^\d{1,20}$/.test(id)),
            ),
          ]
        : [];
    if (!saved || typeof saved !== "object") return { added: [], removed: [] };
    return {
      added: "added" in saved ? ids(saved.added) : [],
      removed: "removed" in saved ? ids(saved.removed) : [],
    };
  } catch {
    return { added: [], removed: [] };
  }
}

export function selectedTelegramChannels(
  channels: readonly TelegramChannel[],
  selection: TelegramChannelSelection,
  legacyWatched: readonly string[] = [],
) {
  const added = new Set([...selection.added, ...legacyWatched]);
  const removed = new Set(selection.removed);
  return channels.filter(
    (channel) =>
      !removed.has(channel.id) && (added.has(channel.id) || isTradingTelegramChannel(channel)),
  );
}

export function setTelegramChannelIncluded(
  selection: TelegramChannelSelection,
  id: string,
  included: boolean,
): TelegramChannelSelection {
  return {
    added: [...selection.added.filter((value) => value !== id), ...(included ? [id] : [])],
    removed: [...selection.removed.filter((value) => value !== id), ...(included ? [] : [id])],
  };
}
