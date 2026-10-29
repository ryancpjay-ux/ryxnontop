const {test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const {EventEmitter}=require('node:events');
const original=Module._load;let requested;
class Socket extends EventEmitter {constructor(url){super();requested=new URL(url);queueMicrotask(()=>this.emit('open'))}close(){}}
Module._load=function(name,...args){if(name==='ws')return Socket;return original.call(this,name,...args)};
const {openDeepgram}=require('../electron/windowsConnections.js');Module._load=original;
test('Windows Deepgram uses bounded endpointing and avoids entity formatting waits while retaining endpoint events',async()=>{await openDeepgram('synthetic-key','multi');assert.equal(requested.searchParams.get('endpointing'),'200');assert.equal(requested.searchParams.get('no_delay'),'true');assert.equal(requested.searchParams.get('interim_results'),'true');assert.equal(requested.searchParams.get('utterance_end_ms'),'1000');assert.equal(requested.searchParams.get('language'),'multi');assert.equal(requested.searchParams.get('key'),null)});
