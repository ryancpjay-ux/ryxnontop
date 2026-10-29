// One repeatable local update, with no publication or additional installed copies.
const {spawnSync}=require('node:child_process');const path=require('node:path');
process.chdir(path.resolve(__dirname,'..'));
function run(command,args,env={}){const result=spawnSync(command,args,{stdio:'inherit',env:{...process.env,...env}});if(result.status!==0)process.exit(result.status||1)}
const node=process.execPath;
run(node,['scripts/build-electron.js']);
run(node,['node_modules/next/dist/bin/next','build']);
run(node,['scripts/apply-app-constants.js']);
run(node,['node_modules/electron-builder/out/cli/cli.js','--mac','--dir','--publish','never','--config.asar=false','--config.directories.output=work/release'],{CSC_IDENTITY_AUTO_DISCOVERY:'false'});
const bundle='work/release/mac-arm64/ryxnontop.app';
run(node,['scripts/repack-verified.cjs',bundle]);
if(process.argv.includes('--prepare')) run('python3',['scripts/prepare-local-update.py',bundle]);
else run('python3',['scripts/install-local.py',bundle]);
run(node,['scripts/clean-local-artifacts.cjs']);
if(process.argv.includes('--launch')) run('open',['-n','/Applications/ryxnontop.app']);
