# Publishing Automorphic

## Source release

The root license is MIT with both the original T3 Tools notice and the Automorphic
contribution notice retained. Component-specific licenses remain in force. Use this
procedure when publishing a new source snapshot or changing repository visibility.

1. Review the exact branch and every other branch/tag that will become public.
   Include Git history, releases, attachments, screenshots, workflow logs, and issue/PR
   content in the review. A source scanner cannot inspect image contents or remote settings.
2. Run `node scripts/source-release-check.mjs`. This checks tracked private/runtime
   paths and absolute local dependency references, not secret values.
3. Install [Gitleaks](https://github.com/gitleaks/gitleaks) and scan the reachable history:

   ```sh
   gitleaks git --redact --log-opts="--branches --remotes --tags"
   ```

   Scan `--all` too when reviewing local-only refs. Never publish with `git push --mirror`:
   agent checkpoint refs and personal scratch refs are not release branches.
   `.gitleaksignore` records exact historical false positives, including public upstream
   test fixtures, publishable client identifiers, protocol examples, and token-generation
   alphabets. It does not suppress entire files, tests, or detection rules. Review every
   new finding; never baseline a live credential. Revoke exposed credentials before
   removing them from history, then rescan all affected refs and artifacts.

4. Verify a fresh checkout with the pinned Node/package-manager versions and
   `vp i --frozen-lockfile`. Follow [self-hosting](self-hosting.md) using your own
   service configuration. Confirm account sign-in, provider detection, chart rendering,
   and market-data access on the intended installation; no maintainer account is included.
5. Preserve [LICENSE](../../LICENSE), [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md),
   [LICENSES](../../LICENSES), and nested component notices. Added assets need recorded
   provenance; a screenshot comparison is not a license to copy proprietary assets.
6. Use a reviewed commit/PR as the release record. Change visibility only after the
   credential review. Publishing source does not automatically publish installers, npm
   packages, or deployment credentials.

The internal CLI package remains named `t3` for compatibility and is marked private to
prevent accidental publication to the upstream npm package. There is currently no
documented Automorphic npm installation command.

## Dependency notices and source obligations

Generate an inventory and copy the legal files shipped with installed production dependencies:

```sh
mkdir -p build/source-review
pnpm licenses list --prod --json > build/source-review/pnpm-licenses.json
node scripts/license-bundle.mjs build/source-review/pnpm-licenses.json build/source-review/licenses
```

Use a new, empty output directory on each run. The raw pnpm report contains local installation
paths and is for local review. The generated bundle contains a portable CycloneDX inventory,
copied license/notice files, and `review-required.json` without those local paths.
Packages absent from the current host, missing notices, and licenses requiring review are
reported rather than silently treated as MIT.

This inventory is not a legal approval and is not an inventory of the finished executable.
It includes production dependencies across the installed workspace; some may not ship in
a given artifact. Native Rust/C/C++ components, Electron, WASM, downloaded helpers,
fonts, vendored tarballs, and image assets require separate review.

For **heic-to/libheif** and **libvips** distributions, retain the applicable LGPL texts
and provide the corresponding source/build materials and modification/relinking provisions
required for the artifact you distribute. A link to a package homepage alone is not a
substitute for those obligations. Check any additional native codec licenses.

The **Claude Agent SDK** has Anthropic-specific terms rather than the root MIT license.
Preserve its notices and review the applicable terms for the intended distribution.
Provider executables remain user-installed; do not package maintainer credentials or
describe third-party binaries as MIT-licensed Automorphic code.

## Installer release

Build on each target OS using [the platform prerequisites](development.md#desktop-artifacts).
For each release:

- Build from a clean, identified commit using the locked dependencies.
- Collect notices for the exact target dependency closure and native helpers. Include the
  root license, third-party notices, applicable license texts, and required corresponding
  source materials alongside the artifacts and in the installed distribution as applicable.
- Resolve `review-required.json` entries relevant to the shipped artifact. Obtain missing
  license texts from the exact upstream release; record the version/source used.
- Inspect unpacked artifacts for credentials, environment files, local state, trial fonts,
  personal data, and unintended updater/account endpoints. Source checks do not scan binaries.
- Test a fresh install, first sign-in, provider CLI discovery, restart, and update behavior.
  Test with a dedicated demo account; never ship a shared brokerage session.
- Configure your own signing/notarization identities and update repository. Publish one
  clearly named download per supported OS/architecture, with SHA-256 checksums and a
  versioned release note listing tested platforms. Do not advertise unbuilt targets.
- Review screenshots and sample market data for privacy and redistribution rights.

Do not call a new binary release cleared merely because the source PR or secret scan passed.

## CI and repository settings

[Automorphic CI](../../.github/workflows/ci.yml) runs source-hygiene tests, a redacted Git
history scan, chart/account tests, trading server tests, session-renewal tests, and scoped
web/server typechecks on standard GitHub runners. It uploads dependency notices for review.
It does not publish packages or deploy infrastructure. The inherited T3 publishing,
relay, mobile, vouch, and scheduled-release workflows have been removed.

In repository settings, enable secret scanning/push protection where available, private
vulnerability reporting, and dependency alerts. Protect the default branch, require reviews
and the Automorphic CI jobs, and restrict workflow token permissions to what each job needs.
A workflow file cannot enable these account-level settings. Configure release environments
and secrets separately; never attach production credentials to untrusted PR workflows.
