'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ModulationParam, AudioSource } from '@/types';
import { INITIAL_MODULATION_PARAMS } from '@/mock/modulation';
import { AUDIO_SOURCE_COLORS } from '@/lib/constants';

const SOURCES: AudioSource[] = ['none', 'rms', 'bpm', 'sub', 'bass', 'mid', 'high'];
const DEBOUNCE_MS = 200;

interface ModulationGridProps {
  onModulationChange?: (paramName: string, source: string, amount: number) => void;
  syncedParams?: Array<{ name: string; source: string; amount: number }> | null;
}

export default function ModulationGrid({ onModulationChange, syncedParams }: ModulationGridProps) {
  const [params, setParams] = useState<ModulationParam[]>(INITIAL_MODULATION_PARAMS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onModulationChange);
  onChangeRef.current = onModulationChange;
  const lastLocalRef = useRef(0);

  // Apply synced state from other browsers
  useEffect(() => {
    if (!syncedParams || syncedParams.length === 0) return;
    if (Date.now() - lastLocalRef.current < 2000) return;
    setParams(prev => prev.map(p => {
      const synced = syncedParams.find(s => s.name === p.name);
      if (!synced) return p;
      return { ...p, source: synced.source as AudioSource, amount: synced.amount };
    }));
  }, [syncedParams]);

  const sendChange = useCallback((name: string, source: string, amount: number) => {
    lastLocalRef.current = Date.now();
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
                style={{ color: ({ none: '#6B7280', rms: '#E5F9FF', bpm: '#FFD84D', sub: '#7C3AED', bass: '#FF2FA3', mid: '#FF8A3D', high: '#3DD6FF' })[param.source] || '#6B7280', background: 'rgba(0,0,0,0.4)', border: `1px solid ${({ none: '#6B7280', rms: '#E5F9FF', bpm: '#FFD84D', sub: '#7C3AED', bass: '#FF2FA3', mid: '#FF8A3D', high: '#3DD6FF' })[param.source] || '#6B7280'}40` }}
              >
                {SOURCES.map(s => {
                  const colors: Record<string, string> = {
                    none: '#6B7280', rms: '#E5F9FF', bpm: '#FFD84D',
                    sub: '#7C3AED', bass: '#FF2FA3', mid: '#FF8A3D', high: '#3DD6FF',
                  };
                  const icons: Record<string, string> = {
                    none: '·', rms: '◈', bpm: '♩', sub: '▋', bass: '▋', mid: '▋', high: '▋',
                  };
                  return (
                    <option key={s} value={s} style={{ color: colors[s], background: '#0a0a14' }}>
                      {icons[s]} {s === 'none' ? 'None' : s.toUpperCase()}
                    </option>
                  );
                })}
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
