# Automorphic

Supercharge your discretionary trading with AI. Automorphic brings charts, AI agents, macro context, and strategy investigation into one workspace.

Built on [T3 Code](https://github.com/pingdotgg/t3code), with a native trading workspace using [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts). This is an independent project; it is not affiliated with T3 Tools or TradingView.

## The workspace

- Switch between a chart-focused layout and a conversation with the chart beside it.
- Explore MGC and NQ contracts with candlesticks, volume, technical indicators and opening-range studies.
- Mark up charts with drawings saved to each workspace and instrument.
- Follow macro headlines with AI-assessed direction and impact strength.
- Open the bottom dock for a terminal or your connected account’s positions, orders and available fills.

Chart tools include replay, drawing alerts, and configurable indicators. Agents can create backtests and visual reports in your workspace. This is evolving software; TradingView feature parity, always-on alerts, and automated execution are not implied. Connect your own data and AI accounts. Backtest results are not guarantees of future performance.

## Run locally

Install Git, Node.js 24 (compatible with `^24.13.1`), and [Vite+](https://viteplus.dev/guide/).
The lockfile uses pnpm 11.10.0. Then:

```sh
git clone https://github.com/Munasco/automorphic.git
cd automorphic
vp i --frozen-lockfile
vp run dev
```

Open the pairing URL printed by the server. Install and authenticate the provider CLI you want to use, then select it in Settings and open **Trading**. Provider subscriptions and market-data entitlements are separate from this source code.

The current account gate uses hosted Automorphic services by default. To run independently, configure your own backend before starting; see [self-hosting](docs/operations/self-hosting.md). A local pairing token authenticates the environment, not the Automorphic account.

The default **My workspace** folder is `~/.automorphic/my-workspace`. New workspaces are created beneath `~/.automorphic`; you can also import an existing folder. Settings, drawings and cached news analysis persist in SQLite. Temporary news data expires after 24 hours or seven days; saved chart work is retained.

Market-data and headline analysis connections require server-side configuration. Keep credentials in `~/.automorphic/.env`; never commit them. Token renewal can run locally; the Convex backend also provides the account service. See the [development guide](docs/operations/development.md) for platform prerequisites and desktop builds.

## Landing page

```sh
vp run --filter @t3tools/marketing dev
```

Set `PUBLIC_CONVEX_SITE_URL` in the marketing `.env` and deployment environment for signup. Set `WAITLIST_ALLOWED_ORIGINS` in your Convex deployment to the comma-separated site origins. Email and beta-download access require their own backend configuration; see [self-hosting](docs/operations/self-hosting.md).

Refresh the workspace image with:

```sh
vp run --filter @t3tools/marketing snapshot:update /path/to/workspace-screenshot.png
```

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md), the [community conduct policy](CODE_OF_CONDUCT.md), and the [security reporting policy](.github/SECURITY.md). Source and binary maintainers should follow the [release checklist](docs/operations/open-source-release.md).

## License and attribution

Automorphic's original code and the inherited T3 Code core are MIT licensed; retain both copyright notices in [LICENSE](LICENSE). Dependencies, fonts, and other assets retain their own terms: see [third-party notices](THIRD_PARTY_NOTICES.md). The MIT license does not grant access to hosted services or redistribute brokerage data or third-party provider software under MIT.
