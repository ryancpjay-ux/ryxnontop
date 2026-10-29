const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const original=Module._load;
Module._load=function(name,...args){if(name==='electron')return{systemPreferences:{}};return original.call(this,name,...args)};
const {prepareAudioCapture}=require('../electron/audioPermissions.js');
Module._load=original;
function preferences(status,answer=true){let requests=0;return{getMediaAccessStatus:()=>status,askForMediaAccess:async()=>{requests++;return answer},requests:()=>requests}}
test('first microphone capture requests macOS consent',async()=>{const p=preferences('not-determined');await prepareAudioCapture('microphone','darwin',p);assert.equal(p.requests(),1)});
test('granted microphone does not ask again',async()=>{const p=preferences('granted');await prepareAudioCapture('microphone','darwin',p);await prepareAudioCapture('microphone','darwin',p);assert.equal(p.requests(),0)});
test('revoked microphone gives permission recovery instructions without prompting repeatedly',async()=>{const p=preferences('denied');await assert.rejects(prepareAudioCapture('microphone','darwin',p),/Access required:.*Microphone/);assert.equal(p.requests(),0)});
test('declined first prompt and revoked screen capture require recovery',async()=>{await assert.rejects(prepareAudioCapture('microphone','darwin',preferences('not-determined',false)),/Access required/);await assert.rejects(prepareAudioCapture('system','darwin',preferences('denied')),/Screen & System Audio/)});
test('first screen capture can reach the OS prompt and invalid sources are rejected',async()=>{await prepareAudioCapture('system','darwin',preferences('not-determined'));await assert.rejects(prepareAudioCapture('bad','darwin',preferences('granted')),/Invalid audio source/)});
