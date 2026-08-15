import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cloneDefaults, createAdditionalFilter, DEFAULT_FILTERS, MAX_EQ_BANDS, MIN_EQ_BANDS
} from '../audio/constants.js';
import {
  CHAIN_PRESETS, cloneEffectChain, createDefaultEffectChain, createEffectInstance, MAX_EFFECTS
} from '../audio/effects.js';
import { normalizePreset, normalizePresetCollection } from '../audio/presets.js';

const NOOP = () => undefined;

function getRuntime() {
  const candidate = [globalThis.chrome?.runtime, globalThis.browser?.runtime].find(
    (runtime) => typeof runtime?.sendMessage === 'function'
  );
  return candidate ?? null;
}

function sendMessage(message) {
  const runtime = getRuntime();
  if (!runtime) return Promise.resolve(null);
  if (runtime === globalThis.browser?.runtime && runtime !== globalThis.chrome?.runtime) {
    try { return runtime.sendMessage(message).then((response) => response ?? null).catch(() => null); }
    catch { return Promise.resolve(null); }
  }
  return new Promise((resolve) => {
    try {
      const maybePromise = runtime.sendMessage(message, (response) => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          resolve({ error: lastError.message || String(lastError) });
          return;
        }
        resolve(response ?? null);
      });
      if (maybePromise?.then) maybePromise.then(resolve).catch(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function sendEngineMessage(message) {
  if (globalThis.location?.protocol === 'moz-extension:') {
    return sendMessage({ ...message, target: 'offscreen' });
  }
  return sendMessage({ type: 'engineCommand', target: 'service-worker', command: message });
}

function normalizeWorkspace(message, previous) {
  const defaults = cloneDefaults();
  return {
    filters: Array.isArray(message?.eqFilters)
      && message.eqFilters.length >= MIN_EQ_BANDS
      && message.eqFilters.length <= MAX_EQ_BANDS
      ? message.eqFilters.map((filter, index) => ({ ...filter, index }))
      : previous.filters,
    gain: Number.isFinite(message?.gain) ? message.gain : previous.gain,
    streams: Array.isArray(message?.streams) ? message.streams : previous.streams,
    activeTab: Object.prototype.hasOwnProperty.call(message ?? {}, 'activeTab')
      ? (message.activeTab && typeof message.activeTab === 'object' ? message.activeTab : null)
      : previous.activeTab,
    presets: message?.presets && typeof message.presets === 'object' ? message.presets : previous.presets,
    mastering: message?.mastering && typeof message.mastering === 'object'
      ? { ...defaults.mastering, ...message.mastering }
      : previous.mastering,
    effectChain: Array.isArray(message?.effectChain)
      && message.effectChain.length >= 1
      && message.effectChain.length <= MAX_EFFECTS
      ? cloneEffectChain(message.effectChain)
      : previous.effectChain,
    meter: message?.meter && typeof message.meter === 'object' ? message.meter : previous.meter,
    audioContextState: typeof message?.audioContextState === 'string' ? message.audioContextState : previous.audioContextState,
    audioTrackState: typeof message?.audioTrackState === 'string' ? message.audioTrackState : previous.audioTrackState,
    workletAvailable: typeof message?.workletAvailable === 'boolean' ? message.workletAvailable : previous.workletAvailable,
    dspReady: typeof message?.dspReady === 'boolean' ? message.dspReady : previous.dspReady,
    captureCapability: typeof message?.captureCapability === 'string' ? message.captureCapability : previous.captureCapability,
    engineError: Object.prototype.hasOwnProperty.call(message ?? {}, 'engineError') ? message.engineError : previous.engineError
  };
}

function createDemoSpectrum(phase, before = false) {
  return Array.from({ length: 4096 }, (_, index) => {
    const normalized = index / 4096;
    const rolloff = -30 - normalized * 68;
    const bass = 22 * Math.exp(-Math.pow((normalized - 0.02) / 0.025, 2));
    const presence = 8 * Math.exp(-Math.pow((normalized - 0.18) / 0.09, 2));
    const movement = Math.sin(index * 0.08 + phase) * 2.5;
    return rolloff + bass + presence + movement + (before ? -4 : 0);
  });
}

function createDemoWaveform(phase, before = false) {
  const level = before ? 0.52 : 0.38;
  return Array.from({ length: 1024 }, (_, index) => {
    const x = index / 1024;
    const envelope = 0.42 + 0.58 * Math.sin(x * Math.PI) ** 0.4;
    return level * envelope * (
      Math.sin(index * 0.19 + phase) * 0.62
      + Math.sin(index * 0.071 + phase * 0.7) * 0.25
      + Math.sin(index * 0.41 + phase * 1.4) * 0.13
    );
  });
}

export function useAudioEngine(preferences = {}) {
  const runtime = getRuntime();
  const demoMode = !runtime;
  const autoCapture = preferences.autoCapture !== false;
  const monitoringFps = [15, 24, 30].includes(preferences.monitoringFps) ? preferences.monitoringFps : 24;
  const [workspace, setWorkspace] = useState(() => {
    const defaults = cloneDefaults();
    return {
      filters: defaults.filters,
      gain: 1,
      streams: [],
      activeTab: demoMode ? { id: 1, title: 'YouTube · Music Mix', url: 'https://youtube.com' } : null,
      presets: {},
      mastering: defaults.mastering,
      effectChain: createDefaultEffectChain(),
      meter: demoMode ? {
        ...defaults.meter,
        inputPeak: -7.8, outputPeak: -3.2,
        inputPeakLeft: -7.8, inputPeakRight: -8.4,
        outputPeakLeft: -3.2, outputPeakRight: -3.6,
        inputRms: -17.6, outputRms: -13.8,
        gainReduction: -4.6
      } : defaults.meter,
      audioContextState: demoMode ? 'running' : 'unknown',
      audioTrackState: demoMode ? 'live' : 'none',
      workletAvailable: demoMode,
      dspReady: demoMode,
      captureCapability: demoMode ? 'demo' : (globalThis.location?.protocol === 'moz-extension:' ? 'unsupported-firefox-tab-audio' : 'chromium-tab-capture'),
      engineError: null
    };
  });
  const [fftData, setFftData] = useState([]);
  const [fftBeforeData, setFftBeforeData] = useState([]);
  const [waveformData, setWaveformData] = useState([]);
  const [waveformBeforeData, setWaveformBeforeData] = useState([]);
  const [sampleRate, setSampleRate] = useState(44100);
  const [isEQingTab, setIsEQingTab] = useState(demoMode);
  const [visualizerEnabled, setVisualizerEnabled] = useState(() => localStorage.getItem('SHOW_VISUALIZER') !== 'false');
  const [notice, setNotice] = useState('');
  const filterRef = useRef(workspace.filters);
  const masteringRef = useRef(workspace.mastering);
  const effectChainRef = useRef(workspace.effectChain);
  const filterRevisionRef = useRef(0);
  const masteringRevisionRef = useRef(0);
  const gainRevisionRef = useRef(0);
  const engineSessionRef = useRef(null);
  const lastEngineNoticeRef = useRef({ text: '', at: 0 });

  useEffect(() => {
    filterRef.current = workspace.filters;
  }, [workspace.filters]);

  useEffect(() => {
    masteringRef.current = workspace.mastering;
  }, [workspace.mastering]);

  useEffect(() => {
    effectChainRef.current = workspace.effectChain;
  }, [workspace.effectChain]);

  const showNotice = useCallback((text) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 3500);
  }, []);

  const dispatchEngineControl = useCallback((message) => {
    void sendEngineMessage(message).then((response) => {
      const error = response?.error || (!response ? 'Audio engine unavailable. Restart processing for this tab.' : '');
      if (!error) return;
      const now = Date.now();
      if (lastEngineNoticeRef.current.text !== error || now - lastEngineNoticeRef.current.at > 3000) {
        lastEngineNoticeRef.current = { text: error, at: now };
        showNotice(error);
      }
    });
  }, [showNotice]);

  const applyStatus = useCallback((message) => {
    const status = { ...message };
    if (typeof message?.engineSessionId === 'string' && message.engineSessionId !== engineSessionRef.current) {
      engineSessionRef.current = message.engineSessionId;
      filterRevisionRef.current = message.filterRevision ?? 0;
      masteringRevisionRef.current = message.masteringRevision ?? 0;
      gainRevisionRef.current = message.gainRevision ?? 0;
    }
    if (Number.isSafeInteger(message?.filterRevision)) {
      if (message.filterRevision < filterRevisionRef.current) delete status.eqFilters;
      else filterRevisionRef.current = message.filterRevision;
    }
    if (Number.isSafeInteger(message?.masteringRevision)) {
      if (message.masteringRevision < masteringRevisionRef.current) {
        delete status.mastering;
        delete status.effectChain;
      }
      else masteringRevisionRef.current = message.masteringRevision;
    }
    if (Number.isSafeInteger(message?.gainRevision)) {
      if (message.gainRevision < gainRevisionRef.current) delete status.gain;
      else gainRevisionRef.current = message.gainRevision;
    }
    setWorkspace((previous) => normalizeWorkspace(status, previous));
    if (typeof (message?.processing ?? message?.streaming) === 'boolean') setIsEQingTab(message.processing ?? message.streaming);
    if (Number.isFinite(message?.sampleRate ?? message?.Fs)) setSampleRate(message.sampleRate ?? message.Fs);
  }, []);

  const refresh = useCallback(async () => {
    if (demoMode) return;
    const response = await sendEngineMessage({ type: 'getFullRefresh' });
    if (response) applyStatus(response);
  }, [applyStatus, demoMode]);

  useEffect(() => {
    if (demoMode) return NOOP;
    const handleMessage = (message) => {
      if (message?.type === 'sendWorkspaceStatus' || message?.type === 'sendCurrentTabStatus' || message?.type === 'sendSampleRate') {
        applyStatus(message);
      }
      if (message?.type === 'sendPresets') setWorkspace((previous) => ({ ...previous, presets: message.presets ?? {} }));
      if (message?.type === 'meter') setWorkspace((previous) => ({ ...previous, meter: message.meter ?? previous.meter }));
    };
    runtime.onMessage.addListener(handleMessage);
    void (async () => {
      await sendMessage({ type: 'initPopup' });
      const status = await sendEngineMessage({ type: 'getFullRefresh' });
      if (status) applyStatus(status);
      if (autoCapture && !status?.streaming && status?.captureCapability !== 'unsupported-firefox-tab-audio') {
        const response = await sendMessage({ type: 'eqTab', on: true });
        if (response?.error) showNotice(response.error);
        else if (response?.ok && response.processing === true) setIsEQingTab(true);
        window.setTimeout(refresh, 250);
      }
    })();
    return () => runtime.onMessage.removeListener(handleMessage);
  }, [applyStatus, autoCapture, demoMode, refresh, runtime, showNotice]);

  useEffect(() => {
    if (!visualizerEnabled) return NOOP;
    let active = true;
    let timer = 0;
    let phase = 0;
    const tick = async () => {
      if (!active) return;
      if (demoMode) {
        phase += 0.08;
        setFftData(createDemoSpectrum(phase));
        setFftBeforeData(createDemoSpectrum(phase + 0.4, true));
        setWaveformData(createDemoWaveform(phase));
        setWaveformBeforeData(createDemoWaveform(phase + 0.55, true));
        const movement = Math.sin(phase * 1.7) * 1.8;
        setWorkspace((previous) => ({
          ...previous,
          meter: {
            ...previous.meter,
            inputPeak: -8 + movement,
            outputPeak: -3.6 + movement * 0.5,
            inputPeakLeft: -7.8 + movement,
            inputPeakRight: -8.5 + movement * 0.8,
            outputPeakLeft: -3.2 + movement * 0.5,
            outputPeakRight: -3.8 + movement * 0.45,
            inputRms: -18 + movement * 0.4,
            outputRms: -14 + movement * 0.3,
            gainReduction: -4.6 + Math.sin(phase) * 0.8
          }
        }));
      } else {
        const response = await sendEngineMessage({ type: 'getFFT' });
        if (active && response) {
          setFftData(response.fft ?? []);
          setFftBeforeData(response.fftBefore ?? []);
          setWaveformData(response.waveform ?? []);
          setWaveformBeforeData(response.waveformBefore ?? []);
          if (Number.isFinite(response.sampleRate)) setSampleRate(response.sampleRate);
          if (response.meter) setWorkspace((previous) => ({ ...previous, meter: response.meter }));
        }
      }
      timer = window.setTimeout(tick, 1000 / monitoringFps);
    };
    void tick();
    return () => { active = false; window.clearTimeout(timer); };
  }, [demoMode, monitoringFps, visualizerEnabled]);

  useEffect(() => {
    if (demoMode) return NOOP;
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [demoMode, refresh]);

  const updateFilter = useCallback((index, updates) => {
    const current = filterRef.current[index] ?? DEFAULT_FILTERS[index];
    const nextFilter = { ...current, ...updates, index };
    const nextFilters = filterRef.current.map((filter, filterIndex) => filterIndex === index ? nextFilter : filter);
    const revision = filterRevisionRef.current + 1;
    filterRef.current = nextFilters;
    filterRevisionRef.current = revision;
    setWorkspace((previous) => ({ ...previous, filters: nextFilters }));
    dispatchEngineControl({ type: 'modifyFilter', index, ...nextFilter, revision });
  }, [dispatchEngineControl]);

  const commitFilter = useCallback((index) => {
    const filter = filterRef.current[index] ?? DEFAULT_FILTERS[index];
    const revision = filterRevisionRef.current + 1;
    filterRevisionRef.current = revision;
    dispatchEngineControl({ type: 'modifyFilter', index, ...filter, revision });
  }, [dispatchEngineControl]);

  const updateGain = useCallback((gain) => {
    const revision = gainRevisionRef.current + 1;
    gainRevisionRef.current = revision;
    setWorkspace((previous) => ({ ...previous, gain }));
    dispatchEngineControl({ type: 'modifyGain', gain, revision });
  }, [dispatchEngineControl]);

  const commitGain = useCallback(() => {
    const revision = gainRevisionRef.current + 1;
    gainRevisionRef.current = revision;
    dispatchEngineControl({ type: 'modifyGain', gain: workspace.gain, revision });
  }, [dispatchEngineControl, workspace.gain]);

  const resetFilter = useCallback((index) => {
    const nextFilters = filterRef.current.map((filter, filterIndex) => filterIndex === index ? { ...DEFAULT_FILTERS[index] } : filter);
    const revision = filterRevisionRef.current + 1;
    filterRef.current = nextFilters;
    filterRevisionRef.current = revision;
    setWorkspace((previous) => ({ ...previous, filters: nextFilters }));
    dispatchEngineControl({ type: 'resetFilter', index, revision });
  }, [dispatchEngineControl]);

  const resetFilters = useCallback(() => {
    const filters = DEFAULT_FILTERS.map((filter) => ({ ...filter }));
    const filterRevision = filterRevisionRef.current + 1;
    const gainRevision = gainRevisionRef.current + 1;
    filterRef.current = filters;
    filterRevisionRef.current = filterRevision;
    gainRevisionRef.current = gainRevision;
    setWorkspace((previous) => ({ ...previous, filters, gain: 1 }));
    dispatchEngineControl({ type: 'resetFilters', revision: filterRevision, gainRevision });
  }, [dispatchEngineControl]);

  const addFilter = useCallback(() => {
    if (filterRef.current.length >= MAX_EQ_BANDS) return;
    const filter = createAdditionalFilter(filterRef.current);
    const filters = [...filterRef.current, filter];
    const revision = filterRevisionRef.current + 1;
    filterRef.current = filters;
    filterRevisionRef.current = revision;
    setWorkspace((previous) => ({ ...previous, filters }));
    dispatchEngineControl({ type: 'replaceFilters', filters, revision });
  }, [dispatchEngineControl]);

  const removeFilter = useCallback(() => {
    if (filterRef.current.length <= MIN_EQ_BANDS) return;
    const filters = filterRef.current.slice(0, -1).map((filter, index) => ({ ...filter, index }));
    const revision = filterRevisionRef.current + 1;
    filterRef.current = filters;
    filterRevisionRef.current = revision;
    setWorkspace((previous) => ({ ...previous, filters }));
    dispatchEngineControl({ type: 'replaceFilters', filters, revision });
  }, [dispatchEngineControl]);

  const loadPreset = useCallback((preset) => {
    let filters = filterRef.current;
    if (preset === 'bassBoost') {
      filters = DEFAULT_FILTERS.map((filter, index) => index === 0 ? { ...filter, frequency: 340, gain: 5 } : { ...filter });
    } else if (workspace.presets[preset]) {
      const data = normalizePreset(workspace.presets[preset]);
      if (!data) return;
      filters = data.frequencies.map((frequency, index) => ({
        index,
        frequency,
        gain: data.gains[index],
        q: data.qs[index],
        type: data.types?.[index] ?? (index === 0 ? 'lowshelf' : index === data.frequencies.length - 1 ? 'highshelf' : 'peaking')
      }));
    }
    const revision = filterRevisionRef.current + 1;
    filterRef.current = filters;
    filterRevisionRef.current = revision;
    setWorkspace((previous) => ({ ...previous, filters }));
    dispatchEngineControl({ type: 'preset', preset, revision });
  }, [dispatchEngineControl, workspace.presets]);

  const savePreset = useCallback((name) => {
    const preset = {
      frequencies: workspace.filters.map(({ frequency }) => frequency),
      gains: workspace.filters.map(({ gain }) => gain),
      qs: workspace.filters.map(({ q }) => q),
      types: workspace.filters.map(({ type }) => type)
    };
    setWorkspace((previous) => ({ ...previous, presets: { ...previous.presets, [name]: preset } }));
    dispatchEngineControl({ type: 'savePreset', preset: name });
    showNotice(`Preset “${name}” saved`);
  }, [dispatchEngineControl, showNotice, workspace.filters]);

  const deletePreset = useCallback((name) => {
    setWorkspace((previous) => {
      const presets = { ...previous.presets };
      delete presets[name];
      return { ...previous, presets };
    });
    dispatchEngineControl({ type: 'deletePreset', preset: name });
  }, [dispatchEngineControl]);

  const exportPresets = useCallback(() => {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([JSON.stringify(workspace.presets, null, 2)], { type: 'application/json' }));
    anchor.download = 'goatEQ_Presets.json';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }, [workspace.presets]);

  const importPresets = useCallback((presets) => {
    const normalized = normalizePresetCollection(presets);
    const count = Object.keys(normalized).length;
    if (!count) throw new Error('Invalid preset file');
    setWorkspace((previous) => ({ ...previous, presets: { ...previous.presets, ...normalized } }));
    dispatchEngineControl({ type: 'importPresets', presets: normalized });
    showNotice(`${count} preset(s) imported`);
  }, [dispatchEngineControl, showNotice]);

  const updateMastering = useCallback((module, patch) => {
    const nextMastering = {
      ...masteringRef.current,
      [module]: { ...masteringRef.current[module], ...patch }
    };
    const revision = masteringRevisionRef.current + 1;
    masteringRef.current = nextMastering;
    masteringRevisionRef.current = revision;
    setWorkspace((previous) => ({ ...previous, mastering: nextMastering }));
    dispatchEngineControl({ type: 'updateMastering', module, patch, revision });
  }, [dispatchEngineControl]);

  const replaceEffectChain = useCallback((effectChain) => {
    if (!Array.isArray(effectChain) || effectChain.length < 1 || effectChain.length > MAX_EFFECTS) return;
    const chain = cloneEffectChain(effectChain);
    const revision = masteringRevisionRef.current + 1;
    effectChainRef.current = chain;
    masteringRevisionRef.current = revision;
    setWorkspace((previous) => ({ ...previous, effectChain: chain }));
    dispatchEngineControl({ type: 'replaceEffectChain', effectChain: chain, revision });
  }, [dispatchEngineControl]);

  const updateEffect = useCallback((id, patch) => {
    const { enabled, settings, ...settingPatch } = patch;
    const chain = effectChainRef.current.map((effect) => effect.id === id ? {
      ...effect,
      enabled: typeof enabled === 'boolean' ? enabled : effect.enabled,
      settings: { ...effect.settings, ...(settings ?? settingPatch) }
    } : effect);
    replaceEffectChain(chain);
  }, [replaceEffectChain]);

  const toggleEffect = useCallback((id) => {
    const effect = effectChainRef.current.find((item) => item.id === id);
    if (effect) updateEffect(id, { enabled: !effect.enabled });
  }, [updateEffect]);

  const addEffect = useCallback((type) => {
    if (effectChainRef.current.length >= MAX_EFFECTS) return;
    const effect = createEffectInstance(type);
    if (effect) replaceEffectChain([...effectChainRef.current, effect]);
  }, [replaceEffectChain]);

  const removeEffect = useCallback((id) => {
    if (effectChainRef.current.length <= 1) return;
    replaceEffectChain(effectChainRef.current.filter((effect) => effect.id !== id));
  }, [replaceEffectChain]);

  const moveEffect = useCallback((id, direction) => {
    const chain = cloneEffectChain(effectChainRef.current);
    const index = chain.findIndex((effect) => effect.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= chain.length) return;
    [chain[index], chain[target]] = [chain[target], chain[index]];
    replaceEffectChain(chain);
  }, [replaceEffectChain]);

  const loadChainPreset = useCallback((name) => {
    const factory = CHAIN_PRESETS[name];
    if (!factory) return;
    replaceEffectChain(factory());
    showNotice(`Chain preset “${name}” loaded`);
  }, [replaceEffectChain, showNotice]);

  const resetMastering = useCallback(() => {
    replaceEffectChain(createDefaultEffectChain());
  }, [replaceEffectChain]);

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    const filters = snapshot.filters.map((filter, index) => ({ ...filter, index }));
    const mastering = structuredClone(snapshot.mastering ?? masteringRef.current);
    const effectChain = cloneEffectChain(snapshot.effectChain ?? effectChainRef.current);
    const filterRevision = filterRevisionRef.current + 1;
    const masteringRevision = masteringRevisionRef.current + 1;
    const gainRevision = gainRevisionRef.current + 1;
    filterRef.current = filters;
    masteringRef.current = mastering;
    effectChainRef.current = effectChain;
    filterRevisionRef.current = filterRevision;
    masteringRevisionRef.current = masteringRevision;
    gainRevisionRef.current = gainRevision;
    setWorkspace((previous) => ({
      ...previous,
      filters,
      gain: snapshot.gain,
      mastering,
      effectChain
    }));
    dispatchEngineControl({ type: 'replaceFilters', filters, revision: filterRevision });
    dispatchEngineControl({ type: 'modifyGain', gain: snapshot.gain, revision: gainRevision });
    dispatchEngineControl({ type: 'replaceEffectChain', effectChain, revision: masteringRevision });
  }, [dispatchEngineControl]);

  const toggleEqTab = useCallback(async () => {
    if (demoMode) {
      setIsEQingTab((value) => !value);
      return;
    }
    if (workspace.captureCapability === 'unsupported-firefox-tab-audio') {
      showNotice('Firefox bietet aktuell keine unterstützte Tab-Audio-Capture-API. Vollständige Verarbeitung ist in Chrome verfügbar.');
      return;
    }
    const next = !isEQingTab;
    const response = await sendMessage({ type: 'eqTab', on: next });
    if (response?.error) showNotice(response.error);
    else if (response?.ok) setIsEQingTab(typeof response.processing === 'boolean' ? response.processing : next);
    window.setTimeout(refresh, 250);
  }, [demoMode, isEQingTab, refresh, showNotice, workspace.captureCapability]);

  const disconnectTab = useCallback((tab) => {
    setWorkspace((previous) => ({ ...previous, streams: previous.streams.filter(({ id }) => id !== tab.id) }));
    dispatchEngineControl({ type: 'disconnectTab', tab });
  }, [dispatchEngineControl]);

  const toggleVisualizer = useCallback(() => {
    setVisualizerEnabled((value) => {
      localStorage.setItem('SHOW_VISUALIZER', String(!value));
      return !value;
    });
  }, []);

  const openFullWindow = useCallback(() => {
    const url = runtime?.getURL ? runtime.getURL('index.html') : window.location.href;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [runtime]);

  return {
    ...workspace,
    fftData,
    fftBeforeData,
    waveformData,
    waveformBeforeData,
    sampleRate,
    isEQingTab,
    visualizerEnabled,
    notice,
    demoMode,
    updateFilter,
    commitFilter,
    updateGain,
    commitGain,
    resetFilter,
    resetFilters,
    addFilter,
    removeFilter,
    loadPreset,
    savePreset,
    deletePreset,
    exportPresets,
    importPresets,
    updateMastering,
    replaceEffectChain,
    updateEffect,
    toggleEffect,
    addEffect,
    removeEffect,
    moveEffect,
    loadChainPreset,
    resetMastering,
    applySnapshot,
    toggleEqTab,
    disconnectTab,
    toggleVisualizer,
    openFullWindow,
    refresh
  };
}
