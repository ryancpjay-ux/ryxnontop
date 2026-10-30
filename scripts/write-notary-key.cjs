const fs=require('node:fs');const path=require('node:path');
const file=path.join(process.env.RUNNER_TEMP||'work','ryxnontop-notary-key.p8');
const key=Buffer.from(process.env.APPLE_API_KEY_BASE64||'','base64').toString();
if(!key.includes('-----BEGIN PRIVATE KEY-----'))throw Error('Notarization API key is missing or malformed.');
fs.writeFileSync(file,key,{mode:0o600});
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,`APPLE_API_KEY=${file}\n`);
console.log('Temporary notarization key prepared.');
