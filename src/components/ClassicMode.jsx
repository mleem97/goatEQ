import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, Download, Expand, Folder, FolderOpen, Gauge, Import, Minus, Plus,
  RotateCcw, Save, Settings, SlidersHorizontal, Trash2, Volume2, Waves
} from 'lucide-react';
import ClassicEQVisualizer from './ClassicEQVisualizer.jsx';
import MasteringPanel from './MasteringPanel.jsx';
import logoUrl from '../../goateq_transsource.png';

function TabButton({ active, title, children, onClick }) {
  return <button type="button" className={`classic-top-tab ${active ? 'active' : ''}`} title={title} aria-label={title} onClick={onClick}>{children}</button>;
}

function ClassicGuide() {
  return (
    <section className="classic-guide">
      <h2>Graphic EQ</h2>
      <p>Move a point left or right for frequency and up or down for gain. Hold Shift while dragging vertically to change Q.</p>
      <p><strong>Purple</strong> points are shelf filters. <em>Mint</em> points are peaking filters. Double-click a point to reset it.</p>
      <p>The live spectrum is enabled by default and compares the input with the processed signal.</p>
    </section>
  );
}

function ClassicTabs({ audioEngine }) {
  const tabs = audioEngine.streams.length ? audioEngine.streams : audioEngine.activeTab ? [audioEngine.activeTab] : [];
  if (!tabs.length) return <section className="classic-empty-tabs">No active browser audio tab.</section>;
  return (
    <section className="classic-active-tabs">
      {tabs.map((tab) => (
        <div key={tab.id ?? tab.title}>
          {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <Volume2 size={15} />}
          <span>{tab.title || `Tab ${tab.id}`}</span>
          {audioEngine.streams.some(({ id }) => id === tab.id) ? <button onClick={() => audioEngine.disconnectTab(tab)}>Stop EQing</button> : null}
        </div>
      ))}
    </section>
  );
}

function ClassicToolbar({ audioEngine }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const fileRef = useRef(null);
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
    <div className="classic-toolbar">
      {editing ? <input autoFocus value={name} placeholder="Preset Name" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setEditing(false); }} /> : null}
      <button onClick={save}><Save />Save Preset</button>
      <button disabled={!selected} onClick={() => { audioEngine.deletePreset(selected); setSelected(''); }}><Trash2 />Delete Preset</button>
      <button onClick={audioEngine.resetFilters}><RotateCcw />Reset Filters</button>
      <button disabled={audioEngine.filters.length >= 32} onClick={audioEngine.addFilter}><Plus />Add Band</button>
      <button disabled={audioEngine.filters.length <= 1} onClick={audioEngine.removeFilter}><Minus />Remove Band</button>
      <span className="classic-band-count">{audioEngine.filters.length}/32</span>
      <button onClick={audioEngine.exportPresets}><Download />Export Presets</button>
      <button onClick={() => fileRef.current?.click()}><Import />Import Presets</button>
      <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={importFile} />
      <button onClick={() => audioEngine.loadPreset('bassBoost')}><Volume2 />Bass Boost</button>
      {Object.keys(audioEngine.presets).map((preset) => <button key={preset} className={selected === preset ? 'selected' : ''} onClick={() => { audioEngine.loadPreset(preset); setSelected(preset); }}>{preset}</button>)}
    </div>
  );
}

