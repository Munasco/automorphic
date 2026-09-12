import { useEffect, useState } from "react";

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
}

declare global {
  interface Window {
    getUser?: () => Promise<AccountUser | null>;
    requestAuth?: (options: { provider?: string; callbackURL?: string }) => Promise<void>;
    signOut?: () => Promise<void>;
    onAuthenticated?: (callback: (user: AccountUser) => void) => () => void;
    onUserUpdated?: (callback: (user: AccountUser | null) => void) => () => void;
    onAuthError?: (callback: () => void) => () => void;
  }
}

export function useDesktopAccount() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [pending, setPending] = useState(!!window.getUser);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!window.getUser) return;
    let active = true;
    const refresh = () => {
      void window
        .getUser?.()
        .then((value) => {
          if (active) {
            setUser(value);
            setError("");
          }
        })
        .catch(() => {
          if (active) {
            setUser(null);
            setError("Could not verify your account. Please try again.");
          }
        })
        .finally(() => {
          if (active) setPending(false);
        });
    };
    const authenticated = window.onAuthenticated?.(() => refresh());
    const updated = window.onUserUpdated?.(() => refresh());
    const failed = window.onAuthError?.(() => {
      if (active) setError("Google sign-in did not finish. Please try again.");
    });
    window.addEventListener("focus", refresh);
    window.addEventListener("automorphic-account-changed", refresh);
    refresh();
    return () => {
      active = false;
      authenticated?.();
      updated?.();
      failed?.();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("automorphic-account-changed", refresh);
    };
  }, []);
  return { user, pending, error };
}
