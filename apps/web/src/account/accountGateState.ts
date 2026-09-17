import type { AccountUser } from "./desktop";

export function accountGateState(input: {
  sessionPending: boolean;
  hasSession: boolean;
  sessionFailed: boolean;
  verifiedPending: boolean;
  verifiedUser: AccountUser | null | undefined;
  desktopPending: boolean;
  desktopUser: AccountUser | null;
}) {
  if (input.desktopPending) return { pending: true, user: null };
  if (input.desktopUser) return { pending: false, user: input.desktopUser };
  if (input.sessionPending) return { pending: true, user: null };
  // A resolved empty/failed session must reach sign-in even if Convex is reconnecting.
  if (!input.hasSession || input.sessionFailed) return { pending: false, user: null };
  return { pending: input.verifiedPending, user: input.verifiedUser ?? null };
}
