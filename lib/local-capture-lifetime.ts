/** Do not start or deliver a capture after its requesting UI/session was cancelled. */
export async function captureWhileCurrent<T>(prepare:()=>Promise<void>,capture:()=>Promise<T>,current:()=>boolean):Promise<T|undefined> {
 await prepare();
 if(!current())return undefined;
 const result=await capture();
 return current()?result:undefined;
}
