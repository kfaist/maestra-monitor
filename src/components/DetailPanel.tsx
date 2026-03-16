'use client';

import { FleetSlot, LogEntry, EventEntry } from '@/types';
import SignalPanel from './SignalPanel';
import TDConnectGuide from './TDConnectGuide';
import WSLog from './WSLog';

interface DetailPanelProps {
  slot: FleetSlot | null;
  logEntries: LogEntry[];
  eventEntries: EventEntry[];
  injectActive: boolean;
  onInjectToggle: (active: boolean) => void;
  promptText: string;
  onPromptChange: (text: string) => void;
  onBroadcast: (prompt: string) => void;
  onP6Flush: (prompt: string) => void;
}

export default function DetailPanel({
  slot,
  logEntries,
  eventEntries,
  injectActive,
  onInjectToggle,
  promptText,
  onPromptChange,
  onBroadcast,
  onP6Flush,
}: DetailPanelProps) {
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

      {/* TD Connect Guide — shown for active/selected slots */}
      {slot && (
        <TDConnectGuide slot={slot} />
      )}

      {/* Signal Panel */}
      <SignalPanel
        injectActive={injectActive}
        onInjectToggle={onInjectToggle}
        promptText={promptText}
        onPromptChange={onPromptChange}
        onBroadcast={onBroadcast}
        onP6Flush={onP6Flush}
      />

      {/* Event Log */}
      <div className="event-log">
        <div className="event-log-title">// Event Log</div>
        <div className="event-log-inner">
          {eventEntries.length === 0 ? (
            <div style={{ fontSize: '9px', color: 'var(--text-dim)', opacity: 0.4 }}>No events yet</div>
          ) : (
            eventEntries.map((evt, i) => (
              <div key={i} className="event-line">
                <span className="event-time">[{evt.timestamp}]</span>
                <span className={`event-type ${evt.eventType}`}>
                  {evt.eventType === 'connect' ? 'JOIN' : evt.eventType === 'disconnect' ? 'LEFT' : evt.eventType === 'state' ? 'STATE' : 'STREAM'}
                </span>
                <span className="event-msg">{evt.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* WS Log */}
      <WSLog entries={logEntries} />
    </div>
  );
}
