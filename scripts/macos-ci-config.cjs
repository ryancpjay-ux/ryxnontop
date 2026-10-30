const config = require('../package.json').build;
module.exports = {
  ...config,
  directories: { ...config.directories, output: 'work/macos-ci' },
  publish: [{ provider: 'github', owner: 'ryancpjay-ux', repo: 'ryxnontop', releaseType: 'release' }],
  forceCodeSigning: true,
  artifactName: 'ryxnontop-${version}-macOS-Apple-Silicon.${ext}',
  mac: { ...config.mac, target: [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }], notarize: true },
};
