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
