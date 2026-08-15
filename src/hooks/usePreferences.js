import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'goateqPreferencesV2';

export const DEFAULT_PREFERENCES = {
  uiMode: 'modern',
  classicMasteringEnabled: false,
  autoCapture: true,
  monitoringFps: 24
};

function extensionStorage() {
  return [globalThis.chrome?.storage?.local, globalThis.browser?.storage?.local].find(
    (storage) => typeof storage?.get === 'function' && typeof storage?.set === 'function'
  ) ?? null;
}

function localFallback() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function readExtensionPreferences(storage) {
  if (!storage) return Promise.resolve(localFallback());
  if (storage === globalThis.browser?.storage?.local && storage !== globalThis.chrome?.storage?.local) {
    return storage.get(STORAGE_KEY).then((result) => result?.[STORAGE_KEY] ?? {}).catch(() => localFallback());
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result?.[STORAGE_KEY] ?? {});
    };
    try {
      const maybePromise = storage.get(STORAGE_KEY, finish);
      if (maybePromise?.then) maybePromise.then(finish).catch(() => finish({}));
    } catch {
      finish({});
    }
  });
}

function writeExtensionPreferences(storage, value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage can be unavailable */ }
  if (!storage) return;
  if (storage === globalThis.browser?.storage?.local && storage !== globalThis.chrome?.storage?.local) {
    try { void storage.set({ [STORAGE_KEY]: value }).catch(() => undefined); } catch { /* local fallback remains available */ }
    return;
  }
  try {
    const result = storage.set({ [STORAGE_KEY]: value });
    if (result?.catch) result.catch(() => undefined);
  } catch { /* local fallback remains available */ }
}

export function usePreferences() {
  const storage = extensionStorage();
  const [preferences, setPreferences] = useState(() => ({ ...DEFAULT_PREFERENCES, ...localFallback() }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void readExtensionPreferences(storage).then((stored) => {
      if (!active) return;
      setPreferences({ ...DEFAULT_PREFERENCES, ...stored });
      setReady(true);
    });
    return () => { active = false; };
  }, [storage]);

  const updatePreference = useCallback((key, value) => {
    setPreferences((previous) => {
      const next = { ...previous, [key]: value };
      writeExtensionPreferences(storage, next);
      return next;
    });
  }, [storage]);

  const resetPreferences = useCallback(() => {
    const next = { ...DEFAULT_PREFERENCES };
    setPreferences(next);
    writeExtensionPreferences(storage, next);
  }, [storage]);

  return { preferences, ready, updatePreference, resetPreferences };
}
