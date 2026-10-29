// Cross-build a single Windows x64 folder archive without installing Wine or publishing.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
process.chdir(path.resolve(__dirname, ".."));
function run(command, args, env = {}) {
  const r = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
const node = process.execPath;
if (!process.argv.includes("--skip-build")) {
  run(node, ["scripts/build-electron.js"]);
  run(node, ["node_modules/next/dist/bin/next", "build"]);
  run(node, ["scripts/apply-app-constants.js"]);
}
run(
  node,
  [
    "node_modules/electron-builder/out/cli/cli.js",
    "--win",
    "--dir",
    "--x64",
    "--publish",
    "never",
    "--config",
    "scripts/windows-builder-config.cjs",
    "--config.asar=false",
    "--config.win.icon=public/icons/ryxnontop.png",
    "--config.win.signExecutable=false",
    "--config.directories.output=work/windows",
  ],
  { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
);
run(node, ["scripts/repack-verified.cjs", "work/windows/win-unpacked", "--windows"]);
run(node, ["scripts/build-windows-installer.cjs"]);
run("python3", ["scripts/package-windows.py"]);
