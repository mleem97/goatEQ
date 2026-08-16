// sampleRate is provided by AudioWorkletGlobalScope. Read it through
// globalThis so ordinary JS tooling does not treat it as an undeclared name.
const WORKLET_SAMPLE_RATE = Number.isFinite(globalThis.sampleRate) && globalThis.sampleRate > 0
  ? globalThis.sampleRate
  : 48000;
const SOFT_CLIP_DENOMINATOR_EPSILON = 0.000001;
const ENVELOPE_EPSILON = 0.00000001;
const MAXIMIZER_ENVELOPE_FLOOR = 0.0001;
const MAXIMIZER_RISE_COEFFICIENT = 0.0008;

class GoatMasteringProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chain = [];
    this.states = new Map();
    this.meterFrames = 0;
    this.clipCount = 0;
    this.maxGainReduction = 0;
    this.meter = this.emptyMeter();
    this.result = new Float64Array(2);
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'chain' && Array.isArray(data.chain)) {
        this.chain = data.chain.slice(0, 32).map((effect, index) => ({
          id: String(effect.id || `${effect.type}-${index}`),
          type: effect.type,
          enabled: effect.enabled !== false,
          settings: { ...(effect.settings ?? {}) }
        }));
        const liveIds = new Set(this.chain.map(({ id }) => id));
        for (const id of this.states.keys()) if (!liveIds.has(id)) this.states.delete(id);
      }
      if (data?.type === 'settings') {
        this.chain = ['declipper', 'deesser', 'stereo'].map((type) => ({
          id: `legacy-${type}`,
          type,
          enabled: Boolean(data.settings?.[type]?.enabled),
          settings: { ...(data.settings?.[type] ?? {}) }
        }));
      }
    };
  }

  emptyMeter() {
    return {
      inputPeak: [0, 0], outputPeak: [0, 0],
      inputEnergy: [0, 0], outputEnergy: [0, 0]
    };
  }

  clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }
  dbToGain(db) { return Math.pow(10, Number(db) / 20); }
  coefficient(frequency) { return Math.exp(-2 * Math.PI * this.clamp(frequency, 5, WORKLET_SAMPLE_RATE * 0.45) / WORKLET_SAMPLE_RATE); }
  timeCoefficient(seconds) { return Math.exp(-1 / Math.max(1, this.clamp(seconds, 0.001, 10) * WORKLET_SAMPLE_RATE)); }
  setResult(left, right) { this.result[0] = left; this.result[1] = right; return this.result; }
  softClip(sample, drive, ceiling, kneeStart) {
    const driven = sample * drive;
    const magnitude = Math.abs(driven);
    if (magnitude <= kneeStart) return driven;
    const normalized = (magnitude - kneeStart) / Math.max(SOFT_CLIP_DENOMINATOR_EPSILON, ceiling - kneeStart);
    return Math.sign(driven) * Math.min(ceiling, kneeStart + (ceiling - kneeStart) * Math.tanh(normalized));
  }

  stateFor(effect) {
    let state = this.states.get(effect.id);
    if (!state) {
      state = {
        low: [0, 0], low2: [0, 0], history: [[0, 0], [0, 0]],
        envelope: 0, fastEnvelope: 0, slowEnvelope: 0,
        gain: 1, tone: [0, 0], index: 0, buffers: null, bufferLength: 0
      };
      this.states.set(effect.id, state);
    }
    return state;
  }

  ensureBuffers(state, seconds = 2) {
    const length = Math.max(2048, Math.ceil(WORKLET_SAMPLE_RATE * seconds));
    if (!state.buffers || state.bufferLength !== length) {
      state.buffers = [new Float32Array(length), new Float32Array(length)];
      state.bufferLength = length;
      state.index = 0;
    }
  }

  processEffect(effect, left, right) {
    if (!effect.enabled) return this.setResult(left, right);
    const settings = effect.settings;
    const state = this.stateFor(effect);
    const dryLeft = left;
    const dryRight = right;
    const peak = Math.max(Math.abs(left), Math.abs(right));
    let alpha;
    let mix;

    switch (effect.type) {
      case 'input':
      case 'output': {
        const gain = this.dbToGain(this.clamp(settings.trimDb ?? 0, -18, 18));
        return this.setResult(left * gain, right * gain);
      }
      case 'highpass':
        alpha = this.coefficient(settings.frequency ?? 25);
        state.low[0] = left * (1 - alpha) + state.low[0] * alpha;
        state.low[1] = right * (1 - alpha) + state.low[1] * alpha;
        return this.setResult(left - state.low[0], right - state.low[1]);
      case 'lowpass':
        alpha = this.coefficient(settings.frequency ?? 19000);
        state.low[0] = left * (1 - alpha) + state.low[0] * alpha;
        state.low[1] = right * (1 - alpha) + state.low[1] * alpha;
        return this.setResult(state.low[0], state.low[1]);
      case 'declipper': {
        const threshold = this.clamp(settings.threshold ?? 0.96, 0.7, 1);
        mix = this.clamp(settings.mix ?? 1, 0, 1);
        this.result[0] = left;
        this.result[1] = right;
        for (let channel = 0; channel < 2; channel += 1) {
          const sample = this.result[channel];
          if (Math.abs(sample) >= threshold) {
            const [older, previous] = state.history[channel];
            const predicted = this.clamp(previous + (previous - older) * 0.65, -1, 1);
            this.result[channel] = sample * (1 - mix) + predicted * mix;
            this.clipCount += 1;
          }
          state.history[channel][0] = state.history[channel][1];
          state.history[channel][1] = this.result[channel];
        }
        return this.result;
      }
      case 'gate': {
        const release = this.timeCoefficient(settings.release ?? 0.18);
        state.envelope = Math.max(peak, state.envelope * release);
        const threshold = this.dbToGain(settings.threshold ?? -55);
        const ratio = this.clamp(settings.ratio ?? 2, 1, 8);
        const normalized = this.clamp(state.envelope / Math.max(threshold, SOFT_CLIP_DENOMINATOR_EPSILON), 0, 1);
        const target = normalized < 1 ? Math.pow(normalized, ratio - 1) : 1;
        state.gain += (target - state.gain) * (target < state.gain ? 0.08 : 0.002);
        return this.setResult(left * state.gain, right * state.gain);
      }
      case 'compressor': {
        const attack = this.timeCoefficient(settings.attack ?? 0.02);
        const release = this.timeCoefficient(settings.release ?? 0.25);
        state.envelope = peak > state.envelope ? peak + attack * (state.envelope - peak) : peak + release * (state.envelope - peak);
        const thresholdDb = this.clamp(settings.threshold ?? -18, -48, 0);
        const ratio = this.clamp(settings.ratio ?? 2, 1, 20);
        const levelDb = 20 * Math.log10(Math.max(state.envelope, ENVELOPE_EPSILON));
        const reductionDb = levelDb > thresholdDb ? (thresholdDb + (levelDb - thresholdDb) / ratio) - levelDb : 0;
        const gain = this.dbToGain(reductionDb + this.clamp(settings.makeupDb ?? 0, 0, 18));
        mix = this.clamp(settings.mix ?? 1, 0, 1);
        this.maxGainReduction = Math.min(this.maxGainReduction, reductionDb);
        return this.setResult(left * (1 - mix) + left * gain * mix, right * (1 - mix) + right * gain * mix);
      }
      case 'maximizer': {
        const release = this.timeCoefficient(settings.release ?? 0.45);
        state.envelope = Math.max(peak, state.envelope * release);
        const target = this.dbToGain(settings.targetDb ?? -14);
        const maxGain = this.dbToGain(this.clamp(settings.maxGainDb ?? 6, 0, 12));
        const ceiling = this.dbToGain(this.clamp(settings.ceilingDb ?? -1, -6, -0.1));
        const loudnessGain = this.clamp(target / Math.max(state.envelope, MAXIMIZER_ENVELOPE_FLOOR), 1, maxGain);
        const peakGain = peak > 0 ? ceiling / peak : maxGain;
        const desired = Math.min(loudnessGain, peakGain);
        state.gain += (desired - state.gain) * (desired < state.gain ? 0.18 : MAXIMIZER_RISE_COEFFICIENT);
        const gain = Math.min(state.gain, peakGain);
        if (gain < 1) this.maxGainReduction = Math.min(this.maxGainReduction, 20 * Math.log10(Math.max(gain, ENVELOPE_EPSILON)));
        return this.setResult(left * gain, right * gain);
      }
      case 'transient': {
        const fast = this.timeCoefficient(0.006);
        const slow = this.timeCoefficient(0.12);
        state.fastEnvelope = Math.max(peak, state.fastEnvelope * fast);
        state.slowEnvelope = peak + slow * (state.slowEnvelope - peak);
        const transient = (state.fastEnvelope - state.slowEnvelope) / Math.max(state.slowEnvelope, 0.02);
        const shaping = 1 + transient * this.clamp(settings.attack ?? 0.12, -1, 1)
          + (1 - Math.min(1, Math.abs(transient))) * this.clamp(settings.sustain ?? 0, -1, 1) * 0.25;
        mix = this.clamp(settings.mix ?? 1, 0, 1);
        return this.setResult(left * (1 - mix + mix * shaping), right * (1 - mix + mix * shaping));
      }
      case 'deesser': {
        alpha = this.coefficient(settings.frequency ?? 6500);
        const amount = this.clamp(settings.amount ?? 0.25, 0, 1);
        this.result[0] = left;
        this.result[1] = right;
        for (let channel = 0; channel < 2; channel += 1) {
          state.low[channel] = this.result[channel] * (1 - alpha) + state.low[channel] * alpha;
          const high = this.result[channel] - state.low[channel];
          state.envelope = Math.max(Math.abs(high), state.envelope * 0.997);
          this.result[channel] -= high * Math.min(0.85, amount * state.envelope * 3);
        }
        return this.result;
      }
      case 'stereo': {
        alpha = this.coefficient(settings.monoBass ?? 120);
        state.low[0] = left * (1 - alpha) + state.low[0] * alpha;
        state.low[1] = right * (1 - alpha) + state.low[1] * alpha;
        const monoLow = (state.low[0] + state.low[1]) * 0.5;
        const highLeft = left - state.low[0];
        const highRight = right - state.low[1];
        const mid = (highLeft + highRight) * 0.5;
        const side = (highLeft - highRight) * 0.5 * this.clamp(settings.width ?? 1, 0, 2);
        const crossfeed = this.clamp(settings.crossfeed ?? 0, 0, 0.5);
        const wetLeft = monoLow + mid + side;
        const wetRight = monoLow + mid - side;
        return this.setResult(wetLeft * (1 - crossfeed) + dryRight * crossfeed, wetRight * (1 - crossfeed) + dryLeft * crossfeed);
      }
      case 'bassEnhancer': {
        alpha = this.coefficient(settings.frequency ?? 120);
        const amount = this.clamp(settings.amount ?? 0.12, 0, 0.75);
        mix = this.clamp(settings.mix ?? 1, 0, 1);
        state.low[0] = left * (1 - alpha) + state.low[0] * alpha;
        state.low[1] = right * (1 - alpha) + state.low[1] * alpha;
        const wetLeft = left + Math.tanh(state.low[0] * 3) * amount;
        const wetRight = right + Math.tanh(state.low[1] * 3) * amount;
        return this.setResult(left * (1 - mix) + wetLeft * mix, right * (1 - mix) + wetRight * mix);
      }
      case 'presence': {
        const center = this.clamp(settings.frequency ?? 2800, 1000, 6000);
        const lowAlpha = this.coefficient(center * 0.55);
        const highAlpha = this.coefficient(center * 1.8);
        const amount = this.clamp(settings.amount ?? 0.1, -0.5, 0.75);
        mix = this.clamp(settings.mix ?? 1, 0, 1);
        this.result[0] = left;
        this.result[1] = right;
        for (let channel = 0; channel < 2; channel += 1) {
          state.low[channel] = this.result[channel] * (1 - lowAlpha) + state.low[channel] * lowAlpha;
          state.low2[channel] = this.result[channel] * (1 - highAlpha) + state.low2[channel] * highAlpha;
          this.result[channel] += (state.low2[channel] - state.low[channel]) * amount * mix;
        }
        return this.result;
      }
      case 'exciter': {
        alpha = this.coefficient(settings.frequency ?? 5500);
        const amount = this.clamp(settings.amount ?? 0.08, 0, 0.5);
        mix = this.clamp(settings.mix ?? 1, 0, 1);
        this.result[0] = left;
        this.result[1] = right;
        for (let channel = 0; channel < 2; channel += 1) {
          state.low[channel] = this.result[channel] * (1 - alpha) + state.low[channel] * alpha;
          const high = this.result[channel] - state.low[channel];
          this.result[channel] += (Math.tanh(high * 5) - high) * amount * mix;
        }
        return this.result;
      }
      case 'saturation': {
        const drive = this.dbToGain(this.clamp(settings.drive ?? 1, 0, 24));
        mix = this.clamp(settings.mix ?? 0.35, 0, 1);
        const normalizer = Math.max(0.01, Math.tanh(drive));
        return this.setResult(left * (1 - mix) + Math.tanh(left * drive) / normalizer * mix, right * (1 - mix) + Math.tanh(right * drive) / normalizer * mix);
      }
      case 'softClipper': {
        const drive = this.dbToGain(this.clamp(settings.drive ?? 0.8, 0, 18));
        const ceiling = this.dbToGain(this.clamp(settings.ceilingDb ?? -1, -6, 0));
        const softness = this.clamp(settings.softness ?? 0.8, 0.05, 1);
        const kneeStart = ceiling * softness;
        return this.setResult(this.softClip(left, drive, ceiling, kneeStart), this.softClip(right, drive, ceiling, kneeStart));
      }
      case 'delay':
      case 'echo': {
        this.ensureBuffers(state, 1.7);
        const baseTime = this.clamp(settings.time ?? (effect.type === 'echo' ? 0.36 : 0.24), 0.01, 1.5);
        const offset = effect.type === 'echo' ? this.clamp(settings.stereoOffset ?? 0.025, 0, 0.12) : 0;
        const delayLeft = Math.floor(baseTime * WORKLET_SAMPLE_RATE);
        const delayRight = Math.floor((baseTime + offset) * WORKLET_SAMPLE_RATE);
        const feedback = this.clamp(settings.feedback ?? 0.25, 0, 0.85);
        const tone = this.clamp(settings.tone ?? 0.6, 0, 1);
        mix = this.clamp(settings.mix ?? 0.12, 0, 1);
        const readLeft = (state.index - delayLeft + state.bufferLength) % state.bufferLength;
        const readRight = (state.index - delayRight + state.bufferLength) % state.bufferLength;
        const delayedLeft = state.buffers[0][readLeft];
        const delayedRight = state.buffers[1][readRight];
        state.tone[0] += (delayedLeft - state.tone[0]) * (0.04 + tone * 0.46);
        state.tone[1] += (delayedRight - state.tone[1]) * (0.04 + tone * 0.46);
        const wetLeft = state.tone[0];
        const wetRight = state.tone[1];
        state.buffers[0][state.index] = left + (effect.type === 'echo' ? wetRight : delayedLeft) * feedback;
        state.buffers[1][state.index] = right + (effect.type === 'echo' ? wetLeft : delayedRight) * feedback;
        state.index = (state.index + 1) % state.bufferLength;
        return this.setResult(left * (1 - mix) + wetLeft * mix, right * (1 - mix) + wetRight * mix);
      }
      case 'reverb': {
        this.ensureBuffers(state, 2.2);
        const size = this.clamp(settings.size ?? 0.45, 0.05, 1);
        const damping = this.clamp(settings.damping ?? 0.55, 0, 1);
        const preDelay = this.clamp(settings.preDelay ?? 0.012, 0, 0.12);
        mix = this.clamp(settings.mix ?? 0.1, 0, 0.8);
        const delayLeft = Math.floor((0.031 + size * 0.21 + preDelay) * WORKLET_SAMPLE_RATE);
        const delayRight = Math.floor((0.043 + size * 0.27 + preDelay) * WORKLET_SAMPLE_RATE);
        const readLeft = (state.index - delayLeft + state.bufferLength) % state.bufferLength;
        const readRight = (state.index - delayRight + state.bufferLength) % state.bufferLength;
        const delayedLeft = state.buffers[0][readLeft];
        const delayedRight = state.buffers[1][readRight];
        state.tone[0] += (delayedLeft - state.tone[0]) * (0.05 + (1 - damping) * 0.35);
        state.tone[1] += (delayedRight - state.tone[1]) * (0.05 + (1 - damping) * 0.35);
        const wetLeft = state.tone[0];
        const wetRight = state.tone[1];
        state.buffers[0][state.index] = left + wetRight * (0.42 + size * 0.4);
        state.buffers[1][state.index] = right + wetLeft * (0.42 + size * 0.4);
        state.index = (state.index + 1) % state.bufferLength;
        return this.setResult(left * (1 - mix) + wetLeft * mix, right * (1 - mix) + wetRight * mix);
      }
      case 'limiter': {
        const ceiling = this.dbToGain(this.clamp(settings.threshold ?? -1, -12, 0));
        const release = this.timeCoefficient(settings.release ?? 0.12);
        const desired = peak > ceiling ? ceiling / Math.max(peak, ENVELOPE_EPSILON) : 1;
        state.gain = desired < state.gain ? desired : 1 + release * (state.gain - 1);
        if (state.gain < 1) this.maxGainReduction = Math.min(this.maxGainReduction, 20 * Math.log10(Math.max(state.gain, ENVELOPE_EPSILON)));
        return this.setResult(this.clamp(left * state.gain, -ceiling, ceiling), this.clamp(right * state.gain, -ceiling, ceiling));
      }
      default:
        return this.setResult(left, right);
    }
  }

  updateMeter(inputLeft, inputRight, outputLeft, outputRight) {
    this.meter.inputPeak[0] = Math.max(this.meter.inputPeak[0], Math.abs(inputLeft));
    this.meter.inputPeak[1] = Math.max(this.meter.inputPeak[1], Math.abs(inputRight));
    this.meter.outputPeak[0] = Math.max(this.meter.outputPeak[0], Math.abs(outputLeft));
    this.meter.outputPeak[1] = Math.max(this.meter.outputPeak[1], Math.abs(outputRight));
    this.meter.inputEnergy[0] += inputLeft * inputLeft;
    this.meter.inputEnergy[1] += inputRight * inputRight;
    this.meter.outputEnergy[0] += outputLeft * outputLeft;
    this.meter.outputEnergy[1] += outputRight * outputRight;
    this.meterFrames += 1;
    if (this.meterFrames < WORKLET_SAMPLE_RATE / 12) return;
    const frames = this.meterFrames;
    this.port.postMessage({
      type: 'meter',
      inputPeak: Math.max(...this.meter.inputPeak), outputPeak: Math.max(...this.meter.outputPeak),
      inputPeakLeft: this.meter.inputPeak[0], inputPeakRight: this.meter.inputPeak[1],
      outputPeakLeft: this.meter.outputPeak[0], outputPeakRight: this.meter.outputPeak[1],
      inputRms: Math.sqrt((this.meter.inputEnergy[0] + this.meter.inputEnergy[1]) / (frames * 2)),
      outputRms: Math.sqrt((this.meter.outputEnergy[0] + this.meter.outputEnergy[1]) / (frames * 2)),
      inputRmsLeft: Math.sqrt(this.meter.inputEnergy[0] / frames), inputRmsRight: Math.sqrt(this.meter.inputEnergy[1] / frames),
      outputRmsLeft: Math.sqrt(this.meter.outputEnergy[0] / frames), outputRmsRight: Math.sqrt(this.meter.outputEnergy[1] / frames),
      clippedSamples: this.clipCount,
      gainReduction: this.maxGainReduction
    });
    this.meterFrames = 0;
    this.clipCount = 0;
    this.maxGainReduction = 0;
    this.meter = this.emptyMeter();
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;
    const frames = output[0].length;
    for (let index = 0; index < frames; index += 1) {
      const inputLeft = input[0]?.[index] ?? 0;
      const inputRight = input[1]?.[index] ?? inputLeft;
      let left = inputLeft;
      let right = inputRight;
      for (const effect of this.chain) {
        const result = this.processEffect(effect, left, right);
        left = result[0];
        right = result[1];
      }
      output[0][index] = Number.isFinite(left) ? left : 0;
      if (output[1]) output[1][index] = Number.isFinite(right) ? right : 0;
      this.updateMeter(inputLeft, inputRight, output[0][index], output[1]?.[index] ?? output[0][index]);
    }
    return true;
  }
}

registerProcessor('goat-mastering-processor', GoatMasteringProcessor);
