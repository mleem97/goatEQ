import React, { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

const SVG_WIDTH = 550;
const SVG_HEIGHT = 280;
const PADDING = 20;

// Logarithmic mapping helpers
const freqToX = (freq) => {
  const minF = Math.log10(20);
  const maxF = Math.log10(20000);
  const curF = Math.log10(Math.max(20, Math.min(20000, freq)));
  return PADDING + ((curF - minF) / (maxF - minF)) * (SVG_WIDTH - 2 * PADDING);
};

const xToFreq = (x) => {
  const minF = Math.log10(20);
  const maxF = Math.log10(20000);
  const boundedX = Math.max(PADDING, Math.min(SVG_WIDTH - PADDING, x));
  const ratio = (boundedX - PADDING) / (SVG_WIDTH - 2 * PADDING);
  return Math.pow(10, minF + ratio * (maxF - minF));
};

const gainToY = (gain) => {
  const minG = -30;
  const maxG = 30;
  const curG = Math.max(minG, Math.min(maxG, gain));
  const ratio = (curG - minG) / (maxG - minG);
  // Invert Y axis: higher gain -> lower Y pixel
  return PADDING + (1 - ratio) * (SVG_HEIGHT - 2 * PADDING);
};

const yToGain = (y) => {
  const minG = -30;
  const maxG = 30;
  const boundedY = Math.max(PADDING, Math.min(SVG_HEIGHT - PADDING, y));
  const ratio = 1 - ((boundedY - PADDING) / (SVG_HEIGHT - 2 * PADDING));
  return minG + ratio * (maxG - minG);
};

export default function EQVisualizer({ audioEngine }) {
  const containerRef = useRef(null);
  const { filters, updateFilter, fftData } = audioEngine;

  // Render spectral FFT curve
  const spectralPath = useMemo(() => {
    if (!fftData || fftData.length === 0) return '';
    let path = `M ${PADDING} ${SVG_HEIGHT - PADDING}`;
    const step = (SVG_WIDTH - 2 * PADDING) / fftData.length;
    for (let i = 0; i < fftData.length; i++) {
      const x = PADDING + i * step;
      // fftData is usually in dB (-100 to 0)
      const db = fftData[i];
      const yRatio = Math.max(0, Math.min(1, (db + 100) / 100)); // Normalize
      const y = (SVG_HEIGHT - PADDING) - (yRatio * (SVG_HEIGHT - 2 * PADDING));
      path += ` L ${x} ${y}`;
    }
    return path;
  }, [fftData]);

  // Handle Dragging
  const handleDrag = (index, info) => {
    // Relative position inside the SVG
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = info.point.x - rect.left;
    const relativeY = info.point.y - rect.top;

    const newFreq = xToFreq(relativeX);
    const newGain = yToGain(relativeY);

    updateFilter(index, { frequency: newFreq, gain: newGain });
  };

  return (
    <div className="flex w-full h-full gap-2 relative">
      {/* Gain Slider Placeholder */}
      <div className="w-[40px] flex-shrink-0 h-full bg-goat-bg border border-goat-accent/30 rounded flex flex-col items-center justify-center">
        {/* Simple vertical range for gain */}
        <input 
          type="range" 
          min="0.00316" max="10" step="0.01" 
          value={audioEngine.gain}
          onChange={(e) => audioEngine.updateGain(parseFloat(e.target.value))}
          className="w-[200px] -rotate-90 origin-center translate-y-[20px]"
          style={{ width: SVG_HEIGHT - 40 }}
        />
      </div>

      {/* Main EQ SVG */}
      <div className="flex-1 bg-goat-bg border border-goat-accent/30 rounded overflow-hidden relative">
        <svg 
          ref={containerRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} 
          className="w-full h-full pointer-events-none"
        >
          {/* Grid lines */}
          <line x1={PADDING} y1={SVG_HEIGHT/2} x2={SVG_WIDTH-PADDING} y2={SVG_HEIGHT/2} stroke="#FF7F00" strokeWidth="1" strokeDasharray="5,5" strokeOpacity="0.3" />

          {/* Spectral Path */}
          {spectralPath && (
            <path d={spectralPath} fill="none" stroke="#FF7F00" strokeWidth="2" strokeOpacity="0.4" />
          )}
        </svg>

        {/* Draggable Dots rendered outside SVG with framer-motion for smooth UI handling */}
        {filters.map((filter, index) => {
          const x = freqToX(filter.frequency);
          const y = gainToY(filter.gain);
          
          return (
            <motion.div
              key={index}
              drag
              dragMomentum={false}
              dragElastic={0}
              onDrag={(e, info) => handleDrag(index, info)}
              style={{
                position: 'absolute',
                top: 0, left: 0,
                width: 20, height: 20,
                borderRadius: '50%',
                backgroundColor: filter.type === 'peaking' ? '#00e5ff' : '#9d00ff',
                cursor: 'pointer',
                touchAction: 'none'
              }}
              animate={{
                x: x - 10, // Center the 20x20 div
                y: y - 10,
              }}
              transition={{ type: "spring", bounce: 0, duration: 0.1 }}
              whileHover={{ scale: 1.3 }}
              whileDrag={{ scale: 1.5 }}
            />
          );
        })}
      </div>
    </div>
  );
}
