I fixed the Windows in-app update restart path. After choosing Restart and install, the updater now requests a silent installation and reopens ryxnontop. The installer also recognizes updater restarts from earlier beta clients, so those clients can receive this fix through the app. Regular manual installation keeps its existing assisted setup.

I tested the beta.6 → beta.7 in-app update in Parallels: the application downloaded the update, installed it and reopened automatically on beta.7. My saved keys and history remained intact. Ask was also confirmed working on beta.6 before the update. All 133 automated tests passed on the native Windows runner. This verifies this update roundtrip; broader provider, audio and capture acceptance testing remains separate.

This is an unsigned experimental Windows release, excluded from stable clients. macOS and existing Mac assets are unchanged.
