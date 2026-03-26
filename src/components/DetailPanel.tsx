'use client';

import { FleetSlot, LogEntry, EventEntry, SlotConnectionInfo } from '@/types';
import ConnectionPanel from './ConnectionPanel';
import Explainer from './Explainer';
import TDConnectGuide from './TDConnectGuide';
import WebcamCapture from './WebcamCapture';
import WSLog from './WSLog';

export interface EntityBusEntry {
  timestamp: string;
  key: string;
  value: string;
}

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
  slots?: import('@/types').FleetSlot[];
  entityStates?: Record<string, Record<string, unknown>>;
  webcamActive: boolean;
  onWebcamToggle: (active: boolean) => void;
  onWebcamFrame: (blobUrl: string, fps: number) => void;
  onWebcamFrameData?: (base64: string) => void;
  connectionInfo: SlotConnectionInfo | null;
  onAutoConnect?: () => void;
  onDisconnect?: () => void;
  onUpdateConfig?: (config: { serverUrl?: string; entityId?: string; port?: number; streamPath?: string }) => void;
  remoteEntities?: string[];
  onSignalTypeChange?: (source: string) => void;
  onNodeRoleChange?: (role: 'receive' | 'send' | 'two_way') => void;
  entityBus?: EntityBusEntry[];
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
  slots = [],
  entityStates = {},
  webcamActive,
  onWebcamToggle,
  onWebcamFrame,
  onWebcamFrameData,
  connectionInfo,
  onAutoConnect,
  onDisconnect,
  onUpdateConfig,
  remoteEntities,
  onSignalTypeChange,
  onNodeRoleChange,
  entityBus = [],
}: DetailPanelProps) {
  const hasRemoteFrame = slot?.active && slot.frameUrl && !webcamActive;
  const isSlotActive = slot?.active ?? false;

  // For inactive slots: show the connect guide immediately, skip other panels
  if (slot && !isSlotActive) {
    return (
      <div className="detail-panel">
        {/* Compact header for the slot */}
        <div className="detail-inactive-header">
          <div className="detail-inactive-title">{slot.label}</div>
          <span className="detail-inactive-badge">Available</span>
        </div>

        {/* Connect guide — front and center */}
        <TDConnectGuide
          slot={slot}
          onConnect={onAutoConnect}
          onReconnect={onAutoConnect}
          onDisconnect={onDisconnect}
          onSignalSourceChange={onSignalTypeChange ? (src) => onSignalTypeChange(src) : undefined}
          onRoleChange={onNodeRoleChange}
        />

        {/* Event Log — collapsed at bottom */}
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

        <WSLog entries={logEntries} />
      </div>
    );
  }

  // Active slot or no slot selected — full panel
  return (
    <div className="detail-panel">
      {/* Video Preview */}
      <div className="detail-video-container">
        {hasRemoteFrame ? (
          <>
            <img src={slot!.frameUrl!} alt="Stream" />
            <div className="video-overlay">
              <div className="live-badge">
                <div className="dot online" />
                Live
              </div>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                {slot!.fps ? `${slot!.fps} FPS` : ''}
              </span>
            </div>
          </>
        ) : webcamActive && slot?.frameUrl ? (
          <>
            <img src={slot.frameUrl} alt="Webcam" />
            <div className="video-overlay">
              <div className="live-badge webcam-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Webcam
              </div>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                {slot.fps ? `${slot.fps} FPS` : 'starting...'}
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

      {/* Stream FPS display — replaces START CAMERA button */}
      <div style={{
        padding: '10px 14px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: slot?.active ? 'var(--active)' : 'var(--text-dim)',
            boxShadow: slot?.active ? '0 0 6px var(--active)' : 'none',
          }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: slot?.active ? 'var(--active)' : 'var(--text-dim)' }}>
            {slot?.active ? 'STREAMING' : 'NO SIGNAL'}
          </span>
          {slot?.fps ? (
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-bright)', letterSpacing: '0.04em' }}>
              {slot.fps} <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 400 }}>FPS</span>
            </span>
          ) : null}
        </div>
        {slot?.entity_id && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', opacity: 0.6 }}>{slot.entity_id}</span>
        )}
      </div>

      {/* Webcam Capture — hidden controls only */}
      <WebcamCapture
        active={webcamActive}
        onActiveChange={onWebcamToggle}
        onFrame={onWebcamFrame}
        onFrameData={onWebcamFrameData}
        hidePreview
      />


      {/* Maestra Status + Connection */}
      <ConnectionPanel
        connectionInfo={connectionInfo}
        remoteEntities={remoteEntities}
        onAutoConnect={onAutoConnect}
        onDisconnect={onDisconnect}
        onUpdateConfig={onUpdateConfig}
      />

      {/* TD Connect Guide — for active slots (setup wizard / live panel) */}
      {slot && (
        <TDConnectGuide
          slot={slot}
          onConnect={onAutoConnect}
          onReconnect={onAutoConnect}
          onDisconnect={onDisconnect}
          onSignalSourceChange={onSignalTypeChange ? (src) => onSignalTypeChange(src) : undefined}
          onRoleChange={onNodeRoleChange}
        />
      )}

      {/* ═══ LIVE ENTITY BUS ═══ */}
      <div className="entity-bus">
        <div className="entity-bus-title">// Live Entity Bus</div>
        <div className="entity-bus-inner">
          {entityBus.length === 0 ? (
            <div className="entity-bus-empty">Waiting for signals…</div>
          ) : (
            entityBus.map((entry, i) => (
              <div key={i} className="entity-bus-row">
                <span className="entity-bus-key">{entry.key}</span>
                <span className="entity-bus-arrow">→</span>
                <span className="entity-bus-val">{entry.value}</span>
              </div>
            ))
          )}
        </div>
      </div>

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

      {/* About — below logs */}
      <Explainer />
    </div>
  );
}
