import { describe, expect, it } from "vite-plus/test";
import { accountGateState } from "./accountGateState";

const user = { id: "one", name: "Trader", email: "trader@example.test", emailVerified: true };
const signedOut = {
  sessionPending: false,
  hasSession: false,
  sessionFailed: false,
  verifiedPending: true,
  verifiedUser: null,
  desktopPending: false,
  desktopUser: null,
};
describe("account gate state", () => {
  it("shows sign-in after an empty session without waiting for Convex", () => {
    expect(accountGateState(signedOut)).toEqual({ pending: false, user: null });
  });
  it("does not reuse a previously verified user after sign-out", () => {
    expect(accountGateState({ ...signedOut, verifiedUser: user })).toEqual({
      pending: false,
      user: null,
    });
  });
  it("keeps a browser session gated until backend verification finishes", () => {
    expect(accountGateState({ ...signedOut, hasSession: true }).pending).toBe(true);
    expect(
      accountGateState({
        ...signedOut,
        hasSession: true,
        verifiedPending: false,
        verifiedUser: user,
      }),
    ).toEqual({ pending: false, user });
  });
  it("returns to sign-in on session lookup failure", () => {
    expect(
      accountGateState({ ...signedOut, hasSession: true, sessionFailed: true, verifiedUser: user }),
    ).toEqual({ pending: false, user: null });
  });
  it("lets the verified desktop account complete independently of browser auth", () => {
    expect(accountGateState({ ...signedOut, sessionPending: true, desktopUser: user })).toEqual({
      pending: false,
      user,
    });
  });
});
