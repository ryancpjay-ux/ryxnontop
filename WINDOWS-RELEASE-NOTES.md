I fixed the Windows in-app update restart path. After choosing Restart and install, the updater now requests a silent installation and reopens ryxnontop. The installer also recognizes updater restarts from earlier beta clients, so those clients can receive this fix through the app. Regular manual installation keeps its existing assisted setup.

I am testing the complete beta.6 → beta.7 update in Parallels, including saved credentials, onboarding status, preferences and history. Automated tests and a successful build do not replace that installed-app test.

This is an unsigned experimental Windows release, excluded from stable clients. macOS and existing Mac assets are unchanged.
