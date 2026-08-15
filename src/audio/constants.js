export const EQ_WIDTH = 600;
export const EQ_HEIGHT = 300;
export const GAIN_WIDTH = 30;
export const MIN_GAIN_DB = -30;
export const MAX_GAIN_DB = 30;
export const MAX_MASTER_GAIN_DB = 10;
export const DISPLAY_MAX_FREQUENCY = 22050;
export const MIN_EQ_BANDS = 1;
export const MAX_EQ_BANDS = 32;

export const DEFAULT_FREQUENCIES = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
export const DEFAULT_Q = 0.7071;

export const DEFAULT_FILTERS = DEFAULT_FREQUENCIES.map((frequency, index) => ({
  index,
  frequency,
  gain: 0,
  q: DEFAULT_Q,
  type: index === 0 ? 'lowshelf' : index === DEFAULT_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking'
}));

export function createAdditionalFilter(filters) {
  const sorted = filters.map(({ frequency }) => frequency).filter(Number.isFinite).sort((a, b) => a - b);
  const candidates = [5, ...sorted, 20000];
  let lower = 20;
  let upper = 20000;
  let largestRatio = 0;
  for (let index = 1; index < candidates.length; index += 1) {
    const ratio = candidates[index] / Math.max(5, candidates[index - 1]);
    if (ratio > largestRatio) {
      largestRatio = ratio;
      lower = candidates[index - 1];
      upper = candidates[index];
    }
  }
  return {
    index: filters.length,
    frequency: Math.round(Math.sqrt(lower * upper)),
    gain: 0,
    q: DEFAULT_Q,
    type: 'peaking'
  };
}

export const DEFAULT_MASTERING = {
  input: { enabled: true, trimDb: 0 },
  highpass: { enabled: false, frequency: 25, q: 0.7071 },
  declipper: { enabled: false, threshold: 0.96, mix: 1 },
  compressor: {
    enabled: false,
    threshold: -18,
    knee: 12,
    ratio: 2,
    attack: 0.02,
    release: 0.25,
    makeupDb: 0,
    mix: 1
  },
  deesser: { enabled: false, frequency: 6500, amount: 0.25 },
  stereo: { enabled: false, width: 1, monoBass: 120, crossfeed: 0 },
  saturation: { enabled: false, drive: 0, mix: 1 },
  softClipper: { enabled: false, drive: 1, ceilingDb: -1, softness: 0.65, oversample: '4x' },
  limiter: { enabled: true, threshold: -1, release: 0.12 },
  output: { enabled: true, trimDb: 0 }
};

export const DEFAULT_METER = {
  inputPeak: -Infinity,
  outputPeak: -Infinity,
  inputPeakLeft: -Infinity,
  inputPeakRight: -Infinity,
  outputPeakLeft: -Infinity,
  outputPeakRight: -Infinity,
  inputRms: -Infinity,
  outputRms: -Infinity,
  inputRmsLeft: -Infinity,
  inputRmsRight: -Infinity,
  outputRmsLeft: -Infinity,
  outputRmsRight: -Infinity,
  gainReduction: 0,
  clippedSamples: 0
};

export function cloneDefaults() {
  return {
    filters: DEFAULT_FILTERS.map((filter) => ({ ...filter })),
    mastering: structuredClone(DEFAULT_MASTERING),
    meter: { ...DEFAULT_METER }
  };
}
