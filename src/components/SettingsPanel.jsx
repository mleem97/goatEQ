import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';

function Toggle({ checked, label, description, onChange, disabled = false }) {
  return (
    <label className={`settings-toggle ${disabled ? 'disabled' : ''}`}>
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true"><b /></i>
    </label>
  );
}

export default function SettingsPanel({ preferences, onChange, onReset, onClose }) {
  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div><span className="eyebrow">GOATEQ 2.0</span><h2 id="settings-title">Settings</h2></div>
          <button title="Close settings" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="settings-body">
          <fieldset className="mode-picker">
            <legend>Interface mode</legend>
            <label className={preferences.uiMode === 'classic' ? 'selected' : ''}>
              <input type="radio" name="ui-mode" value="classic" checked={preferences.uiMode === 'classic'} onChange={() => onChange('uiMode', 'classic')} />
              <span><strong>Classic</strong><small>The original compact EARS-inspired goatEQ interface.</small></span>
            </label>
            <label className={preferences.uiMode === 'modern' ? 'selected' : ''}>
              <input type="radio" name="ui-mode" value="modern" checked={preferences.uiMode === 'modern'} onChange={() => onChange('uiMode', 'modern')} />
              <span><strong>2.0</strong><small>Split live monitor with meters, waveform and mastering rail.</small></span>
            </label>
          </fieldset>
          <div className="settings-section">
            <h3>Classic mode</h3>
            <Toggle
              checked={preferences.classicMasteringEnabled}
              label="Enable Mastering tab"
              description="Disabled by default to keep the original Classic workflow unchanged."
              onChange={(value) => onChange('classicMasteringEnabled', value)}
            />
          </div>
          <div className="settings-section">
            <h3>Audio and monitoring</h3>
            <Toggle
              checked={preferences.autoCapture}
              label="Process the active tab automatically"
              description="Starts tab capture when the popup opens. The live spectrum remains enabled by default."
              onChange={(value) => onChange('autoCapture', value)}
            />
            <label className="fps-setting">
              <span><strong>Monitor refresh rate</strong><small>Lower values reduce popup CPU load.</small></span>
              <select value={preferences.monitoringFps} onChange={(event) => onChange('monitoringFps', Number(event.target.value))}>
                <option value="15">15 FPS</option>
                <option value="24">24 FPS</option>
                <option value="30">30 FPS</option>
              </select>
            </label>
          </div>
          <aside className="architecture-note">
            <SlidersHorizontal size={16} />
            <p><strong>Shared processing state</strong><br />Both modes use the same EQ, presets and mastering chain. Switching the interface never resets audio.</p>
          </aside>
        </div>
        <footer><button onClick={onReset}><RotateCcw size={14} /> Reset interface settings</button></footer>
      </section>
    </div>
  );
}
