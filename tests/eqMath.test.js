import assert from 'node:assert/strict';
import test from 'node:test';
import { frequencyToX, gainToY, xToFrequency, yToGain } from '../src/audio/eqMath.js';
import { normalizePreset, normalizePresetCollection } from '../src/audio/presets.js';

test('quartic EARS frequency mapping remains reversible', () => {
  for (const frequency of [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20000]) {
    assert.ok(Math.abs(xToFrequency(frequencyToX(frequency)) - frequency) < 0.001);
  }
});

test('legacy preset format remains compatible and rejects malformed bands', () => {
  const valid = {
    frequencies: [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20000],
    gains: Array(11).fill(0),
    qs: Array(11).fill(0.7071)
  };
  assert.deepEqual(normalizePreset(valid), valid);
  assert.equal(normalizePreset({ ...valid, gains: [0, 1] }), null);
  assert.deepEqual(Object.keys(normalizePresetCollection({ presets: { Studio: valid, Broken: {} } })), ['Studio']);
});

test('dynamic presets support one through thirty-two EQ bands', () => {
  for (const length of [1, 11, 32]) {
    const preset = {
      frequencies: Array.from({ length }, (_, index) => 20 + index * 500),
      gains: Array(length).fill(3),
      qs: Array(length).fill(1),
      types: Array.from({ length }, (_, index) => index === 0 ? 'lowshelf' : index === length - 1 ? 'highshelf' : 'peaking')
    };
    assert.equal(normalizePreset(preset)?.frequencies.length, length);
  }
  assert.equal(normalizePreset({ frequencies: [], gains: [], qs: [] }), null);
  assert.equal(normalizePreset({ frequencies: Array(33).fill(1000), gains: Array(33).fill(0), qs: Array(33).fill(1) }), null);
});

test('gain mapping remains reversible across the complete EQ range', () => {
  for (const gain of [-30, -15, 0, 15, 30]) {
    assert.ok(Math.abs(yToGain(gainToY(gain)) - gain) < 0.001);
  }
});
