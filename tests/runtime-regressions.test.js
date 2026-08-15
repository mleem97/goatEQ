import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const audioEngine = readFileSync(new URL('../audio-engine.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const audioHook = readFileSync(new URL('../src/hooks/useAudioEngine.js', import.meta.url), 'utf8');

test('offscreen runtime selection uses the supported messaging contract', () => {
  assert.match(audioEngine, /\[globalThis\.chrome, globalThis\.browser\]\.find/);
  assert.match(audioEngine, /typeof candidate\?\.runtime\?\.sendMessage === 'function'/);
  assert.match(audioEngine, /typeof candidate\?\.runtime\?\.onMessage\?\.addListener === 'function'/);
  assert.doesNotMatch(audioEngine, /api\.runtime\.getManifest\(\)/);
});

test('restricted Chromium offscreen runtime is accepted without getManifest or storage', () => {
  const runtime = { sendMessage() {}, onMessage: { addListener() {} } };
  const context = { chrome: { runtime }, browser: { runtime: {} } };
  const selected = vm.runInNewContext(`
    [globalThis.chrome, globalThis.browser].find((candidate) => (
      typeof candidate?.runtime?.sendMessage === 'function'
      && typeof candidate?.runtime?.onMessage?.addListener === 'function'
    ))
  `, context);
  assert.equal(selected, context.chrome);
  assert.equal(selected.runtime.getManifest, undefined);
  assert.equal(selected.storage, undefined);
});

test('offscreen active-tab requests are handled before the sender guard', () => {
  const requestHandler = serviceWorker.indexOf("message.type === 'getActiveTab'");
  const offscreenGuard = serviceWorker.indexOf("sender.url?.endsWith('/offscreen.html')");
  assert.ok(requestHandler >= 0, 'getActiveTab handler must exist');
  assert.ok(offscreenGuard > requestHandler, 'offscreen sender guard must run after getActiveTab');
});

test('offscreen storage is brokered before the sender guard', () => {
  const getHandler = serviceWorker.indexOf("message.type === 'engineStorageGet'");
  const setHandler = serviceWorker.indexOf("message.type === 'engineStorageSet'");
  const offscreenGuard = serviceWorker.indexOf("if (sender.url?.endsWith('/offscreen.html')) return false");
  assert.ok(getHandler >= 0, 'engineStorageGet handler must exist');
  assert.ok(setHandler > getHandler, 'engineStorageSet must follow engineStorageGet');
  assert.ok(offscreenGuard > setHandler, 'offscreen sender guard must run after storage broker handlers');
  assert.match(audioEngine, /if \(!storage\) return runtimeMessage\(\{ type: 'engineStorageGet'/);
  assert.match(audioEngine, /if \(!storage\) return runtimeMessage\(\{ type: 'engineStorageSet'/);
});

test('audio worklet URL has a restricted-runtime fallback', () => {
  assert.match(audioEngine, /typeof api\.runtime\.getURL === 'function'/);
  assert.match(audioEngine, /new URL\('mastering-worklet\.js', globalThis\.location\.href\)\.href/);
});

test('live monitoring returns both spectrum and waveform buffers', () => {
  assert.match(audioEngine, /fftBefore:/);
  assert.match(audioEngine, /waveformBefore:/);
  assert.match(audioEngine, /downsampleWaveform\(waveformAfter\)/);
});

test('Chromium capture is explicitly targeted and cannot report a false-positive processing state', () => {
  assert.match(serviceWorker, /target: 'offscreen', streamId, tab/);
  assert.match(serviceWorker, /!response\?\.ok \|\| response\?\.processing !== true/);
  assert.match(audioEngine, /audioTrack\?\.readyState === 'live' && context\.state === 'running'/);
  assert.match(audioEngine, /message\.target !== 'offscreen'/);
});

test('Chromium DSP commands are brokered through a service worker that ensures the offscreen engine exists', () => {
  assert.match(audioHook, /type: 'engineCommand', target: 'service-worker', command: message/);
  assert.match(serviceWorker, /message\.type === 'engineCommand' && message\.target === 'service-worker'/);
  assert.match(serviceWorker, /await ensureOffscreen\(\)/);
  assert.match(serviceWorker, /message\.command \?\? \{\}\), target: 'offscreen'/);
  assert.match(serviceWorker, /The offscreen audio engine did not respond/);
});

test('audio engine only claims explicitly targeted Chromium commands', () => {
  assert.match(audioEngine, /const engineMessageTypes = new Set/);
  assert.match(audioEngine, /if \(!engineMessageTypes\.has\(message\?\.type\)\) return false/);
  assert.match(audioEngine, /if \(!isFirefox && message\.target !== 'offscreen'\) return false/);
});

test('Chrome message listeners return response promises and never orphan a return-true channel', () => {
  const engineListener = audioEngine.slice(audioEngine.indexOf('api.runtime.onMessage.addListener'));
  assert.doesNotMatch(serviceWorker, /return true;/);
  assert.doesNotMatch(engineListener, /return true;/);
  assert.match(serviceWorker, /return \(async \(\) => \{/);
  assert.match(audioEngine, /return handle\(message\)\.catch/);
});

test('Firefox capture is capability-gated instead of using a non-standard tab constraint', () => {
  assert.match(audioEngine, /unsupported-firefox-tab-audio/);
  assert.match(audioEngine, /return \{ ok: false, processing: false, captureCapability, error: firefoxCaptureError \}/);
  assert.doesNotMatch(audioEngine, /mediaSource:\s*['"]tab['"]/);
  assert.match(audioHook, /status\?\.captureCapability !== 'unsupported-firefox-tab-audio'/);
});
