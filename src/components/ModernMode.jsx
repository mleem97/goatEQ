import { useRef, useState } from 'react';
import {
  BookOpen, Download, Expand, Folder, FolderOpen, Import, Minus, Plus, Power,
  RotateCcw, Save, Settings, SlidersHorizontal, Trash2, Volume2, Waves
} from 'lucide-react';
import EQVisualizer from './EQVisualizer.jsx';
import MasteringPanel from './MasteringPanel.jsx';
import MasteringRail from './MasteringRail.jsx';
import WaveformMonitor from './WaveformMonitor.jsx';
import logoUrl from '../../goateq_transsource.png';

const GUIDE = {
  eq: ['EQ Filter', 'The eleven movable points are the original EARS-inspired filters. Purple points are shelf filters; mint points are peaking filters.', 'Drag horizontally for frequency and vertically for gain. Hold Shift while dragging vertically to change Q. Double-click a point to reset it.'],
  mastering: ['Mastering', 'The signal moves from the Graphic EQ into the mastering chain shown on the right.', 'Enable only the modules you need. The limiter remains last and the optional Soft Clipper is positioned directly before it.'],
  monitoring: ['Live monitoring', 'The source bar shows the captured browser tab. IN, OUT and GR meters remain visible at all times.', 'The spectrum and waveform compare the unprocessed input with the processed output in real time.'],
  safety: ['Health & Safety', 'Start quietly. Large EQ boosts, makeup gain and clipping stages can create dangerous playback levels.', 'The limiter reduces peak risk, but it is not a substitute for safe listening volume.']
};

function snapshot(engine) {
  return {
    filters: engine.filters.map((filter) => ({ ...filter })),
    gain: engine.gain,
    mastering: structuredClone(engine.mastering),
    effectChain: structuredClone(engine.effectChain)
  };
}

function IconTab({ active, title, children, onClick }) {
  return <button type="button" className={`icon-tab ${active ? 'active' : ''}`} title={title} aria-label={title} onClick={onClick}>{children}</button>;
}

function GuidePanel() {
  const [topic, setTopic] = useState('eq');
  const [title, first, second] = GUIDE[topic];
  return (
    <section className="guide-panel">
      <nav>{Object.entries(GUIDE).map(([id, [label]]) => <button key={id} className={topic === id ? 'active' : ''} onClick={() => setTopic(id)}>{label}</button>)}</nav>
      <article><span className="eyebrow">GOATEQ GUIDE</span><h2>{title}</h2><p>{first}</p><p>{second}</p></article>
    </section>
  );
}

function ActiveTabs({ tabs, activeTab, onDisconnect }) {
  const items = tabs.length ? tabs : activeTab ? [activeTab] : [];
  if (!items.length) return <section className="empty-tabs">No capturable audio tab is active.</section>;
  return (
    <section className="active-tabs">
      <header><span className="eyebrow">AUDIO SOURCES</span><h2>Captured tabs</h2></header>
      {items.map((tab) => (
        <div key={tab.id ?? tab.title} className="tab-source-row">
          {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <Volume2 size={16} />}
          <span><strong>{tab.title || `Tab ${tab.id}`}</strong><small>{tab.url || 'Browser audio'}</small></span>
          {tabs.some(({ id }) => id === tab.id) ? <button onClick={() => onDisconnect(tab)}>Stop</button> : <em>Current tab</em>}
        </div>
      ))}
    </section>
  );
}

function EQToolbar({ audioEngine, abSlot, onAB }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const fileRef = useRef(null);
  const presets = Object.keys(audioEngine.presets);

  const save = () => {
    if (!editing) { setEditing(true); return; }
    const clean = name.trim();
    if (!clean) return;
    audioEngine.savePreset(clean);
    setSelected(clean);
    setEditing(false);
    setName('');
  };
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { audioEngine.importPresets(JSON.parse(await file.text())); }
    catch { window.alert('This is not a valid goatEQ preset file.'); }
    event.target.value = '';
  };

  return (
    <footer className="workspace-footer">
      {editing ? (
        <input className="preset-name" autoFocus value={name} placeholder="Preset name" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setEditing(false); }} />
      ) : (
        <select value={selected} onChange={(event) => { const value = event.target.value; setSelected(value); if (value) audioEngine.loadPreset(value); }} aria-label="Preset">
          <option value="">Default Preset</option>
          {presets.map((preset) => <option key={preset}>{preset}</option>)}
        </select>
      )}
      <button title="Save preset" onClick={save}><Save size={14} /><span>Save</span></button>
      <button title="Delete preset" disabled={!selected} onClick={() => { audioEngine.deletePreset(selected); setSelected(''); }}><Trash2 size={14} /></button>
      <button title="Bass boost" onClick={() => audioEngine.loadPreset('bassBoost')}><Volume2 size={14} /></button>
      <button title="Reset filters" onClick={audioEngine.resetFilters}><RotateCcw size={14} /><span>Reset</span></button>
      <button title="Add EQ band" disabled={audioEngine.filters.length >= 32} onClick={audioEngine.addFilter}><Plus size={14} /></button>
      <button title="Remove last EQ band" disabled={audioEngine.filters.length <= 1} onClick={audioEngine.removeFilter}><Minus size={14} /></button>
      <span className="band-count">{audioEngine.filters.length}/32</span>
      <button title="Export presets" onClick={audioEngine.exportPresets}><Download size={14} /></button>
      <button title="Import presets" onClick={() => fileRef.current?.click()}><Import size={14} /></button>
      <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={importFile} />
      <div className="ab-control" aria-label="A/B comparison">
        <button className={abSlot === 'A' ? 'active' : ''} onClick={() => onAB('A')}>A</button>
        <button className={abSlot === 'B' ? 'active' : ''} onClick={() => onAB('B')}>B</button>
      </div>
    </footer>
  );
}

