import {app,ipcMain,type IpcMainInvokeEvent} from 'electron';
import {isTrustedOrigin} from './origin';
/** Privileged calls must come from the local top-level renderer, never a remote page/subframe. */
export function handleTrusted(channel:string,listener:(event:IpcMainInvokeEvent,...args:any[])=>any) {
 ipcMain.handle(channel,(event,...args)=>{
  const origin=event.sender?.getURL?.()??'';
  if((app?.isPackaged && !process.env.DEV_PORT && !origin.startsWith('file:')) || !isTrustedOrigin(origin) || (event.senderFrame && event.sender.mainFrame && event.senderFrame!==event.sender.mainFrame)) throw new Error('Untrusted origin');
  return listener(event,...args);
 });
}
