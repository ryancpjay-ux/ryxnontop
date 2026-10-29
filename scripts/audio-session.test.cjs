const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { LocalAudioSession } = require('../lib/local-audio.ts');
const originalStream = global.MediaStream;
class Stream {
  constructor(tracks = [{ stopped:false, stop(){this.stopped=true;} }]) { this.tracks=tracks; }
  getTracks(){return this.tracks;}
  getAudioTracks(){return this.tracks;}
}
global.MediaStream=Stream;
after(()=>{global.MediaStream=originalStream;});
class Socket {
  static sockets=[];
  readyState=0;sent=[];onopen=null;onerror=null;onclose=null;onmessage=null;
  constructor(){Socket.sockets.push(this);queueMicrotask(()=>{if(this.readyState===0){this.readyState=1;this.onopen?.({});}});}
  send(value){this.sent.push(value);if(typeof value==='string'&&JSON.parse(value).type==='CloseStream')queueMicrotask(()=>{this.onmessage?.({data:JSON.stringify({is_final:true,channel:{alternatives:[{transcript:'The final phrase.'}]}})});this.readyState=3;this.onclose?.({code:1000});});}
  close(){this.readyState=3;}
  drop(){this.readyState=3;this.onclose?.({code:1006});}
}
class Recorder {
  static recorders=[];static isTypeSupported(){return true;}
  state='inactive';mimeType='audio/webm';ondataavailable=null;onstop=null;onerror=null;
  constructor(){Recorder.recorders.push(this);}
  start(timeslice){this.timeslice=timeslice;this.state='recording';}
  pause(){this.state='paused';}
  resume(){this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['last encoded audio'])});this.onstop?.({});});}
}
function fixture(devices, os){
  Socket.sockets=[];Recorder.recorders=[];
  const stream=new Stream();const events=[];let requests=0;
  const platform={os,mediaDevices:devices??{getUserMedia:async()=>{requests++;return stream;},getDisplayMedia:async()=>{requests++;return stream;}},Socket,Recorder};
  const session=new LocalAudioSession({state:value=>events.push(`state:${value}`),text:(text,final)=>events.push(`${final?'final':'interim'}:${text}`),error:message=>events.push(`error:${message}`),utterance:()=>events.push("utterance:end")},platform);
  return {session,stream,events,requests:()=>requests};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('one media acquisition starts 200ms audio chunks and pause/resume preserves the stream',async()=>{
  const f=fixture();await f.session.start('synthetic-key','microphone','en');
  assert.equal(f.requests(),1);assert.equal(Recorder.recorders[0].timeslice,200);
  assert.equal(f.events.at(-1),'state:live');
  f.session.pause();assert.equal(Recorder.recorders[0].state,'paused');assert.equal(f.events.at(-1),'state:paused');
  f.session.pause();assert.equal(f.events.at(-1),'state:live');
  f.session.stop(true);assert.equal(f.stream.tracks[0].stopped,true);assert.equal(f.events.at(-1),'state:idle');
});
test('graceful Stop sends the final audio before CloseStream and retains the final phrase',async()=>{
  const f=fixture();await f.session.start('synthetic-key','system','multi');
  const socket=Socket.sockets[0];f.session.stop();await tick();
  const closeIndex=socket.sent.findIndex(value=>typeof value==='string'&&JSON.parse(value).type==='CloseStream');
  assert.ok(closeIndex>0);assert.ok(socket.sent[closeIndex-1] instanceof Blob);
  assert.ok(f.events.indexOf('final:The final phrase.')<f.events.lastIndexOf('state:idle'));
  assert.equal(f.events.at(-1),'state:idle');
});
test('a dropped socket reconnects without reacquiring microphone permissions',async()=>{
  const f=fixture();await f.session.start('synthetic-key','microphone','en');
  Socket.sockets[0].drop();assert.equal(f.events.at(-1),'state:reconnecting');
  await new Promise(resolve=>setTimeout(resolve,550));
  assert.equal(f.requests(),1);assert.equal(Socket.sockets.length,2);assert.equal(Recorder.recorders.length,2);
  assert.equal(f.events.at(-1),'state:live');f.session.stop(true);
});
test('cancelling while permissions are pending releases the late stream and opens no socket',async()=>{
  let grant;const late=new Stream();
  const f=fixture({getUserMedia:()=>new Promise(resolve=>{grant=resolve;})});
  const pending=f.session.start('synthetic-key','microphone','en');f.session.stop(true);grant(late);await pending;
  assert.equal(late.tracks[0].stopped,true);assert.equal(Socket.sockets.length,0);assert.equal(f.events.at(-1),'state:idle');
});
test('missing provider keys acquire no media and produce an actionable error',async()=>{
  const f=fixture();await f.session.start('','microphone','en');
  assert.equal(f.requests(),0);assert.match(f.events.at(-1),/Deepgram key/);
});

test('cancelling a connecting socket resolves promptly and releases its stream',async()=>{
  class PendingSocket extends Socket {constructor(){super();this.readyState=2;}}
  const stream=new Stream();const events=[];
  const session=new LocalAudioSession({state:value=>events.push(value),text:()=>{},error:message=>events.push(message)}, {mediaDevices:{getUserMedia:async()=>stream},Socket:PendingSocket,Recorder});
  const pending=session.start('synthetic-key','microphone','en');await tick();session.stop(true);
  await Promise.race([pending,new Promise((_resolve,reject)=>setTimeout(()=>reject(new Error('Cancellation hung')),100))]);
  assert.equal(stream.tracks[0].stopped,true);assert.equal(events.at(-1),'idle');
});

test('system capture uses legal display constraints and no microphone request',async()=>{
  let requested;const stream=new Stream();
  const f=fixture({getDisplayMedia:async options=>{requested=options;return stream},getUserMedia:async()=>{throw new Error('Wrong source')}});
  await f.session.start('synthetic-key','system','en');
  assert.deepEqual(requested,{video:{frameRate:1},audio:true});assert.equal(f.events.at(-1),'state:live');f.session.stop(true);
});
test('denied capture reports actionable permission recovery and opens no provider socket',async()=>{
  const error=new Error('Permission denied');error.name='NotAllowedError';
  const f=fixture({getDisplayMedia:async()=>{throw error}});await f.session.start('synthetic-key','system','en');
  assert.match(f.events.at(-1),/Access required:.*System Settings/);assert.equal(Socket.sockets.length,0);
});
test('a capture with no audio is stopped and sent back to permission setup',async()=>{
  const tracks=[{stopped:false,stop(){this.stopped=true}}];
  const noAudio={getTracks:()=>tracks,getAudioTracks:()=>[]};
  const f=fixture({getDisplayMedia:async()=>noAudio});await f.session.start('synthetic-key','system','en');
  assert.equal(tracks[0].stopped,true);assert.match(f.events.at(-1),/Access required/);assert.equal(Socket.sockets.length,0);
});

test('ASR final segments do not imply a completed question until the speech endpoint arrives',async()=>{const f=fixture();await f.session.start('synthetic-key','microphone','en');const socket=Socket.sockets[0];socket.onmessage({data:JSON.stringify({is_final:true,channel:{alternatives:[{transcript:'Tell us about a time you had to'}]}})});assert.ok(f.events.includes('final:Tell us about a time you had to'));assert.ok(!f.events.includes('utterance:end'));socket.onmessage({data:JSON.stringify({is_final:true,speech_final:true,channel:{alternatives:[{transcript:'resolve a conflict.'}]}})});assert.equal(f.events.at(-1),'utterance:end');f.session.stop(true)});

 test('late messages from a replaced transcription socket cannot add stale transcript',async()=>{
  const f=fixture();await f.session.start('synthetic-key','microphone','en');
  const old=Socket.sockets[0];const queuedMessage=old.onmessage;old.drop();
  queuedMessage({data:JSON.stringify({is_final:true,channel:{alternatives:[{transcript:'stale phrase'}]}})});
  assert.ok(!f.events.includes('final:stale phrase'));
  assert.equal(old.onmessage,null);f.session.stop(true);
 });

test('Windows rejects malformed Deepgram credentials before microphone acquisition',async()=>{const f=fixture();f.session.platform.os='win32';await f.session.start('secret with spaces','microphone','en');assert.equal(f.requests(),0);assert.match(f.events.at(-1),/Deepgram: paste only the API key/);assert.ok(!f.events.at(-1).includes('secret with spaces'))});
test('Windows cleans clipboard quotes and never passes a long-lived key as a socket subprotocol',async()=>{const f=fixture();f.session.platform.os='win32';let protocols;class ValidatingSocket extends Socket{constructor(url,p){assert.match(url,/^wss:\/\/api.deepgram.com\/v1\/listen\?/);protocols=p;super()}}f.session.platform.Socket=ValidatingSocket;await f.session.start(' "synthetic-deepgram"\u200b','microphone','en');assert.equal(protocols,undefined);assert.equal(f.events.at(-1),'state:live');f.session.stop(true)});

test('Windows streams 100ms chunks while preserving pause and final audio delivery',async()=>{const f=fixture(undefined,'win32');await f.session.start('synthetic-key','microphone','en');assert.equal(Recorder.recorders[0].timeslice,100);f.session.pause();assert.equal(Recorder.recorders[0].state,'paused');f.session.pause();assert.equal(Recorder.recorders[0].state,'recording');const socket=Socket.sockets[0];f.session.stop();await tick();const end=socket.sent.findIndex(value=>typeof value==='string'&&JSON.parse(value).type==='CloseStream');assert.ok(end>0);assert.ok(socket.sent[end-1] instanceof Blob);assert.equal(f.events.at(-1),'state:idle')});
