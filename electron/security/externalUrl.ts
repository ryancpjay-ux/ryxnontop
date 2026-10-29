/** Only normal browser/mail links may leave the app; OS settings use fixed IPC URLs. */
export function isSafeExternalUrl(value: string): boolean {
 try { return ['https:','http:','mailto:'].includes(new URL(value).protocol); }
 catch { return false; }
}

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
export function canNavigateRenderer(value:string,exportDirectory:string,developmentUrl?:string):boolean {
 try {
  const target=new URL(value);
  if(developmentUrl) return target.origin===new URL(developmentUrl).origin;
  if(target.protocol!=='file:')return false;
  const relative=path.relative(path.resolve(exportDirectory),fileURLToPath(target));
  return relative!=='' && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
 } catch {return false;}
}
