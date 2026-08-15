# goatEQ 2.1.2

goatEQ is a real-time browser equalizer and mastering extension inspired by the original EARS Audio interface.

## Interface modes

- **Classic** preserves the compact 11-band EARS-inspired interface. Its Mastering tab is disabled by default and can be enabled in Settings.
- **2.0** adds an always-visible source status, live before/after spectrum, waveform monitor, stereo meters, gain reduction and a mastering rail.

Both modes share the same audio engine, EQ state, mastering chain and presets. Changing the interface does not reset audio.

## Audio features

- The original eleven EARS-inspired EQ bands remain the default. Add or remove bands at runtime from 1 up to 32 without rebuilding the live audio graph.
- Spectrum and waveform Before/After monitoring are enabled by default and show the signal immediately before the EQ and after the complete chain.
- The mastering tab is an ordered, instance-based chain. Effects can be added repeatedly, bypassed, removed and moved up or down.
- Available effects: trim, high/low-pass, de-clipper, gate, compressor, smart maximizer, transient shaper, de-esser, stereo tool, bass enhancer, presence, exciter, saturation, soft clipper, delay, echo, reverb and limiter.
- New installs start with the conservative `Safe Loudness` chain. The final limiter ceiling is −1 dB and the maximizer gain is bounded to protect dynamics.
- Existing 11-band presets remain valid; new presets can contain any matching set of 1–32 frequency/gain/Q/type values.

## Build

```bash
npm install
npm run check
```

The production extension is written to `dist/`. The Vite build copies the browser runtime files, icons and manifest automatically.

## Load in Chromium

1. Build the extension.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked** and select `dist/`.

## Firefox

Firefox does not currently expose a supported WebExtension API equivalent to Chromium's `tabCapture` source hand-off. The Firefox package therefore keeps the React UI, presets and configuration available but clearly disables automatic tab-audio processing instead of using an unreliable non-standard constraint or reporting a false capture state.

The package uses `manifest.firefox.json` as its final `manifest.json` and loads `offscreen.html` as a persistent background page. Package the files themselves at the root of the ZIP/XPI, not their containing folder. A future Firefox audio backend must be implemented separately, for example as a user-mediated visible capture page or a deliberately site-limited media-element integration.

## Tests

```bash
npm run test
npm run build
```

The tests cover the preserved quartic EARS frequency mapping, gain mapping, 1/11/32-band presets, DSP command ordering, Chrome capture confirmation, message ownership, the complete effect catalogue, Firefox capability gating and legacy preset compatibility. A real-browser Chrome smoke test is still required before publishing because automated Node tests cannot grant and route a live browser-tab stream.

See [React Architecture](docs/REACT_ARCHITECTURE.md) for the runtime boundary and browser-specific assessment.
