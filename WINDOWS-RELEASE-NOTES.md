I added automated Windows releases and expanded the in-app updater. Windows can check stable releases automatically, show release notes and download progress, and restart to install when Listen and Ask are idle. Background downloads are optional. Saved credentials, onboarding and history stay in the existing Windows profile directory.

I also reduced Listen audio chunks from 200ms to 100ms, shortened speech endpoint detection from 250ms to 200ms, and enabled Deepgram's no-delay finalization. Number/date formatting may be simpler as a result. Fast OpenAI GPT-5.4-mini requests use no extra reasoning; other selected providers/models are preserved. Streaming avoids empty updates and long transcript preparation keeps exactly the same prompt text with less work.

This is an experimental Windows build, not a verified stable production update. Automated contract/UI tests do not prove live Gemini speed or a Windows upgrade roundtrip. The reported 32-second Gemini delay remains under investigation. Existing stable installations ignore this prerelease. The installer is unsigned unless signing credentials were supplied to the workflow; do not treat it as a verified publisher-signed build.

The first native Windows pipeline run found platform assumptions in older fixtures. I corrected those fixtures and Windows archive-path verification before retrying publication. Failed builds never publish a release.

macOS and the existing Mac download are unchanged.
