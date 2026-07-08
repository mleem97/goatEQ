/* global chrome */

let pendingPopupCallbacks = [];
let creatingOffscreen = null;

async function checkOffscreenOpen() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreen() {
  if (creatingOffscreen) {
    return creatingOffscreen;
  }

  creatingOffscreen = (async () => {
    const open = await checkOffscreenOpen();
    if (!open) {
      try {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
          justification: 'EQ tab audio and access user presets'
        });
        console.log('Offscreen document created successfully.');
      } catch (err) {
        if (!err.message.includes('Only one offscreen document')) {
          console.error('Error creating offscreen document:', err);
        }
      }
    }
    creatingOffscreen = null;
  })();

  return creatingOffscreen;
}

function flushPendingPopupCallbacks() {
  while (pendingPopupCallbacks.length > 0) {
    const cb = pendingPopupCallbacks.shift();
    try {
      cb({ ready: true });
    } catch (err) {
      console.error('Error calling popup callback:', err);
    }
  }
}

function startCaptureForActiveTab(message) {
  if (!message.on) {
    chrome.runtime.sendMessage({ type: 'stopCaptureOffscreen' });
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs.at(0);
    if (!tab || tab.url.startsWith('chrome-extension://')) {
      return;
    }

    chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
      chrome.runtime.sendMessage({
        type: 'startCaptureOffscreen',
        streamId,
        tab
      });
    });
  });
}

function runWhenOffscreenReady(callback) {
  checkOffscreenOpen().then((isOpen) => {
    if (!isOpen) {
      pendingPopupCallbacks.push(callback);
      ensureOffscreen();
      return;
    }

    chrome.runtime.sendMessage({ type: 'pingOffscreen' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.alive) {
        pendingPopupCallbacks.push(callback);
        ensureOffscreen();
        return;
      }

      callback({ ready: true });
    });
  });
}

// Open offscreen document immediately when service worker starts
ensureOffscreen();

chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen();
});

chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreen();
});

// Intercept messages to control/redirect capture and ensure offscreen document is open
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs.at(0) || null });
    });
    return true;
  }

  if (message.type === 'offscreenReady') {
    flushPendingPopupCallbacks();
    return false;
  }

  if (message.type === 'initPopup') {
    runWhenOffscreenReady(sendResponse);
    return true;
  }

  if (message.type === 'eqTab') {
    ensureOffscreen().then(() => {
      runWhenOffscreenReady(() => startCaptureForActiveTab(message));
    });
    return true;
  }

  return false;
});
