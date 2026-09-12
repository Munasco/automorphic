import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { BrokerSessionSync } from "./BrokerSessionSync";

export function TradingQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            gcTime: 5 * 60_000,
          },
        },
      }),
  );
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider client={client}>
      <BrokerSessionSync>{children}</BrokerSessionSync>
    </QueryClientProvider>
  );
}
