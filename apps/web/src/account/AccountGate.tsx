import { useVerifiedAccount } from "./AccountProvider";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { MailIcon, ArrowLeftIcon, Loader2Icon, LoaderPinwheelIcon } from "lucide-react";
import { useDesktopAccount } from "./desktop";
import { accountClient } from "./client";
import { accountGateState } from "./accountGateState";

const inputClass =
  "h-11 w-full rounded-md border border-slate-700/70 bg-[#0d121c] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/15";
const buttonClass =
  "flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-500 text-sm font-medium text-white transition-colors hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50";

export function AccountGate({ children }: { children: ReactNode }) {
  const session = accountClient.useSession();
  const desktop = useDesktopAccount();
  const verified = useVerifiedAccount();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [signingUp, setSigningUp] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user, pending } = accountGateState({
    sessionPending: session.isPending,
    hasSession: !!session.data?.session,
    sessionFailed: !!session.error,
    verifiedPending: verified.pending,
    verifiedUser: verified.user,
    desktopPending: desktop.pending,
    desktopUser: desktop.user,
  });
  if (!pending && user?.emailVerified && user.name.trim()) return children;
  const profile = !!user?.emailVerified;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (profile) {
        if (!name.trim()) throw new Error("Enter your name.");
        const result = await accountClient.updateUser({ name: name.trim() });
        if (result.error) throw new Error(result.error.message || "Could not save your name.");
        await session.refetch();
      } else if (sent) {
        const result = await accountClient.signIn.emailOtp({
          email: email.trim(),
          otp,
          ...(signingUp && name.trim() ? { name: name.trim() } : {}),
        });
        if (result.error) throw new Error(result.error.message || "Check the code and try again.");
        await session.refetch();
      } else {
        const result = await accountClient.emailOtp.sendVerificationOtp({
          email: email.trim(),
          type: "sign-in",
        });
        if (result.error) throw new Error(result.error.message || "Could not send your code.");
        setSent(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const startGoogle = async () => {
    setError("");
    setGoogleBusy(true);
    try {
      if (window.requestAuth) {
        await window.requestAuth({});
        return;
      }
      const result = await accountClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
      if (result.error) throw new Error(result.error.message || "Could not connect to Google.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to Google.");
    } finally {
      setGoogleBusy(false);
    }
  };
  const resend = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await accountClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "sign-in",
      });
      if (result.error) throw new Error(result.error.message || "Could not send your code.");
      setOtp("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your code.");
    } finally {
      setBusy(false);
    }
  };
  if (pending) return <AccountLoading />;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#080b12] px-6 py-10 font-sans text-slate-100">
      <section className="w-full max-w-sm">
        <a
          href="https://automorphic-six.vercel.app"
          className="mb-10 flex items-center gap-2.5 text-xl font-medium tracking-tight text-slate-100"
        >
          <img src="/automorphic-mark.svg" alt="" width="24" height="24" /> Automorphic
        </a>
        {pending ? (
          <p role="status" className="text-sm text-slate-400">
            Signing you in…
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              {profile
                ? "What should we call you?"
                : sent
                  ? "Check your email"
                  : signingUp
                    ? "Create your account"
                    : "Welcome to Automorphic"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {profile ? (
                "Your trading workspace is almost ready."
              ) : sent ? (
                <>
                  We’ve sent a 6-digit code to <strong className="text-slate-100">{email}</strong>
                </>
              ) : (
                "Sign in to your trading workspace."
              )}
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {profile || (signingUp && !sent) ? (
                <label className="block text-sm text-slate-300">
                  Name
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={100}
                    className={`${inputClass} mt-2`}
                    placeholder="Enter your name"
                  />
                </label>
              ) : null}
              {sent && !profile ? (
                <label className="block text-sm text-slate-300">
                  Verification code
                  <input
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                    required
                    className={`${inputClass} mt-2 text-center text-xl tracking-[0.65em]`}
                  />
                </label>
              ) : !profile ? (
                <label className="block text-sm text-slate-300">
                  Email
                  <span className="relative mt-2 block">
                    <MailIcon
                      aria-hidden="true"
                      className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setError("");
                      }}
                      required
                      maxLength={254}
                      className={`${inputClass} pl-10`}
                    />
                  </span>
                </label>
              ) : null}
              <button
                disabled={busy || googleBusy || (!profile && !sent && !email.trim())}
                className={buttonClass}
              >
                {busy && <Loader2Icon className="size-5 animate-spin" />}
                {busy
                  ? sent
                    ? "Verifying code…"
                    : "Sending code…"
                  : profile
                    ? "Open my workspace"
                    : sent
                      ? "Verify and continue"
                      : "Send verification code"}
              </button>
            </form>
            {!profile && !sent && (
              <>
                <div className="relative my-6 flex items-center justify-center text-xs text-slate-400">
                  <span className="absolute inset-x-0 border-t border-slate-800" />
                  <span className="relative bg-[#080b12] px-3">or</span>
                </div>
                <button
                  type="button"
                  disabled={busy || googleBusy}
                  onClick={() => void startGoogle()}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-700/70 bg-[#0d121c] text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {googleBusy ? <Loader2Icon className="size-5 animate-spin" /> : <GoogleIcon />}
                  Continue with Google
                </button>
                <p className="mt-8 text-center text-xs text-slate-400">
                  {signingUp ? "Already have an account? " : "Don’t have an account? "}
                  <button
                    className="font-medium text-blue-400 hover:underline"
                    onClick={() => {
                      setSigningUp(!signingUp);
                      setError("");
                    }}
                  >
                    {signingUp ? "Sign in" : "Create an account"}
                  </button>
                </p>
              </>
            )}
            {sent && !profile && (
              <div className="mt-6 space-y-3 text-center text-sm text-slate-400">
                <p className="text-slate-500">Didn’t receive the code? Check your spam folder.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void resend()}
                  className="block w-full underline"
                >
                  {busy ? "Sending…" : "Resend Code"}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2"
                  onClick={() => {
                    setSent(false);
                    setOtp("");
                    setError("");
                  }}
                >
                  <ArrowLeftIcon className="size-4" />
                  Use a different email
                </button>
              </div>
            )}
            {(error || desktop.error) && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {error || desktop.error}
              </p>
            )}
            {session.error && !desktop.user && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                We couldn’t verify your session.{" "}
                <button type="button" className="underline" onClick={() => void session.refetch()}>
                  Retry
                </button>
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AccountLoading() {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setStalled(true), 15_000);
    return () => window.clearTimeout(timeout);
  }, []);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#080b12] px-6 py-12 text-slate-200">
      <div className="w-full max-w-xl p-6 md:p-12">
        <div className="mb-8 flex items-center gap-2 text-xl text-slate-100">
          <img src="/automorphic-mark.svg" width="24" height="24" alt="" /> Automorphic
        </div>
        <div role="status" className="flex flex-col items-center gap-6 py-8">
          <LoaderPinwheelIcon
            aria-hidden="true"
            className="size-6 animate-spin text-blue-400 motion-reduce:animate-none"
          />
          <p>
            {stalled
              ? "Session verification is taking longer than expected."
              : "Verifying session…"}
          </p>
          {stalled && (
            <button
              type="button"
              className="rounded-md border border-slate-600 px-4 py-2 hover:bg-slate-800"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export function AccountSettings() {
  const { data, isPending } = accountClient.useSession();
  const desktop = useDesktopAccount();
  const user = desktop.user ?? data?.user;
  const [error, setError] = useState("");
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">Automorphic account</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {isPending ? "Loading account…" : user?.email || "Sign in to Automorphic."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        onClick={async () => {
          if (!user) {
            const url = new URL(window.location.href);
            url.searchParams.set("sign-in", "");
            window.location.assign(url.toString());
            return;
          }
          setError("");
          try {
            await window.signOut?.();
            window.dispatchEvent(new Event("automorphic-account-changed"));
            const result = await accountClient.signOut();
            if (result.error) setError(result.error.message || "Could not sign out.");
          } catch {
            setError("Could not sign out. Please try again.");
          }
        }}
      >
        {user ? "Sign out" : "Sign in"}
      </button>
    </section>
  );
}