export default function ModernMode({ audioEngine, onOpenSettings }) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('last-tab') || 'controls');
  const [abSlot, setABSlot] = useState('A');
  const snapshots = useRef({ A: null, B: null });
  const activeSource = audioEngine.streams.find(({ id }) => id === audioEngine.activeTab?.id) ?? audioEngine.activeTab ?? audioEngine.streams[0];
  const inputPeak = audioEngine.meter.inputPeak;
  const audible = audioEngine.isEQingTab && (audioEngine.demoMode || (Number.isFinite(inputPeak) && inputPeak > -59));
  const masteringOffline = audioEngine.isEQingTab && !audioEngine.demoMode && audioEngine.workletAvailable === false;
  const captureUnavailable = audioEngine.captureCapability === 'unsupported-firefox-tab-audio';

  const selectTab = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('last-tab', tab);
  };

  const switchAB = (target) => {
    if (target === abSlot) return;
    snapshots.current[abSlot] = snapshot(audioEngine);
    if (snapshots.current[target]) audioEngine.applySnapshot(snapshots.current[target]);
    else snapshots.current[target] = snapshot(audioEngine);
    setABSlot(target);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="https://github.com/mleem97/goatEQ" target="_blank" rel="noreferrer" aria-label="goatEQ on GitHub">
          <img src={logoUrl} alt="" />
          <strong>goatEQ</strong>
        </a>
        <div className={`source-status ${audioEngine.isEQingTab ? 'captured' : ''} ${audible ? 'audible' : ''}`}>
          <span className="live-state"><i />{captureUnavailable ? 'FIREFOX · TAB AUDIO UNAVAILABLE' : audioEngine.engineError ? 'ENGINE ERROR' : masteringOffline ? 'EQ LIVE · MASTER OFFLINE' : audible ? 'LIVE AUDIO' : audioEngine.isEQingTab ? 'CAPTURED' : 'BYPASSED'}</span>
          {activeSource?.favIconUrl ? <img src={activeSource.favIconUrl} alt="" /> : <Volume2 size={15} />}
          <span className="source-title" title={activeSource?.title}>{activeSource?.title || 'Current browser tab'}</span>
        </div>
        <button className={`processing-switch ${audioEngine.isEQingTab ? 'on' : ''}`} type="button" role="switch" aria-checked={audioEngine.isEQingTab} disabled={captureUnavailable} title={captureUnavailable ? 'Firefox exposes no supported automatic tab-audio capture API.' : 'Toggle processing for the current tab'} onClick={audioEngine.toggleEqTab}>
          <span>PROCESSING</span><i><b /></i>
        </button>
      </header>

      <nav className="utility-bar" aria-label="Main navigation">
        <div className="icon-tabs">
          <IconTab active={activeTab === 'controls'} title="Graphic EQ" onClick={() => selectTab('controls')}><SlidersHorizontal size={17} /></IconTab>
          <IconTab active={activeTab === 'mastering'} title="Mastering Chain" onClick={() => selectTab('mastering')}><Power size={17} /></IconTab>
          <IconTab active={activeTab === 'guide'} title="Guide" onClick={() => selectTab('guide')}><BookOpen size={17} /></IconTab>
          <IconTab active={activeTab === 'tabs'} title="Active Tabs" onClick={() => selectTab('tabs')}>{audioEngine.streams.length ? <FolderOpen size={17} /> : <Folder size={17} />}</IconTab>
        </div>
        <div className="monitor-actions">
          <button className={audioEngine.visualizerEnabled ? 'active' : ''} onClick={audioEngine.toggleVisualizer}><Waves size={15} /> Spectral</button>
          <button title="Settings" onClick={onOpenSettings}><Settings size={15} /></button>
          <button title="Open full window" onClick={audioEngine.openFullWindow}><Expand size={15} /></button>
        </div>
      </nav>

      <div className="workspace-grid">
        <section className={`main-workspace ${activeTab}`}>
          {activeTab === 'controls' ? (
            <>
              <EQVisualizer audioEngine={audioEngine} />
              <WaveformMonitor before={audioEngine.waveformBeforeData} after={audioEngine.waveformData} active={audible} />
              <EQToolbar audioEngine={audioEngine} abSlot={abSlot} onAB={switchAB} />
            </>
          ) : null}
          {activeTab === 'mastering' ? <MasteringPanel audioEngine={audioEngine} /> : null}
          {activeTab === 'guide' ? <GuidePanel /> : null}
          {activeTab === 'tabs' ? <ActiveTabs tabs={audioEngine.streams} activeTab={audioEngine.activeTab} onDisconnect={audioEngine.disconnectTab} /> : null}
        </section>
        <MasteringRail audioEngine={audioEngine} mode={activeTab} onModeChange={selectTab} />
      </div>

      {audioEngine.demoMode ? <span className="demo-badge">UI PREVIEW · SIMULATED SIGNAL</span> : null}
      {audioEngine.notice ? <div className="notice" role="status">{audioEngine.notice}</div> : null}
    </main>
  );
}
