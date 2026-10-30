I am testing the shared desktop updater on Windows. It checks my GitHub repository shortly after launch and periodically while open, keeps notices from repeating for the same version during a session, and preserves explicit download/restart controls and the existing beta update channel.

The beta.6 → beta.7 restart fix remains in place. Saved data is written before installation, and native activity guards prevent updating during Ask or Listen.

This is an unsigned Windows test candidate. The Mac implementation is in source, but no Mac update package is published by this beta. Signing/notarization and a real Mac update test are still pending. Stable clients ignore this release.
