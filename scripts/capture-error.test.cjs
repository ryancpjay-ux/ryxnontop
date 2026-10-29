const {test}=require('node:test');
const assert=require('node:assert/strict');
const {captureErrorMessage}=require('../lib/local-capture-error.ts');
test('permission recovery recognizes Electron-wrapped capture failures from the reported Start error',()=>{
 const plain='Access required: Enable ryxnontop in System Settings → Privacy & Security → Screen & System Audio Recording, then restart the app if macOS requests it.';
 assert.equal(captureErrorMessage("Error invoking remote method 'local:prepare-audio': Error: "+plain),plain);
 assert.equal(captureErrorMessage(plain),plain);
 assert.equal(captureErrorMessage('Network unavailable'),'Network unavailable');
});
test('provider errors hide the Electron IPC envelope while keeping actionable diagnostics',()=>{assert.equal(captureErrorMessage("Error invoking remote method 'local:reply': Error: OpenAI: API credits unavailable."),'OpenAI: API credits unavailable.')});
