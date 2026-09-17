import { toastManager } from "../ui/toast";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tradingOrderValidation, type TradingOrderRequest } from "@t3tools/contracts";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { TradingSelect } from "./TradingSelect";
import { fetchTradingAccount } from "./tradingAccountCache";
import { tradingQueryScope } from "./tradingQueries";
import { submitChartOrder, type ChartOrderDraft } from "./chartOrderEntry";

export function ChartOrderTicket({
  symbol,
  draft,
  priceStep,
  onClose,
  requestId,
  onSubmitStart,
}: {
  symbol: string;
  draft: ChartOrderDraft;
  priceStep: number;
  onClose: () => void;
  requestId: string;
  onSubmitStart: () => void;
}) {
  const id = useId();
  const client = useQueryClient();
  const scope = tradingQueryScope();
  const accountQuery = useQuery({
    queryKey: [...scope, "account", null],
    queryFn: ({ signal }) => fetchTradingAccount(null, signal),
    staleTime: 0,
    retry: false,
  });
  const [accountSelection, setAccountSelection] = useState<{
    id: string;
    environment: string;
  } | null>(null);
  const [side, setSide] = useState(draft.side);
  const [type, setType] = useState<TradingOrderRequest["type"]>(draft.type);
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState(String(draft.price));
  const [stopPrice, setStopPrice] = useState(String(draft.price));
  const [duration, setDuration] = useState<"Day" | "GTC">("Day");
  const [status, setStatus] = useState<"editing" | "submitting" | "done" | "failed">("editing");
  const [message, setMessage] = useState("");
  const submitted = useRef(false);
  const [submittedAccount, setSubmittedAccount] = useState<{
    id: string;
    name: string;
    environment: "demo" | "live";
  } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const accounts = accountQuery.data?.accounts ?? [];
  const environment = accountQuery.data?.environment;
  const selected =
    accountSelection && accountSelection.environment === environment
      ? accounts.find((a) => String(a.id) === accountSelection.id)
      : undefined;
  const accountId = submittedAccount?.id ?? (selected ? String(selected.id) : "");
  const displayedEnvironment = submittedAccount?.environment ?? environment;
  const locked = status !== "editing";
  const input =
    "mt-1 h-9 w-full rounded border border-zinc-600 bg-[#141414] px-3 text-sm outline-none focus:border-blue-400 disabled:opacity-50";
  const limit = type === "Limit" || type === "StopLimit";
  const stop = type === "Stop" || type === "StopLimit";
  async function submit() {
    if (
      submitted.current ||
      !selected ||
      !environment ||
      accountQuery.isError ||
      accountQuery.isFetching
    )
      return;
    const order: TradingOrderRequest = {
      requestId,
      accountId: selected.id,
      environment,
      symbol,
      side,
      type,
      quantity: Number(quantity),
      timeInForce: duration,
      ...(limit ? { price: price.trim() ? Number(price) : NaN } : {}),
      ...(stop ? { stopPrice: stopPrice.trim() ? Number(stopPrice) : NaN } : {}),
    };
    const error = tradingOrderValidation(order);
    if (error) {
      setMessage(error);
      return;
    }
    setSubmittedAccount({ id: String(selected.id), name: selected.name, environment });
    submitted.current = true;
    onSubmitStart();
    setStatus("submitting");
    setMessage("");
    try {
      const receipt = await submitChartOrder(order);
      setStatus("done");
      setMessage(`Order ${receipt.orderId} submitted to Tradovate.`);
      if (!mounted.current)
        toastManager.add({
          type: "success",
          title: `Order ${receipt.orderId} submitted`,
          description: `${side} ${quantity} ${symbol}`,
        });
      void client.invalidateQueries({ queryKey: [...scope, "account"] });
    } catch (error) {
      setStatus("failed");
      if (!mounted.current)
        toastManager.add({
          type: "error",
          title: "Check order status in Tradovate",
          description: error instanceof Error ? error.message : "Order confirmation unavailable.",
        });
      setMessage(error instanceof Error ? error.message : "Check order status in Tradovate.");
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && status !== "submitting") onClose();
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        backdropStyle={{ background: "transparent", backdropFilter: "none" }}
        className="flex w-[380px] flex-col overflow-hidden rounded-md border border-zinc-700 bg-[#1f1f1f] p-0 text-zinc-200"
      >
        <header className="border-b border-zinc-700 px-5 py-4 pr-12">
          <DialogTitle className="text-lg">Add order · {symbol}</DialogTitle>
          <p className="mt-1 text-xs text-zinc-400">
            Tradovate
            {displayedEnvironment
              ? ` · ${displayedEnvironment === "live" ? "Live account" : "Demo account"}`
              : ""}
          </p>
        </header>
        <form
          className="space-y-4 overflow-y-auto p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(["Sell", "Buy"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={locked}
                aria-pressed={side === value}
                onClick={() => setSide(value)}
                className={`h-10 rounded border text-sm font-medium ${side === value ? (value === "Buy" ? "border-blue-500 bg-blue-600 text-white" : "border-red-500 bg-red-600 text-white") : "border-zinc-600 hover:bg-white/5"}`}
              >
                {value}
              </button>
            ))}
          </div>
          <TradingSelect
            label="Trading account"
            value={accountId}
            disabled={locked || accountQuery.isFetching}
            options={
              submittedAccount
                ? [[submittedAccount.id, submittedAccount.name]]
                : [["", "Select account"], ...accounts.map((a) => [String(a.id), a.name] as const)]
            }
            onChange={(id) => setAccountSelection(environment ? { id, environment } : null)}
            className="w-full"
          />
          {accountQuery.isFetching ? (
            <p role="status" className="text-xs text-zinc-400">
              Checking broker accounts…
            </p>
          ) : accountQuery.isError || !accounts.length ? (
            <div className="space-y-2 text-sm text-zinc-400">
              <p>
                {accountQuery.error?.message ??
                  "No trading account is available in this Tradovate connection."}
              </p>
              <button
                type="button"
                className="text-blue-400 underline"
                onClick={() => void accountQuery.refetch()}
              >
                Refresh accounts
              </button>
            </div>
          ) : null}
          <TradingSelect
            label="Order type"
            value={type}
            disabled={locked}
            options={[
              ["Market", "Market"],
              ["Limit", "Limit"],
              ["Stop", "Stop"],
              ["StopLimit", "Stop limit"],
            ]}
            onChange={(value) => setType(value as typeof type)}
            className="w-full"
          />
          <label className="block text-xs" htmlFor={`${id}-quantity`}>
            Contracts
            <input
              id={`${id}-quantity`}
              className={input}
              type="number"
              min="1"
              step="1"
              value={quantity}
              disabled={locked}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          {stop ? (
            <label className="block text-xs" htmlFor={`${id}-stop`}>
              Stop price
              <input
                id={`${id}-stop`}
                className={input}
                type="number"
                step={priceStep}
                value={stopPrice}
                disabled={locked}
                onChange={(e) => setStopPrice(e.target.value)}
              />
            </label>
          ) : null}
          {limit ? (
            <label className="block text-xs" htmlFor={`${id}-price`}>
              Limit price
              <input
                id={`${id}-price`}
                className={input}
                type="number"
                step={priceStep}
                value={price}
                disabled={locked}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          ) : null}
          <TradingSelect
            label="Time in force"
            value={duration}
            disabled={locked}
            options={[
              ["Day", "Day"],
              ["GTC", "Good till canceled"],
            ]}
            onChange={(value) => setDuration(value as typeof duration)}
            className="w-full"
          />
          {message ? (
            <p
              role={status === "done" ? "status" : "alert"}
              className={`text-sm ${status === "done" ? "text-emerald-400" : "text-red-400"}`}
            >
              {message}
            </p>
          ) : null}
          {status === "done" || status === "failed" ? (
            <button
              type="button"
              className="h-10 w-full rounded border border-zinc-600"
              onClick={onClose}
            >
              Close
            </button>
          ) : (
            <button
              type="submit"
              disabled={
                locked ||
                !selected ||
                !environment ||
                accountQuery.isError ||
                accountQuery.isFetching
              }
              className={`h-10 w-full rounded text-sm font-medium text-white disabled:opacity-40 ${side === "Buy" ? "bg-blue-600" : "bg-red-600"}`}
            >
              {status === "submitting"
                ? "Submitting…"
                : `${side} ${quantity || "0"} ${symbol}${environment === "live" ? " · LIVE" : " · Demo"}`}
            </button>
          )}
        </form>
      </DialogPopup>
    </Dialog>
  );
}
