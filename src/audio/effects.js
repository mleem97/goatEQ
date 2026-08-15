export const MAX_EFFECTS = 32;

export const EFFECT_CATALOG = [
  { type: 'input', name: 'Input Trim', group: 'Utility', summary: 'Gain before processing', defaults: { trimDb: 0 } },
  { type: 'highpass', name: 'High-pass', group: 'Utility', summary: 'Remove subsonic energy', defaults: { frequency: 25, q: 0.7071 } },
  { type: 'lowpass', name: 'Low-pass', group: 'Utility', summary: 'Control ultrasonic or harsh highs', defaults: { frequency: 19000 } },
  { type: 'declipper', name: 'De-clipper', group: 'Repair', summary: 'Reconstruct clipped peaks', defaults: { threshold: 0.96, mix: 1 } },
  { type: 'gate', name: 'Expander / Gate', group: 'Dynamics', summary: 'Reduce low-level noise', defaults: { threshold: -55, ratio: 2, release: 0.18 } },
  { type: 'compressor', name: 'Compressor', group: 'Dynamics', summary: 'Control macro dynamics', defaults: { threshold: -18, ratio: 2, attack: 0.02, release: 0.25, makeupDb: 0, mix: 1 } },
  { type: 'maximizer', name: 'Smart Maximizer', group: 'Dynamics', summary: 'Adaptive loudness with peak safety', defaults: { targetDb: -14, maxGainDb: 6, ceilingDb: -1, release: 0.45 } },
  { type: 'transient', name: 'Transient Shaper', group: 'Dynamics', summary: 'Shape attack and sustain', defaults: { attack: 0.12, sustain: 0, mix: 1 } },
  { type: 'deesser', name: 'De-esser', group: 'Repair', summary: 'Tame harsh sibilance', defaults: { frequency: 6500, amount: 0.25 } },
  { type: 'stereo', name: 'Stereo Tool', group: 'Stereo', summary: 'Width, mono bass and crossfeed', defaults: { width: 1, monoBass: 120, crossfeed: 0 } },
  { type: 'bassEnhancer', name: 'Bass Enhancer', group: 'Tone', summary: 'Add controlled low harmonics', defaults: { frequency: 120, amount: 0.12, mix: 1 } },
  { type: 'presence', name: 'Presence', group: 'Tone', summary: 'Improve vocal and detail focus', defaults: { frequency: 2800, amount: 0.1, mix: 1 } },
  { type: 'exciter', name: 'Exciter', group: 'Tone', summary: 'Add high-frequency harmonics', defaults: { frequency: 5500, amount: 0.08, mix: 1 } },
  { type: 'saturation', name: 'Saturation', group: 'Tone', summary: 'Add harmonic density', defaults: { drive: 1, mix: 0.35 } },
  { type: 'softClipper', name: 'Soft Clipper', group: 'Dynamics', summary: 'Smooth transient peaks', defaults: { drive: 0.8, ceilingDb: -1, softness: 0.8 } },
  { type: 'delay', name: 'Delay', group: 'Space', summary: 'Tempo-free stereo delay', defaults: { time: 0.24, feedback: 0.22, tone: 0.65, mix: 0.12 } },
  { type: 'echo', name: 'Echo', group: 'Space', summary: 'Alternating stereo repeats', defaults: { time: 0.36, feedback: 0.3, tone: 0.55, stereoOffset: 0.025, mix: 0.12 } },
  { type: 'reverb', name: 'Reverb', group: 'Space', summary: 'Algorithmic room ambience', defaults: { size: 0.45, damping: 0.55, preDelay: 0.012, mix: 0.1 } },
  { type: 'limiter', name: 'Limiter', group: 'Dynamics', summary: 'Final peak protection', defaults: { threshold: -1, release: 0.12 } },
  { type: 'output', name: 'Output Trim', group: 'Utility', summary: 'Final level adjustment', defaults: { trimDb: 0 } }
];

export const EFFECT_DEFINITIONS = Object.fromEntries(EFFECT_CATALOG.map((effect) => [effect.type, effect]));

