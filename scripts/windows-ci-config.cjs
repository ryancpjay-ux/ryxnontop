// Native Windows CI only. The Mac configuration and installed Mac bundle are untouched.
const config = require('./windows-builder-config.cjs');
const signed = Boolean(process.env.WIN_CSC_LINK);
module.exports = {
  ...config,
  directories: { ...config.directories, output: 'work/windows-ci' },
  artifactName: 'ryxnontop-${version}-Windows-Setup.${ext}',
  forceCodeSigning: process.env.RYX_STABLE_RELEASE === 'true',
  win: { ...config.win, target: ['nsis'], icon: 'public/icons/ryxnontop.ico', signExecutable: signed, ...(signed && process.env.RYX_WINDOWS_PUBLISHER ? { publisherName: process.env.RYX_WINDOWS_PUBLISHER } : {}) },
  nsis: { include: 'scripts/windows-updater.nsh', oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: 'always', createStartMenuShortcut: true, shortcutName: 'ryxnontop', runAfterFinish: false, installerIcon: 'public/icons/ryxnontop.ico', uninstallerIcon: 'public/icons/ryxnontop.ico', deleteAppDataOnUninstall: false },
};
