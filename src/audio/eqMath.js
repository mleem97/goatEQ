import {
  DISPLAY_MAX_FREQUENCY,
  EQ_HEIGHT,
  EQ_WIDTH,
  MAX_GAIN_DB,
  MIN_GAIN_DB
} from './constants.js';

export const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

// This quartic scale is intentionally preserved from the original EARS-inspired UI.
export function frequencyToX(frequency, maximum = DISPLAY_MAX_FREQUENCY) {
  return Math.pow(clamp(frequency, 0, maximum) / maximum, 0.25) * EQ_WIDTH;
}

export function xToFrequency(x, maximum = DISPLAY_MAX_FREQUENCY) {
  return Math.pow(clamp(x, 0, EQ_WIDTH) / EQ_WIDTH, 4) * maximum;
}

export function gainToY(gain) {
  return EQ_HEIGHT * (1 - (clamp(gain, MIN_GAIN_DB, MAX_GAIN_DB) - MIN_GAIN_DB) / (MAX_GAIN_DB - MIN_GAIN_DB));
}

export function yToGain(y) {
  return (1 - clamp(y, 0, EQ_HEIGHT) / EQ_HEIGHT) * (MAX_GAIN_DB - MIN_GAIN_DB) + MIN_GAIN_DB;
}

export function linearToLegacyDb(gain) {
  return 10 * Math.log10(Math.max(0.00316, gain));
}

export function legacyDbToLinear(db) {
  return Math.pow(10, db / 10);
}

export function formatFrequency(value) {
  const rounded = Math.round(value);
  if (rounded >= 1000) {
    return `${Number((rounded / 1000).toFixed(rounded >= 10000 ? 0 : 1))}k`;
  }
  return `${rounded}`;
}

export function getFrequencyTicks(maximum = DISPLAY_MAX_FREQUENCY) {
  const ticks = [];
  for (let frequency = 5; frequency < maximum; frequency *= 2) {
    ticks.push({ frequency, x: frequencyToX(frequency, maximum) });
  }
  return ticks;
}

export function getGainTicks() {
  const ticks = [];
  for (let gain = MIN_GAIN_DB; gain < MAX_GAIN_DB; gain += 5) {
    if (gain !== MAX_GAIN_DB) ticks.push({ gain, y: gainToY(gain) });
  }
  return ticks;
}

