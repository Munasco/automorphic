# Automorphic

A clearer view of the markets. Automorphic brings charts, AI conversations and macro news into one trading workspace, so you can investigate an idea without jumping between disconnected tools.

## The workspace

- Switch between a chart-focused layout and a conversation with the chart beside it.
- Explore MGC and NQ contracts with candlesticks, volume, technical indicators and opening-range studies.
- Mark up charts with drawings saved to each workspace and instrument.
- Follow macro headlines with AI-assessed direction and impact strength.
- Open the bottom dock for a terminal or your connected account’s positions, orders and available fills.

Account views are read-only. Natural-language backtesting and custom AI-generated alerts are planned; the current preview provides charts, indicators and headline analysis.

## Run locally

Install [Vite+](https://viteplus.dev/guide/), then:

```sh
vp i
vp run dev
```

Open the pairing URL printed by the server. Authenticate an AI provider in Settings, then open **Trading** from the side panel. The button beside the chat input opens the bottom dock.

The default **My workspace** folder lives under `~/Automorphic/Workspaces`. Create additional workspaces by name, or import an existing folder. Settings, drawings and cached news analysis persist in SQLite. Temporary news data expires after 24 hours or seven days; saved chart work is retained.

Market-data and headline analysis connections require server-side configuration. Keep credentials in the ignored `.env` file; never commit them. Session renewal can run locally or through the optional backend in `apps/trading-backend`.

## Landing page

```sh
vp run --filter @t3tools/marketing dev
```

Set `PUBLIC_APP_URL` when deploying the site. Refresh the workspace image with:

```sh
vp run --filter @t3tools/marketing snapshot:update /path/to/workspace-screenshot.png
```

## License

See [LICENSE](LICENSE) and [third-party notices](apps/web/THIRD_PARTY_NOTICES.md) for the original licenses and attributions.