let instanceCounter = 0;

export function createEffectInstance(type, overrides = {}, id) {
  const definition = EFFECT_DEFINITIONS[type];
  if (!definition) return null;
  instanceCounter += 1;
  return {
    id: id ?? `${type}-${Date.now().toString(36)}-${instanceCounter.toString(36)}`,
    type,
    enabled: overrides.enabled !== false,
    settings: { ...definition.defaults, ...(overrides.settings ?? overrides) }
  };
}

function chain(entries, prefix) {
  return entries.map(([type, settings = {}], index) => createEffectInstance(type, settings, `${prefix}-${index + 1}-${type}`));
}

export const CHAIN_PRESETS = {
  'Safe Loudness': () => chain([
    ['input', { trimDb: 0 }],
    ['highpass', { frequency: 25, q: 0.7071 }],
    ['maximizer', { targetDb: -14, maxGainDb: 6, ceilingDb: -1.2, release: 0.45 }],
    ['softClipper', { drive: 0.8, ceilingDb: -1, softness: 0.82 }],
    ['limiter', { threshold: -1, release: 0.14 }],
    ['output', { trimDb: 0 }]
  ], 'safe'),
  'Transparent Loudness': () => chain([
    ['maximizer', { targetDb: -15, maxGainDb: 4, ceilingDb: -1.2, release: 0.6 }],
    ['limiter', { threshold: -1, release: 0.16 }]
  ], 'transparent'),
  'Music Balanced': () => chain([
    ['highpass', { frequency: 24 }],
    ['compressor', { threshold: -16, ratio: 1.7, attack: 0.035, release: 0.32, makeupDb: 0.8, mix: 0.65 }],
    ['saturation', { drive: 1.2, mix: 0.18 }],
    ['maximizer', { targetDb: -14, maxGainDb: 4.5, ceilingDb: -1.2, release: 0.5 }],
    ['limiter', { threshold: -1, release: 0.14 }]
  ], 'music'),
  'Dialogue Focus': () => chain([
    ['highpass', { frequency: 70 }],
    ['presence', { frequency: 3000, amount: 0.12, mix: 1 }],
    ['deesser', { frequency: 6500, amount: 0.32 }],
    ['compressor', { threshold: -22, ratio: 2.4, attack: 0.012, release: 0.22, makeupDb: 1.5, mix: 0.75 }],
    ['maximizer', { targetDb: -16, maxGainDb: 4, ceilingDb: -1.2, release: 0.45 }],
    ['limiter', { threshold: -1, release: 0.12 }]
  ], 'dialogue'),
  'Night Listening': () => chain([
    ['highpass', { frequency: 35 }],
    ['compressor', { threshold: -28, ratio: 3, attack: 0.018, release: 0.4, makeupDb: 2, mix: 0.72 }],
    ['maximizer', { targetDb: -18, maxGainDb: 3, ceilingDb: -2, release: 0.7 }],
    ['limiter', { threshold: -2, release: 0.2 }]
  ], 'night'),
  'Streaming Safe': () => chain([
    ['highpass', { frequency: 25 }],
    ['maximizer', { targetDb: -14, maxGainDb: 5, ceilingDb: -1.5, release: 0.5 }],
    ['softClipper', { drive: 0.5, ceilingDb: -1.3, softness: 0.9 }],
    ['limiter', { threshold: -1.2, release: 0.16 }]
  ], 'streaming'),
  'Creative Space': () => chain([
    ['highpass', { frequency: 30 }],
    ['delay', { time: 0.22, feedback: 0.18, tone: 0.65, mix: 0.08 }],
    ['reverb', { size: 0.38, damping: 0.62, preDelay: 0.01, mix: 0.09 }],
    ['limiter', { threshold: -1, release: 0.15 }]
  ], 'space')
};

export function createDefaultEffectChain() {
  return CHAIN_PRESETS['Safe Loudness']();
}

export function cloneEffectChain(value) {
  return value.map((effect) => ({ ...effect, settings: { ...effect.settings } }));
}
