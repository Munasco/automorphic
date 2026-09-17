import { createBrowserHistory, createHashHistory } from "@tanstack/react-router";
import { getRouter } from "./router";
import { AppRoot } from "./AppRoot";
import { isElectron } from "./env";
import { TradingQueryProvider } from "./components/trading/TradingQueryProvider";

// This entire module is lazy-loaded only after account verification succeeds.
const router = getRouter(isElectron ? createHashHistory() : createBrowserHistory());
export default function AuthenticatedWorkspace() {
  return (
    <TradingQueryProvider>
      <AppRoot router={router} />
    </TradingQueryProvider>
  );
}
