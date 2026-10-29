export function listenStatus(input:{audio:string;interim:string;pending:number;generating:boolean;streaming:boolean;error:boolean;completed:boolean}) {
 if(input.error) return 'Error';
 if(input.audio==='idle') return 'Ready';
 if(input.audio==='paused') return 'Paused';
 if(input.audio==='connecting') return 'Connecting';
 if(input.audio==='reconnecting') return 'Reconnecting';
 if(input.audio==='stopping') return 'Finishing';
 if(input.generating) return input.streaming?'Answering':'Generating';
 if(input.pending) return 'Question detected';
 if(input.interim) return 'Transcribing';
 return input.completed?'Ready · listening':'Listening';
}
