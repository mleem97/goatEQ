/* global chrome, AudioContext, AudioWorkletNode */
(function goatEQAudioEngine() {
  'use strict';

  // Chromium offscreen documents intentionally expose only the runtime
  // messaging subset of the extension API. In particular, getManifest() and
  // storage may be absent even though this is a valid extension context.
  // Prefer Chromium's native API, then accept Firefox's browser API, but only
  // when the messaging contract required by this engine is present.
  const api = [globalThis.chrome, globalThis.browser].find((candidate) => (
    typeof candidate?.runtime?.sendMessage === 'function'
    && typeof candidate?.runtime?.onMessage?.addListener === 'function'
  ));
  if (!api) {
    throw new Error('goatEQ could not locate a compatible WebExtension runtime API.');
  }
  const isFirefox = globalThis.location?.protocol === 'moz-extension:';
  const usesPromiseApi = isFirefox || (api === globalThis.browser && api !== globalThis.chrome);
  const captureCapability = isFirefox ? 'unsupported-firefox-tab-audio' : 'chromium-tab-capture';
  const firefoxCaptureError = 'Firefox stellt aktuell keine unterstützte WebExtension-API für automatisches Tab-Audio-Capturing bereit. Nutze für vollständige Verarbeitung bitte die Chrome-Version.';
  const minEqBands = 1;
  const maxEqBands = 32;
  const maxEffects = 32;
  const engineMessageTypes = new Set([
    'initPopup', 'getWorkspaceStatus', 'getFullRefresh', 'getCurrentTabStatus', 'getFFT',
    'getPresetsForExport', 'modifyFilter', 'replaceFilters', 'modifyGain', 'resetFilter',
    'resetFilters', 'preset', 'savePreset', 'deletePreset', 'importPresets',
    'updateMastering', 'replaceEffectChain', 'replaceMastering', 'resetMastering',
    'disconnectTab', 'startCaptureOffscreen', 'stopCaptureOffscreen', 'eqTab'
  ]);
  const frequencies = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
  const effectDefaults = {
    input: { trimDb: 0 },
    highpass: { frequency: 25, q: 0.7071 },
    lowpass: { frequency: 19000 },
    declipper: { threshold: 0.96, mix: 1 },
    gate: { threshold: -55, ratio: 2, release: 0.18 },
    compressor: { threshold: -18, ratio: 2, attack: 0.02, release: 0.25, makeupDb: 0, mix: 1 },
    maximizer: { targetDb: -14, maxGainDb: 6, ceilingDb: -1, release: 0.45 },
    transient: { attack: 0.12, sustain: 0, mix: 1 },
    deesser: { frequency: 6500, amount: 0.25 },
    stereo: { width: 1, monoBass: 120, crossfeed: 0 },
    bassEnhancer: { frequency: 120, amount: 0.12, mix: 1 },
    presence: { frequency: 2800, amount: 0.1, mix: 1 },
    exciter: { frequency: 5500, amount: 0.08, mix: 1 },
    saturation: { drive: 1, mix: 0.35 },
    softClipper: { drive: 0.8, ceilingDb: -1, softness: 0.8 },
    delay: { time: 0.24, feedback: 0.22, tone: 0.65, mix: 0.12 },
    echo: { time: 0.36, feedback: 0.3, tone: 0.55, stereoOffset: 0.025, mix: 0.12 },
    reverb: { size: 0.45, damping: 0.55, preDelay: 0.012, mix: 0.1 },
    limiter: { threshold: -1, release: 0.12 },
    output: { trimDb: 0 }
  };

  function createSafeEffectChain() {
    return [
      { id: 'safe-1-input', type: 'input', enabled: true, settings: { trimDb: 0 } },
      { id: 'safe-2-highpass', type: 'highpass', enabled: true, settings: { frequency: 25, q: 0.7071 } },
      { id: 'safe-3-maximizer', type: 'maximizer', enabled: true, settings: { targetDb: -14, maxGainDb: 6, ceilingDb: -1.2, release: 0.45 } },
      { id: 'safe-4-softClipper', type: 'softClipper', enabled: true, settings: { drive: 0.8, ceilingDb: -1, softness: 0.82 } },
      { id: 'safe-5-limiter', type: 'limiter', enabled: true, settings: { threshold: -1, release: 0.14 } },
      { id: 'safe-6-output', type: 'output', enabled: true, settings: { trimDb: 0 } }
    ];
  }
  const defaults = {
    gain: 1,
    filters: frequencies.map((frequency, index) => ({
      frequency, gain: 0, q: 0.7071,
      type: index === 0 ? 'lowshelf' : index === 10 ? 'highshelf' : 'peaking'
    })),
    effectChain: createSafeEffectChain(),
    mastering: {
      input: { enabled: true, trimDb: 0 },
      highpass: { enabled: false, frequency: 25, q: 0.7071 },
      declipper: { enabled: false, threshold: 0.96, mix: 1 },
      compressor: { enabled: false, threshold: -18, knee: 12, ratio: 2, attack: 0.02, release: 0.25, makeupDb: 0, mix: 1 },
      deesser: { enabled: false, frequency: 6500, amount: 0.25 },
      stereo: { enabled: false, width: 1, monoBass: 120, crossfeed: 0 },
      saturation: { enabled: false, drive: 0, mix: 1 },
      softClipper: { enabled: false, drive: 1, ceilingDb: -1, softness: 0.65, oversample: '4x' },
      limiter: { enabled: true, threshold: -1, release: 0.12 },
      output: { enabled: true, trimDb: 0 }
    }
  };

  let state = JSON.parse(JSON.stringify(defaults));
  let context = null;
  let nodes = null;
  let initPromise = null;
  let engineError = null;
  let workletAvailable = false;
  const streams = new Map();
  let presets = {};
  const revisions = { filters: 0, gain: 0, mastering: 0 };
  const engineSessionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  let workletMeter = {
    inputPeak: -Infinity, outputPeak: -Infinity,
    inputPeakLeft: -Infinity, inputPeakRight: -Infinity,
    outputPeakLeft: -Infinity, outputPeakRight: -Infinity,
    inputRms: -Infinity, outputRms: -Infinity,
    inputRmsLeft: -Infinity, inputRmsRight: -Infinity,
    outputRmsLeft: -Infinity, outputRmsRight: -Infinity,
    clippedSamples: 0,
    gainReduction: 0
  };

  function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }
  function dbToGain(db) { return Math.pow(10, db / 20); }
  function gainToDb(gain) { return gain > 0 ? 20 * Math.log10(gain) : -Infinity; }

  function acceptRevision(domain, message) {
    if (!Number.isSafeInteger(message?.revision) || message.revision < 0) {
      revisions[domain] += 1;
      return true;
    }
    if (message.revision < revisions[domain]) return false;
    revisions[domain] = message.revision;
    return true;
  }

  function normalizeFilter(filter, index) {
    const fallback = state.filters[index] ?? defaults.filters[index] ?? {
      frequency: 1000,
      gain: 0,
      q: 0.7071,
      type: 'peaking'
    };
    const type = ['lowshelf', 'peaking', 'highshelf'].includes(filter?.type) ? filter.type : fallback.type;
    return {
      ...fallback,
      frequency: clamp(filter?.frequency ?? fallback.frequency, 5, 20000),
      gain: clamp(filter?.gain ?? fallback.gain, -30, 30),
      q: clamp(filter?.q ?? fallback.q, 0.2, 11),
      type
    };
  }

  function normalizeMasteringPatch(module, patch = {}) {
    const current = state.mastering[module];
    if (!current) return null;
    const enabled = typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled;
    switch (module) {
      case 'input':
      case 'output': return { enabled, trimDb: clamp(patch.trimDb ?? current.trimDb, -18, 18) };
      case 'highpass': return {
        enabled,
        frequency: clamp(patch.frequency ?? current.frequency, 15, 180),
        q: clamp(patch.q ?? current.q, 0.2, 11)
      };
      case 'declipper': return {
        enabled,
        threshold: clamp(patch.threshold ?? current.threshold, 0.7, 1),
        mix: clamp(patch.mix ?? current.mix, 0, 1)
      };
      case 'compressor': return {
        enabled,
        threshold: clamp(patch.threshold ?? current.threshold, -48, 0),
        knee: clamp(patch.knee ?? current.knee, 0, 40),
        ratio: clamp(patch.ratio ?? current.ratio, 1, 20),
        attack: clamp(patch.attack ?? current.attack, 0.001, 1),
        release: clamp(patch.release ?? current.release, 0.02, 2),
        makeupDb: clamp(patch.makeupDb ?? current.makeupDb, 0, 18),
        mix: clamp(patch.mix ?? current.mix, 0, 1)
      };
      case 'deesser': return {
        enabled,
        frequency: clamp(patch.frequency ?? current.frequency, 3000, 12000),
        amount: clamp(patch.amount ?? current.amount, 0, 1)
      };
      case 'stereo': return {
        enabled,
        width: clamp(patch.width ?? current.width, 0, 2),
        monoBass: clamp(patch.monoBass ?? current.monoBass, 40, 300),
        crossfeed: clamp(patch.crossfeed ?? current.crossfeed, 0, 0.5)
      };
      case 'saturation': return {
        enabled,
        drive: clamp(patch.drive ?? current.drive, 0, 24),
        mix: clamp(patch.mix ?? current.mix, 0, 1)
      };
      case 'softClipper': return {
        enabled,
        drive: clamp(patch.drive ?? current.drive, 0, 18),
        ceilingDb: clamp(patch.ceilingDb ?? current.ceilingDb, -6, 0),
        softness: clamp(patch.softness ?? current.softness, 0.05, 1),
        oversample: ['none', '2x', '4x'].includes(patch.oversample) ? patch.oversample : current.oversample
      };
      case 'limiter': return {
        enabled,
        threshold: clamp(patch.threshold ?? current.threshold, -6, 0),
        release: clamp(patch.release ?? current.release, 0.02, 1)
      };
      default: return null;
    }
  }

  function normalizeEffectSettings(type, value = {}) {
    const fallback = effectDefaults[type];
    if (!fallback) return null;
    switch (type) {
      case 'input':
      case 'output': return { trimDb: clamp(value.trimDb ?? fallback.trimDb, -18, 18) };
      case 'highpass': return { frequency: clamp(value.frequency ?? fallback.frequency, 15, 250), q: clamp(value.q ?? fallback.q, 0.2, 11) };
      case 'lowpass': return { frequency: clamp(value.frequency ?? fallback.frequency, 1000, 20000) };
      case 'declipper': return { threshold: clamp(value.threshold ?? fallback.threshold, 0.7, 1), mix: clamp(value.mix ?? fallback.mix, 0, 1) };
      case 'gate': return { threshold: clamp(value.threshold ?? fallback.threshold, -80, -10), ratio: clamp(value.ratio ?? fallback.ratio, 1, 8), release: clamp(value.release ?? fallback.release, 0.02, 2) };
      case 'compressor': return {
        threshold: clamp(value.threshold ?? fallback.threshold, -48, 0),
        ratio: clamp(value.ratio ?? fallback.ratio, 1, 20),
        attack: clamp(value.attack ?? fallback.attack, 0.001, 1),
        release: clamp(value.release ?? fallback.release, 0.02, 2),
        makeupDb: clamp(value.makeupDb ?? fallback.makeupDb, 0, 18),
        mix: clamp(value.mix ?? fallback.mix, 0, 1)
      };
      case 'maximizer': return {
        targetDb: clamp(value.targetDb ?? fallback.targetDb, -24, -8),
        maxGainDb: clamp(value.maxGainDb ?? fallback.maxGainDb, 0, 12),
        ceilingDb: clamp(value.ceilingDb ?? fallback.ceilingDb, -6, -0.1),
        release: clamp(value.release ?? fallback.release, 0.05, 2)
      };
      case 'transient': return { attack: clamp(value.attack ?? fallback.attack, -1, 1), sustain: clamp(value.sustain ?? fallback.sustain, -1, 1), mix: clamp(value.mix ?? fallback.mix, 0, 1) };
      case 'deesser': return { frequency: clamp(value.frequency ?? fallback.frequency, 3000, 12000), amount: clamp(value.amount ?? fallback.amount, 0, 1) };
      case 'stereo': return { width: clamp(value.width ?? fallback.width, 0, 2), monoBass: clamp(value.monoBass ?? fallback.monoBass, 40, 300), crossfeed: clamp(value.crossfeed ?? fallback.crossfeed, 0, 0.5) };
      case 'bassEnhancer': return { frequency: clamp(value.frequency ?? fallback.frequency, 50, 250), amount: clamp(value.amount ?? fallback.amount, 0, 0.75), mix: clamp(value.mix ?? fallback.mix, 0, 1) };
      case 'presence': return { frequency: clamp(value.frequency ?? fallback.frequency, 1000, 6000), amount: clamp(value.amount ?? fallback.amount, -0.5, 0.75), mix: clamp(value.mix ?? fallback.mix, 0, 1) };
      case 'exciter': return { frequency: clamp(value.frequency ?? fallback.frequency, 3000, 12000), amount: clamp(value.amount ?? fallback.amount, 0, 0.5), mix: clamp(value.mix ?? fallback.mix, 0, 1) };
      case 'saturation': return { drive: clamp(value.drive ?? fallback.drive, 0, 24), mix: clamp(value.mix ?? fallback.mix, 0, 1) };
      case 'softClipper': return { drive: clamp(value.drive ?? fallback.drive, 0, 18), ceilingDb: clamp(value.ceilingDb ?? fallback.ceilingDb, -6, 0), softness: clamp(value.softness ?? fallback.softness, 0.05, 1) };
      case 'delay': return { time: clamp(value.time ?? fallback.time, 0.01, 1.5), feedback: clamp(value.feedback ?? fallback.feedback, 0, 0.85), tone: clamp(value.tone ?? fallback.tone, 0, 1), mix: clamp(value.mix ?? fallback.mix, 0, 1) };
      case 'echo': return { time: clamp(value.time ?? fallback.time, 0.03, 1.5), feedback: clamp(value.feedback ?? fallback.feedback, 0, 0.85), tone: clamp(value.tone ?? fallback.tone, 0, 1), stereoOffset: clamp(value.stereoOffset ?? fallback.stereoOffset, 0, 0.12), mix: clamp(value.mix ?? fallback.mix, 0, 1) };
      case 'reverb': return { size: clamp(value.size ?? fallback.size, 0.05, 1), damping: clamp(value.damping ?? fallback.damping, 0, 1), preDelay: clamp(value.preDelay ?? fallback.preDelay, 0, 0.12), mix: clamp(value.mix ?? fallback.mix, 0, 0.8) };
      case 'limiter': return { threshold: clamp(value.threshold ?? fallback.threshold, -12, 0), release: clamp(value.release ?? fallback.release, 0.02, 1) };
      default: return null;
    }
  }

  function normalizeEffectChain(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > maxEffects) return null;
    const ids = new Set();
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      const effect = value[index];
      if (!effect || typeof effect !== 'object' || !effectDefaults[effect.type]) return null;
      let id = String(effect.id || `${effect.type}-${index + 1}`).slice(0, 96);
      while (ids.has(id)) id = `${id}-${index + 1}`;
      ids.add(id);
      result.push({
        id,
        type: effect.type,
        enabled: effect.enabled !== false,
        settings: normalizeEffectSettings(effect.type, effect.settings)
      });
    }
    return result;
  }

  function legacyMasteringToChain(mastering) {
    const order = ['input', 'highpass', 'declipper', 'compressor', 'deesser', 'stereo', 'saturation', 'softClipper', 'limiter', 'output'];
    return normalizeEffectChain(order.map((type, index) => {
      const legacy = mastering?.[type] ?? defaults.mastering[type];
      const { enabled = false, ...settings } = legacy;
      return { id: `legacy-${index + 1}-${type}`, type, enabled, settings };
    }));
  }

  function chainToLegacyMastering(chain) {
    const result = JSON.parse(JSON.stringify(defaults.mastering));
    for (const effect of chain) {
      if (!Object.prototype.hasOwnProperty.call(result, effect.type)) continue;
      result[effect.type] = { ...result[effect.type], ...effect.settings, enabled: effect.enabled };
    }
    return result;
  }

  function normalizePreset(value) {
    if (!value || typeof value !== 'object') return null;
    const length = value.frequencies?.length;
    if (!Number.isInteger(length) || length < minEqBands || length > maxEqBands) return null;
    const arrays = [value.frequencies, value.gains, value.qs];
    if (arrays.some((items) => !Array.isArray(items) || items.length !== length || items.some((item) => !Number.isFinite(item)))) return null;
    return {
      frequencies: value.frequencies.map((frequency) => clamp(frequency, 5, 20000)),
      gains: value.gains.map((gain) => clamp(gain, -30, 30)),
      qs: value.qs.map((q) => clamp(q, 0.2, 11)),
      types: Array.isArray(value.types) && value.types.length === length
        ? value.types.map((type, index) => ['lowshelf', 'peaking', 'highshelf'].includes(type)
          ? type
          : index === 0 ? 'lowshelf' : index === length - 1 ? 'highshelf' : 'peaking')
        : undefined
    };
  }

  function downsampleWaveform(data, targetLength = 512) {
    if (data.length <= targetLength) return Array.from(data);
    const result = new Array(targetLength);
    const step = data.length / targetLength;
    for (let index = 0; index < targetLength; index += 1) {
      const start = Math.floor(index * step);
      const end = Math.max(start + 1, Math.floor((index + 1) * step));
      let peak = 0;
      for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
        if (Math.abs(data[sourceIndex]) > Math.abs(peak)) peak = data[sourceIndex];
      }
      result[index] = peak;
    }
    return result;
  }

  function runtimeMessage(message) {
    if (usesPromiseApi) return api.runtime.sendMessage(message).catch(() => undefined);
    return new Promise((resolve) => {
      try {
        const result = api.runtime.sendMessage(message, (response) => {
          void api.runtime.lastError;
          resolve(response);
        });
        if (result?.then) result.then(resolve).catch(() => resolve(undefined));
      } catch { resolve(undefined); }
    });
  }

  function storageGet(keys) {
    const storage = api.storage?.local;
    if (!storage) return runtimeMessage({ type: 'engineStorageGet', keys }).then((response) => response?.value ?? {});
    if (usesPromiseApi) return storage.get(keys).catch(() => ({}));
    return new Promise((resolve) => {
      try {
        const result = storage.get(keys, resolve);
        if (result?.then) result.then(resolve).catch(() => resolve({}));
      } catch { resolve({}); }
    });
  }

  function storageSet(value) {
    const storage = api.storage?.local;
    if (!storage) return runtimeMessage({ type: 'engineStorageSet', value }).then(() => undefined);
    if (usesPromiseApi) return storage.set(value).catch(() => undefined);
    return new Promise((resolve) => {
      try {
        const result = storage.set(value, resolve);
        if (result?.then) result.then(resolve).catch(resolve);
      } catch { resolve(); }
    });
  }

  async function loadState() {
    const stored = await storageGet(['goateqStateV2', 'goateqPresets']);
    if (stored.goateqStateV2) {
      const storedMastering = stored.goateqStateV2.mastering ?? {};
      const storedEffectChain = normalizeEffectChain(stored.goateqStateV2.effectChain);
      state = {
        ...defaults,
        ...stored.goateqStateV2,
        filters: stored.goateqStateV2.filters?.length >= minEqBands && stored.goateqStateV2.filters.length <= maxEqBands
          ? stored.goateqStateV2.filters
          : defaults.filters,
        effectChain: storedEffectChain ?? legacyMasteringToChain(storedMastering),
        mastering: Object.fromEntries(Object.entries(defaults.mastering).map(([module, settings]) => [
          module,
          { ...settings, ...(storedMastering[module] ?? {}) }
        ]))
      };
    } else {
      // One-time migration from the original EARS/goatEQ localStorage schema.
      try {
        const migratedFilters = defaults.filters.map((filter, index) => {
          const legacy = JSON.parse(localStorage.getItem(`filter${index}`));
          return legacy ? { ...filter, frequency: legacy.f, gain: legacy.g, q: legacy.q } : filter;
        });
        const legacyGain = JSON.parse(localStorage.getItem('GAIN'));
        state.filters = migratedFilters;
        if (Number.isFinite(legacyGain)) state.gain = legacyGain;
        const legacyPresets = JSON.parse(localStorage.getItem('PRESETS'));
        if (legacyPresets && typeof legacyPresets === 'object') presets = legacyPresets;
      } catch { /* Invalid legacy data is safely ignored. */ }
    }
    state.filters = state.filters.map((filter, index) => normalizeFilter(filter, index));
    for (const module of Object.keys(defaults.mastering)) {
      state.mastering[module] = normalizeMasteringPatch(module, state.mastering[module]);
    }
    state.effectChain = normalizeEffectChain(state.effectChain) ?? createSafeEffectChain();
    state.mastering = chainToLegacyMastering(state.effectChain);
    presets = stored.goateqPresets ?? presets;
  }

  function persist() {
    void storageSet({ goateqStateV2: state, goateqPresets: presets });
  }

  function createCurve(amount, ceiling = 1, softness = 0.65) {
    const length = 65536;
    const curve = new Float32Array(length);
    const drive = dbToGain(amount);
    const knee = 1 + (1 - softness) * 8;
    const normalizer = Math.tanh(knee);
    for (let index = 0; index < length; index += 1) {
      const x = index * 2 / (length - 1) - 1;
      curve[index] = Math.tanh(x * drive * knee) / normalizer * ceiling;
    }
    return curve;
  }

  function setAudioValue(parameter, value) {
    if (!context) return;
    parameter.cancelScheduledValues(context.currentTime);
    parameter.setTargetAtTime(value, context.currentTime, 0.01);
  }

  async function buildGraph() {
    context = new AudioContext({ latencyHint: 'interactive' });
    nodes = {};
    nodes.inputBus = context.createGain();
    nodes.beforeAnalyser = context.createAnalyser();
    nodes.beforeAnalyser.fftSize = 8192;
    nodes.beforeAnalyser.smoothingTimeConstant = 0.5;
    nodes.inputTrim = context.createGain();
    nodes.highpass = context.createBiquadFilter();
    nodes.eq = Array.from({ length: maxEqBands }, (_, index) => {
      const node = context.createBiquadFilter();
      node.type = defaults.filters[index]?.type ?? 'allpass';
      return node;
    });

    try {
      const workletUrl = typeof api.runtime.getURL === 'function'
        ? api.runtime.getURL('mastering-worklet.js')
        : new URL('mastering-worklet.js', globalThis.location.href).href;
      await context.audioWorklet.addModule(workletUrl);
      nodes.worklet = new AudioWorkletNode(context, 'goat-mastering-processor', { outputChannelCount: [2] });
      workletAvailable = true;
      nodes.worklet.port.onmessage = ({ data }) => {
        if (data?.type === 'meter') workletMeter = {
          inputPeak: gainToDb(data.inputPeak), outputPeak: gainToDb(data.outputPeak),
          inputPeakLeft: gainToDb(data.inputPeakLeft), inputPeakRight: gainToDb(data.inputPeakRight),
          outputPeakLeft: gainToDb(data.outputPeakLeft), outputPeakRight: gainToDb(data.outputPeakRight),
          inputRms: gainToDb(data.inputRms), outputRms: gainToDb(data.outputRms),
          inputRmsLeft: gainToDb(data.inputRmsLeft), inputRmsRight: gainToDb(data.inputRmsRight),
          outputRmsLeft: gainToDb(data.outputRmsLeft), outputRmsRight: gainToDb(data.outputRmsRight),
          clippedSamples: data.clippedSamples,
          gainReduction: Number.isFinite(data.gainReduction) ? data.gainReduction : 0
        };
      };
    } catch (error) {
      console.warn('goatEQ mastering worklet unavailable; using transparent fallback.', error);
      workletAvailable = false;
      nodes.worklet = context.createGain();
    }

    nodes.compDry = context.createGain();
    nodes.compressor = context.createDynamicsCompressor();
    nodes.compWet = context.createGain();
    nodes.compSum = context.createGain();
    nodes.makeup = context.createGain();
    nodes.saturationDry = context.createGain();
    nodes.saturation = context.createWaveShaper();
    nodes.saturationWet = context.createGain();
    nodes.saturationSum = context.createGain();
    nodes.clipper = context.createWaveShaper();
    nodes.limiter = context.createDynamicsCompressor();
    nodes.output = context.createGain();
    nodes.afterAnalyser = context.createAnalyser();
    nodes.afterAnalyser.fftSize = 8192;
    nodes.afterAnalyser.smoothingTimeConstant = 0.5;

    nodes.inputBus.connect(nodes.beforeAnalyser);
    let previous = nodes.inputBus;
    for (const filter of nodes.eq) { previous.connect(filter); previous = filter; }
    previous.connect(nodes.worklet);
    nodes.worklet.connect(nodes.output);
    nodes.output.connect(nodes.afterAnalyser);
    nodes.output.connect(context.destination);
    applyAllSettings();
    await context.suspend();
  }

  async function ensureInitialized() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        await loadState();
        await buildGraph();
        engineError = null;
      } catch (error) {
        engineError = error?.message ?? String(error);
        initPromise = null;
        throw error;
      }
    })();
    return initPromise;
  }

  function applyAllSettings() {
    if (!nodes) return;
    setAudioValue(nodes.inputTrim.gain, state.mastering.input.enabled ? dbToGain(state.mastering.input.trimDb) : 1);
    nodes.highpass.type = state.mastering.highpass.enabled ? 'highpass' : 'allpass';
    setAudioValue(nodes.highpass.frequency, clamp(state.mastering.highpass.frequency, 15, 180));
    setAudioValue(nodes.highpass.Q, clamp(state.mastering.highpass.q, 0.2, 11));
    nodes.eq.forEach((node, index) => {
      const filter = state.filters[index];
      if (!filter) {
        node.type = 'allpass';
        setAudioValue(node.frequency, 1000);
        setAudioValue(node.gain, 0);
        setAudioValue(node.Q, 0.7071);
        return;
      }
      node.type = filter.type;
      setAudioValue(node.frequency, clamp(filter.frequency, 5, 20000));
      setAudioValue(node.gain, clamp(filter.gain, -30, 30));
      setAudioValue(node.Q, clamp(filter.q, 0.2, 11));
    });
    const compressor = state.mastering.compressor;
    setAudioValue(nodes.compressor.threshold, compressor.enabled ? clamp(compressor.threshold, -48, 0) : 0);
    setAudioValue(nodes.compressor.knee, compressor.enabled ? clamp(compressor.knee, 0, 40) : 0);
    setAudioValue(nodes.compressor.ratio, compressor.enabled ? clamp(compressor.ratio, 1, 20) : 1);
    setAudioValue(nodes.compressor.attack, clamp(compressor.attack, 0.001, 1));
    setAudioValue(nodes.compressor.release, clamp(compressor.release, 0.02, 2));
    setAudioValue(nodes.compDry.gain, compressor.enabled ? 1 - clamp(compressor.mix, 0, 1) : 1);
    setAudioValue(nodes.compWet.gain, compressor.enabled ? clamp(compressor.mix, 0, 1) : 0);
    setAudioValue(nodes.makeup.gain, compressor.enabled ? dbToGain(compressor.makeupDb) : 1);
    const saturation = state.mastering.saturation;
    nodes.saturation.curve = saturation.enabled ? createCurve(saturation.drive, 1, 0.85) : null;
    nodes.saturation.oversample = '2x';
    setAudioValue(nodes.saturationDry.gain, saturation.enabled ? 1 - clamp(saturation.mix, 0, 1) : 1);
    setAudioValue(nodes.saturationWet.gain, saturation.enabled ? clamp(saturation.mix, 0, 1) : 0);
    const clipper = state.mastering.softClipper;
    nodes.clipper.curve = clipper.enabled ? createCurve(clipper.drive, dbToGain(clipper.ceilingDb), clipper.softness) : null;
    nodes.clipper.oversample = ['none', '2x', '4x'].includes(clipper.oversample) ? clipper.oversample : '4x';
    const limiter = state.mastering.limiter;
    setAudioValue(nodes.limiter.threshold, limiter.enabled ? clamp(limiter.threshold, -12, 0) : 0);
    setAudioValue(nodes.limiter.knee, limiter.enabled ? 0 : 40);
    setAudioValue(nodes.limiter.ratio, limiter.enabled ? 20 : 1);
    setAudioValue(nodes.limiter.attack, limiter.enabled ? 0.003 : 0.1);
    setAudioValue(nodes.limiter.release, clamp(limiter.release, 0.02, 1));
    setAudioValue(nodes.output.gain, clamp(state.gain, 0.001, 16));
    nodes.worklet.port?.postMessage({
      type: 'chain',
      chain: state.effectChain
    });
  }

  async function activeTab() {
    if (api.tabs?.query) {
      try {
        const result = api.tabs.query({ active: true, currentWindow: true });
        if (result?.then) return (await result)[0] ?? null;
        return await new Promise((resolve) => api.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] ?? null)));
      } catch { return null; }
    }
    return await new Promise((resolve) => api.runtime.sendMessage({ type: 'getActiveTab' }, (response) => resolve(response?.tab ?? null)));
  }

  async function status() {
    await ensureInitialized();
    const tab = await activeTab();
    const activeStream = tab ? streams.get(tab.id) : null;
    const audioTrack = activeStream?.stream?.getAudioTracks?.()[0] ?? null;
    const processing = Boolean(activeStream && audioTrack?.readyState === 'live' && context.state === 'running');
    return {
      type: 'sendWorkspaceStatus',
      engineSessionId,
      eqFilters: state.filters,
      gain: state.gain,
      filterRevision: revisions.filters,
      gainRevision: revisions.gain,
      masteringRevision: revisions.mastering,
      mastering: state.mastering,
      effectChain: state.effectChain,
      presets,
      streams: Array.from(streams.values(), ({ tab: streamTab }) => streamTab),
      streaming: processing,
      processing,
      captureCapability,
      activeTab: tab,
      sampleRate: context.sampleRate,
      audioContextState: context.state,
      audioTrackState: audioTrack?.readyState ?? 'none',
      workletAvailable,
      dspReady: Boolean(nodes?.eq?.length === maxEqBands && nodes.worklet && nodes.output && nodes.afterAnalyser),
      engineError,
      meter: currentMeter()
    };
  }

  async function broadcastStatus() {
    const message = await status();
    try {
      if (usesPromiseApi) void api.runtime.sendMessage(message).catch(() => undefined);
      else api.runtime.sendMessage(message, () => void api.runtime.lastError);
    } catch { /* Popup can be closed. */ }
  }

  function currentMeter() {
    return { ...workletMeter };
  }

  async function attachStream(stream, tab) {
    await ensureInitialized();
    const audioTrack = stream.getAudioTracks?.()[0];
    if (!audioTrack || audioTrack.readyState !== 'live') {
      stream.getTracks?.().forEach((track) => track.stop());
      throw new Error('The captured tab did not provide a live audio track. Start playback and try again.');
    }
    if (streams.has(tab.id)) disconnectTab(tab.id);
    const source = context.createMediaStreamSource(stream);
    source.connect(nodes.inputBus);
    streams.set(tab.id, { stream, tab, source });
    stream.getTracks().forEach((track) => track.addEventListener('ended', () => disconnectTab(tab.id)));
    await context.resume();
    if (context.state !== 'running') {
      disconnectTab(tab.id);
      throw new Error(`The Web Audio context is ${context.state}; processing could not start.`);
    }
    engineError = null;
    await broadcastStatus();
  }

  function disconnectTab(tabId) {
    const item = streams.get(tabId);
    if (!item) return;
    try { item.source.disconnect(); } catch { /* already disconnected */ }
    item.stream.getTracks().forEach((track) => track.stop());
    streams.delete(tabId);
    if (!streams.size) void context.suspend();
    void broadcastStatus();
  }

  async function captureChromium(message) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId } },
        video: false
      });
      await attachStream(stream, message.tab);
    } catch (error) {
      engineError = error?.message ?? String(error);
      throw error;
    }
  }

  function getFFT() {
    const before = new Float32Array(nodes.beforeAnalyser.frequencyBinCount);
    const after = new Float32Array(nodes.afterAnalyser.frequencyBinCount);
    const waveformBefore = new Float32Array(nodes.beforeAnalyser.fftSize);
    const waveformAfter = new Float32Array(nodes.afterAnalyser.fftSize);
    nodes.beforeAnalyser.getFloatFrequencyData(before);
    nodes.afterAnalyser.getFloatFrequencyData(after);
    nodes.beforeAnalyser.getFloatTimeDomainData(waveformBefore);
    nodes.afterAnalyser.getFloatTimeDomainData(waveformAfter);
    return {
      type: 'fft',
      fft: Array.from(after),
      fftBefore: Array.from(before),
      waveform: downsampleWaveform(waveformAfter),
      waveformBefore: downsampleWaveform(waveformBefore),
      sampleRate: context.sampleRate,
      meter: currentMeter()
    };
  }

  async function handle(message) {
    await ensureInitialized();
    switch (message.type) {
      case 'initPopup': return { ready: true };
      case 'getWorkspaceStatus':
      case 'getFullRefresh': return status();
      case 'getCurrentTabStatus': {
        const tab = await activeTab();
        const activeStream = tab ? streams.get(tab.id) : null;
        const audioTrack = activeStream?.stream?.getAudioTracks?.()[0] ?? null;
        const processing = Boolean(activeStream && audioTrack?.readyState === 'live' && context.state === 'running');
        return {
          type: 'sendCurrentTabStatus',
          streaming: processing,
          processing,
          captureCapability,
          activeTab: tab,
          audioContextState: context.state,
          audioTrackState: audioTrack?.readyState ?? 'none',
          engineError
        };
      }
      case 'getFFT': return getFFT();
      case 'getPresetsForExport': return { presets };
      case 'modifyFilter': {
        const index = clamp(message.index, 0, state.filters.length - 1);
        if (!acceptRevision('filters', message)) return { ok: true, stale: true, filterRevision: revisions.filters };
        state.filters[index] = normalizeFilter(message, index);
        applyAllSettings(); persist();
        return { ok: true, filterRevision: revisions.filters, filter: state.filters[index] };
      }
      case 'replaceFilters': {
        if (!Array.isArray(message.filters) || message.filters.length < minEqBands || message.filters.length > maxEqBands) return { error: 'Invalid EQ filter set.' };
        if (!acceptRevision('filters', message)) return { ok: true, stale: true, filterRevision: revisions.filters };
        state.filters = message.filters.map(normalizeFilter);
        applyAllSettings(); persist(); return status();
      }
      case 'modifyGain': {
        if (!acceptRevision('gain', message)) return { ok: true, stale: true, gainRevision: revisions.gain };
        state.gain = clamp(message.gain, 0.00316, 10); applyAllSettings(); persist();
        return { ok: true, gainRevision: revisions.gain, gain: state.gain };
      }
      case 'resetFilter': {
        if (!acceptRevision('filters', message)) return status();
        const index = clamp(message.index, 0, state.filters.length - 1);
        state.filters[index] = defaults.filters[index]
          ? { ...defaults.filters[index] }
          : { ...state.filters[index], gain: 0, q: 0.7071 };
        applyAllSettings(); persist(); return status();
      }
      case 'resetFilters': {
        if (acceptRevision('filters', message)) state.filters = defaults.filters.map((filter) => ({ ...filter }));
        const gainMessage = { revision: message.gainRevision };
        if (acceptRevision('gain', gainMessage)) state.gain = 1;
        applyAllSettings(); persist(); return status();
      }
      case 'preset': {
        if (!acceptRevision('filters', message)) return status();
        const preset = message.preset === 'bassBoost'
          ? { frequencies: frequencies.map((frequency, index) => index === 0 ? 340 : frequency), gains: frequencies.map((_, index) => index === 0 ? 5 : 0), qs: frequencies.map(() => 0.7071) }
          : normalizePreset(presets[message.preset]);
        if (preset) state.filters = preset.frequencies.map((frequency, index) => normalizeFilter({
          frequency,
          gain: preset.gains[index],
          q: preset.qs[index],
          type: preset.types?.[index] ?? (index === 0 ? 'lowshelf' : index === preset.frequencies.length - 1 ? 'highshelf' : 'peaking')
        }, index));
        applyAllSettings(); persist(); return status();
      }
      case 'savePreset': presets[message.preset] = { frequencies: state.filters.map((filter) => filter.frequency), gains: state.filters.map((filter) => filter.gain), qs: state.filters.map((filter) => filter.q), types: state.filters.map((filter) => filter.type) }; persist(); return status();
      case 'deletePreset': delete presets[message.preset]; persist(); return status();
      case 'importPresets': {
        const imported = {};
        for (const [name, value] of Object.entries(message.presets ?? {})) {
          const preset = normalizePreset(value);
          if (preset) imported[String(name).trim().slice(0, 80)] = preset;
        }
        presets = { ...presets, ...imported };
        persist();
        return status();
      }
      case 'updateMastering': {
        if (!acceptRevision('mastering', message)) return status();
        const normalized = normalizeMasteringPatch(message.module, message.patch);
        if (!normalized) return { error: 'Unknown mastering module.' };
        state.mastering[message.module] = normalized;
        const existingIndex = state.effectChain.findIndex((effect) => effect.type === message.module);
        const { enabled, ...settings } = normalized;
        if (existingIndex >= 0) {
          state.effectChain[existingIndex] = {
            ...state.effectChain[existingIndex],
            enabled,
            settings: normalizeEffectSettings(message.module, settings)
          };
        } else if (effectDefaults[message.module] && state.effectChain.length < maxEffects) {
          state.effectChain.push({
            id: `legacy-added-${Date.now()}-${message.module}`,
            type: message.module,
            enabled,
            settings: normalizeEffectSettings(message.module, settings)
          });
        }
        applyAllSettings(); persist(); return status();
      }
      case 'replaceEffectChain': {
        if (!acceptRevision('mastering', message)) return status();
        const chain = normalizeEffectChain(message.effectChain);
        if (!chain) return { error: 'Invalid mastering effect chain.' };
        state.effectChain = chain;
        state.mastering = chainToLegacyMastering(chain);
        applyAllSettings(); persist(); return status();
      }
      case 'replaceMastering': {
        if (!message.mastering || typeof message.mastering !== 'object') return { error: 'Invalid mastering state.' };
        if (!acceptRevision('mastering', message)) return status();
        for (const module of Object.keys(defaults.mastering)) {
          const normalized = normalizeMasteringPatch(module, message.mastering[module]);
          if (normalized) state.mastering[module] = normalized;
        }
        state.effectChain = legacyMasteringToChain(state.mastering);
        applyAllSettings(); persist(); return status();
      }
      case 'resetMastering': {
        if (!acceptRevision('mastering', message)) return status();
        state.effectChain = createSafeEffectChain();
        state.mastering = chainToLegacyMastering(state.effectChain);
        applyAllSettings(); persist(); return status();
      }
      case 'disconnectTab': disconnectTab(message.tab.id); return { ok: true };
      case 'startCaptureOffscreen':
        await captureChromium(message);
        return { ok: true, processing: true, audioContextState: context.state, workletAvailable };
      case 'stopCaptureOffscreen': {
        if (message.tab?.id) disconnectTab(message.tab.id);
        else { const tab = await activeTab(); if (tab) disconnectTab(tab.id); }
        return { ok: true, processing: false };
      }
      case 'eqTab':
        if (!isFirefox) return undefined;
        if (!message.on) {
          const tab = await activeTab();
          if (tab) disconnectTab(tab.id);
          return { ok: true, processing: false, captureCapability };
        }
        return { ok: false, processing: false, captureCapability, error: firefoxCaptureError };
      default: return undefined;
    }
  }

  api.runtime.onMessage.addListener((message) => {
    // runtime.sendMessage is broadcast to every extension context, including
    // the sender. Never claim service-worker/storage messages here: returning
    // true without eventually calling sendResponse produces Chrome's
    // "message channel closed" error and looks like an unavailable engine.
    if (!engineMessageTypes.has(message?.type)) return false;
    if (!isFirefox && message.target !== 'offscreen') return false;
    if (isFirefox && message.target && message.target !== 'offscreen') return false;
    if (!isFirefox && (message.type === 'initPopup' || message.type === 'eqTab')) return false;
    return handle(message).catch((error) => {
      console.error('goatEQ audio engine error', error);
      return { error: error.message ?? String(error) };
    });
  });

  void ensureInitialized();
}());
