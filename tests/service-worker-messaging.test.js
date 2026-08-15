import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

function createHarness() {
  let listener;
  const sent = [];
  const chrome = {
    runtime: {
      getContexts: async () => [{ documentUrl: 'chrome-extension://test/offscreen.html' }],
      sendMessage: async (message) => {
        sent.push(message);
        if (message.type === 'startCaptureOffscreen') return { ok: true, processing: true };
        if (message.type === 'stopCaptureOffscreen') return { ok: true, processing: false };
        return { ok: true, type: 'sendWorkspaceStatus' };
      },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener(callback) { listener = callback; } }
    },
    offscreen: { createDocument: async () => undefined },
    tabs: { query: async () => [{ id: 7, title: 'Test tab', url: 'https://example.com/audio' }] },
    tabCapture: { getMediaStreamId: async () => 'stream-id' },
    storage: {
      local: {
        get: async () => ({ goateqStateV2: {} }),
        set: async () => undefined
      }
    }
  };
  vm.runInNewContext(source, { chrome, console });
  return { listener, sent };
}

test('every claimed Chrome service-worker message resolves a response promise', async () => {
  const { listener, sent } = createHarness();
  const offscreenSender = { url: 'chrome-extension://test/offscreen.html' };
  const popupSender = { url: 'chrome-extension://test/index.html' };
  const cases = [
    [{ type: 'engineCommand', target: 'service-worker', command: { type: 'getFullRefresh' } }, popupSender],
    [{ type: 'getActiveTab' }, offscreenSender],
    [{ type: 'engineStorageGet', keys: ['goateqStateV2'] }, offscreenSender],
    [{ type: 'engineStorageSet', value: { goateqStateV2: {} } }, offscreenSender],
    [{ type: 'initPopup' }, popupSender],
    [{ type: 'eqTab', on: true }, popupSender],
    [{ type: 'eqTab', on: false }, popupSender]
  ];

  for (const [message, sender] of cases) {
    const responsePromise = listener(message, sender);
    assert.equal(typeof responsePromise?.then, 'function', `${message.type} must return a promise`);
    assert.notEqual(await responsePromise, undefined, `${message.type} must resolve a response`);
  }

  assert.ok(sent.some(({ type, target }) => type === 'getFullRefresh' && target === 'offscreen'));
  assert.ok(sent.some(({ type, streamId }) => type === 'startCaptureOffscreen' && streamId === 'stream-id'));
  assert.equal(listener({ type: 'unknown' }, popupSender), false);
});
