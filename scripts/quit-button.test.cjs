const{test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const original=Module._load;const handlers=new Map();let quits=0,closes=0;
Module._load=function(name,...args){if(name==='electron')return{app:{quit:()=>quits++},ipcMain:{handle:(name,handler)=>handlers.set(name,handler)}};return original.call(this,name,...args)};
const{registerWindowIpc}=require('../electron/ipc/window.js');Module._load=original;
test('top-right close requests app quit instead of leaving a windowless process',()=>{registerWindowIpc(()=>({close:()=>closes++}));handlers.get('window-close')({sender:{getURL:()=> 'file:///app/index.html'}});assert.equal(quits,1);assert.equal(closes,0)});
