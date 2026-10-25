import { describe, expect, it, beforeEach } from "vite-plus/test";
import { circuitBreaker } from "./rateLimitCircuitBreaker.ts";

describe("TradovateCircuitBreaker", () => {
  beforeEach(() => {
    circuitBreaker.reset();
  });

  it("is initially unblocked", () => {
    const s = circuitBreaker.status();
    expect(s.blocked).toBe(false);
    expect(s.remainingMs).toBe(0);
  });

  it("blocks outbound calls for 60 minutes on 429", () => {
    circuitBreaker.trip429("Rate limited by Tradovate");
    const s = circuitBreaker.status();
    expect(s.blocked).toBe(true);
    expect(s.remainingMs).toBeGreaterThan(59 * 60_000);
    expect(s.reason).toBe("Rate limited by Tradovate");
  });

  it("backs off after 3 consecutive connection failures", () => {
    circuitBreaker.recordFailure();
    expect(circuitBreaker.status().blocked).toBe(false);
    circuitBreaker.recordFailure();
    expect(circuitBreaker.status().blocked).toBe(false);
    circuitBreaker.recordFailure();
    expect(circuitBreaker.status().blocked).toBe(true);
    expect(circuitBreaker.status().remainingMs).toBeGreaterThan(0);
  });

  it("clears consecutive failures on success", () => {
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordSuccess();
    circuitBreaker.recordFailure();
    expect(circuitBreaker.status().blocked).toBe(false);
  });
});
