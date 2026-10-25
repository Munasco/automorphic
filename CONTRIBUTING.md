# Contributing to Automorphic

Automorphic is a trading workspace built on [T3 Code](https://github.com/pingdotgg/t3code).
Report Automorphic bugs and propose changes in [this repository](https://github.com/Munasco/automorphic/issues), rather than in T3 Code's issue tracker.

## Get started

Fork the repository, create a branch, and follow the [development guide](docs/operations/development.md).
See [self-hosting](docs/operations/self-hosting.md) for account, market-data, and AI configuration.
Use your own credentials and synthetic data. Never include brokerage sessions, account exports,
private conversations, environment files, or browser profiles in a contribution.

## Propose a change

Open an issue before a substantial feature or architectural change so we can agree on scope.
Focused bug fixes, accessibility improvements, performance work, documentation, and tests are welcome.
Describe the problem, expected behavior, and steps to reproduce it. Redact logs and screenshots.
For security issues, use the [private reporting process](.github/SECURITY.md).

## Submit a pull request

- Keep each PR focused and explain the resulting behavior and why it matters.
- Run focused tests, lint, and package typechecks for the files you changed. CI owns the full suite.
- Include before/after screenshots for UI changes and a short video for interaction or timing changes.
- Consider both compact and expanded charts and the web/desktop clients; shared changes may also affect mobile.
- Update user documentation when setup or behavior changes. Follow [AGENTS.md](AGENTS.md) for repository conventions.
- Preserve copyright and license notices. Identify the source and license of any added code, icons, fonts, or other assets.

Contributions are provided under the repository's MIT license unless an existing file has a
different license. Submit only work you have the right to contribute. Third-party components
retain their own licenses. Review and acceptance are at the maintainers' discretion.
