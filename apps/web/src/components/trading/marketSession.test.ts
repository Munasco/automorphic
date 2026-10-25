import { describe, expect, it } from "vite-plus/test";
import { getFuturesSession } from "./marketSession";
import { INSTRUMENT_ROOTS, type InstrumentRoot } from "./tradingInstruments";

const at = (root: InstrumentRoot, iso: string) => getFuturesSession(root, new Date(iso));

describe("getFuturesSession", () => {
  it.each(INSTRUMENT_ROOTS)("observes the Friday close and Sunday reopen for %s", (root) => {
    expect(at(root, "2026-09-11T20:59:59Z").status).toBe("scheduled-open");
    expect(at(root, "2026-09-11T21:00:00Z").status).toBe("closed");
    expect(at(root, "2026-09-12T22:00:00Z").status).toBe("closed");
    expect(at(root, "2026-09-13T21:59:59Z").status).toBe("closed");
    expect(at(root, "2026-09-13T22:00:00Z").status).toBe("scheduled-open");
  });

  it.each(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"])(
    "observes maintenance on %s",
    (day) => {
      expect(at("MGC", `${day}T20:59:59Z`).status).toBe("scheduled-open");
      expect(at("MGC", `${day}T21:00:00Z`).status).toBe("break");
      expect(at("NQ", `${day}T21:59:59Z`).status).toBe("break");
      expect(at("NQ", `${day}T22:00:00Z`).status).toBe("scheduled-open");
    },
  );

  it("applies the equity pause to NQ but not gold, including Friday", () => {
    for (const day of ["2026-09-10", "2026-09-11"]) {
      expect(at("NQ", `${day}T20:14:59Z`).status).toBe("scheduled-open");
      expect(at("NQ", `${day}T20:15:00Z`).status).toBe("break");
      expect(at("MGC", `${day}T20:20:00Z`).status).toBe("scheduled-open");
      expect(at("GC", `${day}T20:20:00Z`).status).toBe("scheduled-open");
      expect(at("MNQ", `${day}T20:20:00Z`).status).toBe("break");
      expect(at("NQ", `${day}T20:29:59Z`).status).toBe("break");
      expect(at("NQ", `${day}T20:30:00Z`).status).toBe("scheduled-open");
    }
  });

  it("keeps midnight within the overnight session", () => {
    expect(at("MGC", "2026-09-15T05:00:00Z").status).toBe("scheduled-open");
  });

  it("uses the new daylight-saving offset after the spring transition", () => {
    expect(at("NQ", "2026-03-06T21:59:59Z").status).toBe("scheduled-open");
    expect(at("NQ", "2026-03-06T22:00:00Z").status).toBe("closed");
    expect(at("NQ", "2026-03-08T21:59:59Z").status).toBe("closed");
    expect(at("NQ", "2026-03-08T22:00:00Z").status).toBe("scheduled-open");
    expect(at("MGC", "2026-03-09T21:00:00Z").status).toBe("break");
  });

  it("uses the new standard-time offset after the fall transition", () => {
    expect(at("MGC", "2026-10-30T20:59:59Z").status).toBe("scheduled-open");
    expect(at("MGC", "2026-10-30T21:00:00Z").status).toBe("closed");
    expect(at("MGC", "2026-11-01T22:59:59Z").status).toBe("closed");
    expect(at("MGC", "2026-11-01T23:00:00Z").status).toBe("scheduled-open");
    expect(at("NQ", "2026-11-02T22:00:00Z").status).toBe("break");
  });

  it("does not claim verified opening on holidays", () => {
    const session = at("MGC", "2026-12-25T16:00:00Z");
    expect(session.label).toBe("Scheduled session");
    expect(session.scheduleNote).toContain("Holidays");
    expect(session.scheduleNote).toContain("Regular Chicago-time schedule");
    expect(session.nextOpen).toBeNull();
  });
});
