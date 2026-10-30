I added a shared update experience for Windows and Apple Silicon macOS, preserving the existing interface and platform-specific capture and credential storage.

The application checks my GitHub releases shortly after launch and periodically while open. Each version is announced at most once per session. Updates download on request, display progress, and install only after state is saved and Listen and Ask are idle.

I also brought the API setup wizard, provider connection testing and automatic intro-to-workspace routing to macOS. Existing configured Mac profiles migrate without being forced through setup. Interrupted new setup resumes after the intro.

This source is not yet a verified production release. Apple Developer ID signing/notarization credentials are not configured, and a real Mac signed-update roundtrip is untested. I will not publish this as a stable cross-platform release until signing and installed-build acceptance pass.
