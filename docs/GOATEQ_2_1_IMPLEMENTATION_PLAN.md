# goatEQ 2.1 Implementation Plan

## Implementation status

- Priority 1 capture/EQ/dynamic bands: complete and regression-tested.
- Priority 2 ordered effect chain and catalogue: complete and sample-tested.
- Priority 3 Safe Loudness/default presets: complete.
- React production build and cross-browser archives: complete; target-browser manual playback QA remains required.

## Non-negotiable compatibility requirements

- Preserve the existing Classic and 2.0 Graphic EQ appearance, quartic frequency mapping, drag behavior, response curves and Before/After animation.
- Keep all existing 11-band presets importable and editable.
- Continue audio after the popup closes by keeping capture and DSP outside React.
- Never display `PROCESSING` until the background engine confirms a live track, running `AudioContext` and connected DSP graph.
- Process audio locally. No audio, meter or preset data leaves the extension.

## Priority 1 — working and expandable Graphic EQ

### Capture and control path

- Route every DSP command explicitly to the single offscreen/background audio engine.
- Require an acknowledgement from that engine for capture and final filter commits.
- Surface capture, AudioContext and worklet errors in the UI.
- Expose live-track, AudioContext, DSP-ready and revision state in workspace status.
- Reject stale UI writes and stale periodic refreshes by revision.

### Dynamic EQ

- Support 1–32 active filters; keep the original 11 bands as the default.
- Preallocate 32 serial `BiquadFilterNode`s so adding/removing a band never disconnects live audio.
- Put unused nodes into transparent `allpass` bypass.
- Re-index filters after deletion while retaining shelf endpoints and peaking filters in between.
- Add UI actions for adding a peaking band and removing the last added band.
- Disable add/remove at the 32/1 limits.
- Extend preset validation from exactly 11 bands to 1–32 matching frequency/gain/Q arrays.
- Preserve legacy 11-band preset files unchanged.
- Include the dynamic filter list in A/B snapshots.

### Priority-1 acceptance criteria

- A ±12 dB band update reaches the intended live `BiquadFilterNode`.
- The engine acknowledges the final value after pointer release.
- A delayed refresh cannot move the point back.
- A capture is never shown as active without a live audio track and running context.
- 11-band legacy and 32-band presets both round-trip.
- Spectrum and waveform remain enabled by default and keep Before/After rendering.

## Priority 2 — dynamic mastering chain

### Data model

- Replace the fixed one-instance-per-module object with an ordered array of effect instances.
- Each instance contains a stable ID, effect type, enabled state and validated settings.
- Allow repeated instances where musically useful, including EQ-like tone stages, delay and reverb.
- Cap the chain at 32 instances to keep CPU and memory bounded.
- Migrate the old fixed mastering object into an equivalent ordered chain once.

### Chain operations

- Add an `Add effect` catalogue.
- Add, remove, enable/bypass, move up and move down.
- Preserve exact order in storage, presets, import/export and A/B snapshots.
- Keep the final safety limiter visible and movable, while warning when no limiter is enabled.
- Apply chain changes atomically in the AudioWorklet so audio never traverses a partially rebuilt chain.

### Effect catalogue

- Utility: Input Trim, Output Trim, High-pass, Low-pass, Stereo Width, Mono Bass, Crossfeed.
- Dynamics: Compressor, Maximizer, Limiter, Transient Shaper, Expander/Gate, De-esser, De-clipper.
- Tone: Saturation, Soft Clipper, Exciter, Bass Enhancer, Presence.
- Space/time: Reverb, Delay and Echo with wet/dry, time, feedback and tone controls.
- Every time-based effect owns separate buffers per instance and channel.
- Every effect must be transparent when bypassed.

## Priority 3 — safe loudness presets

### Default preset

- Start new installations with `Safe Loudness`:
  1. gentle high-pass at 25 Hz;
  2. transparent maximizer with conservative gain and slow release;
  3. true safety soft clipper with low drive;
  4. final limiter at −1 dB ceiling.
- Target high perceived loudness without aggressive pumping or flat dynamics.
- Keep output headroom and prevent digital overs.

### Additional presets

- Transparent Loudness: minimal coloration and light peak control.
- Music Balanced: gentle dynamics, subtle saturation and safe limiting.
- Dialogue Focus: subsonic cleanup, presence, de-essing and moderate leveling.
- Night Listening: reduced peak range without excessive makeup gain.
- Streaming Safe: conservative ceiling and controlled peaks.
- Creative Space: subtle delay/reverb example, disabled by default for normal playback.

### Preset safety rules

- Never combine large makeup gain with an unrestricted output.
- Keep limiter ceiling at or below −1 dB in loudness presets.
- Use moderate ratios and parallel mix to avoid over-compression.
- Label creative/spatial presets separately from mastering presets.

## Test and release checklist

- Unit tests for 1, 11 and 32 filters, stale revisions and preset migration.
- AudioWorklet tests proving bypass transparency and audible processing for every effect type.
- Chain tests for add/remove/reorder/duplicate and atomic replacement.
- Capture handshake test proving no false-positive processing state.
- Production React build.
- Manifest/version validation for Chromium and Firefox.
- ZIP integrity checks for Chrome, Firefox and source archives.
- Manual target-browser QA remains required for protected media and browser-specific capture restrictions.
