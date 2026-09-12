export const TRADING_VISUALS_SKILL = `---
name: trading-visuals
description: Explain a trading setup with an annotated price chart, illustrate a market scenario or decision process, or present backtest evidence in a visual HTML report in Automorphic.
---

# Trading visuals

## When to use this skill

Use when the user asks to show, draw, annotate, visualize, or explain a chart/setup; to illustrate a trading decision or macro scenario; or to explore backtest results visually. Also use when a visual would materially clarify a complex setup or comparison. Examples: "mark the neckline and invalidation", "show why this trade failed", "diagram my entry rules", and "plot drawdown against the baseline". Skip it for a simple quote, one-line factual answer, or a task that does not benefit from a visual.

## Output location

Keep generated output inside the active workspace at .work/.diagrams/<topic-or-report-id>/. Use index.html for the rendered view and save report.json or the source data/diagram beside it. Resolve the workspace from the current session rather than hardcoding a home path. Create folders as needed, preserve unrelated artifacts, and revise the same report when the user asks for an edit. Return a clickable absolute path to index.html. The chart tool returns these paths automatically; conceptual diagrams and custom HTML use the same convention.

## Rendering style

For component-based generated UI, load the bundled json-render, json-render-react and json-render-shadcn skills to define a catalog and render a validated spec. Use the bundled design-review skill to review every visual design before delivery. These skills are installed for both Claude and Codex; their instructions do not imply that npm runtime packages are already installed in an artifact.

Read [assets/report.css](assets/report.css) before building a custom report and embed it in the HTML's style element so the report remains portable. trading_create_chart already uses this stylesheet. Use its tokens and components (.metrics/.metric, .report-grid/.card, .rules/.rule, .verdict) as the starting point; adapt composition to the question rather than inventing a new visual theme each time.

Default to a quiet black and neutral-gray canvas, crisp hairline borders, modest 8px corners and clear typographic hierarchy. No blue-tinted backgrounds, decorative gradients, glows, oversized marketing headings, or a rainbow of cards. Prefer Geist when a local font asset is available; embed or copy it with the report, with the supplied system sans fallback. Use tabular numbers for prices and metrics, regular body weight, and medium headings. Color should convey data: restrained green/red for gains/losses, neutral white for the main series and gray/dashes for a comparison. Label series and outcomes so color isn't the only cue. Other color palettes are fine when the user requests them or the data requires distinct categories.

Put a concise finding and instrument/date context first, then a compact metric strip, then the main chart. Keep evidence visible without scrolling through a large hero. Use aligned grids and 16–24px spacing; collapse columns for the narrow side panel. Move detailed methods/provenance into native details disclosures. Charts need readable axes and units, visible focus, and room for labels. Controls must change real data or a meaningful view. Verify the actual rendered HTML in Automorphic's side panel and expanded view when preview tools are available, including chart content and interactions, not just source syntax.

Design references: [Vercel Geist](https://vercel.com/geist/colors) and [Vercel's interface guidelines](https://vercel.com/design/guidelines). [Vercel Labs json-render](https://github.com/vercel-labs/json-render) provides the bundled catalog-driven UI skills. The bundled local stylesheet requires no hosted generator or runtime dependency.

Choose the output that answers the trader's question:

- **Explain an observed setup:** use actual OHLCV and timestamped annotations. Read trading_get_workspace for the current chart context, export the relevant history with trading_export_dataset, inspect a window using trading_read_dataset, then call trading_create_chart with that datasetId, offset/limit, title, summary, annotations and levels. Its HTML has hoverable candles, numbered notes, levels and the source data. Annotations use exact displayed candle timestamps in epoch seconds. Keep the window focused (usually 50–150 bars, maximum 500). Use levels for support, entry, invalidation or targets; explain which are observations and which are hypotheses. Return the saved HTML path as a Markdown file link, with one concise finding. The user can open the file's browser preview.
- **Explain a concept or decision:** draw a labeled SVG or self-contained HTML diagram under .work/.diagrams/<topic>/. For mock price charts, start from [assets/mock-chart.html](assets/mock-chart.html): copy it into the report directory and edit its setup object (title, summary, closes, marks and levels), or provide explicit OHLC bars. It includes candlesticks, a price-path toggle, annotated levels, numbered labels and candle tooltips. Keep its schematic/synthetic labels; invented candles are not historical evidence. Use an available Excalidraw integration if the user requests an editable sketch. Verify its actual tools and preview support first; do not imply it is installed merely because this skill mentions it.
- **Compare or explore results:** build a self-contained HTML report under .work/.diagrams/<topic>/ with the saved results, a concise conclusion, and only controls that change a meaningful scenario. Save source data and assumptions next to the report. Drawdown, expectancy and sample size matter alongside win rate. Generated dashboards must not contain invented performance or trade data.

If trading_create_chart is not listed in an existing session, use available file tools to create a local report from verified bars, or start a new session after the server has been updated. Never claim a tool ran when it was unavailable.

## Read charts and verify the result

A model can interpret a screenshot when its provider supports image input, but a screenshot alone does not provide exact prices, complete history or a measured success rate. Confirm contract, interval, timezone and visible date range; corroborate precise claims with saved bars. Distinguish visible evidence, interpretation and uncertainty. Never silently replace a real chart with plausible synthetic candles.

Use available preview_open, preview_snapshot and preview interaction tools to inspect generated pages when the runtime supports them. A chart report file link can use Automorphic's HTML browser preview; do not invent localhost URLs or assume a server is running. Check labels, readable small-screen layout and interactive controls before claiming verification. If preview tools or vision input are unavailable, say what was verified from data/code instead.

## Keep the artifact useful

Use the trader's contract, timezone and units. Anchor price-chart marks to data coordinates, not guessed screenshot pixels. Keep notes concise; don't cover the candles with paragraphs. Persist the report, underlying data, annotations and assumptions, and link to the actual saved output. Explain what would invalidate a setup. A visual explanation neither activates an alert nor places a trade.

HTML and SVG can be authored with the agent's existing file tools; no hosted UI generator is required. Optional external MCP tools belong in Settings > Integrations > Plugins and apply to new sessions. Do not upload private charts, trades or account data to a hosted design service merely to draw a local explanation. Keep generated pages self-contained by default.
`;
