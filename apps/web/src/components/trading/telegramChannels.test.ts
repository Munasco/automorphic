import { describe, expect, it } from "vite-plus/test";
import {
  isTradingTelegramChannel,
  readTelegramChannelSelection,
  selectedTelegramChannels,
  setTelegramChannelIncluded,
} from "./telegramChannels";

describe("Telegram trading channel selection", () => {
  it.each([
    "CallistoFX",
    "callistofx",
    "FX",
    "fx",
    "FX Signals",
    "fxsignals",
    "Trading Room",
    "Gold Trades",
    "NQ Futures",
    "forex",
    "Trader_Joe",
  ])("automatically includes %s", (title) =>
    expect(isTradingTelegramChannel({ title })).toBe(true),
  );
  it.each(["Fixer", "fxer", "FXers", "Family", "Affxer"])(
    "does not match unrelated name %s",
    (title) => {
      expect(isTradingTelegramChannel({ title })).toBe(false);
    },
  );
  it("detects a trading handle even when the display title is generic", () => {
    expect(isTradingTelegramChannel({ title: "Callisto", username: "callistofx" })).toBe(true);
  });
  it("preserves removals after reload and refresh, and permits adding the channel back", () => {
    const channels = [
      { id: "1", title: "CallistoFX" },
      { id: "2", title: "Research room" },
    ];
    let selection = readTelegramChannelSelection(null);
    expect(selectedTelegramChannels(channels, selection).map((c) => c.id)).toEqual(["1"]);
    selection = setTelegramChannelIncluded(selection, "1", false);
    selection = readTelegramChannelSelection(JSON.stringify(selection));
    expect(selectedTelegramChannels(channels, selection, ["1"])).toEqual([]);
    expect(
      selectedTelegramChannels(
        [...channels, { id: "3", title: "New Trading Room" }],
        selection,
      ).map((c) => c.id),
    ).toEqual(["3"]);
    selection = setTelegramChannelIncluded(selection, "2", true);
    selection = setTelegramChannelIncluded(selection, "1", true);
    expect(selectedTelegramChannels(channels, selection).map((c) => c.id)).toEqual(["1", "2"]);
  });
  it("retains previously watched channels and tolerates malformed preferences", () => {
    expect(
      selectedTelegramChannels([{ id: "2", title: "Research room" }], { added: [], removed: [] }, [
        "2",
      ]),
    ).toHaveLength(1);
    expect(readTelegramChannelSelection("broken")).toEqual({ added: [], removed: [] });
    expect(readTelegramChannelSelection('{"added":["1","1",2,"bad"],"removed":["3"]}')).toEqual({
      added: ["1"],
      removed: ["3"],
    });
  });
});
