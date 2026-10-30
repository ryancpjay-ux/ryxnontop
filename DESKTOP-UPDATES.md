# Desktop updates and migration

The shared updater checks ryancpjay-ux/ryxnontop after five seconds at launch and every four hours while open (when automatic checks are enabled). Stable versions select stable metadata and reject downgrades. Explicit beta.N Windows test builds follow beta.yml; after upgrading to a normal stable version they use the stable channel on the next launch. Native electron-updater selects Windows latest.yml or macOS latest-mac.yml and the compatible architecture. The shared notification announces each available version at most once per renderer session, including across Settings/panel navigation. Later suppresses that version for the rest of that session; Settings always retains update controls.

Downloads require a click unless background downloads are explicitly enabled. HTTPS and SHA-512 metadata verification are retained. Windows verifies the configured publisher where available; unsigned historical builds do not have publisher authenticity. Mac automatic installation requires a compatible code signature. There is no signature-verification bypass. Ordinary quit never installs an update. Restart requires durable credential/workspace saves, and both renderer and native activity guards reject installation during Listen/Ask.

## Older installations

- Windows beta.5–beta.7: contain the own-repository updater and beta feed. beta.6→beta.7 download, installation, automatic reopen and saved-key/history preservation were verified in Parallels. beta.7→the new shared-updater candidate still needs an installed-build test.
- Older Windows builds: inspect their embedded app-update.yml and updater code; do not assume they subscribe to the correct feed. The safe fallback is one manual run of the current compatible installer, using the existing installation and preserving userData. Do not uninstall or delete app data.
- Existing Mac 0.20.1: not update-enabled for this repository. Its packaged app-update.yml is absent, its updater source references upstream, its local startup does not initialize that updater, and its local development identity cannot be assumed compatible with a future Developer ID release. It requires one manual upgrade to the first verified signed/notarized release. Later compatible signed releases can update in-app.
- No code change can retroactively add notifications to an already-installed app without an updater. No automatic Mac migration has been verified yet.

The installed Mac app, existing Mac archive and real user profile are preserved. A local source checkpoint exists at refs/audit/before-cross-platform-updates. Test Mac packaging uses a separate bundle identifier, product name and hard-coded disposable profile in the staged bundle only. It contains no real credentials and is not a distribution artifact.

## Production credentials and release process

Windows secrets: WIN_CSC_LINK (base64 Authenticode PFX), WIN_CSC_KEY_PASSWORD. Variables: WINDOWS_PUBLISHER_NAME, WINDOWS_CERT_THUMBPRINT.

Mac secrets: MAC_CSC_LINK (base64 Developer ID Application PFX), MAC_CSC_KEY_PASSWORD, APPLE_API_KEY_BASE64 (App Store Connect notarization .p8), APPLE_API_KEY_ID, APPLE_API_ISSUER. Variable: APPLE_TEAM_ID. Use GitHub repository secrets, never source files or chat. Apple Developer Program membership and a Developer ID Application certificate are required for the intended public Mac distribution. The existing local signing identity is not a distribution certificate.

For an approved stable release, set matching package version and vX.Y.Z tag, update DESKTOP-RELEASE-NOTES.md, and push verified source/tag. Windows and macOS runners validate source. Windows builds NSIS, checks metadata and the expected Authenticode signature. macOS builds arm64 DMG+ZIP with unchanged production bundle ID and entitlements, signs/notarizes, verifies Developer ID/team identity, stapled ticket and Gatekeeper assessment, and validates macOS metadata against actual packages. Only if both jobs succeed does one publication job upload both artifact sets and mark the release stable/latest. Missing credentials stop publication. Existing assets are not overwritten.

Windows-only beta tags remain useful for controlled VM update tests and never publish Mac update packages or reach stable clients. Mac CI signing/notarization has not run successfully yet; credentials are not configured. Neither a successful compile nor simulated updater tests establish a real Mac update roundtrip.

## Background validation

Desktop validation runs on pushes to main and pull requests using Windows and Mac runners. It runs lint, both type checks, regression tests, static renderer build and platform packaging without opening any app or publishing any release. Mac validation uses an unsigned, non-distribution test identity and cannot be mistaken for signed production verification. The separate stable release workflow still requires real signing/notarization.

## Outstanding acceptance

Verify the shared-updater Windows candidate through an installed beta upgrade. With Apple credentials ready, test signed Mac old→new installation, download, restart and data preservation, including Keychain/TCC identity migration. Test live provider/Deepgram/audio capture and multi-monitor/privacy behavior on each target. Do not publish a stable cross-platform release before these pass. Current implementation work is not a stable-release readiness claim.