export function getFilterResponse(filter, sampleRate = 44100, step = 2) {
  const frequency = clamp(filter.frequency, 5, 20000);
  const q = clamp(filter.q, 0.2, 11);
  const gain = clamp(filter.gain, MIN_GAIN_DB, MAX_GAIN_DB);
  const tangent = Math.tan(Math.PI * frequency / sampleRate);
  let scale = 1 / (1 + tangent / q + tangent * tangent);
  const magnitude = Math.pow(10, Math.abs(gain) / 20);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;

  if (filter.type === 'peaking') {
    if (gain >= 0) {
      scale = 1 / (1 + tangent / q + tangent * tangent);
      b0 = (1 + magnitude * tangent / q + tangent * tangent) * scale;
      b1 = 2 * (tangent * tangent - 1) * scale;
      b2 = (1 - magnitude * tangent / q + tangent * tangent) * scale;
      a1 = b1;
      a2 = (1 - tangent / q + tangent * tangent) * scale;
    } else {
      scale = 1 / (1 + magnitude * tangent / q + tangent * tangent);
      b0 = (1 + tangent / q + tangent * tangent) * scale;
      b1 = 2 * (tangent * tangent - 1) * scale;
      b2 = (1 - tangent / q + tangent * tangent) * scale;
      a1 = b1;
      a2 = (1 - magnitude * tangent / q + tangent * tangent) * scale;
    }
  } else if (filter.type === 'highshelf') {
    if (gain >= 0) {
      scale = 1 / (1 + Math.SQRT2 * tangent + tangent * tangent);
      b0 = (magnitude + Math.sqrt(2 * magnitude) * tangent + tangent * tangent) * scale;
      b1 = 2 * (tangent * tangent - magnitude) * scale;
      b2 = (magnitude - Math.sqrt(2 * magnitude) * tangent + tangent * tangent) * scale;
      a1 = 2 * (tangent * tangent - 1) * scale;
      a2 = (1 - Math.SQRT2 * tangent + tangent * tangent) * scale;
    } else {
      scale = 1 / (magnitude + Math.sqrt(2 * magnitude) * tangent + tangent * tangent);
      b0 = (1 + Math.SQRT2 * tangent + tangent * tangent) * scale;
      b1 = 2 * (tangent * tangent - 1) * scale;
      b2 = (1 - Math.SQRT2 * tangent + tangent * tangent) * scale;
      a1 = 2 * (tangent * tangent - magnitude) * scale;
      a2 = (magnitude - Math.sqrt(2 * magnitude) * tangent + tangent * tangent) * scale;
    }
  } else {
    if (gain >= 0) {
      scale = 1 / (1 + Math.SQRT2 * tangent + tangent * tangent);
      b0 = (1 + Math.sqrt(2 * magnitude) * tangent + magnitude * tangent * tangent) * scale;
      b1 = 2 * (magnitude * tangent * tangent - 1) * scale;
      b2 = (1 - Math.sqrt(2 * magnitude) * tangent + magnitude * tangent * tangent) * scale;
      a1 = 2 * (tangent * tangent - 1) * scale;
      a2 = (1 - Math.SQRT2 * tangent + tangent * tangent) * scale;
    } else {
      scale = 1 / (1 + Math.sqrt(2 * magnitude) * tangent + magnitude * tangent * tangent);
      b0 = (1 + Math.SQRT2 * tangent + tangent * tangent) * scale;
      b1 = 2 * (tangent * tangent - 1) * scale;
      b2 = (1 - Math.SQRT2 * tangent + tangent * tangent) * scale;
      a1 = 2 * (magnitude * tangent * tangent - 1) * scale;
      a2 = (1 - Math.sqrt(2 * magnitude) * tangent + magnitude * tangent * tangent) * scale;
    }
  }

  const points = [];
  for (let x = 0; x < EQ_WIDTH; x += step) {
    const omega = Math.pow(x / EQ_WIDTH, 4) * Math.PI;
    const sinSquared = Math.pow(Math.sin(omega / 2), 2);
    const numerator = Math.pow(b0 + b1 + b2, 2)
      - 4 * (b0 * b1 + 4 * b0 * b2 + b1 * b2) * sinSquared
      + 16 * b0 * b2 * sinSquared * sinSquared;
    const denominator = Math.pow(1 + a1 + a2, 2)
      - 4 * (a1 + 4 * a2 + a1 * a2) * sinSquared
      + 16 * a2 * sinSquared * sinSquared;
    let y = gainToY((10 / Math.LN10) * Math.log(numerator / denominator));
    if (!Number.isFinite(y)) y = EQ_HEIGHT - 1;
    if (Math.abs(y - EQ_HEIGHT / 2) > 1) points.push([x, y]);
  }
  return points;
}

export function fftToPoints(data, sampleRate = 44100) {
  if (!data?.length) return [];
  const collapsed = [];
  for (let index = 0; index < data.length; index += 1) {
    const frequency = index * sampleRate / (data.length * 2);
    if (frequency < 10) continue;
    const x = frequencyToX(frequency);
    if (x > EQ_WIDTH) break;
    const amplitude = ((data[index] + 100) / 100) * EQ_HEIGHT;
    const point = [x, clamp(EQ_HEIGHT - amplitude, 0, EQ_HEIGHT)];
    const previous = collapsed.at(-1);
    if (previous && point[0] - previous[0] < 2) {
      if (point[1] < previous[1]) previous[1] = point[1];
    } else {
      collapsed.push(point);
    }
  }
  return collapsed;
}

export function pointsToString(points) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}
