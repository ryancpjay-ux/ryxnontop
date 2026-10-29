# ryxnontop — local Smog-style rebuild

This project adapts [Realtime Interview Copilot](https://github.com/innovatorved/realtime-interview-copilot), under its existing Apache-2.0 license. The interface is recreated from the supplied Smog photographs. No Smog executable, icon, native helper, or proprietary source code is included.

## Open in Visual Studio Code

Open this folder in VS Code. Requirements: Node 22+ and Bun 1.3+.

```sh
bun install
bun run electron:dev
```

A browser preview is available with `bun run dev`, but native screenshot capture and AI requests require the Electron app. If port 3000 is already serving this project, use `DEV_PORT=3000 bun run electron:start` instead of starting a second server.

## First use

1. In the setup screen, review screen/system-audio and microphone permissions. Accessibility is optional and is not required by the current shortcuts. Development builds may appear as Electron in System Settings.
2. Open Settings and enter your own **Gemini** and **Deepgram** API keys. Keys save automatically, encrypted using Electron safeStorage backed by macOS Keychain, and restore when the app reopens. Click Done to save immediately. Clearing both fields removes the saved keys. Provider charges and quotas apply. The model field accepts an available Gemini model ID from your Google AI Studio account.
3. Add background context or a text/Markdown file. For a quick check without audio, paste a sample transcript in Add context and choose **Use as transcript**.
4. Choose System audio or Microphone in Settings. **Test audio** shows the input level for eight seconds, without sending audio to a provider. Press **Start** to stream audio to Deepgram. Browser system capture depends on the browser's audio-sharing support; use the desktop app on macOS.
5. Automatic suggestions use a question-word/punctuation heuristic after 1.4 seconds of quiet between final transcript updates. Toggle this in Settings. Use **Answer** for manual generation. It is not semantic question detection.
6. Ask uses the transcript, background context, and recent chat. Capture a screenshot with the camera button, then submit a question to send it to Gemini.
7. Stopping Listen saves the transcript as a local note. Save any answer as a note, edit notes, search them, and export Markdown. Summarize session generates a summary that can also be saved as a note.

## Shortcuts

| Action | macOS |
| --- | --- |
| Hide / restore the desktop window | Cmd+Shift+H |
| Capture screenshot | Cmd+Shift+1 |
| Answer latest question | Cmd+Enter |
| Summarize transcript | Cmd+Shift+Enter |
| Listen / toggle Ask / Notes | Option+C / A / N |

Windows uses Ctrl in place of Cmd and Alt in place of Option. Windows has not been tested in this workspace.

## Storage and network behavior

API keys are encrypted in `provider-keys.enc` inside the app profile, with file permissions restricted to the current user; the encryption key is protected by the macOS Keychain. If secure storage is unavailable, saving reports an error and never falls back to plaintext. Notes, chats, context, and non-secret settings use an atomic local workspace file with a recovery copy; the browser preview uses local browser storage. The app uses a separate Electron profile, `MistCopilotLocal`. Live audio is sent to Deepgram only while Listen is active; the screen video required by Chromium's system-audio capture is not sent to Deepgram. Text and any explicitly attached screenshot are sent to Google when requesting an answer. The local workspace does not mount the original project's login, analytics providers, or auto-updater. Original source components remain in the repository for reference.

## Verification

```sh
bun run build:electron
bunx tsc --noEmit
bunx eslint components/local electron/ipc/local.ts electron/main.ts electron/preload.ts app/layout.tsx app/page.tsx
node --test scripts/local-ipc.test.cjs scripts/credentials.test.cjs
bun run build
```

The offline bridge and encrypted-storage tests cover untrusted origins, streamed response framing, screenshot payloads, invalid inputs, cancellation, persisted credential restoration, updates, deletion, corrupt storage, and unavailable encryption. Notes were also checked through the UI and persisted after a reload. A native Electron window was launched successfully. Live paid-provider calls have not been tested because no user keys were supplied.

## Current limits

This is a functional reference-based rebuild, not recovered Smog source. Listen and Ask are two panels inside one native window; independent undocking and per-panel native window positioning are not implemented. Account sync, billing, PDF document import, and GPT/Claude provider selection are not implemented. Notes export to PDF/Markdown and use the macOS share sheet. Chat history, notes, transcripts, settings, and keys persist. Stop Listen before quitting to finish transcription and optional audio saving; an interrupted active session also saves its existing transcript. Live provider latency and accuracy depend on network and provider service.

The inherited Electron content-protection settings are enabled. Native screenshot capture returned a blank protected window during local verification, but this does not establish invisibility across every screen-sharing or recording app. Verify behavior in the meeting app and OS version you intend to use.

## Package locally

```sh
bun run build:electron
bun run build
node scripts/apply-app-constants.js
CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --mac --dir --publish never
```

This creates an unsigned local app in `dist/`. The current version is installed at `/Applications/ryxnontop.app`; older generated build copies were moved to Trash. It does not publish a release. The upstream README and LICENSE are retained for attribution and reference.

## Clear branded interface update

The updated build includes a solid ryxnontop title bar with “Made by Ryan J.”, a monochrome R/arrow icon, labeled Minimize/Close controls, black/white themes, and named Listen/Ask headers. The profile and encrypted API-key storage remain unchanged.

Quit the old Mist app completely with Cmd+Q before launching the updated app; both use one shared profile and a single-instance lock. The stable shortcut is `../ryxnontop.app` beside this project folder.

## Installed desktop version

The current build is installed at `/Applications/ryxnontop.app`. Open it from Finder → Applications or Spotlight; no terminal or development server is required. The shortcut beside this project points to the installed app. The default profile and Keychain-backed credential storage remain unchanged.

The interface includes the “Made by Ryan J.” byline and persistent monochrome dark/light themes. The modal close button is sticky and excluded from native drag regions. Requests shows generated responses; Session History filters saved Listen transcripts. The duplicate hide control under Ask has been removed. Reopening the app restores hidden/minimized windows and recreates a closed window.

For isolated UI checks, `RYXNONTOP_PROFILE_DIR` can point to a temporary profile; it is unset for normal launches. Never use real provider keys in a test profile.

## Dock and popup behavior

The macOS application runs as an accessory app (`LSUIElement`), with its Dock icon hidden. Minimize hides the window without leaving a thumbnail in the Dock. Open it through Applications/Spotlight or use Cmd+Shift+H to restore it. Screenshot protection applies to the app window; hiding the Dock icon removes that separate macOS UI element entirely while running.

Session mode and response style now use in-app keyboard-accessible menus rather than native popup windows. Right-click on non-editable chrome does not open browser-style menus or select button text. Text entry fields keep normal editing behavior.

The microphone icon in the top toolbar toggles visibility of Listen; the chat icon toggles Ask. When both panels are hidden, the desktop window collapses to the brand bar and toolbar. Hiding Listen preserves its transcript and does not stop an active recording. The labeled New chat button clears Ask, confirms the action, and focuses its input.

Key saving also runs synchronously before the window unloads: pending changes are encrypted on disk before exit, and a storage failure cancels closing with an error instead of dropping the keys. This covers quitting immediately after pasting a key, before the autosave timer fires.

## Listen, Ask, notes, and privacy upgrade

Listen includes question detection, selected request answers with highlighted code, elapsed time, pause/resume, and automatic session notes with an optional AI summary. Its audio recorder sends 200ms chunks at 64kbps, uses speech endpointing, reconnects without reacquiring the media stream, and flushes final audio before Stop completes. Interim text appears before the final transcript. Instant mode reduces the question debounce.

Ask can include or exclude Listen context, archive conversations with New chat, restore chat history, select a display, attach a screenshot, or include that selected display with a question. Captures are sent only with an AI request. A missing selected display fails explicitly.

Notes support manual and automatic entries, favorites, archive, folders, tags, search, sort, grid/list views, Markdown/PDF exports, native sharing, and AI editing. Concurrent manual edits are kept when an AI revision arrives. Privacy includes per-mode controls, opt-in local audio recordings, a processing activity log, JSON backup/import (without API keys), content deletion, and an offline switch that stops audio, cancels requests, and blocks external Electron network requests. Provider processing is disclosed honestly. Raw audio files are separate from JSON backups.

Desktop workspace saves use atomic replacement and a previous valid recovery copy, avoiding browser storage quota limits. Before closing, a synchronous final workspace save and encrypted key save finish on disk. A failed key restore does not replace the saved credentials with blank fields. Keep exported backups for important notes.

Verification for this update: 34 offline automated checks, root TypeScript and ESLint, production Next export, Electron compilation, browser checks for editing/tags/favorites/archive/persistence/privacy, and actual Chromium PDF generation. Live Deepgram/Gemini calls were not exercised with user credentials.

## Permission setup and capture repair

The app opens the reference-style permissions page on first launch and checks microphone/screen grants on launch and focus. Missing or revoked required access brings that page back; Listen stops when those missing grants are detected. Denied or unavailable media capture also routes to setup with recovery instructions. Screen Recording checks both the screen grant and a brief local system-audio capture; no provider request is made during setup. Accessibility is shown as optional because current shortcuts/capture do not use it. Continue is enabled after required access is confirmed.

Microphone capture explicitly requests macOS consent only for `not-determined` status. Granted access skips prompts; denied/restricted access requires restoring the toggle in System Settings. Permissions are controlled by macOS and can be revoked/reset, including after some app updates. The app does not bypass a denied permission.

Display capture now uses scalar frame-rate constraints, includes NSAudioCaptureUsageDescription in the app bundle, and uses Electron 42's documented ScreenCaptureKit capture path for custom system-audio sources. Trusted Chromium media checks reach OS consent; remote pages cannot use the app's media/display handlers. Test audio uses the same acquisition logic as Listen. Verification: 44 offline tests plus TypeScript, lint, and production builds. Actual OS approvals must be completed by the user.

## Permission-status correction

Permission rows now reflect macOS's current grant directly; no saved completion flag or system-audio test can make an approved screen grant display as denied. Continue requires live screen/microphone grants; optional Accessibility and the separate local system-audio test do not gate it. Setup refreshes status every 1.5 seconds and has a graceful Restart app action that allows final data/key saves.

This app is locally/ad-hoc signed because there is no valid Developer ID signing identity on this Mac. macOS can retain a visible permission entry associated with an older ad-hoc build's code hash. A stale grant may require toggling the affected ryxnontop entry off/on (or removing/readding the current /Applications bundle) and restarting. The app does not bypass TCC, fake a granted status, reset other apps' permissions, or modify the TCC database. A stable certificate-based signing identity is needed for reliable identity across future rebuilt versions. This limitation concerns app updates, not ordinary close/reopen cycles. Verification: 47 offline regression checks pass.

For the current package, a builder ASAR archive failed verification. The app was repackaged from a stable unpacked build using `node scripts/repack-verified.cjs <bundle.app>`; all 85 packed files were compared byte-for-byte by SHA-256 to their source before signing and installation. Dependencies remain in app.asar.unpacked. The installed repaired package launched successfully. Use this verification step for subsequent local builds rather than assuming a successful builder exit proves archive integrity.

## Fast responses and latency diagnostics

Fast responses is enabled by default (Settings checkbox). It reduces detected-question debounce from 650ms to 120ms, requests minimal/low thinking where the selected Gemini model supports it, asks for the direct answer before explanation, bounds recent conversation/reference context, and renders the first streamed text immediately. Longer replies are bounded at 1536 output tokens in Fast mode; turn Fast off for extended reasoning/code or full conversation context. Background AI notes yield to foreground Ask/Listen requests; cancellation cannot clear a newer request's busy state or display a spurious background error.

The footer reports first-text and total response times. Test AI speed sends one generic HTTP question to the configured Gemini provider with your saved API key; it sends no transcript, screenshots, or notes. This isolates provider/network latency from speech capture and question detection. Timing varies across requests. Flash-Lite already defaults to minimal thinking, so explicitly setting minimal alone does not imply a speedup on that model. User-visible improvements also come from shorter answers/context, earlier submission, and prioritization. Verification: 51 offline checks, TypeScript/lint, production build and verified archive packaging. Live benchmark results should be reported as individual measurements, not latency guarantees.

## 0.18.2 workflow update

The permissions startup gate has been removed at the user's request. Access is requested when starting the relevant capture feature. Microphone approval is checked before use and requested only when undecided; revoked/denied access offers the relevant macOS System Settings action. Camera/screen context request screen access on use. Actual macOS grants, not a saved completion flag, determine access.

The app includes a brief monochrome launch reveal with reduced-motion support and an Enter/Skip action. First-time key setup has official provider links and a direct path to Settings; it is separate from OS permissions. Settings now offers Gemini, OpenAI Responses, and Anthropic Claude, independent encrypted keys, remembered model selection per provider, an API tutorial, editable source/language selectors, and Apply and restart Listen. Language can be selected directly from the Listen header. Suggested labels preserve underlying saved values. Hover/focus explanations are rendered within the app. Help & contact lists @ryan.c.jay and ryancpjay@gmail.com.

Automatic questions are detected across transcript chunks, recognize "Tell us" and common imperative prompts, and queue while another answer is active. Incomplete fragments wait; repeated wording at a later transcript position is a new question. Provider errors identify quota/rate-limit cases and offer retry; the app does not silently bypass provider limits. Fast responses reduces local debounce by 530ms, bounds context/output, shows selected/confirmed models and measured first-text/total times, and prioritizes answers above background notes.

Ask explicitly shows Screen on/off, an attached screenshot preview, and the last screenshot sent. Screen on captures a fresh image for each Ask; the camera button captures one snapshot. Captures use Retina display dimensions and a 2560px cap for small text. A generated sample-image test isolates provider image support without sending the desktop. Ask does not receive a live screen-share video.

X now saves and calls app.quit on macOS, rather than leaving a windowless process. Hide/Minimize remain separate. The repeatable local:update workflow replaces only /Applications/ryxnontop.app, verifies the package and signature, preserves the existing profile, and cleans generated app bundles. A single previous installation is kept without an .app suffix for recovery. Sharing/ZIP creation is explicitly on hold.

A persistent local code-signing identity was explicitly authorized by the user. Its non-extractable private key lives in the login Keychain and is restricted to codesign. Trust is limited to the current user's code-signing policy, not SSL/system-wide trust. Local updates reuse its fingerprint from ~/Library/Application Support/ryxnontop-build/signing.json and refuse to silently fall back to ad-hoc signing. First transition may need one last Keychain/TCC approval; macOS can always revoke access or require authorization when the keychain is locked. Trusted public distribution still requires Developer ID signing and notarization.

### 0.19 reliability pass

See `../UPDATE-NOTES.md` for root causes, measured live diagnostics, and the verification matrix. Automatic update launching is now off. `bun run local:prepare` stages one compressed, verified update without replacing or opening the running app. After quitting, `bun run local:apply` installs it without launching. `--launch` is explicit opt-in.

The local certificate preserves a designated requirement, but this Mac's legacy Keychain item still has per-build hash approvals. Do not promise that development updates will never ask for approval. Same-build restart after Always Allow was tested successfully. Never replace encrypted storage with plaintext or silently edit macOS privacy databases.
