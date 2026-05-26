let isOffscreenReady = false;
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
            isOffscreenReady = false;
            try {
                await chrome.offscreen.createDocument({
                    url: 'offscreen.html',
                    reasons: ['USER_MEDIA', 'LOCAL_STORAGE'],
                    justification: 'EQ tab audio and access user presets',
                });
                console.log("Offscreen document created successfully.");
            } catch (err) {
                if (!err.message.includes('Only one offscreen document')) {
                    console.error("Error creating offscreen document:", err);
                }
            }
        }
        creatingOffscreen = null;
    })();
    return creatingOffscreen;
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
    if (message.type === "getActiveTab") {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            sendResponse({ tab: tabs[0] || null });
        });
        return true;
    }

    if (message.type === "offscreenReady") {
        isOffscreenReady = true;
        console.log("Service Worker: Offscreen is ready.");
        while (pendingPopupCallbacks.length > 0) {
            const cb = pendingPopupCallbacks.shift();
            try {
                cb({ ready: true });
            } catch (err) {
                console.error("Error calling popup callback:", err);
            }
        }
        return;
    }

    if (message.type === "initPopup") {
        checkOffscreenOpen().then((isOpen) => {
            if (isOpen) {
                chrome.runtime.sendMessage({ type: "pingOffscreen" }, (response) => {
                    if (chrome.runtime.lastError || !response || !response.alive) {
                        pendingPopupCallbacks.push(sendResponse);
                        ensureOffscreen();
                    } else {
                        isOffscreenReady = true;
                        sendResponse({ ready: true });
                    }
                });
            } else {
                pendingPopupCallbacks.push(sendResponse);
                ensureOffscreen();
            }
        });
        return true; // Keep channel open for async response
    }

    if (message.type === "eqTab") {
        ensureOffscreen().then(() => {
            const runCapture = () => {
                if (message.on) {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        const tab = tabs[0];
                        if (!tab || tab.url.startsWith("chrome-extension://")) return;
                        
                        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, function(streamId) {
                            chrome.runtime.sendMessage({
                                type: "startCaptureOffscreen",
                                streamId: streamId,
                                tab: tab
                            });
                        });
                    });
                } else {
                    chrome.runtime.sendMessage({ type: "stopCaptureOffscreen" });
                }
            };

            checkOffscreenOpen().then((isOpen) => {
                if (isOpen) {
                    chrome.runtime.sendMessage({ type: "pingOffscreen" }, (response) => {
                        if (chrome.runtime.lastError || !response || !response.alive) {
                            pendingPopupCallbacks.push(runCapture);
                            ensureOffscreen();
                        } else {
                            isOffscreenReady = true;
                            runCapture();
                        }
                    });
                } else {
                    pendingPopupCallbacks.push(runCapture);
                }
            });
        });
        return true;
    }
});
