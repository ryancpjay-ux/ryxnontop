// Exercise encrypted persistence with synthetic keys, isolated from the user's profile.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return {};
  return originalLoad.call(this, name, ...args);
};
const { createCredentialStore } = require('../electron/credentials.js');
Module._load = originalLoad;
const testRoot = path.resolve(__dirname, '../work');
fs.mkdirSync(testRoot, { recursive: true });
const cipherKey = crypto.randomBytes(32);
const cryptography = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString: text => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  },
  decryptString: bytes => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey, bytes.subarray(0, 12), { authTagLength: 16 });
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  },
};
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(testRoot, 'credentials-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, 'provider-keys.enc'), store: createCredentialStore(() => directory, cryptography) };
}
const keys = { geminiKey: 'synthetic-gemini-key', deepgramKey: 'synthetic-deepgram-key' };

test('restores both keys from a newly-created store and never writes plaintext', t => {
  const { directory, file, store } = fixture(t);
  assert.deepEqual(store.load(), { geminiKey: '', deepgramKey: '' });
  store.save(keys);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.includes(Buffer.from(keys.geminiKey)), false);
  assert.equal(bytes.includes(Buffer.from(keys.deepgramKey)), false);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(createCredentialStore(() => directory, cryptography).load(), keys);
});
test('edits and clearing individual keys survive reopening', t => {
  const { directory, store } = fixture(t);
  store.save(keys);
  const updated = { geminiKey: '', deepgramKey: 'replacement-deepgram' };
  store.save(updated);
  assert.deepEqual(createCredentialStore(() => directory, cryptography).load(), updated);
});
test('clearing both keys removes their saved file', t => {
  const { file, store } = fixture(t);
  store.save(keys);
  store.save({ geminiKey: '', deepgramKey: '' });
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(store.load(), { geminiKey: '', deepgramKey: '' });
});
test('unavailable encryption never overwrites existing keys or falls back to plaintext', t => {
  const { directory, file, store } = fixture(t);
  store.save(keys);
  const before = fs.readFileSync(file);
  const locked = createCredentialStore(() => directory, { ...cryptography, isEncryptionAvailable: () => false });
  assert.throws(() => locked.save({ ...keys, geminiKey: 'replacement' }), /Secure key storage is unavailable/);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.throws(() => locked.load(), /Secure key storage is unavailable/);
});
test('corrupt credentials report an error without erasing the file', t => {
  const { file, store } = fixture(t);
  fs.writeFileSync(file, Buffer.from('invalid-encrypted-payload'));
  assert.throws(() => store.load(), /Could not unlock saved API keys/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'invalid-encrypted-payload');
});
test('invalid settings cannot replace saved credentials', t => {
  const { file, store } = fixture(t);
  store.save(keys);
  const before = fs.readFileSync(file);
  for (const value of [null, {}, { geminiKey: 123, deepgramKey: '' }, { geminiKey: 'x'.repeat(9000), deepgramKey: '' }]) {
    assert.throws(() => store.save(value), /Invalid API key settings/);
  }
  assert.deepEqual(fs.readFileSync(file), before);
});

test('additional provider keys persist encrypted while legacy two-key files remain readable', t => {
 const {directory,store}=fixture(t);
 const all={...keys,openaiKey:'synthetic-openai',anthropicKey:'synthetic-anthropic'};
 store.save(all);assert.deepEqual(store.load(),all);
 const disk=fs.readFileSync(path.join(directory,'provider-keys.enc'));
 assert.equal(disk.includes(Buffer.from(all.openaiKey)),false);assert.equal(disk.includes(Buffer.from(all.anthropicKey)),false);
 store.save({...keys,geminiKey:'',deepgramKey:'',openaiKey:'synthetic-openai',anthropicKey:''});assert.equal(store.load().openaiKey,'synthetic-openai');
});
