# Third-party notices

## T3 Code

Automorphic is derived from [T3 Code](https://github.com/pingdotgg/t3code).
Copyright (c) 2026 T3 Tools Inc. The original MIT grant and copyright are retained
in [LICENSE](LICENSE), alongside the copyright for Automorphic contributions.
Inherited package names and protocol identifiers are compatibility details, not endorsement.

## Scope

The root MIT license covers this project's code, not every dependency or asset.
Preserve component-specific notices in [the web client](apps/web/THIRD_PARTY_NOTICES.md),
[the mobile terminal](apps/mobile/modules/t3-terminal/THIRD_PARTY_NOTICES.md),
vendored reference repositories, and font directories.

Use `pnpm licenses list --prod --json` and the license-bundle tool described in
[the release guide](docs/operations/open-source-release.md) for the exact installed dependency versions.
Review native binaries and assets separately; package metadata alone is not a clearance.

## Components requiring separate terms

- **Claude Agent SDK**: the installed package's `LICENSE.md` reserves Anthropic's rights and
  refers to [Anthropic's legal terms](https://code.claude.com/docs/en/legal-and-compliance).
  It is not MIT licensed. Automorphic uses the user's Claude executable; do not relicense
  or redistribute provider executables as Automorphic code.
- **heic-to**: LGPL-3.0 image conversion, including libheif-derived code. Binary distributors
  must satisfy the applicable license/source and modification requirements. Source:
  [hoppergee/heic-to](https://github.com/hoppergee/heic-to).
- **sharp/libvips**: sharp and its native libvips distributions have different licenses;
  retain their packaged notices and satisfy the native library's LGPL requirements.
- **Fonts**: preserve the OFL files alongside Geist, Inter, DM Sans, JetBrains Mono, and
  terminal fonts. Local trial/evaluation fonts must not enter public source or builds.
- **Third-party marks and imagery**: provider logos, inherited T3 marketing imagery,
  profile photographs, and market-data screenshots need their own provenance review.
  Their presence in a source tree does not establish trademark, publicity, or data rights.

## Additional assets

The trading-graph icon is by [Streamline](https://github.com/webalys-hq/streamline-vectors), from the Freehand color icons collection, retrieved through [Iconify](https://api.iconify.design/streamline-freehand-color/trading-graph.svg). It is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). SVG attributes were adapted for React. The blue graph is preserved; the arrow uses the foreground color in dark mode for contrast.

Charts use TradingView Lightweight Charts under its Apache 2.0 license, with the required TradingView link displayed beside the chart. Upstream dependency licenses remain applicable.

The license and notice for Lightweight Charts 5.2.1 are included in [LICENSES](LICENSES).

The settings icon is from the [Solar icon set](https://github.com/480-Design/Solar-Icon-Set) by 480 Design, retrieved through [Iconify](https://api.iconify.design/solar/settings-linear.svg), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). SVG attributes were adapted for React.
