import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const engineSource = readFileSync(new URL('../audio-engine.js', import.meta.url), 'utf8');
const hookSource = readFileSync(new URL('../src/hooks/useAudioEngine.js', import.meta.url), 'utf8');

class FakeParam {
  constructor(value = 0) { this.value = value; }
  cancelScheduledValues() {}
  setTargetAtTime(value) { this.value = value; }
}

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.gain = new FakeParam(1);
    this.frequency = new FakeParam(350);
    this.Q = new FakeParam(1);
    this.threshold = new FakeParam(-24);
    this.knee = new FakeParam(30);
    this.ratio = new FakeParam(12);
    this.attack = new FakeParam(0.003);
    this.release = new FakeParam(0.25);
    this.reduction = 0;
    this.curve = null;
    this.port = null;
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'suspended';
    this.destination = new FakeNode('destination');
    this.nodes = [];
    this.audioWorklet = { addModule: async () => undefined };
    FakeAudioContext.instance = this;
  }
  make(kind) { const node = new FakeNode(kind); this.nodes.push(node); return node; }
  createGain() { return this.make('gain'); }
  createAnalyser() {
    const node = this.make('analyser');
    node.fftSize = 2048;
    Object.defineProperty(node, 'frequencyBinCount', { get: () => node.fftSize / 2 });
    node.getFloatFrequencyData = (buffer) => buffer.fill(-100);
    node.getFloatTimeDomainData = (buffer) => buffer.fill(0);
    return node;
  }
  createBiquadFilter() { return this.make('biquad'); }
  createDynamicsCompressor() { return this.make('compressor'); }
  createWaveShaper() { return this.make('waveshaper'); }
  createMediaStreamSource() { return this.make('media-stream-source'); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

class FakeAudioWorkletNode extends FakeNode {
  constructor() {
    super('worklet');
    this.port = { messages: [], postMessage: (message) => this.port.messages.push(message), onmessage: null };
    FakeAudioWorkletNode.instance = this;
  }
}

function createEngineHarness() {
  let listener;
  const audioTrack = { readyState: 'live', stop() { this.readyState = 'ended'; }, addEventListener() {} };
  const stream = { getAudioTracks: () => [audioTrack], getTracks: () => [audioTrack] };
  const runtime = {
    onMessage: { addListener(callback) { listener = callback; } },
    sendMessage(message, callback) {
      if (message.type === 'engineStorageGet') callback?.({ value: {} });
      else if (message.type === 'engineStorageSet') callback?.({ ok: true });
      else if (message.type === 'getActiveTab') callback?.({ tab: { id: 7, title: 'Test tab' } });
      else callback?.();
    }
  };
  vm.runInNewContext(engineSource, {
    chrome: { runtime },
    AudioContext: FakeAudioContext,
    AudioWorkletNode: FakeAudioWorkletNode,
    URL,
    Float32Array,
    console,
    crypto: { randomUUID: () => 'test-engine-session' },
    location: { protocol: 'chrome-extension:', href: 'chrome-extension://test/offscreen.html' },
    localStorage: { getItem: () => null },
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    setTimeout,
    clearTimeout
  });
  const send = async (message) => {
    const result = listener({ target: 'offscreen', ...message }, {});
    if (!result || typeof result.then !== 'function') throw new Error(`No response promise for ${message.type}`);
    return result;
  };
  return { send, stream, dispatch: listener };
}

test('Chromium audio engine ignores its own storage and active-tab broker messages synchronously', () => {
  const { dispatch } = createEngineHarness();
  let responded = false;
  assert.equal(dispatch({ type: 'engineStorageGet', keys: [] }, {}), false);
  assert.equal(dispatch({ type: 'engineStorageSet', value: {} }, {}), false);
  assert.equal(dispatch({ type: 'getActiveTab' }, {}), false);
  assert.equal(dispatch({ type: 'getFullRefresh' }, {}), false, 'unscoped Chromium messages must be ignored');
  assert.equal(responded, false);
});

test('React keeps the latest drag value and commits through modifyFilter', () => {
  assert.match(hookSource, /filterRef\.current = nextFilters/);
  assert.doesNotMatch(hookSource, /type: 'filterUpdated'/);
  assert.match(hookSource, /type: 'modifyFilter', index, \.\.\.filter, revision/);
  assert.match(hookSource, /message\.filterRevision < filterRevisionRef\.current/);
});

test('engine applies EQ, synchronizes the ordered worklet chain and rejects stale EQ writes', async () => {
  const { send } = createEngineHarness();
  await send({ type: 'getFullRefresh', target: 'offscreen' });

  await send({ type: 'modifyFilter', index: 4, frequency: 500, gain: 12, q: 2, revision: 2 });
  await send({ type: 'modifyFilter', index: 4, frequency: 320, gain: -12, q: 1, revision: 1 });
  await send({ type: 'updateMastering', module: 'input', patch: { enabled: true, trimDb: -6 }, revision: 1 });
  await send({ type: 'updateMastering', module: 'highpass', patch: { enabled: true, frequency: 90 }, revision: 2 });
  await send({ type: 'updateMastering', module: 'compressor', patch: { enabled: true, threshold: -30, ratio: 6, makeupDb: 4, mix: 0.75 }, revision: 3 });
  await send({ type: 'updateMastering', module: 'saturation', patch: { enabled: true, drive: 9, mix: 0.8 }, revision: 4 });
  await send({ type: 'updateMastering', module: 'softClipper', patch: { enabled: true, drive: 6, ceilingDb: -2 }, revision: 5 });
  await send({ type: 'updateMastering', module: 'limiter', patch: { enabled: true, threshold: -3 }, revision: 6 });
  await send({ type: 'updateMastering', module: 'output', patch: { enabled: true, trimDb: -3 }, revision: 7 });
  const status = await send({ type: 'getFullRefresh' });

  assert.equal(status.engineSessionId, 'test-engine-session');
  assert.equal(status.filterRevision, 2);
  assert.equal(status.eqFilters[4].frequency, 500);
  assert.equal(status.eqFilters[4].gain, 12);
  assert.equal(status.mastering.highpass.frequency, 90);
  assert.equal(status.mastering.compressor.threshold, -30);
  assert.equal(status.mastering.saturation.drive, 9);
  assert.equal(status.mastering.softClipper.ceilingDb, -2);
  assert.equal(status.mastering.limiter.threshold, -3);
  assert.equal(status.mastering.output.trimDb, -3);

  const context = FakeAudioContext.instance;
  const biquads = context.nodes.filter((node) => node.kind === 'biquad');
  const compressors = context.nodes.filter((node) => node.kind === 'compressor');
  const gains = context.nodes.filter((node) => node.kind === 'gain');
  const shapers = context.nodes.filter((node) => node.kind === 'waveshaper');
  assert.ok(Math.abs(gains[1].gain.value - 10 ** (-6 / 20)) < 1e-9);
  assert.equal(biquads[0].type, 'highpass');
  assert.equal(biquads[5].gain.value, 12);
  assert.equal(compressors[0].threshold.value, -30);
  assert.equal(gains[2].gain.value, 0.25);
  assert.equal(gains[3].gain.value, 0.75);
  assert.ok(Math.abs(gains[5].gain.value - 10 ** (4 / 20)) < 1e-9);
  assert.ok(shapers[0].curve instanceof Float32Array, 'saturation curve should be active');
  assert.ok(Math.abs(gains[6].gain.value - 0.2) < 1e-9);
  assert.equal(gains[7].gain.value, 0.8);
  assert.ok(shapers[1].curve instanceof Float32Array, 'soft clipper curve should be active');
  assert.equal(compressors[1].threshold.value, -3);
  assert.equal(gains[9].gain.value, 1, 'global output gain stays separate from the ordered worklet output effect');
  const chainMessage = FakeAudioWorkletNode.instance.port.messages.at(-1);
  assert.equal(chainMessage.type, 'chain');
  assert.equal(chainMessage.chain.find(({ type }) => type === 'output').settings.trimDb, -3);
});

test('worklet mastering chain is delivered for de-clipper, de-esser and stereo', async () => {
  const { send } = createEngineHarness();
  await send({ type: 'getFullRefresh', target: 'offscreen' });
  await send({ type: 'updateMastering', module: 'declipper', patch: { enabled: true, threshold: 0.8 }, revision: 1 });
  await send({ type: 'updateMastering', module: 'deesser', patch: { enabled: true, amount: 0.7 }, revision: 2 });
  await send({ type: 'updateMastering', module: 'stereo', patch: { enabled: true, width: 1.5 }, revision: 3 });

  const chainMessage = FakeAudioWorkletNode.instance.port.messages.at(-1);
  assert.equal(chainMessage.type, 'chain');
  assert.equal(chainMessage.chain.find(({ type }) => type === 'declipper').enabled, true);
  assert.equal(chainMessage.chain.find(({ type }) => type === 'deesser').settings.amount, 0.7);
  assert.equal(chainMessage.chain.find(({ type }) => type === 'stereo').settings.width, 1.5);
});

test('effect instances can be repeated, reordered and replaced atomically', async () => {
  const { send } = createEngineHarness();
  const effectChain = [
    { id: 'delay-a', type: 'delay', enabled: true, settings: { time: 0.2, feedback: 0.2, tone: 0.6, mix: 0.1 } },
    { id: 'compressor-a', type: 'compressor', enabled: true, settings: { threshold: -20, ratio: 2, attack: 0.02, release: 0.2, makeupDb: 1, mix: 0.7 } },
    { id: 'delay-b', type: 'delay', enabled: false, settings: { time: 0.4, feedback: 0.3, tone: 0.5, mix: 0.2 } },
    { id: 'limiter-a', type: 'limiter', enabled: true, settings: { threshold: -1, release: 0.12 } }
  ];
  const response = await send({ type: 'replaceEffectChain', target: 'offscreen', effectChain, revision: 1 });
  assert.equal(response.effectChain.map(({ id }) => id).join(','), 'delay-a,compressor-a,delay-b,limiter-a');
  assert.equal(response.effectChain.filter(({ type }) => type === 'delay').length, 2);
  const chainMessage = FakeAudioWorkletNode.instance.port.messages.at(-1);
  assert.equal(chainMessage.chain.map(({ id }) => id).join(','), 'delay-a,compressor-a,delay-b,limiter-a');
});

test('captured audio is only reported active after a live track and running AudioContext are confirmed', async () => {
  const { send } = createEngineHarness();
  const capture = await send({
    type: 'startCaptureOffscreen',
    target: 'offscreen',
    streamId: 'test-stream',
    tab: { id: 7, title: 'Test tab' }
  });
  assert.equal(capture.ok, true);
  assert.equal(capture.processing, true);
  assert.equal(capture.audioContextState, 'running');

  const status = await send({ type: 'getFullRefresh', target: 'offscreen' });
  assert.equal(status.processing, true);
  assert.equal(status.audioTrackState, 'live');
  assert.equal(status.dspReady, true);
  assert.ok(FakeAudioContext.instance.nodes.some((node) => node.kind === 'media-stream-source'));
});

test('audio engine supports up to thirty-two live EQ nodes while bypassing unused nodes', async () => {
  const { send } = createEngineHarness();
  const filters = Array.from({ length: 32 }, (_, index) => ({
    index,
    frequency: Math.min(20000, 20 * 2 ** (index / 3)),
    gain: index === 31 ? 9 : 0,
    q: 0.7071,
    type: index === 0 ? 'lowshelf' : index === 31 ? 'highshelf' : 'peaking'
  }));
  const response = await send({ type: 'replaceFilters', target: 'offscreen', filters, revision: 1 });
  assert.equal(response.eqFilters.length, 32);
  assert.equal(response.dspReady, true);
  const biquads = FakeAudioContext.instance.nodes.filter((node) => node.kind === 'biquad');
  assert.equal(biquads.length, 33, 'one high-pass plus 32 EQ nodes must be preallocated');
  assert.equal(biquads[32].gain.value, 9);

  const reduced = await send({ type: 'replaceFilters', target: 'offscreen', filters: filters.slice(0, 11), revision: 2 });
  assert.equal(reduced.eqFilters.length, 11);
  assert.equal(biquads[12].type, 'allpass', 'first unused EQ node must return to transparent bypass');
});
