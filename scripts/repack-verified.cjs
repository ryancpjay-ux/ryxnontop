// Build an archive from a stable unpacked package, verifying every packed file.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const asar=require('@electron/asar');
async function main(){
 const bundle=path.resolve(process.argv[2]);const resources=fs.existsSync(path.join(bundle,'Contents/Resources'))?path.join(bundle,'Contents/Resources'):path.join(bundle,'resources');const source=path.join(resources,'app');const archive=path.join(resources,'app.asar');
 if(!fs.existsSync(path.join(source,'package.json')))throw new Error('Expected a packaged app directory');
 const output=await asar.createPackageWithOptions(source,archive,{unpack:'**/*.{node,dll,dylib,so,exe}'});
 // Windows cross-builds must wait for the archive output to finish before byte verification.
 if(process.argv.includes('--windows') && output && typeof output.on==='function') await require('node:stream/promises').finished(output);
 const header=asar.getRawHeader(archive).header;let count=0;
 function verify(files,parent=''){for(const[name,entry]of Object.entries(files)){const file=parent?`${parent}/${name}`:name;if(entry.files)verify(entry.files,file);else if(!entry.unpacked&&!entry.link){const actual=crypto.createHash('sha256').update(asar.extractFile(archive,file)).digest('hex');const expected=crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex');if(actual!==expected)throw new Error(`Archive verification failed: ${file}`);count++}}}
 verify(header.files);JSON.parse(asar.extractFile(archive,'package.json').toString());
 fs.rmSync(source,{recursive:true,force:true});
 console.log(`Verified ${count} packed files against original package sources`);
}
main().catch(error=>{console.error(error.message);process.exit(1)});
