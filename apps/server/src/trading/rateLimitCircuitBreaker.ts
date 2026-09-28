// @effect-diagnostics globalTimers:off globalDate:off
/**
 * In-memory circuit breaker to prevent cascading HTTP 429 rate limit locks.
 *
 * Per official Tradovate docs:
 * "If you receive an HTTP 429, you must wait one hour before calling any endpoint again.
 *  If you retry before the hour has elapsed, each call returns another HTTP 429 (empty body, no wait time to read)
 *  and resets the one-hour clock. The window only clears once you stop calling for the full hour."
 *
 * This circuit breaker intercepts outbound calls and ensures that once a 429 is encountered,
 * zero outbound network requests are sent to Tradovate until the cooldown window expires,
 * completely preventing the client or server from resetting the 60-minute ban.
 */

export interface CircuitBreakerState {
  blocked: boolean;
  remainingMs: number;
  reason: string;
  cooldownUntil: number;
}

class TradovateCircuitBreaker {
  private cooldownUntil = 0;
  private reason = "";
  private consecutiveErrors = 0;

  /**
   * Trip a 60-minute lockdown when an HTTP 429 is detected.
   */
  trip429(reason = "Tradovate returned HTTP 429 (Too Many Requests). IP rate limit active.") {
    this.cooldownUntil = Date.now() + 60 * 60_000;
    this.reason = reason;
  }

  /**
   * Track general connection failure (e.g. handshake dropped).
   * After 3 consecutive handshake drops within a short interval, back off for 60s.
   */
  recordFailure() {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= 3 && this.cooldownUntil < Date.now()) {
      this.cooldownUntil = Date.now() + 60_000;
      this.reason = "Multiple consecutive connection failures. Backing off for 60s.";
    }
  }

  recordSuccess() {
    this.consecutiveErrors = 0;
  }

  status(): CircuitBreakerState {
    const now = Date.now();
    if (now < this.cooldownUntil) {
      return {
        blocked: true,
        remainingMs: this.cooldownUntil - now,
        reason: this.reason,
        cooldownUntil: this.cooldownUntil,
      };
    }
    return {
      blocked: false,
      remainingMs: 0,
      reason: "",
      cooldownUntil: 0,
    };
  }

  reset() {
    this.cooldownUntil = 0;
    this.consecutiveErrors = 0;
    this.reason = "";
  }
}

export const circuitBreaker = new TradovateCircuitBreaker();
