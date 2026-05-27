import { useState, useEffect, useCallback } from 'react';

const DEFAULT_FREQS = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
const DEFAULT_QS = Array(11).fill(0.7071);

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
    if (typeof chrome === 'undefined' || !chrome.runtime) return;

    chrome.runtime.sendMessage({ type: "getWorkspaceStatus" });
    chrome.runtime.sendMessage({ type: "getCurrentTabStatus" });

    const fftInterval = setInterval(() => {
      chrome.runtime.sendMessage({ type: "getFFT" });
    }, 1000 / 30);

    const handleMessage = (msg) => {
      if (msg.type === "sendWorkspaceStatus") {
        if (msg.eqFilters && msg.eqFilters.length > 0) {
          setFilters(msg.eqFilters.map((f, i) => ({ ...f, index: i })));
        }
        if (msg.gain !== undefined) {
          setGain(msg.gain);
        }
      }
      
      if (msg.type === "sendCurrentTabStatus") {
        setIsEQingTab(msg.streaming);
      }

      if (msg.type === "fft") {
        setFftData(msg.fft || []);
        setFftBeforeData(msg.fftBefore || []);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      clearInterval(fftInterval);
    };
  }, []);

  const updateFilter = useCallback((index, updates) => {
    setFilters(prev => {
      const newFilters = [...prev];
      newFilters[index] = { ...newFilters[index], ...updates };
      
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: "modifyFilter",
          index: index,
          gain: newFilters[index].gain,
          frequency: newFilters[index].frequency,
          q: newFilters[index].q
        });
      }
      
      return newFilters;
    });
  }, []);

  const updateGain = useCallback((newGain) => {
    setGain(newGain);
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "modifyGain", gain: newGain });
    }
  }, []);

  const resetFilters = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "resetFilters" });
      setTimeout(() => chrome.runtime.sendMessage({ type: "getWorkspaceStatus" }), 50);
    }
  }, []);

  const toggleEqTab = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    
    if (isEQingTab) {
      chrome.runtime.sendMessage({ type: "stopCaptureOffscreen" });
      setIsEQingTab(false);
    } else {
      if (chrome.tabCapture) {
        chrome.tabCapture.getMediaStreamId({ targetTabId: null }, (streamId) => {
          chrome.runtime.sendMessage({ type: "startCaptureOffscreen", streamId });
          setIsEQingTab(true);
        });
      }
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
