import { clamp } from './eqMath.js';
import { MAX_EQ_BANDS, MIN_EQ_BANDS } from './constants.js';

function finiteArray(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

export function normalizePreset(value) {
  if (!value || typeof value !== 'object') return null;
  const length = value.frequencies?.length;
  if (!Number.isInteger(length) || length < MIN_EQ_BANDS || length > MAX_EQ_BANDS) return null;
  if (!finiteArray(value.frequencies, length) || !finiteArray(value.gains, length) || !finiteArray(value.qs, length)) return null;
  const types = Array.isArray(value.types) && value.types.length === length
    ? value.types.map((type, index) => ['lowshelf', 'peaking', 'highshelf'].includes(type)
      ? type
      : index === 0 ? 'lowshelf' : index === length - 1 ? 'highshelf' : 'peaking')
    : undefined;
  return {
    frequencies: value.frequencies.map((frequency) => clamp(frequency, 5, 20000)),
    gains: value.gains.map((gain) => clamp(gain, -30, 30)),
    qs: value.qs.map((q) => clamp(q, 0.2, 11)),
    ...(types ? { types } : {})
  };
}

export function normalizePresetCollection(value) {
  const source = value?.presets && typeof value.presets === 'object' ? value.presets : value;
  if (!source || Array.isArray(source) || typeof source !== 'object') return {};
  const result = {};
  for (const [name, preset] of Object.entries(source)) {
    const cleanName = String(name).trim().slice(0, 80);
    const normalized = normalizePreset(preset);
    if (cleanName && normalized) result[cleanName] = normalized;
  }
  return result;
}
