// Package the already verified Windows runtime; never start a VM or the app.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
process.chdir(root);
if (process.platform !== 'win32') {
  require('app-builder-lib/out/vm/vm').getWindowsVm = async () => {
    throw new Error('Native installer extraction failed. VM fallback is disabled; build on Windows instead.');
  };
}
const { build, Platform, Arch } = require('electron-builder');
async function main() {
  const runtime = path.join(root, 'work/windows/win-unpacked');
  const asar = require('@electron/asar');
  const version = require('../package.json').version;
  const packed = JSON.parse(asar.extractFile(path.join(runtime, 'resources/app.asar'), 'package.json'));
  if (packed.version !== version) throw new Error('Windows runtime version does not match the installer.');
  const updateConfig = path.join(runtime, 'resources/app-update.yml');
  if (!fs.existsSync(updateConfig)) fs.writeFileSync(updateConfig, 'provider: github\nowner: ryancpjay-ux\nrepo: ryxnontop\nupdaterCacheDirName: ryxnontop-updater\n');
  const staging = path.join(root, 'work/windows/installer');
  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
    prepackaged: runtime,
    publish: 'never',
    config: {
      publish: { provider: "github", owner: "ryancpjay-ux", repo: "ryxnontop", releaseType: "release" },
      directories: { output: staging },
      artifactName: 'ryxnontop-${version}-Windows-Setup.${ext}',
      win: { icon: 'public/icons/ryxnontop.ico', signExecutable: false },
      nsis: {
        include: 'scripts/windows-updater.nsh',
        oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
        createDesktopShortcut: 'always', createStartMenuShortcut: true,
        shortcutName: 'ryxnontop', runAfterFinish: false,
        installerIcon: 'public/icons/ryxnontop.ico',
        uninstallerIcon: 'public/icons/ryxnontop.ico',
        deleteAppDataOnUninstall: false,
      },
    },
  });
  const installer = artifacts.find(file => file.endsWith('-Windows-Setup.exe'));
  if (!installer || fs.statSync(installer).size < 1000000) throw new Error('Missing installer payload.');
  const out = process.env.RYX_WINDOWS_OUTPUT_DIR || path.join(root, '../windows');
  fs.mkdirSync(out, { recursive: true });
  const destination = path.join(out, path.basename(installer));
  fs.copyFileSync(installer, destination);
  for (const name of [path.basename(installer) + ".blockmap", "latest.yml"]) {
    const file = path.join(staging, name);
    if (!fs.existsSync(file)) throw new Error("Missing Windows update metadata: " + name);
    fs.copyFileSync(file, path.join(out, name));
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex');
  fs.writeFileSync(`${destination}.sha256`, `${hash}  ${path.basename(destination)}\n`);
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify({ installer: destination, bytes: fs.statSync(destination).size, sha256: hash, runtime_test: 'requires Windows' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
