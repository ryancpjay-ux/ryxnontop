// Synthetic-only integration test of the synchronous final-save IPC route.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const root = path.resolve(__dirname, '../work');
fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'close-save-'));
after(() => fs.rmSync(directory, { recursive: true, force: true }));
const handlers = new Map();
const secret = crypto.randomBytes(32);
let available = true;
const electron = {
  app: { getPath: () => directory },
  ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => handlers.set(name, fn) },
  safeStorage: {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: text => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
      const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decryptString: bytes => {
      const decipher = crypto.createDecipheriv('aes-256-gcm', secret, bytes.subarray(0,12), {authTagLength:16});
      decipher.setAuthTag(bytes.subarray(12,28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    },
  },
};
const originalLoad = Module._load;
Module._load = function(name, ...args) { return name === 'electron' ? electron : originalLoad.call(this, name, ...args); };
require('../electron/ipc/local.js').registerLocalIpc(() => null);
Module._load = originalLoad;
const event = (url = 'file:///Applications/ryxnontop.app/Contents/Resources/app.asar/out/index.html') => ({ sender: { getURL: () => url } });
const synthetic = { geminiKey: 'not-a-real-gemini-key', deepgramKey: 'not-a-real-deepgram-key' };
test('final save completes on disk before replying and is restored on load', () => {
  const e = event();
  handlers.get('local:keys-save-now')(e, synthetic);
  assert.deepEqual(e.returnValue, { success: true });
  const saved = fs.readFileSync(path.join(directory, 'provider-keys.enc'));
  assert.equal(saved.includes(Buffer.from(synthetic.geminiKey)), false);
  assert.deepEqual(handlers.get('local:keys-load')(event()), synthetic);
});
test('final save reports an encryption failure and preserves the previous keys', () => {
  available = false;
  const e = event();
  handlers.get('local:keys-save-now')(e, { ...synthetic, geminiKey: 'new-test-key' });
  assert.deepEqual(e.returnValue, { success: false });
  available = true;
  assert.deepEqual(handlers.get('local:keys-load')(event()), synthetic);
});
test('an untrusted page cannot use final-save IPC', () => {
  const e = event('https://example.com');
  handlers.get('local:keys-save-now')(e, synthetic);
  assert.deepEqual(e.returnValue, { success: false });
});
