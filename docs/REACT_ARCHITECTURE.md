# goatEQ 2.1 React Architecture

## Decision summary

React now owns every part of the extension that benefits from declarative UI state:

- Classic and 2.0 interface selection
- Settings persistence and mode switching
- EQ control state and interaction coordination
- Mastering controls
- Preset creation, deletion, import, export and validation
- A/B workspace snapshots
- Active-tab presentation
- Live spectrum, waveform and meter rendering
- Popup notices and navigation

The audio backend is exposed to React through `useAudioEngine`. Browser-specific APIs and hard-real-time DSP remain outside React by design.

## Runtime boundary

| Layer | Runtime | React migration | Reason |
|---|---|---:|---|
| UI, settings and visualization | Extension popup | Complete | React is the appropriate state and rendering layer. |
| Browser messaging adapter | React hook | Complete | `useAudioEngine` normalizes callback and Promise WebExtension APIs. |
| Chrome tab capture orchestration | MV3 service worker | Not appropriate | The browser starts and suspends service workers independently of the React popup lifecycle. |
| Persistent Chrome audio host | Offscreen document | Not appropriate | Audio must continue after the popup closes; popup React is destroyed when dismissed. |
| Web Audio graph | Offscreen/background page | Not appropriate | `AudioNode` objects are imperative browser resources and are not serializable React state. |
| Ordered mastering/effect DSP | AudioWorklet | Not appropriate | AudioWorklet runs the complete instance chain on the browser audio rendering thread. React and the DOM must never run there. |
| Firefox background audio host | Persistent MV2 background page | Not appropriate | Firefox does not support `background.service_worker`; its background page owns the persistent graph. |

Trying to move the last four layers into React would stop audio whenever the popup closes, increase main-thread jitter and couple DSP lifetime to component rendering. The optimized architecture therefore keeps a narrow message boundary instead.

## Data flow

```text
Classic UI / 2.0 UI
        │
        ▼
useAudioEngine + usePreferences
        │ WebExtension runtime messages
        ▼
Chrome service worker ── creates/controls ──► offscreen audio document
                                                 │
Firefox React UI ── capability gate ──► presets/settings only
                                                 │
                                                 ▼
 Web Audio graph → 1–32 EQ nodes → ordered AudioWorklet chain → output + FFT/waveform/meter snapshots
```

## Preset compatibility

The exported preset representation remains compatible with the existing format:

```json
{
  "Preset name": {
    "frequencies": [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20000],
    "gains": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "qs": [0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071]
  }
}
```

`normalizePresetCollection` also accepts a wrapper shaped as `{ "presets": { ... } }`. Every imported preset must contain 1–32 matching finite frequency, gain and Q values; optional filter types are preserved. Values are clamped to the DSP limits before they reach the audio engine, so legacy eleven-band files remain compatible.

## Ordered effect chain

React stores and edits an ordered array of effect instances with stable IDs. The hook sends the whole chain with a monotonically increasing revision; the audio engine validates it and the AudioWorklet swaps it atomically. The chain supports repeated effect types and up to 32 instances. Stateful delay, echo and reverb buffers are isolated by instance ID.

## Performance changes

- Spectrum monitoring is user-configurable at 15, 24 or 30 FPS and defaults to 24 FPS.
- The spectrum remains enabled by default.
- Time-domain data is peak-preserving downsampled from the analyzer buffer to 512 points before WebExtension message serialization.
- The original quartic EARS frequency mapping is covered by regression tests.
- Filter-response calculations stay memoized and high-frequency animation state remains isolated in the audio hook.
- The offscreen audio graph persists independently from popup rendering.

## Browser assessment

### Chromium / Brave / Edge

The production package uses Manifest V3, `chrome.tabCapture`, a service worker and an offscreen document. Runtime selection validates the messaging contract available in restricted offscreen documents. All popup DSP commands go through a service-worker broker that creates the offscreen host before forwarding the command. The offscreen document can request active-tab status and storage through the same broker.

### Firefox

Firefox supports background pages but does not support `background.service_worker`, so the Firefox package uses a persistent Manifest V2 background page. Mozilla documents this background-runtime difference in the [WebExtensions background manifest documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).

Firefox does not expose Chromium's `tabCapture.getMediaStreamId` workflow. The previous non-standard `getUserMedia({audio: {mediaSource: 'tab'}})` attempt was removed because it cannot be treated as a supported automatic tab-capture backend. The Firefox build now advertises `unsupported-firefox-tab-audio`, disables its processing control and remains useful for UI, preset and configuration work without claiming that audio is being processed.

A Firefox backend is a separate implementation project. A visible `getDisplayMedia()` capture page would require a fresh user gesture and source selection for every session, must request video and may receive no audio track. Injecting Web Audio into page media elements can cover some ordinary HTML players but cannot guarantee all audio produced by a tab. Neither is a transparent replacement for Chrome's extension-controlled tab stream.

The Firefox manifest declares that the extension collects no data through Mozilla's `data_collection_permissions` field. Audio is processed locally and is not transmitted.

## Remaining platform QA

- Load the unpacked Chromium build and verify capture on a normal HTML5 media tab.
- Confirm audio continues after closing the popup.
- Verify before/after spectrum and waveform movement with a flat EQ and with an audible EQ change.
- Add, duplicate, reorder, bypass and remove effects while inspecting IN, OUT and gain-reduction meters.
- Load the Firefox package temporarily through `about:debugging` and verify that processing is disabled with an explicit capability explanation.
- Confirm legacy preset import, mode switching and Classic Mastering opt-in in both browsers.
