import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { EQ_HEIGHT, EQ_WIDTH, GAIN_WIDTH, MAX_MASTER_GAIN_DB, MIN_GAIN_DB } from '../audio/constants.js';
import {
  clamp, fftToPoints, formatFrequency, frequencyToX, gainToY, getFilterResponse,
  getFrequencyTicks, getGainTicks, legacyDbToLinear, linearToLegacyDb, pointsToString,
  xToFrequency, yToGain
} from '../audio/eqMath.js';

const OUTLINE_DOT = 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0';
const FILLED_DOT = 'M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-5 6.66a2 2 0 0 0 -1.977 1.697l-.018 .154l-.005 .149l.005 .15a2 2 0 1 0 1.995 -2.15z';
const PEAK_COLOR = '#CDF7E1';
const SHELF_COLOR = '#9573A8';

function getSvgPoint(event, svg) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * EQ_WIDTH / rect.width,
    y: (event.clientY - rect.top) * EQ_HEIGHT / rect.height
  };
}

function EQVisualizer({ audioEngine }) {
  const svgRef = useRef(null);
  const gainRef = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const { filters, gain, fftData, fftBeforeData, sampleRate, visualizerEnabled } = audioEngine;

  const responseCurves = useMemo(
    () => filters.map((filter) => pointsToString(getFilterResponse(filter, sampleRate))),
    [filters, sampleRate]
  );
  const afterSpectrum = useMemo(() => pointsToString(fftToPoints(fftData, sampleRate)), [fftData, sampleRate]);
  const beforeSpectrum = useMemo(() => pointsToString(fftToPoints(fftBeforeData, sampleRate)), [fftBeforeData, sampleRate]);

  const startFilterDrag = useCallback((event, index) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { index, lastClientY: event.clientY };
    setDragging(index);
  }, []);

  const moveFilter = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const filter = filters[drag.index];
    if (event.shiftKey) {
      const q = clamp(filter.q + (event.clientY - drag.lastClientY) / 10, 0.2, 11);
      drag.lastClientY = event.clientY;
      audioEngine.updateFilter(drag.index, { q });
      return;
    }
    const point = getSvgPoint(event, svgRef.current);
    if (point.x < 0 || point.x >= EQ_WIDTH || point.y < 0 || point.y >= EQ_HEIGHT) return;
    audioEngine.updateFilter(drag.index, {
      frequency: clamp(xToFrequency(point.x), 5, 20000),
      gain: clamp(yToGain(point.y), -30, 30)
    });
    drag.lastClientY = event.clientY;
  }, [audioEngine, filters]);

  const stopFilterDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    audioEngine.commitFilter(drag.index);
    dragRef.current = null;
    setDragging(null);
  }, [audioEngine]);

  const moveFilterKeyboard = useCallback((event, index) => {
    const filter = filters[index];
    const large = event.shiftKey;
    const frequencyStep = large ? 100 : Math.max(1, filter.frequency * 0.01);
    const gainStep = large ? 1 : 0.25;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const updates = {};
    if (event.key === 'ArrowLeft') updates.frequency = clamp(filter.frequency - frequencyStep, 5, 20000);
    if (event.key === 'ArrowRight') updates.frequency = clamp(filter.frequency + frequencyStep, 5, 20000);
    if (event.key === 'ArrowUp') updates.gain = clamp(filter.gain + gainStep, -30, 30);
    if (event.key === 'ArrowDown') updates.gain = clamp(filter.gain - gainStep, -30, 30);
    audioEngine.updateFilter(index, updates);
  }, [audioEngine, filters]);

  const updateMasterGain = useCallback((event) => {
    if (!gainRef.current) return;
    const point = getSvgPoint(event, gainRef.current);
    const db = clamp(yToGain(point.y), MIN_GAIN_DB, MAX_MASTER_GAIN_DB);
    audioEngine.updateGain(legacyDbToLinear(db));
  }, [audioEngine]);

  const gainY = gainToY(linearToLegacyDb(gain));

  return (
    <div className="eq-visualizer" aria-label="Graphic equalizer">
      <svg
        ref={gainRef}
        className="gain-svg"
        viewBox={`0 0 ${GAIN_WIDTH} ${EQ_HEIGHT}`}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); updateMasterGain(event); }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) updateMasterGain(event); }}
        onPointerUp={(event) => { event.currentTarget.releasePointerCapture?.(event.pointerId); audioEngine.commitGain(); }}
      >
        <line x1="15" y1={gainToY(MIN_GAIN_DB)} x2="15" y2={gainToY(MAX_MASTER_GAIN_DB)} className="gain-track" />
        <text x="15" y={gainToY(MAX_MASTER_GAIN_DB) - 10} className="gain-title">volume</text>
        <line x1="10" y1={gainToY(0)} x2="20" y2={gainToY(0)} className="gain-zero" />
        <line x1="0" y1={gainY} x2="30" y2={gainY} className="gain-line" />
      </svg>

      <svg ref={svgRef} className="eq-svg" viewBox={`0 0 ${EQ_WIDTH} ${EQ_HEIGHT}`} role="group" aria-label={`${filters.length}-band parametric graphic EQ`}>
        <defs>
          <linearGradient id="spectrum-gradient" x1="50%" y1="0" x2="50%" y2="100%">
            <stop offset="0" stopColor="#FF7F00" />
            <stop offset="1" stopColor="#2A2D34" />
          </linearGradient>
          {filters.map((filter, index) => {
            const color = filter.type === 'peaking' ? PEAK_COLOR : SHELF_COLOR;
            const positive = filter.gain >= 0;
            return (
              <linearGradient key={index} id={`filter-gradient-${index}`} x1="50%" y1={positive ? '0' : '100%'} x2="50%" y2={positive ? '100%' : '0'}>
                <stop offset="0" stopColor={color} />
                <stop offset="1" stopColor="#2A2D34" />
              </linearGradient>
            );
          })}
        </defs>
        <rect x="0.5" y="0.5" width="599" height="299" className="eq-frame" />
        <g aria-hidden="true">
          {getFrequencyTicks().map(({ frequency, x }) => (
            <g key={frequency}>
              <line x1={x} y1="140" x2={x} y2="160" className="minor-grid" />
              <line x1={x} y1="300" x2={x} y2="285" className="grid-tick" />
              <text x={x} y="280" className="frequency-label">{formatFrequency(frequency)}</text>
              <line x1={x} y1="0" x2={x} y2="15" className="grid-tick" />
            </g>
          ))}
          {getGainTicks().map(({ gain: tickGain, y }) => (
            <g key={tickGain}>
              <line x1="0" y1={y} x2="5" y2={y} className="grid-tick" />
              <text x="7" y={y} className="gain-label">{tickGain}</text>
            </g>
          ))}
        </g>
        {responseCurves.map((points, index) => (
          <polyline key={filters[index].index} points={points} className="filter-response" stroke={`url(#filter-gradient-${index})`} />
        ))}
        {visualizerEnabled && beforeSpectrum && <polyline points={beforeSpectrum} className="spectrum before" stroke="url(#spectrum-gradient)" />}
        {visualizerEnabled && afterSpectrum && <polyline points={afterSpectrum} className="spectrum after" stroke="url(#spectrum-gradient)" />}
        {filters.map((filter, index) => {
          const color = filter.type === 'peaking' ? PEAK_COLOR : SHELF_COLOR;
          const isDragging = dragging === index;
          return (
            <path
              key={filter.index}
              d={isDragging ? FILLED_DOT : OUTLINE_DOT}
              className="filter-dot"
              fill={isDragging ? color : 'none'}
              stroke={isDragging ? 'none' : color}
              strokeWidth="2"
              transform={`translate(${frequencyToX(filter.frequency)} ${gainToY(filter.gain)}) scale(.6) translate(-12 -12)`}
              tabIndex="0"
              role="slider"
              aria-label={`Band ${index + 1}, ${Math.round(filter.frequency)} Hz, ${filter.gain.toFixed(1)} dB, Q ${filter.q.toFixed(2)}`}
              aria-valuemin="-30"
              aria-valuemax="30"
              aria-valuenow={filter.gain}
              onPointerDown={(event) => startFilterDrag(event, index)}
              onPointerMove={moveFilter}
              onPointerUp={stopFilterDrag}
              onPointerCancel={stopFilterDrag}
              onDoubleClick={() => audioEngine.resetFilter(index)}
              onKeyDown={(event) => moveFilterKeyboard(event, index)}
            >
              <title>{`${Math.round(filter.frequency)} Hz · ${filter.gain.toFixed(1)} dB · Q ${filter.q.toFixed(2)}`}</title>
            </path>
          );
        })}
      </svg>
    </div>
  );
}

export default memo(EQVisualizer);
