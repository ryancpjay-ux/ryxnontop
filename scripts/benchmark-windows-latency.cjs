// Synthetic local preparation benchmark. Does NOT measure network/API response speed.
const assert=require('node:assert/strict');
const {buildResponsePrompt}=require('../lib/local-response.ts');
const input={mode:'Interview',style:'Concise',fast:true,context:'Resume '.repeat(2000),transcript:Array.from({length:30000},(_,i)=>'Segment '+i+' some meeting context '.repeat(8)),includeListen:true,messages:[],task:'What did we decide?'};
assert.equal(buildResponsePrompt({...input,windows:true}),buildResponsePrompt(input));
function measure(windows){const times=[];for(let i=0;i<60;i++){const start=performance.now();buildResponsePrompt({...input,windows});times.push(performance.now()-start)}times.sort((a,b)=>a-b);return{medianMs:times[30],p95Ms:times[57]}}
for(let run=1;run<=2;run++) console.log(JSON.stringify({run,fixture:'30000 segments; exact prompt equality asserted',baseline:measure(false),windows:measure(true)}));
console.log('Configured Windows audio chunk: 200 -> 100ms; endpoint silence: 250 -> 200ms. Scheduling/network/recognition timing is not measured here.');
