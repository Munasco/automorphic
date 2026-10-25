import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useConvexAuth, useQuery as useConvexQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useQueryClient } from "@tanstack/react-query";

type BrokerStatus = {
  environment: "demo" | "live";
  expiration: number;
  lastRenewedAt: number;
  status: string;
} | null;
const statusQuery = makeFunctionReference<"query", Record<string, never>, BrokerStatus>(
  "tradovate:connectionStatus",
);
const VersionContext = createContext("");
export const useTradingConnectionVersion = () => useContext(VersionContext);

export function BrokerSessionSync({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const status = useConvexQuery(statusQuery, isAuthenticated ? {} : "skip");
  const version = status
    ? `${status.environment}:${status.lastRenewedAt}:${status.expiration}`
    : "";
  const previous = useRef(version);
  const client = useQueryClient();
  useEffect(() => {
    if (previous.current !== version) {
      previous.current = version;
      void client.invalidateQueries({ queryKey: ["trading"] });
    }
  }, [client, version]);
  return <VersionContext.Provider value={version}>{children}</VersionContext.Provider>;
}
