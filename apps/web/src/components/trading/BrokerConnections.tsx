import { useEffect, useRef, useState } from "react";
import { CheckIcon, ArrowUpRightIcon, SendIcon, LinkIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { TradingSelect } from "./TradingSelect";
import { connectionRequest, useTradingConnections } from "./connectionClient";

const inputClass =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400";
function TelegramAppSetup({ onSaved }: { onSaved: () => Promise<void> }) {
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await connectionRequest("connections", {
            action: "telegram.configure",
            apiId: Number(apiId),
            apiHash: apiHash.trim(),
          });
          setApiHash("");
          await onSaved();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not save Telegram settings.";
          setError(message);
          toastManager.add({
            type: "error",
            title: "Telegram setup error",
            description: message,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        One-time setup: get your API ID and API hash from{" "}
        <a
          className="text-blue-400 underline underline-offset-2"
          href="https://my.telegram.org/apps"
          target="_blank"
          rel="noreferrer"
        >
          Telegram’s API development tools
        </a>
        . Then sign in with your phone number to choose your signal channels.
      </p>
      <label className="block space-y-1.5 text-xs text-muted-foreground">
        <span>API ID</span>
        <input
          className={inputClass}
          inputMode="numeric"
          pattern="[0-9]+"
          required
          value={apiId}
          onChange={(event) => setApiId(event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block space-y-1.5 text-xs text-muted-foreground">
        <span>API hash</span>
        <input
          className={inputClass}
          type="password"
          autoComplete="off"
          required
          minLength={32}
          maxLength={32}
          value={apiHash}
          onChange={(event) => setApiHash(event.target.value)}
          disabled={busy}
        />
      </label>
      <Button type="submit" size="sm" disabled={busy || !apiId || apiHash.trim().length !== 32}>
        {busy ? "Saving…" : "Save and continue"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
export function TelegramSignIn({
  onConnected,
  allowAppSetup = false,
}: {
  onConnected?: () => void;
  allowAppSetup?: boolean;
}) {
  const connection = useTradingConnections();
  const [step, setStep] = useState<"phone" | "code" | "password">("phone"),
    [value, setValue] = useState(""),
    [challenge, setChallenge] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editApp, setEditApp] = useState(false);
  if (connection.data?.telegram.connected)
    return (
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-2 text-emerald-400">
          <CheckIcon className="size-3.5" />
          Connected as {connection.data.telegram.name}
        </span>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await connectionRequest("connections", { action: "telegram.disconnect" });
              setStep("phone");
              setChallenge("");
              setValue("");
              await connection.refresh();
            } catch (e) {
              const message = e instanceof Error ? e.message : "Could not disconnect.";
              setError(message);
              toastManager.add({
                type: "error",
                title: "Telegram error",
                description: message,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Disconnect
        </Button>
        {error ? <span role="alert">{error}</span> : null}
      </div>
    );
  if (connection.data && (!connection.data.telegram.configured || editApp))
    return (
      <div className="space-y-3">
        {!allowAppSetup ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Telegram sign-in is being set up for Automorphic. You’ll only need your phone number and
            the code Telegram sends you.
          </p>
        ) : (
          <details open={editApp} className="text-xs text-muted-foreground">
            <summary className="cursor-pointer text-foreground">
              Configure Automorphic’s Telegram app
            </summary>
            <p className="my-3 leading-relaxed">
              Installation setup only. Everyone connecting through this server uses the same
              Telegram app; they sign in with their own account.
            </p>
            <TelegramAppSetup
              onSaved={async () => {
                await connection.refresh();
                setEditApp(false);
              }}
            />
          </details>
        )}
        {editApp ? (
          <button
            type="button"
            className="text-xs text-muted-foreground"
            onClick={() => setEditApp(false)}
          >
            Back to sign-in
          </button>
        ) : null}
      </div>
    );
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const result = await connectionRequest(
            "connections",
            step === "phone"
              ? { action: "telegram.start", phone: value.replace(/[\s()-]/g, "") }
              : step === "code"
                ? { action: "telegram.code", challenge, code: value.trim() }
                : { action: "telegram.password", challenge, password: value },
          );
          setValue("");
          if (
            result &&
            typeof result === "object" &&
            "connected" in result &&
            result.connected === true
          ) {
            await connection.refresh();
            onConnected?.();
          } else if (
            result &&
            typeof result === "object" &&
            "challenge" in result &&
            typeof result.challenge === "string" &&
            "step" in result &&
            (result.step === "code" || result.step === "password")
          ) {
            setChallenge(result.challenge);
            setStep(result.step);
          } else throw Error("Could not start Telegram sign-in. Try again.");
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not connect Telegram.";
          setError(message);
          toastManager.add({
            type: "error",
            title: "Telegram error",
            description: message,
          });
          if (step === "password") setValue("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-xs text-muted-foreground" htmlFor="telegram-sign-in-value">
        {step === "phone"
          ? "Your Telegram phone number"
          : step === "code"
            ? "Code sent to your Telegram app"
            : "Two-step verification password"}
      </label>
      <div className="flex gap-2">
        <input
          id="telegram-sign-in-value"
          className={inputClass}
          type={step === "password" ? "password" : step === "phone" ? "tel" : "text"}
          inputMode={step === "code" ? "numeric" : undefined}
          autoComplete={
            step === "code" ? "one-time-code" : step === "password" ? "current-password" : "tel"
          }
          placeholder={step === "phone" ? "+1 416 555 1234" : undefined}
          maxLength={256}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={busy || !value.trim()}>
          {busy ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : step === "phone" ? (
            "Continue"
          ) : (
            "Connect"
          )}
        </Button>
      </div>
      {step !== "phone" ? (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setStep("phone");
            setValue("");
            setError("");
          }}
        >
          Start again
        </button>
      ) : (
        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            Choose your signal channels and turn on their alerts to follow new signals as they
            arrive.
          </p>
          {allowAppSetup ? (
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => setEditApp(true)}
            >
              Telegram app settings
            </button>
          ) : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
export function TradingConnections() {
  const connection = useTradingConnections(),
    [target, setTarget] = useState<"demo" | "live">("demo"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const broker = connection.data?.tradovate;
  const lastToastedConnectionErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (connection.error && connection.error.message !== lastToastedConnectionErrorRef.current) {
      lastToastedConnectionErrorRef.current = connection.error.message;
      toastManager.add({
        type: "error",
        title: "Connection error",
        description: connection.error.message,
      });
    } else if (!connection.error) {
      lastToastedConnectionErrorRef.current = null;
    }
  }, [connection.error]);
  useEffect(() => {
    if (broker?.environment) setTarget(broker.environment);
  }, [broker?.environment]);
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-medium">Connections</h2>
        <p className="mt-1 text-xs text-muted-foreground">Your accounts and signals, together.</p>
      </div>
      <div className="space-y-4 border-b border-border p-5">
        <div className="flex items-center gap-3">
          <LinkIcon className="size-4 text-blue-400" />
          <span className="text-sm font-medium">Tradovate</span>
          {broker?.connected ? (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckIcon className="size-3.5" />
              Connected · {broker.environment ?? "account"}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TradingSelect
            label="Tradovate environment"
            value={target}
            onChange={(v) => setTarget(v === "live" ? "live" : "demo")}
            options={[
              ["demo", "Simulation / funded"],
              ["live", "Live account"],
            ]}
            className="w-44"
          />
          <Button
            size="sm"
            disabled={busy || !window.desktopBridge?.connectTradovate}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await window.desktopBridge?.connectTradovate?.(target);
                if (!result?.connected) throw Error(result?.error ?? "Sign-in was not completed.");
                await connection.refresh();
              } catch (e) {
                const message = e instanceof Error ? e.message : "Could not open sign-in.";
                setError(message);
                toastManager.add({
                  type: "error",
                  title: "Tradovate connection failed",
                  description: message,
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <>
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                Waiting for sign-in…
              </>
            ) : (
              <>
                {broker?.connected ? "Reconnect" : "Connect Tradovate"}
                <ArrowUpRightIcon className="size-3.5" />
              </>
            )}
          </Button>
          {broker?.connected ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await connectionRequest("connections", { action: "tradovate.disconnect" });
                  await connection.refresh();
                } catch (e) {
                  const message = e instanceof Error ? e.message : "Could not disconnect.";
                  setError(message);
                  toastManager.add({
                    type: "error",
                    title: "Tradovate disconnect failed",
                    description: message,
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {window.desktopBridge?.connectTradovate
            ? "Sign in on Tradovate and select the matching account environment. We’ll verify access and connect automatically."
            : "Open Automorphic Desktop to connect Tradovate through its sign-in browser."}
        </p>
        {error ? (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        ) : null}
      </div>
      <div className="space-y-4 border-b border-border p-5">
        <div className="flex items-center gap-3">
          <SendIcon className="size-4 text-blue-400" />
          <h3 className="text-sm font-medium">Telegram</h3>
        </div>
        <TelegramSignIn allowAppSetup />
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between text-sm">
          <span>Rithmic</span>
          <span className="text-xs text-muted-foreground">Not connected</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Rithmic is not available yet. Use Tradovate to connect your account.
        </p>
      </div>
      {connection.error ? (
        <div
          role="alert"
          className="flex items-center gap-3 border-t border-border p-4 text-xs text-red-400"
        >
          <span>{connection.error.message}</span>
          <Button size="xs" variant="ghost" onClick={() => void connection.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
    </section>
  );
}
