import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sliders, HelpCircle, Folder, Power } from 'lucide-react';
import EQVisualizer from './components/EQVisualizer.jsx';
import { useAudioEngine } from './hooks/useAudioEngine.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('controls');
  const audioEngine = useAudioEngine();

  const tabVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  return (
    <div className="flex flex-col h-[500px] w-full bg-goat-bg text-goat-accent">
      <header className="flex justify-between items-center p-3">
        <h1 className="text-2xl font-extrabold tracking-widest m-0 flex items-center gap-3">
          <img src="/goateq_transsource.png" className="h-10 w-auto dark:invert dark:brightness-0" style={{filter: 'brightness(0)'}} alt="" />
          goatEQ
        </h1>
        <button 
          onClick={audioEngine.toggleEqTab}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-bold border transition-colors ${
            audioEngine.isEQingTab 
              ? 'bg-goat-accent text-goat-bg border-goat-accent' 
              : 'bg-transparent text-goat-accent border-goat-accent hover:bg-goat-accent/10'
          }`}
        >
          <Power size={16} />
          {audioEngine.isEQingTab ? 'Stop EQing' : 'EQ Current Tab'}
        </button>
      </header>

      <div className="flex border-b border-goat-accent px-2 gap-1 relative z-10">
        <TabButton id="controls" current={activeTab} set={setActiveTab} icon={<Sliders size={18} />} />
        <TabButton id="guide" current={activeTab} set={setActiveTab} icon={<HelpCircle size={18} />} />
        <TabButton id="tabs" current={activeTab} set={setActiveTab} icon={<Folder size={18} />} />
      </div>

      <div className="flex-1 relative overflow-hidden bg-goat-bg">
        <AnimatePresence mode="wait">
          {activeTab === 'controls' && (
            <motion.div 
              key="controls"
              variants={tabVariants}
              initial="initial" animate="animate" exit="exit"
              className="absolute inset-0 flex flex-col p-2"
            >
              <EQVisualizer audioEngine={audioEngine} />
              <div className="flex gap-2 mt-4">
                <button onClick={audioEngine.resetFilters} className="text-xs px-2 py-1 border border-goat-accent rounded hover:bg-goat-accent/10">Reset Filters</button>
              </div>
            </motion.div>
          )}

          {activeTab === 'guide' && (
            <motion.div 
              key="guide"
              variants={tabVariants}
              initial="initial" animate="animate" exit="exit"
              className="absolute inset-0 overflow-y-auto p-4 leading-relaxed text-sm"
            >
              <h3 className="font-bold mb-2">How to use</h3>
              <p className="mb-2">Drag the points up/down for Gain, left/right for Frequency.</p>
              <p>Purple dots act as shelf filters. Blue-green dots act as peaking filters.</p>
            </motion.div>
          )}

          {activeTab === 'tabs' && (
            <motion.div 
              key="tabs"
              variants={tabVariants}
              initial="initial" animate="animate" exit="exit"
              className="absolute inset-0 overflow-y-auto p-4 flex flex-col items-center justify-center text-sm"
            >
              <p>Active EQ tabs will appear here.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TabButton({ id, current, set, icon }) {
  const isActive = current === id;
  return (
    <button
      onClick={() => set(id)}
      className={`px-4 py-1.5 rounded-t-lg border border-b-0 transition-colors ${
        isActive 
          ? 'bg-goat-accent text-goat-bg border-goat-accent relative z-20 translate-y-[1px]' 
          : 'bg-transparent text-goat-accent border-goat-accent/50 hover:bg-goat-accent/10'
      }`}
    >
      {icon}
    </button>
  );
}
