/** Archive recovered live buffers before exposing a fresh launch. No credentials/images. */
export function freshSession(saved: any) {
 if(!saved) return saved;
 const value={...saved,notes:[...(saved.notes??[])],chatHistory:[...(saved.chatHistory??[])]};
 if(saved.retainHistory!==false && saved.messages?.length) {
  const id=saved.chatId || crypto.randomUUID();
  value.chatHistory=[{id,title:saved.messages.find((m:any)=>m.role==='user')?.text.slice(0,80)||'Conversation',date:new Date().toISOString(),messages:saved.messages,provider:saved.provider,model:saved.model},...value.chatHistory.filter((c:any)=>c.id!==id)];
 }
 if(saved.retainHistory!==false && (saved.transcript?.length || saved.requests?.length)) {
  const id=saved.listenSessionId || crypto.randomUUID();
  const content=[saved.transcript?.join('\n\n')??'',...(saved.requests??[]).map((q:any)=>`### ${q.title}\n\n${q.answer||q.error||'No answer'}`)].join('\n\n');
  const previous=value.notes.find((n:any)=>n.id===id);
  value.notes=[{...previous,id,title:previous?.title||`Listen session · ${new Date().toLocaleString()}`,content:previous && !saved.transcript?.length ? previous.content+"\n\n"+content : content,date:previous?.date||new Date().toISOString(),kind:'automatic',provider:saved.provider,model:saved.model},...value.notes.filter((n:any)=>n.id!==id)];
 }
 return {...value,messages:[],transcript:[],requests:[],chatId:crypto.randomUUID(),listenSessionId:null};
}
