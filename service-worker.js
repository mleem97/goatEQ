/* global chrome */

let creatingOffscreen = null;

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) return false;
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.some(({ documentUrl }) => documentUrl.endsWith('/offscreen.html'));
}

async function ensureOffscreen() {
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = (async () => {
    if (!await hasOffscreenDocument()) {
      try {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
          justification: 'Process captured tab audio through the user-selected EQ and mastering chain.'
        });
      } catch (error) {
        if (!String(error).includes('Only one offscreen document')) throw error;
      }
    }
  })().finally(() => { creatingOffscreen = null; });
  return creatingOffscreen;
}

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0] ?? null);
}

async function captureActiveTab() {
  await ensureOffscreen();
  const tab = await getActiveTab();
  if (!tab || /^(chrome|edge|about|moz-extension|chrome-extension):/.test(tab.url ?? '')) {
    return { error: 'This browser page cannot be captured.' };
  }
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  const response = await chrome.runtime.sendMessage({ type: 'startCaptureOffscreen', target: 'offscreen', streamId, tab });
  if (!response?.ok || response?.processing !== true) {
    return { error: response?.error || 'The audio engine did not confirm the captured stream.', tab };
  }
  return { ...response, tab };
}

async function stopActiveTab() {
  await ensureOffscreen();
  const tab = await getActiveTab();
  const response = await chrome.runtime.sendMessage({ type: 'stopCaptureOffscreen', target: 'offscreen', tab });
  if (!response?.ok) return { error: response?.error || 'The audio engine did not confirm capture shutdown.' };
  return response;
}

chrome.runtime.onInstalled.addListener(() => { void ensureOffscreen(); });
chrome.runtime.onStartup.addListener(() => { void ensureOffscreen(); });

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'engineCommand' && message.target === 'service-worker') {
    return (async () => {
      await ensureOffscreen();
      const response = await chrome.runtime.sendMessage({ ...(message.command ?? {}), target: 'offscreen' });
      return response ?? { error: 'The offscreen audio engine did not respond.' };
    })().catch((error) => ({ error: error?.message ?? String(error) }));
  }
  if (message.type === 'getActiveTab') {
    return getActiveTab()
      .then((tab) => ({ tab }))
      .catch((error) => ({ tab: null, error: error?.message ?? String(error) }));
  }
  if (message.type === 'engineStorageGet' && sender.url?.endsWith('/offscreen.html')) {
    return chrome.storage.local.get(message.keys)
      .then((value) => ({ value }))
      .catch((error) => ({ value: {}, error: error?.message ?? String(error) }));
  }
  if (message.type === 'engineStorageSet' && sender.url?.endsWith('/offscreen.html')) {
    return chrome.storage.local.set(message.value ?? {})
      .then(() => ({ ok: true }))
      .catch((error) => ({ error: error?.message ?? String(error) }));
  }
  // Other offscreen messages are ignored after servicing the explicit broker
  // requests above, preventing the worker from handling its own forwarded DSP
  // control messages twice.
  if (sender.url?.endsWith('/offscreen.html')) return false;
  if (message.type === 'initPopup') {
    return ensureOffscreen()
      .then(() => ({ ready: true }))
      .catch((error) => ({ error: error?.message ?? String(error) }));
  }
  if (message.type === 'eqTab') {
    return (message.on ? captureActiveTab() : stopActiveTab())
      .catch((error) => ({ error: error?.message ?? String(error) }));
  }
  return false;
});

void ensureOffscreen();
