// Used exclusively by scripts/build-windows.cjs. Mac build configuration is unchanged.
module.exports={...require('../package.json').build,publish:[{provider:'github',owner:'ryancpjay-ux',repo:'ryxnontop',releaseType:'release'}]};
