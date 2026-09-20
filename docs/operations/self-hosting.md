# Self-hosting Automorphic

## Requirements

Use Git, Node.js 24 compatible with the root `engines` field, Vite+, and the pinned
pnpm version from `package.json`. Run `vp i --frozen-lockfile` at the repository root.
Native desktop prerequisites are in [development](development.md#desktop-artifacts).
Provider CLIs, data subscriptions, email delivery, and cloud hosting are separate services.

## Account service

The current web and desktop account gate requires the Convex/Better Auth backend.
It is separate from local environment pairing. Without overrides, account requests go to
Automorphic's hosted defaults; source availability is not a promise of hosted beta access.

1. From `apps/trading-backend`, run `pnpm exec convex dev` and create your own deployment.
2. Configure the variables listed in that directory's `.env.example` with `pnpm exec convex env set NAME VALUE`.
   Generate a unique `BETTER_AUTH_SECRET`. Use your own Resend key and a verified
   `AUTH_EMAIL_FROM` sender for email OTP. Google OAuth is optional.
3. Set `SITE_URL` to your application origin. Set `AUTH_ALLOWED_ORIGINS` to only the
   origins you operate. Desktop account sign-in also uses the custom schemes documented
   in the backend example. Configure Google OAuth callbacks for your own Better Auth deployment.
4. At the repository root, copy `.env.example` to `.env`. Replace both
   `VITE_AUTOMORPHIC_AUTH_URL` (`.convex.site`) and
   `VITE_AUTOMORPHIC_CONVEX_URL` (`.convex.cloud`) with the deployment's public URLs.
5. Run `vp run dev`, use the pairing URL printed by the runner, and sign in to your account service.
   Restart/rebuild clients after changing build-time URLs.

Do not reuse production identifiers from another operator. Keep server-side credentials in
Convex environment settings, never in `VITE_*` or `PUBLIC_*` variables. Do not set
`VITE_HTTP_URL` or `VITE_WS_URL`; development uses the same-origin proxy.

## AI providers

Install the provider's official CLI on the machine running the Automorphic server and complete
its own sign-in/configuration. Select it in Automorphic Settings. Each contributor supplies
their own credentials and follows that provider's terms.

For Claude on Vertex AI, configure the user's unmodified Claude installation with their
Google Cloud project and credentials. A contributor's Chrome profile, cloud project, or account
must never be part of a release. See the provider's documentation for current authentication requirements.

## Market data and optional headline analysis

Automorphic Desktop provides **Settings → Trading → Connect Tradovate**. Choose simulation/funded
or live, sign in on Tradovate in the dedicated native window, then select that account environment.
Automorphic observes authorization only for the matching Tradovate account API, verifies account
access, and shows Connected. It does not collect passwords or require an OAuth application.
Web-only clients can use the server token configuration below; they cannot inspect another site's
browser session. The desktop connects its own primary local server.

Captured sessions are stored outside the checkout in a private `.connections` directory alongside
the trading environment file, with restrictive directory/file permissions. Sessions renew before
expiry while used. Disconnect disables the saved connection, including fallback to an older server
token; reconnect to resume. Revoked/expired sessions and missing broker permissions require sign-in
or action in Tradovate. Sign-in does not grant additional exchange data or trading permissions.

The local server reads `~/.automorphic/.env`, or the file selected by
`AUTOMORPHIC_ENV_FILE`. Create the directory/file privately, outside your checkout.
The development wrapper renews a configured Tradovate session; it cannot create data entitlements.

```dotenv
TRADOVATE_ENVIRONMENT=demo
TRADOVATE_ACCESS_TOKEN=
# Optional ISO timestamp for session renewal:
TRADOVATE_TOKEN_EXPIRATION=
# Optional AI headline analysis:
GEMINI_API_KEY=
# GEMINI_NEWS_MODEL=
```

Use the environment and token for your own account. Do not mix demo/live sessions.
Expired or revoked tokens require reauthentication. A remote renewal endpoint additionally
requires its own authenticated configuration; do not share an operator's token or sync secret.

Charts require access to the requested contracts and history. The source license does not
license exchange data for redistribution. Use synthetic candles and anonymized examples in
public fixtures, screenshots, bug reports, and demos.

## Telegram channels

Open Settings → Trading or the chart's Telegram view. For a new installation, register an API
application at <https://my.telegram.org/apps>, then enter its API ID and API hash in the setup
form. These are saved in the server's private connection storage. Continue with your phone number,
the code delivered by Telegram, and, if enabled, your two-step verification password.

Official desktop builds use Automorphic’s shared Telegram app identity, supplied by the
`AUTOMORPHIC_TELEGRAM_API_ID` and `AUTOMORPHIC_TELEGRAM_API_HASH` release secrets. Users
only sign in to their own Telegram account. These identify the native Telegram client;
they are embedded in the server bundle, never committed as source or exposed by status APIs.

Self-hosted operators can instead set `AUTOMORPHIC_TELEGRAM_API_ID` and `AUTOMORPHIC_TELEGRAM_API_HASH` in the private
server environment file or use the installation setup form. Environment settings take
precedence over saved setup, which takes precedence over the bundled app identity.

The integration uses your own MTProto account session to read joined channels and supergroups.
Choose a channel to read recent posts, toggle its bell for in-app notifications, and optionally
allow desktop notifications. Notifications run while the trading workspace is open. This does not
send channel messages, execute signals, or place trades. Disconnect logs out the saved Telegram
session and removes its private session file. Telegram sign-in challenges that require other
verification methods must be completed in Telegram before retrying.

## Rithmic

A native Rithmic connector has not been implemented. R|Protocol provides a potential WebSocket
integration path, but requires developer access, the supplied protocol definitions, and applicable
conformance requirements. Request access through <https://www.rithmic.com/api-request> before
planning a production connector. No Rithmic account is connected by these settings.

## Marketing site

Run `vp run dev:marketing`. Set `PUBLIC_CONVEX_SITE_URL` in
`apps/marketing/.env` to your own backend's site URL. Configure
`WAITLIST_ALLOWED_ORIGINS` on that backend. Signup, email delivery, and beta downloads
depend on backend settings and available release assets. Review the marketing release configuration
before deploying a fork; do not direct its signups to Automorphic production.

## Independent builds

Use `vp run dev:desktop` for desktop development or the platform commands in
[development](development.md#desktop-artifacts) for local unsigned builds.
Existing `t3`, `@t3tools/*`, and `t3code:` identifiers are inherited internal compatibility
names. They do not mean an Automorphic CLI has been published to npm. Do not advertise
`npx t3` as an Automorphic installer.

Before publishing a fork's installers, configure its own app identifiers, update repository,
signing credentials, and download destinations. Follow the
[source and binary release procedure](open-source-release.md).
