const {test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const load=Module._load;Module._load=function(name,...args){if(name==='electron')return{};return load.call(this,name,...args)};
const {maskedWindowsKeys,mergeWindowsKeys,connectionKey,testWindowsConnection,deepgramFailure,SAVED_KEY}=require('../electron/windowsConnections.js');Module._load=load;
const keys={geminiKey:'fixture-google',openaiKey:'fixture-openai',deepgramKey:'fixture-deepgram',anthropicKey:'fixture-anthropic'};
test('Windows renderer sees presence markers and independent replacement/removal preserves other encrypted credentials',()=>{
 const masked=maskedWindowsKeys(keys);assert.equal(masked.deepgramKey,SAVED_KEY);assert.equal(JSON.stringify(masked).includes('fixture'),false);
 const merged=mergeWindowsKeys({...masked,openaiKey:'replacement',deepgramKey:''},keys);assert.equal(merged.geminiKey,keys.geminiKey);assert.equal(merged.openaiKey,'replacement');assert.equal(merged.deepgramKey,'');
 assert.equal(connectionKey('openai',SAVED_KEY,keys),'fixture-openai');assert.equal(connectionKey('deepgram',undefined,keys),'fixture-deepgram');
});
function stream(parts){return new ReadableStream({start(c){for(const p of parts)c.enqueue(new TextEncoder().encode(p));c.close()}})}
test('AI connection validation requires actual text from the selected provider/model and handles split SSE frames',async()=>{
 for(const service of ['openai','gemini','anthropic']){
  const frame=service==='openai'?{type:'response.output_text.delta',delta:'Ready'}:service==='anthropic'?{type:'content_block_delta',delta:{type:'text_delta',text:'Ready'}}:{candidates:[{content:{parts:[{text:'Ready'}]}}]};const data='data: '+JSON.stringify(frame)+'\n\n';
  const result=await testWindowsConnection(service,keys[service+'Key'],'model-fixture','multi',async(url,options)=>{
   assert.equal(service==='openai'?options.headers.Authorization:service==='anthropic'?options.headers['x-api-key']:options.headers['x-goog-api-key'],service==='openai'?'Bearer fixture-openai':service==='anthropic'?'fixture-anthropic':'fixture-google');assert.equal(JSON.parse(options.body).model??'model-fixture','model-fixture');
   return {ok:true,body:stream([data.slice(0,13),data.slice(13)])};
  });assert.equal(result.connected,true);assert.ok(result.firstMs>=0);
 }
});
test('Deepgram tests its own auth endpoint followed by a functional live handshake and closes it',async()=>{
 let auth=0,opened=0,closed=0;const result=await testWindowsConnection('deepgram',keys.deepgramKey,'unused','en',async(url,options)=>{auth++;assert.equal(url,'https://api.deepgram.com/v1/auth/token');assert.equal(options.headers.Authorization,'Token fixture-deepgram');return {ok:true,body:stream([])}},async(key,language)=>{opened++;assert.equal(key,keys.deepgramKey);assert.equal(language,'en');return {send:message=>assert.equal(JSON.parse(message).type,'CloseStream'),close:()=>closed++,terminate:()=>{}}});assert.equal(result.connected,true);assert.equal(auth,1);assert.equal(opened,1);assert.equal(closed,1);
});
test('API tests distinguish rejected keys, missing permissions, quota and network without echoing secrets',async()=>{
 for(const [status,pattern] of [[401,/invalid or revoked/],[403,/permissions/],[429,/quota/],[400,/unsupported/]])assert.match(deepgramFailure(status),pattern);
 await assert.rejects(testWindowsConnection('deepgram',keys.deepgramKey,'','multi',async()=>({ok:false,status:401})),/invalid or revoked/);
 await assert.rejects(testWindowsConnection('openai',keys.openaiKey,'model','multi',async()=>{throw new TypeError(keys.openaiKey)}),error=>/Network/.test(error.message)&&!error.message.includes(keys.openaiKey));
 await assert.rejects(testWindowsConnection('openai',keys.openaiKey,'model','multi',async()=>({ok:true,body:stream(['data: {"type":"response.completed"}\n\n'])})),/no text/);
});
