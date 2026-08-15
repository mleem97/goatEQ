import { useState } from 'react';
import ClassicMode from './components/ClassicMode.jsx';
import ModernMode from './components/ModernMode.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { useAudioEngine } from './hooks/useAudioEngine.js';
import { usePreferences } from './hooks/usePreferences.js';

export default function App() {
  const { preferences, ready, updatePreference, resetPreferences } = usePreferences();
  const audioEngine = useAudioEngine(preferences);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!ready) {
    return <main className="preference-loader" aria-label="Loading goatEQ"><span>goatEQ</span></main>;
  }

  return (
    <>
      {preferences.uiMode === 'classic' ? (
        <ClassicMode audioEngine={audioEngine} preferences={preferences} onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <ModernMode audioEngine={audioEngine} onOpenSettings={() => setSettingsOpen(true)} />
      )}
      {settingsOpen ? (
        <SettingsPanel
          preferences={preferences}
          onChange={updatePreference}
          onReset={resetPreferences}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}
