import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { CHAIN_PRESETS, EFFECT_CATALOG, EFFECT_DEFINITIONS, MAX_EFFECTS } from '../audio/effects.js';

const CONTROLS = {
  input: [['trimDb', 'Trim', -18, 18, 0.1, ' dB']],
  output: [['trimDb', 'Trim', -18, 18, 0.1, ' dB']],
  highpass: [['frequency', 'Cutoff', 15, 250, 1, ' Hz'], ['q', 'Q', 0.2, 11, 0.1, '']],
  lowpass: [['frequency', 'Cutoff', 1000, 20000, 100, ' Hz']],
  declipper: [['threshold', 'Detect', 0.7, 1, 0.01, ''], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  gate: [['threshold', 'Threshold', -80, -10, 1, ' dB'], ['ratio', 'Ratio', 1, 8, 0.1, ':1'], ['release', 'Release', 20, 2000, 10, ' ms', 1000]],
  compressor: [['threshold', 'Threshold', -48, 0, 0.5, ' dB'], ['ratio', 'Ratio', 1, 20, 0.1, ':1'], ['attack', 'Attack', 1, 1000, 1, ' ms', 1000], ['release', 'Release', 20, 2000, 10, ' ms', 1000], ['makeupDb', 'Makeup', 0, 18, 0.1, ' dB'], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  maximizer: [['targetDb', 'Target', -24, -8, 0.5, ' dB'], ['maxGainDb', 'Max gain', 0, 12, 0.1, ' dB'], ['ceilingDb', 'Ceiling', -6, -0.1, 0.1, ' dBTP'], ['release', 'Release', 50, 2000, 10, ' ms', 1000]],
  transient: [['attack', 'Attack', -100, 100, 1, '%', 100], ['sustain', 'Sustain', -100, 100, 1, '%', 100], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  deesser: [['frequency', 'Frequency', 3000, 12000, 100, ' Hz'], ['amount', 'Amount', 0, 100, 1, '%', 100]],
  stereo: [['width', 'Width', 0, 200, 1, '%', 100], ['monoBass', 'Mono bass', 40, 300, 5, ' Hz'], ['crossfeed', 'Crossfeed', 0, 50, 1, '%', 100]],
  bassEnhancer: [['frequency', 'Frequency', 50, 250, 1, ' Hz'], ['amount', 'Amount', 0, 75, 1, '%', 100], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  presence: [['frequency', 'Frequency', 1000, 6000, 50, ' Hz'], ['amount', 'Amount', -50, 75, 1, '%', 100], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  exciter: [['frequency', 'Frequency', 3000, 12000, 100, ' Hz'], ['amount', 'Amount', 0, 50, 1, '%', 100], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  saturation: [['drive', 'Drive', 0, 24, 0.1, ' dB'], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  softClipper: [['drive', 'Drive', 0, 18, 0.1, ' dB'], ['ceilingDb', 'Ceiling', -6, 0, 0.1, ' dBTP'], ['softness', 'Softness', 5, 100, 1, '%', 100]],
  delay: [['time', 'Time', 10, 1500, 5, ' ms', 1000], ['feedback', 'Feedback', 0, 85, 1, '%', 100], ['tone', 'Tone', 0, 100, 1, '%', 100], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  echo: [['time', 'Time', 30, 1500, 5, ' ms', 1000], ['feedback', 'Feedback', 0, 85, 1, '%', 100], ['tone', 'Tone', 0, 100, 1, '%', 100], ['stereoOffset', 'Stereo offset', 0, 120, 1, ' ms', 1000], ['mix', 'Mix', 0, 100, 1, '%', 100]],
  reverb: [['size', 'Size', 5, 100, 1, '%', 100], ['damping', 'Damping', 0, 100, 1, '%', 100], ['preDelay', 'Pre-delay', 0, 120, 1, ' ms', 1000], ['mix', 'Mix', 0, 80, 1, '%', 100]],
  limiter: [['threshold', 'Ceiling', -12, 0, 0.1, ' dBTP'], ['release', 'Release', 20, 1000, 10, ' ms', 1000]]
};

function Range({ config, settings, update }) {
  const [key, label, min, max, step, unit, scale = 1] = config;
  const value = Number(settings[key] ?? 0) * scale;
  const output = value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0);
  return (
    <label className="parameter">
      <span>{label}</span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => update({ [key]: Number(event.target.value) / scale })} />
      <output>{output}{unit}</output>
    </label>
  );
}

function Meter({ label, value }) {
  const safe = Number.isFinite(value) ? value : -60;
  const percentage = Math.max(0, Math.min(100, ((safe + 60) / 60) * 100));
  return (
    <div className="meter">
      <span>{label}</span>
      <div className="meter-track"><i style={{ width: `${percentage}%` }} /></div>
      <output>{Number.isFinite(value) ? `${value.toFixed(1)} dB` : '−∞ dB'}</output>
    </div>
  );
}

export default function MasteringPanel({ audioEngine }) {
  const [effectType, setEffectType] = useState('compressor');
  const chain = audioEngine.effectChain ?? [];
  const limiterActive = chain.some((effect) => effect.type === 'limiter' && effect.enabled);
  return (
    <section className="mastering-panel" aria-label="Mastering chain">
      <header className="mastering-header">
        <div>
          <strong>Mastering Chain</strong>
          <span>Drag-free ordering: use the arrows. Processing follows the displayed top-to-bottom order after the Graphic EQ.</span>
        </div>
        <button className="icon-action" type="button" onClick={audioEngine.resetMastering} title="Load Safe Loudness"><RotateCcw size={14} /> Safe reset</button>
      </header>
      <div className="meter-row">
        <Meter label="IN" value={audioEngine.meter.inputPeak} />
        <Meter label="OUT" value={audioEngine.meter.outputPeak} />
        <span className="gain-reduction">GR {Math.abs(audioEngine.meter.gainReduction || 0).toFixed(1)} dB</span>
        <span className={`clip-count ${audioEngine.meter.clippedSamples ? 'warning' : ''}`}>REPAIRED {audioEngine.meter.clippedSamples || 0}</span>
      </div>
      <div className="chain-toolbar">
        <label>Preset
          <select defaultValue="Safe Loudness" onChange={(event) => audioEngine.loadChainPreset(event.target.value)}>
            {Object.keys(CHAIN_PRESETS).map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label>Effect
          <select value={effectType} onChange={(event) => setEffectType(event.target.value)}>
            {EFFECT_CATALOG.map((effect) => <option value={effect.type} key={effect.type}>{effect.group} · {effect.name}</option>)}
          </select>
        </label>
        <button className="primary-action" type="button" disabled={chain.length >= MAX_EFFECTS} onClick={() => audioEngine.addEffect(effectType)}><Plus size={14} /> Effekt hinzufügen</button>
        <span className="chain-count">{chain.length}/{MAX_EFFECTS}</span>
      </div>
      {!limiterActive && <p className="chain-warning">No active limiter: lower the output level to prevent clipping.</p>}
      <div className="module-grid dynamic-chain">
        {chain.map((effect, order) => {
          const definition = EFFECT_DEFINITIONS[effect.type] ?? { name: effect.type, summary: '' };
          return (
            <article className={`module-card ${effect.enabled ? 'enabled' : ''}`} key={effect.id}>
              <header>
                <span className="module-order">{String(order + 1).padStart(2, '0')}</span>
                <div><strong>{definition.name}</strong><small>{definition.summary}</small></div>
                <button className={`module-toggle ${effect.enabled ? 'on' : ''}`} type="button" role="switch" aria-checked={effect.enabled} onClick={() => audioEngine.toggleEffect(effect.id)}>{effect.enabled ? 'ON' : 'OFF'}</button>
              </header>
              <div className="effect-order-actions">
                <button type="button" disabled={order === 0} title="Move up" onClick={() => audioEngine.moveEffect(effect.id, -1)}><ChevronUp size={13} /></button>
                <button type="button" disabled={order === chain.length - 1} title="Move down" onClick={() => audioEngine.moveEffect(effect.id, 1)}><ChevronDown size={13} /></button>
                <button type="button" disabled={chain.length === 1} title="Remove effect" onClick={() => audioEngine.removeEffect(effect.id)}><Trash2 size={13} /></button>
              </div>
              <div className="module-controls">
                {(CONTROLS[effect.type] ?? []).map((config) => <Range key={config[0]} config={config} settings={effect.settings} update={(patch) => audioEngine.updateEffect(effect.id, patch)} />)}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
