// This file exercises the legacy Mac branch. Windows has dedicated fixtures.
const actualPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
Object.defineProperty(process, 'platform', { value: 'darwin' });
require('node:test').after(() => Object.defineProperty(process, 'platform', actualPlatformDescriptor));
// Offline contract tests for the local provider bridge. No real keys or network calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const handlers = new Map();
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { ipcMain: { handle: (name, handler) => handlers.set(name, handler), on: (name, handler) => handlers.set(name, handler) } };
  return originalLoad.call(this, name, ...args);
};
require('../electron/ipc/local.js').registerLocalIpc(() => null);
Module._load = originalLoad;
const event = (url = 'http://localhost:3000') => {
  const sent = [];
  return { sent, sender: { getURL: () => url, isDestroyed: () => false, send: (channel, payload) => sent.push({ channel, payload }) } };
};
const input = () => ({ id: 'test', key: 'fake-test-key', model: 'gemini-test', prompt: 'Explain closures.' });

test('rejects an untrusted renderer before making a request', async () => {
  await assert.rejects(async()=>handlers.get('local:reply')(event('https://example.com'), input()), /Untrusted origin/);
});
test('streams split SSE frames, excludes thinking text, and returns the final answer', async () => {
  const originalFetch = global.fetch;
  const encoder = new TextEncoder();
  global.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com\//);
    assert.equal(options.headers['x-goog-api-key'], 'fake-test-key');
    assert.equal(JSON.parse(options.body).contents[0].parts[0].text, 'Explain closures.');
    return { ok: true, body: new ReadableStream({ start(controller) {
      for (const part of ['data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"private reasoning"},{"text":"A clos', 'ure "}]}}]}\n\ndata: {"candidates":[{"content":{"parts":[{"text":"remembers scope."}]}}]}']) controller.enqueue(encoder.encode(part));
      controller.close();
    } }) };
  };
  try {
    const e = event();
    assert.equal(await handlers.get('local:reply')(e, input()), 'A closure remembers scope.');
    assert.deepEqual(e.sent.map(x => x.payload.text), ['A closure ', 'remembers scope.']);
  } finally { global.fetch = originalFetch; }
});
test('attaches screenshots as inline image data', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const part = JSON.parse(options.body).contents[0].parts[1];
    assert.deepEqual(part, { inline_data: { mime_type: 'image/png', data: 'aGVsbG8=' } });
    return { ok: false, status: 429 };
  };
  try { await assert.rejects(handlers.get('local:reply')(event(), { ...input(), image: 'data:image/png;base64,aGVsbG8=' }), /429/); }
  finally { global.fetch = originalFetch; }
});
test('rejects invalid model names and malformed screenshots', async () => {
  await assert.rejects(handlers.get('local:reply')(event(), { ...input(), model: '../bad' }), /Check your API key/);
  await assert.rejects(handlers.get('local:reply')(event(), { ...input(), image: 'https://example.com/image' }), /Invalid screenshot/);
});
test('cancel aborts an in-flight request', async () => {
  const originalFetch = global.fetch;
  global.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  try {
    const pending = handlers.get('local:reply')(event(), input());
    handlers.get('local:cancel')(event(), 'test');
    await assert.rejects(pending, /cancelled/);
  } finally { global.fetch = originalFetch; }
});

test('credential read/write reject untrusted renderers', () => {
  assert.throws(() => handlers.get('local:keys-load')(event('https://example.com')), /Untrusted origin/);
  assert.throws(() => handlers.get('local:keys-save')(event('https://example.com'), { geminiKey: '', deepgramKey: '' }), /Untrusted origin/);
});

test('offline switch aborts active AI and blocks new provider requests', async () => {
  const originalFetch=global.fetch;let calls=0;
  global.fetch=(_url,options)=>{calls++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))));};
  try {
    const pending=handlers.get('local:reply')(event(),input());
    handlers.get('local:network')(event(),false);
    await assert.rejects(pending,/cancelled/);
    await assert.rejects(handlers.get('local:reply')(event(),input()),/offline/i);
    assert.equal(calls,1);
    assert.throws(()=>handlers.get('local:network')(event('https://example.com'),true),/Untrusted/);
  } finally {handlers.get('local:network')(event(),true);global.fetch=originalFetch;}
});

test('fast reply forwards generation settings to Gemini without altering ordinary requests',async()=>{
 const originalFetch=global.fetch;let body;
 global.fetch=async(_url,options)=>{body=JSON.parse(options.body);return{ok:false,status:429}};
 try{await assert.rejects(handlers.get('local:reply')(event(),{...input(),model:'gemini-3.5-flash-lite',fast:true}),/429/);assert.deepEqual(body.generationConfig.thinkingConfig,{thinkingLevel:'minimal'});await assert.rejects(handlers.get('local:reply')(event(),input()),/429/);assert.equal(body.generationConfig,undefined)}finally{global.fetch=originalFetch}
});

test('stream metadata exposes the server-confirmed model version for the UI',async()=>{const originalFetch=global.fetch;const encoder=new TextEncoder();global.fetch=async()=>({ok:true,body:new ReadableStream({start(controller){controller.enqueue(encoder.encode('data: {"modelVersion":"gemini-3.5-flash-lite-001","candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n'));controller.close()}})});try{const e=event();await handlers.get('local:reply')(e,input());assert.equal(e.sent[0].payload.modelVersion,'gemini-3.5-flash-lite-001')}finally{global.fetch=originalFetch}});
test('malformed IPC request payloads fail with useful validation errors before networking',async()=>{for(const bad of [null,{}, {id:'bad',key:'key',model:'test',prompt:42},{id:42,key:'key',model:'test',prompt:'hello'}])await assert.rejects(handlers.get('local:reply')(event(),bad),/Check your API key/)});

test('reused request IDs cancel the old request without losing the new cancellation handle',async()=>{
 const originalFetch=global.fetch;const signals=[];
 global.fetch=(_url,options)=>new Promise((_resolve,reject)=>{signals.push(options.signal);options.signal.addEventListener('abort',()=>reject(new Error('aborted')))});
 try {
  const first=handlers.get('local:reply')(event(),input());
  const firstRejected=assert.rejects(first,/cancelled/);
  const second=handlers.get('local:reply')(event(),input());
  const secondRejected=assert.rejects(second,/cancelled/);
  await firstRejected;
  assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
  handlers.get('local:cancel')(event(),'test');
  await secondRejected;assert.equal(signals[1].aborted,true);
 } finally {global.fetch=originalFetch}
});

test('Mac Listen activity blocks updates until stopped and clears if its renderer closes',()=>{const {EventEmitter}=require('node:events');const sender=new EventEmitter();sender.id=7;sender.getURL=()=> 'file:///app/index.html';const e={sender};const api=require('../electron/ipc/local.js');assert.equal(api.isDesktopWorkActive(),false);handlers.get('local:activity')(e,true);assert.equal(api.isDesktopWorkActive(),true);handlers.get('local:activity')(e,false);assert.equal(api.isDesktopWorkActive(),false);handlers.get('local:activity')(e,true);assert.equal(sender.listenerCount('destroyed'),1);sender.emit('destroyed');assert.equal(api.isDesktopWorkActive(),false);assert.throws(()=>handlers.get('local:activity')(e,'yes'),/Invalid/)});
