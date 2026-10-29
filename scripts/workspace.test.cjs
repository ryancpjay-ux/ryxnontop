const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const original=Module._load;
Module._load=function(name,...args){if(name==='electron')return{};return original.call(this,name,...args)};
const {createWorkspaceStore}=require('../electron/workspace.js');
Module._load=original;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ryx-workspace-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return{dir,store:createWorkspaceStore(()=>dir)}}
test('workspace persists content, excludes credentials, and restricts file permissions',t=>{const{dir,store}=fixture(t);store.save(JSON.stringify({notes:[{id:'one',content:'hello'}],geminiKey:'synthetic-secret',light:true}));const data=JSON.parse(store.load().data);assert.equal(data.notes[0].content,'hello');assert.equal(data.light,true);assert.equal(data.geminiKey,undefined);assert.equal(fs.statSync(path.join(dir,'workspace.json')).mode&0o777,0o600)});
test('workspace recovers the last valid snapshot after corruption',t=>{const{dir,store}=fixture(t);store.save('{"notes":[],"context":"first"}');store.save('{"notes":[],"context":"second"}');fs.writeFileSync(path.join(dir,'workspace.json'),'broken');assert.equal(store.load().recovered,true);assert.equal(JSON.parse(store.load().data).context,'first');store.save('{"notes":[],"context":"third"}');assert.equal(store.load().recovered,false)});
test('workspace rejects invalid input without replacing saved content',t=>{const{store}=fixture(t);store.save('{"notes":[]}');assert.throws(()=>store.save('{"notes":false}'));assert.throws(()=>store.save('bad'));assert.equal(store.load().data,'{"notes":[]}')});
test('deletion removes both content and recovery copies',t=>{const{dir,store}=fixture(t);store.save('{"notes":[]}');store.save('{"notes":[]}');store.clear();assert.deepEqual(fs.readdirSync(dir),[]);assert.equal(store.load().data,null)});
test('malformed saved collections use the last valid recovery copy instead of breaking launch',t=>{const{dir,store}=fixture(t);store.save('{"notes":[],"chatHistory":[]}');store.save('{"notes":[],"context":"new"}');fs.writeFileSync(path.join(dir,'workspace.json'),'{"notes":[],"chatHistory":{"broken":true}}');assert.equal(store.load().recovered,true);assert.deepEqual(JSON.parse(store.load().data).chatHistory,[])});
test('invalid note and message rows never replace a valid saved workspace',t=>{const{store}=fixture(t);store.save('{"notes":[]}');for(const data of [{notes:[null]},{notes:[],messages:[{text:42}]},{notes:[],transcript:[null]}])assert.throws(()=>store.save(JSON.stringify(data)));assert.deepEqual(JSON.parse(store.load().data),{notes:[]})});
