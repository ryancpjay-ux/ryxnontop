"use client";
import {captureWhileCurrent} from "@/lib/local-capture-lifetime";
import {useEffect,useState} from 'react';
/** Single in-flight local preview capture. Changing source/consent invalidates old results. */
export function useLiveScreen(enabled:boolean,source:string) {
 const [frame,setFrame]=useState<{image:string;at:number;captureMs:number}|null>(null);
 const [failure,setFailure]=useState('');
 useEffect(()=>{
  setFrame(null);setFailure('');
  if(!enabled || !window.electronAPI) return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let cancelled=false;
  const tick=async()=>{
   const start=performance.now();
   try {
    if(document.hidden) return;
    if(await window.electronAPI!.screen.getAccess()!=='granted') {
     if(!cancelled) {setFrame(null);setFailure('Screen access required. Click Permissions to enable it.');}
     return;
    }
    const result=await captureWhileCurrent(async()=>{},()=>window.electronAPI!.screen.capture(source||undefined,true),()=>!cancelled);
    if(!result) return;
    if(!result.success) {setFrame(null);setFailure('Screen capture unavailable despite the permission setting. Open Permissions for recovery.');return;}
    setFrame({image:result.dataUrl,at:performance.now(),captureMs:performance.now()-start});setFailure('');
   } catch {if(!cancelled){setFrame(null);setFailure('Screen preview unavailable. Open Permissions for recovery.');}}
   finally {if(!cancelled) timer=setTimeout(()=>void tick(),Math.max(0,500-(performance.now()-start)));}
  };
  void tick();
  return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[enabled,source]);
 return {frame,failure};
}
