'use client';

import { useState, useCallback } from 'react';

export default function SignalPanel() {
  const [transEnabled, setTransEnabled] = useState(false);
  const [injectActive, setInjectActive] = useState(false);
  const [debounceMs, setDebounceMs] = useState(800);
  const [promptText, setPromptText] = useState('');

  const handleTransToggle = useCallback((checked: boolean) => {
    setTransEnabled(checked);
  }, []);

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
            onChange={(e) => setPromptText(e.target.value)}
          />
          <button
            className={`prompt-inject ${injectActive ? 'live' : ''}`}
            onClick={() => setInjectActive(!injectActive)}
          >
            {injectActive ? 'Live' : 'Inject'}
          </button>
        </div>
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
