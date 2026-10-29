// Remove only verified copies made by this project's packager. Keep one rollback install.
const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');const work=path.join(root,'work');
let removed=0;
for(const name of fs.readdirSync(work)) {
 if(!/^verified-package-source-\d+$/.test(name))continue;
 const folder=path.join(work,name);
 try {const meta=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));if(meta.name!=='realtime-interview-copilot'||meta.main!=='electron/main.js'||!fs.existsSync(path.join(folder,'electron/main.js')))continue;fs.rmSync(folder,{recursive:true,force:true});removed++;}catch{}
}
console.log(`Removed ${removed} obsolete verified package source copies; user profile and rollback retained.`);