export default function ClassicMode({ audioEngine, preferences, onOpenSettings }) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('classic-last-tab') || 'controls');
  const source = audioEngine.streams.find(({ id }) => id === audioEngine.activeTab?.id) ?? audioEngine.activeTab ?? audioEngine.streams[0];
  const audible = audioEngine.isEQingTab && (audioEngine.demoMode || (Number.isFinite(audioEngine.meter.inputPeak) && audioEngine.meter.inputPeak > -59));
  const masteringOffline = audioEngine.isEQingTab && !audioEngine.demoMode && audioEngine.workletAvailable === false;
  const captureUnavailable = audioEngine.captureCapability === 'unsupported-firefox-tab-audio';

  useEffect(() => {
    if (!preferences.classicMasteringEnabled && activeTab === 'mastering') setActiveTab('controls');
  }, [activeTab, preferences.classicMasteringEnabled]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('classic-last-tab', tab);
  };

  return (
    <main className="classic-shell">
      <header className="classic-brand">
        <img src={logoUrl} alt="" />
        <h1>goatEQ</h1>
        <div className={`classic-source ${audible ? 'live' : ''}`} title={source?.title}>
          <i />
          <span>{captureUnavailable ? 'FIREFOX · NO TAB AUDIO' : audioEngine.engineError ? 'ENGINE ERROR' : masteringOffline ? 'EQ LIVE · MASTER OFFLINE' : audible ? 'LIVE' : audioEngine.isEQingTab ? 'CAPTURED' : 'BYPASSED'}</span>
          <strong>{source?.title || 'Current tab'}</strong>
        </div>
      </header>
      <div className="classic-stage">
        <nav className="classic-tab-bar" aria-label="Classic navigation">
          <TabButton active={activeTab === 'controls'} title="Controls" onClick={() => selectTab('controls')}><SlidersHorizontal size={17} /></TabButton>
          {preferences.classicMasteringEnabled ? <TabButton active={activeTab === 'mastering'} title="Mastering Chain" onClick={() => selectTab('mastering')}><Gauge size={17} /></TabButton> : null}
          <TabButton active={activeTab === 'guide'} title="Guide" onClick={() => selectTab('guide')}><BookOpen size={17} /></TabButton>
          <TabButton active={activeTab === 'tabs'} title="Active Tabs" onClick={() => selectTab('tabs')}>{audioEngine.streams.length ? <FolderOpen size={17} /> : <Folder size={17} />}</TabButton>
          <TabButton active={false} title="Settings" onClick={onOpenSettings}><Settings size={17} /></TabButton>
          <div className="classic-tab-actions">
            <button className={audioEngine.visualizerEnabled ? 'on' : ''} onClick={audioEngine.toggleVisualizer}><Waves size={14} /><span>Spectral</span></button>
            <button onClick={audioEngine.openFullWindow} title="Open in new tab"><Expand size={14} /></button>
          </div>
        </nav>
        <div className={`classic-content ${activeTab === 'mastering' ? 'mastering' : ''}`}>
          {activeTab === 'controls' ? <ClassicEQVisualizer audioEngine={audioEngine} /> : null}
          {activeTab === 'mastering' ? <MasteringPanel audioEngine={audioEngine} /> : null}
          {activeTab === 'guide' ? <ClassicGuide /> : null}
          {activeTab === 'tabs' ? <ClassicTabs audioEngine={audioEngine} /> : null}
        </div>
      </div>
      {activeTab === 'controls' ? <ClassicToolbar audioEngine={audioEngine} /> : <div className="classic-toolbar-spacer" />}
      <div className="classic-capture-row">
        <button className={audioEngine.isEQingTab ? 'active' : ''} disabled={captureUnavailable} title={captureUnavailable ? 'Firefox exposes no supported automatic tab-audio capture API.' : undefined} onClick={audioEngine.toggleEqTab}><SlidersHorizontal />{captureUnavailable ? 'Firefox Tab Audio Unavailable' : audioEngine.isEQingTab ? 'Stop EQing This Tab' : 'EQ Current Tab'}</button>
      </div>
      <a className="classic-promo" href="https://github.com/mleem97/goatEQ" target="_blank" rel="noreferrer">goatEQ 🎶 Gain Optimization & Audio Treatment</a>
      {audioEngine.demoMode ? <span className="classic-demo">UI PREVIEW</span> : null}
      {audioEngine.notice ? <div className="notice" role="status">{audioEngine.notice}</div> : null}
    </main>
  );
}
