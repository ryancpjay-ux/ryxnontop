// This file exercises the legacy Mac branch. Windows has dedicated fixtures.
const actualPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
Object.defineProperty(process, 'platform', { value: 'darwin' });
require('node:test').after(() => Object.defineProperty(process, 'platform', actualPlatformDescriptor));
const{test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const original=Module._load;const routes=new Map();let options,resized;
const image={isEmpty:()=>false,getSize:()=>({width:3840,height:2160}),resize:value=>{resized=value;return{toDataURL:()=> 'data:image/png;base64,aGVsbG8='}},toDataURL:()=> 'data:image/png;base64,aGVsbG8='};
const display={id:1,size:{width:1920,height:1080},scaleFactor:2};
Module._load=function(name,...args){if(name==='electron')return{ipcMain:{handle:(name,fn)=>routes.set(name,fn)},screen:{getDisplayMatching:()=>display,getPrimaryDisplay:()=>display,getAllDisplays:()=>[display]},desktopCapturer:{getSources:async value=>{options=value;return[{id:'screen:1:0',display_id:'1',thumbnail:image}]}},systemPreferences:{getMediaAccessStatus:()=> 'granted'}};return original.call(this,name,...args)};
require('../electron/ipc/screen.js').registerScreenIpc(()=>null);Module._load=original;
test('captures Retina detail and limits the sent image to a readable 2560 pixel long edge',async()=>{const result=await routes.get('screen:capture')({sender:{getURL:()=> 'file:///app/index.html'}});assert.equal(result.success,true);assert.deepEqual(options.thumbnailSize,{width:3840,height:2160});assert.deepEqual(resized,{width:2560,height:1440})});
test('an unavailable selected screen fails rather than silently sending another display',async()=>{const result=await routes.get('screen:capture')({sender:{getURL:()=> 'file:///app/index.html'}},'screen:2:0');assert.equal(result.success,false)});
test('live preview requests a small capture independently of full-resolution Ask capture',async()=>{const result=await routes.get('screen:capture')({sender:{getURL:()=> 'file:///app/index.html'}},undefined,true);assert.equal(result.success,true);assert.deepEqual(options.thumbnailSize,{width:960,height:600})});
