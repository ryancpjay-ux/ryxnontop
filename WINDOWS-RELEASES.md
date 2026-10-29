# Windows releases and updates

The Windows pipeline builds tagged source with Bun 1.3.10, the committed lockfile, Node 24, Windows NSIS and electron-updater. macOS is excluded from the workflow and its existing assets are never overwritten.

## Test releases

Set package.json to a unique semantic prerelease such as `0.21.0-beta.1`, commit the source, and push its matching tag `v0.21.0-beta.1`. GitHub Actions validates lint, TypeScript and regression tests, builds on Windows, verifies installer/update hashes and publishes a prerelease. Stable clients ignore prereleases. Explicit `-beta.N` application builds use the separate beta.yml feed so controlled beta-to-beta update tests never expose prereleases to stable installations. Existing published versions are immutable; use a new version to correct a release. A failed upload remains a draft and is not offered to clients.

## Stable releases

First verify the candidate on Windows: actual installation, launch, saved API credentials, Listen, Ask, and an upgrade from the previous version. No local simulated test establishes those results.

For a signed stable release configure repository secrets `WIN_CSC_LINK` (base64 Windows Authenticode PFX certificate) and `WIN_CSC_KEY_PASSWORD`. Configure repository variables `WINDOWS_PUBLISHER_NAME` (the certificate's publisher name) and `WINDOWS_CERT_THUMBPRINT` (its expected thumbprint). Obtain a valid Windows code-signing certificate; an Apple Developer ID or the local Mac signing identity cannot sign Windows installers. Do not put any signing material or API keys in Git.

Set package.json to a normal semantic version and commit that verified source. Creating and pushing its matching `vX.Y.Z` tag is the explicit publication approval. The pipeline rejects a stable tag that does not match package.json, lacks signing configuration, fails any check, or produces a signature that Windows cannot validate. Successful stable releases are marked Latest. This gate deliberately prevents untested/unsigned builds from being advertised as trusted production updates.

The automatic GITHUB_TOKEN needs only read access during build and contents:write during publication. No personal access token or user AI API keys are needed in CI. Actions are pinned by commit, dependency cache contains only Bun's download cache, and only verified Windows assets are uploaded: Setup.exe, its blockmap and SHA-256 checksum, and latest.yml (SHA-512 installer metadata), plus beta.yml for beta update tests. The NSIS installer preserves the existing app ID, per-user install and userData directory.

## In-app updates

Windows checks stable GitHub Releases 30 seconds after launch and every eight hours. Settings → Windows updates shows the installed Electron version, Stable channel, check setting, optional background downloads, progress and release notes. Default behavior asks before downloading. Downloads are verified by electron-updater; publisher signature verification is retained when publisher metadata is available. Historical unsigned builds do not have signed publisher authenticity. HTTPS and hashes alone are not a code-signing identity.

Updates install only through Restart and install after Listen and Ask finish. The renderer saves credentials and synchronously flushes the workspace during window close; a save error keeps the window open. No update runs automatically during a conversation or on ordinary quit. The restart option reopens the new app. Encrypted Windows DPAPI keys, onboarding flags, preferences and library data remain in the existing userData directory outside the replaced installation. A failed/interrupted download leaves the current installation intact. NSIS/Windows handles installation recovery; forced power loss during installation still requires a real Windows recovery test.

A source commit alone is not an update. A successful approved stable release with complete metadata is required. Mac auto-update behavior is unchanged. Never enable a Mac job for this Windows workflow.

## Required acceptance evidence before promotion

Record the old/new installed versions, Windows version, selected provider/model, first-text and total response timing, installer signature, update detection/download/restart outcome, and preservation of keys/settings/history. Test failed download/retry and interrupted onboarding. Check multiple monitors and capture/privacy compatibility separately. Do not publish a stable release until these checks are actually verified.

Local contract tests: `bun run build:electron`, `node --test scripts/*.test.cjs`, `bun run lint`, `node node_modules/typescript/bin/tsc --noEmit`. Synthetic preparation benchmark: `node scripts/benchmark-windows-latency.cjs`. These do not measure live Gemini latency or verify a native Windows update roundtrip.
