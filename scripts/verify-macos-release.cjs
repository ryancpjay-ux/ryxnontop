const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const yaml=require('js-yaml');
function verifyMacRelease(dir,version){
  const expected=['zip','dmg'].map(ext=>`ryxnontop-${version}-macOS-Apple-Silicon.${ext}`);
  const info=yaml.load(fs.readFileSync(path.join(dir,'latest-mac.yml'),'utf8'));
  if(info.version!==version||!Array.isArray(info.files)||info.files.length!==2)throw Error('Mac update version or asset count mismatch.');
  for(const name of expected){
    const item=info.files.find(file=>decodeURIComponent(file.url)===name);const target=path.join(dir,name);
    if(!item||!fs.existsSync(target)||!fs.statSync(target).size)throw Error('Missing compatible Mac update asset.');
    const data=fs.readFileSync(target);const sha512=crypto.createHash('sha512').update(data).digest('base64');
    if(item.sha512!==sha512||item.size!==data.length)throw Error('Mac update hash or size mismatch.');
    fs.writeFileSync(target+'.sha256',`${crypto.createHash('sha256').update(data).digest('hex')}  ${name}\n`);
  }
  const primary=info.files.find(file=>decodeURIComponent(file.url)===info.path);
  if(!info.path?.endsWith('.zip')||!primary||info.sha512!==primary.sha512)throw Error('Mac updater must use the verified ZIP.');
  console.log(`Verified ${version}: Apple Silicon DMG, ZIP and macOS SHA-512 metadata.`);
}
module.exports={verifyMacRelease};
if(require.main===module){try{verifyMacRelease(path.resolve(process.argv[2]||'work/macos-ci'),require('../package.json').version)}catch(error){console.error(error.message);process.exitCode=1}}
