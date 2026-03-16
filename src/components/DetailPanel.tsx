'use client';

import { FleetSlot, LogEntry } from '@/types';
import SignalPanel from './SignalPanel';
import WSLog from './WSLog';

interface DetailPanelProps {
  slot: FleetSlot | null;
  logEntries: LogEntry[];
  onReconnect: () => void;
  onCycleSource: () => void;
}

export default function DetailPanel({ slot, logEntries, onReconnect, onCycleSource }: DetailPanelProps) {
  return (
    <div className="detail-panel">
      {/* Video Preview */}
      <div className="detail-video-container">
        {slot?.active && slot.frameUrl ? (
          <>
            <img src={slot.frameUrl} alt="Stream" />
            <div className="video-overlay">
              <div className="live-badge">
                <div className="dot online" />
                Live
              </div>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                {slot.fps ? `${slot.fps} FPS` : ''}
              </span>
            </div>
          </>
        ) : (
          <div className="detail-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={slot?.active ? 'rgba(0,212,255,0.3)' : '#3a3a55'} strokeWidth="1">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              {!slot?.active && (
                <>
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </>
              )}
            </svg>
            <p>{slot?.active ? 'Waiting for stream...' : slot ? 'No Signal' : 'Select a slot'}</p>
          </div>
        )}
      </div>

      {/* Detail Content */}
      <div>
        {slot?.active ? (
          <div className="detail-info">
            <div className="detail-name">{slot.label}</div>
            <div className="detail-type">{slot.endpoint || 'No endpoint'}</div>
            <div className="detail-stats">
              <div className="stat-cell">
                <div className="stat-label">FPS</div>
                <div className="stat-value online">{slot.fps ?? '--'}</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Status</div>
                <div className="stat-value online">Live</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Stream</div>
                <div className="stat-value" style={{ fontSize: '11px', letterSpacing: '0.06em' }}>/video/frame/td</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Source</div>
                <div className="stat-value" style={{ fontSize: '13px' }}>StreamDiffusion</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', padding: '0 0 4px' }}>
              <button className="btn primary" onClick={onReconnect} style={{ fontSize: '9px', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                &#x21BA; Reconnect Stream
              </button>
              <button className="btn" onClick={onCycleSource} style={{ fontSize: '9px', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                &#x2630; GPU Nodes
              </button>
            </div>
          </div>
        ) : slot?.suggestion ? (
          <div className="detail-info" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-bright)' }}>{slot.suggestion.title}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.7 }}>{slot.suggestion.desc}</div>
            <span className={`suggestion-tag ${slot.suggestion.tag}`} style={{ opacity: 0.7, alignSelf: 'flex-start' }}>{slot.suggestion.tagLabel}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '32px', color: 'var(--text-dim)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>No slot selected</p>
          </div>
        )}
      </div>

      {/* Signal Panel */}
      <SignalPanel />

      {/* Fleet Input */}
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
          // Fleet Input (P6 Live)
        </div>
        <div style={{ fontSize: '11px', color: 'var(--accent)', minHeight: '18px', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
          &mdash;
        </div>
      </div>

      {/* WS Log */}
      <WSLog entries={logEntries} />
    </div>
  );
}
