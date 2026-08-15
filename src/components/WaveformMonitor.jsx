import { memo, useMemo } from 'react';

function waveformPoints(data, width, height) {
  if (!data?.length) return '';
  const sampleCount = Math.min(width, data.length);
  const step = data.length / sampleCount;
  const center = height / 2;
  const points = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const value = data[Math.floor(index * step)] ?? 0;
    points.push(`${(index / (sampleCount - 1) * width).toFixed(1)},${(center - value * height * 0.46).toFixed(1)}`);
  }
  return points.join(' ');
}

function WaveformMonitor({ before, after, active }) {
  const beforePoints = useMemo(() => waveformPoints(before, 600, 36), [before]);
  const afterPoints = useMemo(() => waveformPoints(after, 600, 36), [after]);
  return (
    <section className="waveform-monitor" aria-label="Live waveform before and after processing">
      <div className="waveform-heading">
        <strong>LIVE WAVEFORM</strong>
        <span className={active ? 'active' : ''}>{active ? 'AUDIO STREAMING' : 'NO SIGNAL'}</span>
      </div>
      <div className="waveform-lane before">
        <span>INPUT</span>
        <svg viewBox="0 0 600 36" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="600" y1="18" y2="18" />
          <polyline points={beforePoints} />
        </svg>
      </div>
      <div className="waveform-lane after">
        <span>OUTPUT</span>
        <svg viewBox="0 0 600 36" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="600" y1="18" y2="18" />
          <polyline points={afterPoints} />
        </svg>
      </div>
    </section>
  );
}

export default memo(WaveformMonitor);
