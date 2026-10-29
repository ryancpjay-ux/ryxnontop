# ryxnontop

My desktop assistant for Listen, Ask and local notes. Downloads: [GitHub Releases](https://github.com/ryancpjay-ux/ryxnontop/releases).

## Windows

I publish experimental Windows versions as prereleases. Stable releases are built from approved, tested source tags by the Windows-only GitHub Actions workflow. See [Windows releases and updates](WINDOWS-RELEASES.md) for signing setup, testing, and the release process. Users supply their own AI provider and Deepgram credentials; no API keys are distributed in this repository.

## macOS

The existing Mac release remains unchanged. This workflow does not build or publish macOS. See the [download guide](DOWNLOADS.md) for existing releases.

## Development

Use Bun 1.3.10 and Node 24: `bun install --frozen-lockfile`. Run `bun run build:electron`, `node --test scripts/*.test.cjs`, `bun run lint`, and `node node_modules/typescript/bin/tsc --noEmit`. Native Windows packaging: `bun run build`, then `bunx electron-builder --win nsis --x64 --config scripts/windows-ci-config.cjs --publish never`.

This application builds on [Realtime Interview Copilot](https://github.com/innovatorved/realtime-interview-copilot) by Ved Gupta and its contributors, under the [MIT license](LICENSE). Original copyright and license notices are preserved.

For issues, DM me [@ryan.c.jay](https://www.instagram.com/ryan.c.jay/) or email ryancpjay@gmail.com.
