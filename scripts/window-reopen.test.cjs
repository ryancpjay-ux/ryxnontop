const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const listeners = new Map();
let lock = true;
let quits = 0;
const app = {
  requestSingleInstanceLock: () => lock,
  quit: () => { quits++; },
  on: (event, handler) => listeners.set(event, handler),
  setAsDefaultProtocolClient: () => {},
};
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'electron') return { app };
  return originalLoad.call(this, name, ...args);
};
const { installSingleInstanceAndDeepLinks } = require('../electron/deepLink.js');
Module._load = originalLoad;

test('a second launch makes a hidden existing window visible', () => {
  const calls = [];
  installSingleInstanceAndDeepLinks(() => ({ isMinimized: () => false, isVisible: () => false, show: () => calls.push('show'), focus: () => calls.push('focus') }));
  listeners.get('second-instance')({}, []);
  assert.deepEqual(calls, ['show', 'focus']);
});
test('a second launch restores a minimized window', () => {
  const calls = [];
  installSingleInstanceAndDeepLinks(() => ({ isMinimized: () => true, isVisible: () => true, restore: () => calls.push('restore'), focus: () => calls.push('focus') }));
  listeners.get('second-instance')({}, []);
  assert.deepEqual(calls, ['restore', 'focus']);
});
test('a second launch recreates a previously closed window', () => {
  let reopened = false;
  installSingleInstanceAndDeepLinks(() => null, () => { reopened = true; });
  listeners.get('second-instance')({}, []);
  assert.equal(reopened, true);
});
test('another instance cannot take over the shared profile', () => {
  lock = false;
  assert.equal(installSingleInstanceAndDeepLinks(() => null), false);
  assert.equal(quits, 1);
});
