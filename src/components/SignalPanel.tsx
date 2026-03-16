'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface SignalPanelProps {
  injectActive: boolean;
  onInjectToggle: (active: boolean) => void;
  promptText: string;
  onPromptChange: (text: string) => void;
}

const AUTO_INJECT_INTERVAL = 5000; // 5s
const P6_FLUSH_DELAY = 5000; // 5s after broadcast

export default function SignalPanel({
  injectActive,
  onInjectToggle,
  promptText,
  onPromptChange,
}: SignalPanelProps) {
  const [transEnabled, setTransEnabled] = useState(false);
  const [debounceMs, setDebounceMs] = useState(800);
  const [autoInjectCountdown, setAutoInjectCountdown] = useState(5);
  const [lastBroadcast, setLastBroadcast] = useState<number | null>(null);
  const [p6Flushing, setP6Flushing] = useState(false);
  const autoInjectRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const p6TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTransToggle = useCallback((checked: boolean) => {
    setTransEnabled(checked);
  }, []);

  // Auto-inject every 5s when inject is live
  useEffect(() => {
    if (injectActive) {
      setAutoInjectCountdown(5);

      // Countdown timer (visual)
      countdownRef.current = setInterval(() => {
        setAutoInjectCountdown(prev => {
          if (prev <= 1) return 5;
          return prev - 1;
        });
      }, 1000);

      // Auto-inject timer
      autoInjectRef.current = setInterval(() => {
        // Simulate broadcast: log that we're injecting
        setLastBroadcast(Date.now());
        console.log('[AutoInject] Broadcasting prompt to fleet:', promptText.slice(0, 60));
      }, AUTO_INJECT_INTERVAL);

      return () => {
        if (autoInjectRef.current) clearInterval(autoInjectRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    } else {
      if (autoInjectRef.current) clearInterval(autoInjectRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setAutoInjectCountdown(5);
    }
  }, [injectActive, promptText]);

  // Prompt + p6 flush to TD 5s after broadcast
  useEffect(() => {
    if (lastBroadcast && injectActive) {
      setP6Flushing(false);
      if (p6TimerRef.current) clearTimeout(p6TimerRef.current);

      p6TimerRef.current = setTimeout(() => {
        setP6Flushing(true);
        console.log('[P6 Flush] Flushing prompt + p6 to TouchDesigner');
        // Reset after brief display
        setTimeout(() => setP6Flushing(false), 1500);
      }, P6_FLUSH_DELAY);

      return () => {
        if (p6TimerRef.current) clearTimeout(p6TimerRef.current);
      };
    }
  }, [lastBroadcast, injectActive]);

  return (
    <div className="signal-panel">
      {/* Transcription */}
      <div className="signal-section">
        <div className="signal-section-hdr">
          <span className="signal-title">// Transcription</span>
          <label className="toggle" title="Enable transcription">
            <input
              type="checkbox"
              checked={transEnabled}
              onChange={(e) => handleTransToggle(e.target.checked)}
            />
            <div className="toggle-track">
              <div className="toggle-thumb" />
            </div>
          </label>
        </div>
        <div className="transcript-box">
          <span className="transcript-dim">waiting for speech...</span>
          {transEnabled && <span className="cursor" />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Nouns</span>
          <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>0 extracted</span>
        </div>
        <div className="noun-tags">
          <span style={{ fontSize: '9px', color: 'var(--text-dim)', opacity: 0.4 }}>none yet</span>
        </div>
        <div style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '5px' }}>
          Base Prompt
        </div>
        <div className="prompt-row">
          <textarea
            className="prompt-base"
            placeholder="baroque cathedral, golden light..."
            value={promptText}
            onChange={(e) => onPromptChange(e.target.value)}
          />
          <button
            className={`prompt-inject ${injectActive ? 'live' : ''}`}
            onClick={() => onInjectToggle(!injectActive)}
          >
            {injectActive ? 'Live' : 'Inject'}
          </button>
        </div>

        {/* Auto-inject indicator — shown when inject is live */}
        {injectActive && (
          <div className="auto-inject-bar">
            <span style={{ fontSize: '8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Auto-Inject</span>
            <div className="inject-progress">
              <div
                className="inject-progress-fill"
                style={{ width: `${((5 - autoInjectCountdown) / 5) * 100}%` }}
              />
            </div>
            <span className="inject-countdown">{autoInjectCountdown}s</span>
            {p6Flushing && (
              <span style={{ color: 'var(--amber)', fontSize: '8px', letterSpacing: '0.08em', fontWeight: 700 }}>
                P6 FLUSH
              </span>
            )}
          </div>
        )}

        <div className="debounce-row">
          <span className="debounce-label">Debounce</span>
          <input
            className="debounce-slider"
            type="range"
            min="200"
            max="3000"
            value={debounceMs}
            onChange={(e) => setDebounceMs(parseInt(e.target.value))}
          />
          <span className="debounce-val">{debounceMs}ms</span>
        </div>
      </div>
    </div>
  );
}
