'use client';

import { useState, useCallback } from 'react';

// ── DMX Cue Definitions ──
export interface DmxCue {
  id: string;
  label: string;
  color: string;
  /** Cue category for grouping */
  category: 'reactive' | 'ambient' | 'scene' | 'manual';
}

export const DMX_CUES: DmxCue[] = [
  { id: 'bass_hit', label: 'Bass Hit', color: '#f59e0b', category: 'reactive' },
  { id: 'snare_flash', label: 'Snare Flash', color: '#ef4444', category: 'reactive' },
  { id: 'energy_swell', label: 'Energy Swell', color: '#f97316', category: 'reactive' },
  { id: 'ambient_warm', label: 'Warm Ambient', color: '#fbbf24', category: 'ambient' },
  { id: 'ambient_cool', label: 'Cool Ambient', color: '#38bdf8', category: 'ambient' },
  { id: 'blackout', label: 'Blackout', color: '#374151', category: 'manual' },
  { id: 'full_white', label: 'Full White', color: '#e5e7eb', category: 'manual' },
  { id: 'strobe', label: 'Strobe', color: '#fde047', category: 'manual' },
];

// Scene → cue set mapping
export const SCENE_CUE_MAP: Record<string, string[]> = {
  idle: ['ambient_warm'],
  pulse: ['bass_hit', 'snare_flash'],
  bloom: ['ambient_warm', 'energy_swell'],
  surge: ['bass_hit', 'snare_flash', 'strobe'],
  dissolve: ['ambient_cool'],
};

export interface DmxState {
  currentCue: string | null;
  sequence: string | null;
  step: number;
  progress: number; // 0-1
  paused: boolean;
  lastTrigger: number | null;
  /** History of recent cue triggers */
  history: { cue: string; time: number }[];
}

export function defaultDmxState(): DmxState {
  return {
    currentCue: null,
    sequence: null,
    step: 0,
    progress: 0,
    paused: false,
    lastTrigger: null,
    history: [],
  };
}

interface LightingPanelProps {
  dmxState: DmxState;
  onTriggerCue: (cueId: string) => void;
  onPauseExternal: () => void;
  onFadeOut: () => void;
  /** Audio-reactive threshold config */
  bassThreshold: number;
  onBassThresholdChange: (val: number) => void;
  audioReactiveEnabled: boolean;
  onAudioReactiveToggle: (enabled: boolean) => void;
}

export default function LightingPanel({
  dmxState,
  onTriggerCue,
  onPauseExternal,
  onFadeOut,
  bassThreshold,
  onBassThresholdChange,
  audioReactiveEnabled,
  onAudioReactiveToggle,
}: LightingPanelProps) {
  const [showAllCues, setShowAllCues] = useState(false);

  const handleCueTrigger = useCallback((cueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onTriggerCue(cueId);
  }, [onTriggerCue]);

  const activeCue = DMX_CUES.find(c => c.id === dmxState.currentCue);
  const displayCues = showAllCues ? DMX_CUES : DMX_CUES.filter(c => c.category === 'reactive' || c.category === 'manual');

  return (
    <div className="lighting-panel">
      <div className="lp-header">
        <span className="lp-title">DMX Lighting</span>
        <div className="lp-header-right">
          <span className={`lp-status ${dmxState.currentCue ? 'lp-status-active' : ''}`}>
            {dmxState.currentCue ? activeCue?.label || dmxState.currentCue : 'Idle'}
          </span>
        </div>
      </div>

      {/* ── DMX State Display ── */}
      <div className="lp-state">
        <div className="lp-state-grid">
          <span className="lp-state-key">Cue</span>
          <span className={`lp-state-val ${dmxState.currentCue ? 'lp-val-active' : ''}`}>
            {activeCue ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="lp-cue-dot" style={{ background: activeCue.color }} />
                {activeCue.label}
              </span>
            ) : '—'}
          </span>
          <span className="lp-state-key">Sequence</span>
          <span className="lp-state-val">{dmxState.sequence || '—'}</span>
          <span className="lp-state-key">Step</span>
          <span className="lp-state-val">{dmxState.step || '—'}</span>
          <span className="lp-state-key">Progress</span>
          <span className="lp-state-val">
            <div className="lp-progress-bar">
              <div className="lp-progress-fill" style={{ width: `${dmxState.progress * 100}%` }} />
            </div>
          </span>
        </div>
      </div>

      {/* ── Audio Reactive Config ── */}
      <div className="lp-section">
        <div className="lp-section-head">
          <span>Audio → Lighting</span>
          <button
            className={`lp-toggle-btn ${audioReactiveEnabled ? 'lp-toggle-on' : ''}`}
            onClick={() => onAudioReactiveToggle(!audioReactiveEnabled)}
          >
            {audioReactiveEnabled ? '● ON' : '○ OFF'}
          </button>
        </div>
        {audioReactiveEnabled && (
          <div className="lp-threshold-row">
            <span className="lp-threshold-label">Bass threshold</span>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={bassThreshold}
              onChange={e => onBassThresholdChange(parseFloat(e.target.value))}
              className="lp-threshold-slider"
            />
            <span className="lp-threshold-val">{bassThreshold.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* ── Cue Triggers ── */}
      <div className="lp-section">
        <div className="lp-section-head">
          <span>Trigger Cue</span>
          <button className="lp-show-all" onClick={() => setShowAllCues(!showAllCues)}>
            {showAllCues ? 'Less' : 'All'}
          </button>
        </div>
        <div className="lp-cue-grid">
          {displayCues.map(cue => (
            <button
              key={cue.id}
              className={`lp-cue-btn ${dmxState.currentCue === cue.id ? 'lp-cue-active' : ''}`}
              style={{ '--cue-color': cue.color } as React.CSSProperties}
              onClick={e => handleCueTrigger(cue.id, e)}
            >
              <span className="lp-cue-dot" style={{ background: cue.color }} />
              {cue.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Control Actions ── */}
      <div className="lp-section">
        <div className="lp-section-head">Controls</div>
        <div className="lp-control-row">
          <button className={`lp-control-btn ${dmxState.paused ? 'lp-control-active' : ''}`} onClick={onPauseExternal}>
            {dmxState.paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button className="lp-control-btn lp-control-fade" onClick={onFadeOut}>
            ◐ Fade Out
          </button>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      {dmxState.history.length > 0 && (
        <div className="lp-section">
          <div className="lp-section-head">Recent Cues</div>
          <div className="lp-history">
            {dmxState.history.slice(0, 6).map((h, i) => {
              const cue = DMX_CUES.find(c => c.id === h.cue);
              const ago = Math.round((Date.now() - h.time) / 1000);
              return (
                <div key={i} className="lp-history-row">
                  <span className="lp-cue-dot" style={{ background: cue?.color || '#666' }} />
                  <span className="lp-history-cue">{cue?.label || h.cue}</span>
                  <span className="lp-history-ago">{ago}s ago</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
