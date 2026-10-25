import type { ReactNode } from "react";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { accountClient } from "./client";
import type { AccountUser } from "./desktop";

const convex = new ConvexReactClient(
  import.meta.env.VITE_AUTOMORPHIC_CONVEX_URL || "https://ideal-mastiff-363.convex.cloud",
);
const getCurrentUser = makeFunctionReference<"query", Record<string, never>, AccountUser | null>(
  "auth:getCurrentUser",
);

export function AccountProvider({ children }: { children: ReactNode }) {
  // 0.12.5's broad AuthClient alias infers useSession().data as never with
  // Better Auth 1.6.31. The client uses its documented convex/crossDomain plugins.
  return (
    <ConvexBetterAuthProvider client={convex} authClient={accountClient as unknown as AuthClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}

export function useVerifiedAccount() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(getCurrentUser, isAuthenticated ? {} : "skip");
  return {
    user: isAuthenticated ? user : null,
    pending: isLoading || (isAuthenticated && user === undefined),
  };
}
