import { ChevronRight, CircleGauge, SlidersHorizontal } from 'lucide-react';
import { EFFECT_DEFINITIONS } from '../audio/effects.js';

function percentage(db) {
  const safe = Number.isFinite(db) ? db : -60;
  return Math.max(0, Math.min(100, ((safe + 60) / 60) * 100));
}

function LevelColumn({ label, value }) {
  return <div className="level-column"><span>{label}</span><div className="level-track"><i style={{ height: `${percentage(value)}%` }} /></div></div>;
}

function StereoMeter({ label, left, right }) {
  const peak = Math.max(Number.isFinite(left) ? left : -60, Number.isFinite(right) ? right : -60);
  return (
    <div className="stereo-meter">
      <strong>{label}</strong>
      <div className="stereo-columns"><LevelColumn label="L" value={left} /><LevelColumn label="R" value={right} /></div>
      <output>{peak > -60 ? `${peak.toFixed(1)} dB` : '−∞ dB'}</output>
    </div>
  );
}

function GainReduction({ value }) {
  const reduction = Math.min(24, Math.abs(Number(value) || 0));
  return <div className="stereo-meter gr-meter"><strong>GR</strong><div className="gr-track"><i style={{ height: `${reduction / 24 * 100}%` }} /></div><output>{reduction.toFixed(1)} dB</output></div>;
}

function effectValue(effect) {
  const settings = effect.settings ?? {};
  if (effect.type === 'limiter') return `${Number(settings.threshold).toFixed(1)} dBTP`;
  if (effect.type === 'compressor') return `${Number(settings.ratio).toFixed(1)}:1`;
  if (effect.type === 'delay' || effect.type === 'echo') return `${Math.round(settings.time * 1000)} ms`;
  if (effect.type === 'reverb') return `${Math.round(settings.mix * 100)}%`;
  if (Number.isFinite(settings.mix)) return `${Math.round(settings.mix * 100)}%`;
  if (Number.isFinite(settings.frequency)) return settings.frequency >= 1000 ? `${(settings.frequency / 1000).toFixed(1)} kHz` : `${Math.round(settings.frequency)} Hz`;
  if (Number.isFinite(settings.trimDb)) return `${Number(settings.trimDb).toFixed(1)} dB`;
  return effect.enabled ? 'Active' : 'Bypass';
}

export default function MasteringRail({ audioEngine, mode, onModeChange }) {
  const { meter } = audioEngine;
  const chain = audioEngine.effectChain ?? [];
  return (
    <aside className="mastering-rail" aria-label="Mastering and level monitor">
      <nav className="rail-tabs" aria-label="Workspace mode">
        <button className={mode === 'controls' ? 'active' : ''} onClick={() => onModeChange('controls')}><SlidersHorizontal size={14} /> EQ</button>
        <button className={mode === 'mastering' ? 'active' : ''} onClick={() => onModeChange('mastering')}><CircleGauge size={14} /> MASTER</button>
      </nav>
      <section className="meters-panel" aria-label="Live audio meters">
        <StereoMeter label="IN" left={meter.inputPeakLeft ?? meter.inputPeak} right={meter.inputPeakRight ?? meter.inputPeak} />
        <StereoMeter label="OUT" left={meter.outputPeakLeft ?? meter.outputPeak} right={meter.outputPeakRight ?? meter.outputPeak} />
        <GainReduction value={meter.gainReduction} />
      </section>
      <div className="rail-heading"><strong>MASTERING CHAIN</strong><span>{chain.length}/32 · POST EQ</span></div>
      <div className="chain-list dynamic-chain-list">
        {chain.map((effect, index) => {
          const definition = EFFECT_DEFINITIONS[effect.type] ?? { name: effect.type };
          return (
            <div className={`chain-row ${effect.enabled ? 'enabled' : ''}`} key={effect.id}>
              <span className="rail-order">{index + 1}</span>
              <button className="mini-switch" type="button" role="switch" aria-checked={effect.enabled} aria-label={`${definition.name} ${effect.enabled ? 'on' : 'off'}`} onClick={() => audioEngine.toggleEffect(effect.id)}><i /></button>
              <button className="chain-detail" type="button" onClick={() => onModeChange('mastering')}><span>{definition.name}</span><output>{effectValue(effect)}</output><ChevronRight size={14} /></button>
            </div>
          );
        })}
      </div>
      <div className={`clip-readout ${meter.clippedSamples ? 'warning' : ''}`}><span>REPAIRED</span><strong>{meter.clippedSamples || 0}</strong></div>
    </aside>
  );
}
