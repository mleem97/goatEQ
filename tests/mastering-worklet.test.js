import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../mastering-worklet.js', import.meta.url), 'utf8');

function createProcessor() {
  let Processor;
  class AudioWorkletProcessor {
    constructor() { this.port = { onmessage: null, messages: [], postMessage: (message) => this.port.messages.push(message) }; }
  }
  vm.runInNewContext(source, {
    AudioWorkletProcessor,
    sampleRate: 48000,
    registerProcessor(name, implementation) {
      assert.equal(name, 'goat-mastering-processor');
      Processor = implementation;
    }
  });
  return new Processor();
}

function render(processor, left, right = left) {
  const outputLeft = new Float32Array(left.length);
  const outputRight = new Float32Array(left.length);
  processor.process([[left, right]], [[outputLeft, outputRight]]);
  return [outputLeft, outputRight];
}

test('mastering worklet is transparent with optional modules bypassed', () => {
  const processor = createProcessor();
  const input = Float32Array.from({ length: 128 }, (_, index) => Math.sin(index * 0.1) * 0.5);
  const [left, right] = render(processor, input);
  assert.deepEqual(Array.from(left), Array.from(input));
  assert.deepEqual(Array.from(right), Array.from(input));
});

test('de-clipper, de-esser and stereo processing each alter qualifying audio', () => {
  const clipped = createProcessor();
  clipped.port.onmessage({ data: { type: 'settings', settings: { declipper: { enabled: true, threshold: 0.7, mix: 1 } } } });
  const clippedInput = Float32Array.from({ length: 128 }, (_, index) => index % 8 < 4 ? 0.95 : -0.95);
  const [declipped] = render(clipped, clippedInput);
  assert.notDeepEqual(Array.from(declipped), Array.from(clippedInput));

  const deessed = createProcessor();
  deessed.port.onmessage({ data: { type: 'settings', settings: { deesser: { enabled: true, frequency: 4000, amount: 1 } } } });
  const harsh = Float32Array.from({ length: 128 }, (_, index) => index % 2 ? 0.6 : -0.6);
  const [softened] = render(deessed, harsh);
  assert.notDeepEqual(Array.from(softened), Array.from(harsh));

  const widened = createProcessor();
  widened.port.onmessage({ data: { type: 'settings', settings: { stereo: { enabled: true, width: 0, monoBass: 40, crossfeed: 0 } } } });
  const leftInput = Float32Array.from({ length: 128 }, (_, index) => Math.sin(index * 1.3) * 0.5);
  const rightInput = Float32Array.from(leftInput, (value) => -value);
  const [collapsed] = render(widened, leftInput, rightInput);
  assert.ok(collapsed.some((value, index) => Math.abs(value - leftInput[index]) > 0.01));
});

test('ordered chain supports all new mastering, tone and space effects', () => {
  const effects = [
    ['input', { trimDb: 3 }], ['highpass', { frequency: 80 }], ['lowpass', { frequency: 4000 }],
    ['compressor', { threshold: -24, ratio: 4, attack: 0.001, release: 0.1, makeupDb: 0, mix: 1 }],
    ['maximizer', { targetDb: -10, maxGainDb: 4, ceilingDb: -1, release: 0.2 }],
    ['transient', { attack: 0.8, sustain: 0, mix: 1 }],
    ['bassEnhancer', { frequency: 160, amount: 0.5, mix: 1 }],
    ['presence', { frequency: 2500, amount: 0.5, mix: 1 }],
    ['exciter', { frequency: 4000, amount: 0.4, mix: 1 }],
    ['saturation', { drive: 8, mix: 1 }],
    ['softClipper', { drive: 3, ceilingDb: -1, softness: 0.6 }],
    ['delay', { time: 0.01, feedback: 0.2, tone: 0.7, mix: 0.4 }],
    ['echo', { time: 0.03, feedback: 0.25, tone: 0.6, stereoOffset: 0.01, mix: 0.4 }],
    ['reverb', { size: 0.05, damping: 0.4, preDelay: 0, mix: 0.4 }],
    ['limiter', { threshold: -3, release: 0.1 }], ['output', { trimDb: -2 }]
  ];
  const input = Float32Array.from({ length: 8192 }, (_, index) => index === 0 ? 0.9 : Math.sin(index * 0.17) * 0.35);
  for (const [type, settings] of effects) {
    const processor = createProcessor();
    processor.port.onmessage({ data: { type: 'chain', chain: [{ id: `${type}-1`, type, enabled: true, settings }] } });
    const [processed] = render(processor, input);
    assert.ok(processed.some((value, index) => Math.abs(value - input[index]) > 1e-5), `${type} must alter qualifying audio`);
    assert.ok(processed.every(Number.isFinite), `${type} must remain numerically stable`);
  }
  const gate = createProcessor();
  gate.port.onmessage({ data: { type: 'chain', chain: [{ id: 'gate-1', type: 'gate', enabled: true, settings: { threshold: -20, ratio: 4, release: 0.1 } }] } });
  const quiet = Float32Array.from({ length: 8192 }, (_, index) => Math.sin(index * 0.17) * 0.02);
  const [gated] = render(gate, quiet);
  assert.ok(gated.some((value, index) => Math.abs(value - quiet[index]) > 1e-5));
});

test('effect order changes the audible result and limiter enforces its ceiling', () => {
  const input = Float32Array.from({ length: 128 }, () => 0.72);
  const before = createProcessor();
  before.port.onmessage({ data: { type: 'chain', chain: [
    { id: 'gain', type: 'input', enabled: true, settings: { trimDb: 6 } },
    { id: 'clip', type: 'softClipper', enabled: true, settings: { drive: 1, ceilingDb: -1, softness: 0.7 } }
  ] } });
  const after = createProcessor();
  after.port.onmessage({ data: { type: 'chain', chain: [
    { id: 'clip', type: 'softClipper', enabled: true, settings: { drive: 1, ceilingDb: -1, softness: 0.7 } },
    { id: 'gain', type: 'input', enabled: true, settings: { trimDb: 6 } }
  ] } });
  const [first] = render(before, input);
  const [second] = render(after, input);
  assert.notDeepEqual(Array.from(first), Array.from(second));
  const limiter = createProcessor();
  limiter.port.onmessage({ data: { type: 'chain', chain: [{ id: 'limit', type: 'limiter', enabled: true, settings: { threshold: -1, release: 0.1 } }] } });
  const [limited] = render(limiter, Float32Array.from({ length: 128 }, () => 1.4));
  const ceiling = 10 ** (-1 / 20) + 1e-6;
  assert.ok(limited.every((value) => Math.abs(value) <= ceiling));
});
