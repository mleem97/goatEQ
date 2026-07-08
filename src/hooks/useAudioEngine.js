import { useState, useEffect, useCallback } from 'react';

const DEFAULT_FREQS = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
const DEFAULT_QS = Array(11).fill(0.7071);
const noopCleanup = () => undefined;

function getChromeApi() {
  return globalThis.chrome?.runtime ? globalThis.chrome : null;
}

function sendRuntimeMessage(message, callback) {
  const chromeApi = getChromeApi();
  if (!chromeApi) {
    return;
  }

  chromeApi.runtime.sendMessage(message, callback);
}

export function useAudioEngine() {
  const [gain, setGain] = useState(1);
  const [filters, setFilters] = useState(
    DEFAULT_FREQS.map((freq, i) => ({
      index: i,
      frequency: freq,
      gain: 0,
      q: DEFAULT_QS[i],
      type: i === 0 ? 'lowshelf' : i === 10 ? 'highshelf' : 'peaking'
    }))
  );

  const [fftData, setFftData] = useState([]);
  const [fftBeforeData, setFftBeforeData] = useState([]);
  const [isEQingTab, setIsEQingTab] = useState(false);

  useEffect(() => {
    const chromeApi = getChromeApi();
    if (!chromeApi) {
      return noopCleanup;
    }

    sendRuntimeMessage({ type: 'getWorkspaceStatus' });
    sendRuntimeMessage({ type: 'getCurrentTabStatus' });

    const fftInterval = setInterval(() => {
      sendRuntimeMessage({ type: 'getFFT' });
    }, 1000 / 30);

    const handleMessage = (msg) => {
      if (msg.type === 'sendWorkspaceStatus') {
        if (msg.eqFilters && msg.eqFilters.length > 0) {
          setFilters(msg.eqFilters.map((filter, index) => ({ ...filter, index })));
        }

        if (msg.gain !== undefined) {
          setGain(msg.gain);
        }
      }

      if (msg.type === 'sendCurrentTabStatus') {
        setIsEQingTab(Boolean(msg.streaming));
      }

      if (msg.type === 'fft') {
        setFftData(msg.fft || []);
        setFftBeforeData(msg.fftBefore || []);
      }
    };

    chromeApi.runtime.onMessage.addListener(handleMessage);

    return () => {
      chromeApi.runtime.onMessage.removeListener(handleMessage);
      clearInterval(fftInterval);
    };
  }, []);

  const updateFilter = useCallback((index, updates) => {
    setFilters((prev) => {
      if (!Number.isInteger(index) || index < 0 || index >= prev.length) {
        return prev;
      }

      const currentFilter = prev[index];
      const nextFilter = { ...currentFilter, ...updates };
      const newFilters = prev.map((filter, filterIndex) => (
        filterIndex === index ? nextFilter : filter
      ));

      sendRuntimeMessage({
        type: 'modifyFilter',
        index,
        gain: nextFilter.gain,
        frequency: nextFilter.frequency,
        q: nextFilter.q
      });

      return newFilters;
    });
  }, []);

  const updateGain = useCallback((newGain) => {
    setGain(newGain);
    sendRuntimeMessage({ type: 'modifyGain', gain: newGain });
  }, []);

  const resetFilters = useCallback(() => {
    sendRuntimeMessage({ type: 'resetFilters' });
    setTimeout(() => sendRuntimeMessage({ type: 'getWorkspaceStatus' }), 50);
  }, []);

  const toggleEqTab = useCallback(() => {
    const chromeApi = getChromeApi();
    if (!chromeApi) {
      return;
    }

    if (isEQingTab) {
      sendRuntimeMessage({ type: 'stopCaptureOffscreen' });
      setIsEQingTab(false);
      return;
    }

    if (chromeApi.tabCapture) {
      chromeApi.tabCapture.getMediaStreamId({ targetTabId: null }, (streamId) => {
        sendRuntimeMessage({ type: 'startCaptureOffscreen', streamId });
        setIsEQingTab(true);
      });
    }
  }, [isEQingTab]);

  return {
    gain,
    filters,
    fftData,
    fftBeforeData,
    isEQingTab,
    updateFilter,
    updateGain,
    resetFilters,
    toggleEqTab
  };
}
