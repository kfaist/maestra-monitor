'use client';

import { useState, useRef, useCallback } from 'react';
import { ModulationParam, AudioSource } from '@/types';
import { INITIAL_MODULATION_PARAMS } from '@/mock/modulation';
import { AUDIO_SOURCE_COLORS } from '@/lib/constants';

const SOURCES: AudioSource[] = ['none', 'rms', 'bpm', 'sub', 'bass', 'mid', 'high'];
const DEBOUNCE_MS = 200;

interface ModulationGridProps {
  onModulationChange?: (paramName: string, source: string, amount: number) => void;
}

export default function ModulationGrid({ onModulationChange }: ModulationGridProps) {
  const [params, setParams] = useState<ModulationParam[]>(INITIAL_MODULATION_PARAMS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onModulationChange);
  onChangeRef.current = onModulationChange;

  const sendChange = useCallback((name: string, source: string, amount: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeRef.current?.(name, source, amount);
    }, DEBOUNCE_MS);
  }, []);

  const updateParam = useCallback((index: number, field: 'source' | 'amount', value: AudioSource | number) => {
    setParams(prev => {
      const updated = prev.map((p, i) => i === index ? { ...p, [field]: value } : p);
      const param = updated[index];
      sendChange(param.name, param.source, param.amount);
      return updated;
    });
  }, [sendChange]);

  return (
    <div className="modulation-section">
      <div className="modulation-title">// Audio Reactive Modulation</div>
      <div className="modulation-grid">
        {params.map((param, index) => (
          <div key={param.name} className={`param-group ${param.category}`}>
            <div className="param-name">{param.name}</div>
            <div className="mod-controls">
              <div className="mod-label">Source</div>
              <select
                className="mod-select source-select"
                value={param.source}
                onChange={(e) => updateParam(index, 'source', e.target.value as AudioSource)}
              >
                {SOURCES.map(s => (
                  <option key={s} value={s}>{s === 'none' ? 'None' : s.toUpperCase()}</option>
                ))}
              </select>
              <div
                className="source-indicator"
                style={{ background: AUDIO_SOURCE_COLORS[param.source] || AUDIO_SOURCE_COLORS.none }}
              />
              <div className="mod-label">Amount</div>
              <div className="mod-slider-container">
                <input
                  type="range"
                  className="mod-slider"
                  min="0"
                  max="100"
                  value={param.amount}
                  onChange={(e) => updateParam(index, 'amount', parseInt(e.target.value))}
                  style={{ ['--source-color' as string]: AUDIO_SOURCE_COLORS[param.source] || AUDIO_SOURCE_COLORS.none } as React.CSSProperties}
                />
                <span className="mod-value">{param.amount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
