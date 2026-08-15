# Changelog

## 2.1.2

- Replaces every Chrome `onMessage` callback/`return true` response path with a directly returned response Promise.
- Guarantees a resolved response object for engine commands, active-tab requests, storage brokerage, popup initialization and capture start/stop.
- Removes the remaining mechanism capable of producing Chrome's `A listener indicated an asynchronous response` channel error.
- Adds an executable service-worker regression harness covering every claimed runtime message.

## 2.1.1

- Fixes Chrome's `A listener indicated an asynchronous response` failure by letting the offscreen engine claim only explicitly targeted engine commands.
- Prevents the offscreen engine from intercepting its own storage and active-tab broker requests, which previously surfaced as `Audio engine unavailable` and blocked EQ/mastering updates.
- Preserves the real Chrome runtime error in the React UI instead of replacing it with a generic availability message.
- Removes the unsupported Firefox `mediaSource: tab` capture attempt. Firefox now reports the missing browser capability explicitly and keeps processing disabled instead of showing a false-positive state.
- Adds regression coverage for message ownership and Firefox capability gating.

## 2.1.0

- Restores the audible EQ path and prevents stale engine refreshes from snapping moved dots back.
- Brokers every Chromium DSP command through the service worker and confirms a live tab track plus running AudioContext before showing processing as active.
- Expands the original EARS-inspired Graphic EQ from the default eleven bands to an optional 1–32 bands without changing its curve, dot interaction or before/after animation.
- Replaces the fixed mastering layout with an ordered 1–32 instance chain supporting add, remove, bypass, duplicate and move operations.
- Adds functional Input/Output Trim, High/Low-pass, De-clipper, Gate, Compressor, Smart Maximizer, Transient Shaper, De-esser, Stereo Tool, Bass Enhancer, Presence, Exciter, Saturation, Soft Clipper, Delay, Echo, Reverb and Limiter processors.
- Adds Safe Loudness as the new-install default plus six conservative mastering/creative chain presets.
- Keeps legacy EQ presets and the Classic/2.0 mode setting compatible.
- Adds sample-level regression coverage for the full effect catalogue, order-dependent processing, limiter ceiling, 32-band EQ and capture state.

## 2.0.4

- Routes Chromium DSP commands through a deterministic service-worker broker.
- Ensures the offscreen audio engine exists before every EQ, preset, monitoring or mastering command.
- Keeps Firefox on its direct persistent-background-page message path.
- Adds dynamic 1–32 band EQ support while preserving the original 11-band display and preset format.

## 2.0.3

- Fixed the Chromium capture handshake that could report processing as active even when the offscreen audio engine failed to attach the tab stream.
- Targets all DSP and monitoring messages explicitly at the offscreen engine, matching Chrome's documented MV3 messaging pattern.
- Processing now becomes active only after a live audio track and a running `AudioContext` are both confirmed.
- Capture, AudioContext and worklet failures are surfaced in the UI instead of silently playing the unprocessed original tab audio.
- Added end-to-end regression coverage for tab-stream attachment, DSP graph readiness and capture-state confirmation.

## 2.0.2

- Fixed EQ points snapping back after drag by synchronizing the latest pointer value before sending it to the audio engine.
- Replaced the unsupported `filterUpdated` commit message with an authoritative final `modifyFilter` update.
- Added per-domain revisions for EQ, gain and mastering so delayed status refreshes cannot overwrite newer user input.
- Added atomic EQ/mastering snapshot messages and safe deep migration of previously stored mastering settings.
- Validated and clamped every mastering module update before applying it to the Web Audio graph.
- Added end-to-end regression coverage for all native mastering stages and the De-Clipper, De-Esser and Stereo AudioWorklet stages.

## 2.0.1

- Fixed Chromium and Brave offscreen initialization by detecting the supported runtime messaging contract instead of requiring `runtime.getManifest()`.
- Added a service-worker storage broker because Chromium offscreen documents do not expose `chrome.storage`.
- Added a relative AudioWorklet URL fallback for restricted offscreen runtime contexts.

## 2.0.0

- Added switchable Classic and 2.0 interfaces.
- Kept Classic Mastering disabled by default with an explicit Settings opt-in.
- Added persistent React-managed interface settings.
- Added active audio-tab status, live before/after spectrum and waveform monitoring.
- Added stereo input/output meters and gain-reduction monitoring.
- Added the complete mastering rail including optional De-Clip and Soft Clipper stages.
- Preserved the original eleven Graphic EQ controls and quartic EARS frequency mapping.
- Preserved legacy preset files and added strict 11-band import validation.
- Added A/B snapshots to the 2.0 workspace.
- Fixed Brave runtime API detection and the offscreen active-tab message route.
- Reduced waveform message size through peak-preserving downsampling.
- Added separate Chromium and Firefox manifests and packaging targets.
