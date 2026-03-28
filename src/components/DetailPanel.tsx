'use client';

import { useState, useEffect } from 'react';
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

// ═══ TD Entity Creation Wizard — lives in right panel ═══
function DetailPanelWizard({ slot, eventEntries, logEntries, onAutoConnect, onDisconnect, onSignalTypeChange, onNodeRoleChange }: {
  slot: FleetSlot | null;
  eventEntries: EventEntry[];
  logEntries: LogEntry[];
  onAutoConnect?: () => void;
  onDisconnect?: () => void;
  onSignalTypeChange?: (source: string) => void;
  onNodeRoleChange?: (role: 'receive' | 'send' | 'two_way') => void;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [nodes, setNodes] = useState<{slug:string; name:string; status:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [refFile, setRefFile] = useState<string | null>(null);
  const [wizardStage, setWizardStage] = useState<'pick' | 'confirm'>('pick');

  // Fetch entities from backend
  useEffect(() => {
    fetch('https://maestra-backend-v2-production.up.railway.app/entities')
      .then(r => r.json())
      .then((data: unknown[]) => {
        const seen = new Set<string>();
        const list = data
          .filter((e: unknown) => {
            const en = e as Record<string,unknown>;
            if (!en.slug || seen.has(String(en.slug))) return false;
            seen.add(String(en.slug));
            return true;
          })
          .map((e: unknown) => {
            const en = e as Record<string,unknown>;
            return { slug: String(en.slug), name: String(en.name||en.slug), status: String(en.status||'offline') };
          })
          .sort((a,b) => {
            if (a.status === 'online' && b.status !== 'online') return -1;
            if (b.status === 'online' && a.status !== 'online') return 1;
            return a.slug.localeCompare(b.slug);
          })
          .slice(0, 100);
        setNodes(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = search
    ? nodes.filter(e => e.slug.toLowerCase().includes(search.toLowerCase()) || e.name.toLowerCase().includes(search.toLowerCase()))
    : nodes;

  return (
    <div className="detail-panel">
      {/* ═══ BANNER BUTTON — always visible ═══ */}
      <button
        onClick={() => setWizardOpen(!wizardOpen)}
        style={{
          width: '100%', padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: wizardOpen ? 'rgba(0,212,255,0.12)' : 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(167,139,250,0.08) 100%)',
          border: wizardOpen ? '2px solid rgba(0,212,255,0.5)' : '2px solid rgba(0,212,255,0.25)',
          borderRadius: 0,
          cursor: 'pointer', transition: 'all 0.2s',
          fontFamily: 'var(--font-display)',
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>⚡</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.08em',
            color: '#00d4ff', textTransform: 'uppercase',
          }}>
            TD Entity Creation Wizard
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            {wizardOpen ? 'Select a node or connect a .toe' : 'Connect TouchDesigner to a slot'}
          </div>
        </div>
        <span style={{ fontSize: 14, color: 'rgba(0,212,255,0.6)', transition: 'transform 0.2s', transform: wizardOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>

      {/* ═══ WIZARD PANEL — expands below banner ═══ */}
      {wizardOpen && (
        <div style={{
          padding: '12px 14px',
          background: 'rgba(0,0,0,0.4)',
          borderBottom: '1px solid rgba(0,212,255,0.15)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {wizardStage === 'pick' && (
            <>
              {/* Search / type slug */}
              <input
                type="text"
                value={search}
                placeholder="Search registered nodes or type new slug…"
                onChange={e => { setSearch(e.target.value); setSelectedNode(null); }}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box',
                  fontFamily: "'JetBrains Mono', monospace", color: '#00d4ff', fontWeight: 700,
                  background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,212,255,0.35)',
                  outline: 'none', borderRadius: 3,
                }}
              />

              {/* Node list */}
              {loading ? (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)', padding: '6px 0' }}>Loading nodes…</div>
              ) : filtered.length > 0 ? (
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.5)', borderRadius: 3 }}>
                  {filtered.map(e => (
                    <div key={e.slug}
                      onClick={() => { setSelectedNode(e.slug); setSearch(e.slug); }}
                      style={{
                        padding: '6px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: selectedNode === e.slug ? 'rgba(0,212,255,0.12)' : 'transparent',
                        borderLeft: selectedNode === e.slug ? '3px solid #00d4ff' : '3px solid transparent',
                        transition: 'all 0.1s',
                      }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: e.status === 'online' ? '#4ade80' : 'rgba(255,255,255,0.2)',
                        boxShadow: e.status === 'online' ? '0 0 6px #4ade80' : 'none',
                      }} />
                      <span style={{
                        fontSize: 12, fontFamily: 'var(--font-mono)',
                        color: selectedNode === e.slug ? '#00d4ff' : 'rgba(255,255,255,0.7)',
                        fontWeight: selectedNode === e.slug ? 700 : 400,
                      }}>
                        {e.slug}
                      </span>
                      <span style={{ fontSize: 9, color: e.status === 'online' ? '#4ade80' : 'rgba(255,255,255,0.15)', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', padding: '4px 0' }}>
                  {search ? `No matches for "${search}" — hit Connect to create it` : 'No registered nodes yet'}
                </div>
              )}

              {/* OR divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '.12em' }}>OR BROWSE</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>

              {/* File browse */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', cursor: 'pointer', position: 'relative',
                background: refFile ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                border: refFile ? '1px solid rgba(0,212,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 3,
              }}>
                <span style={{ fontSize: 16 }}>📂</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: refFile ? '#00d4ff' : 'rgba(255,255,255,0.6)' }}>
                    {refFile || 'Browse to .toe file'}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>Select project from disk</div>
                </div>
                <input type="file" accept=".toe,.tox"
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setRefFile(f.name);
                      const derived = f.name.replace(/\.(toe|tox)$/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
                      setSearch(derived);
                      setSelectedNode(derived);
                    }
                  }} />
              </label>

              {/* Paste path */}
              <input type="text" placeholder="Or paste local path  e.g. C:\project\show.toe"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '7px 10px',
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#c8d8e8', outline: 'none', borderRadius: 3,
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (!val) return;
                    const fname = val.replace(/\\/g,'/').split('/').pop() || val;
                    const derived = fname.replace(/\.(toe|tox)$/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'node';
                    setRefFile(val);
                    setSearch(derived);
                    setSelectedNode(derived);
                  }
                }}
              />

              {/* Connect button */}
              <button
                disabled={!selectedNode && !search.trim()}
                onClick={() => {
                  setWizardStage('confirm');
                  onAutoConnect?.();
                }}
                style={{
                  width: '100%', padding: '10px 14px',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: (selectedNode || search.trim()) ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                  border: (selectedNode || search.trim()) ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  color: (selectedNode || search.trim()) ? '#22c55e' : 'rgba(255,255,255,0.2)',
                  cursor: (selectedNode || search.trim()) ? 'pointer' : 'default',
                  borderRadius: 3, transition: 'all 0.15s',
                }}
              >
                Connect {selectedNode || search.trim() ? `"${selectedNode || search.trim()}"` : ''}  →
              </button>
            </>
          )}

          {wizardStage === 'confirm' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', letterSpacing: '.06em' }}>CONNECTING</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                Entity: <span style={{ color: '#00d4ff', fontWeight: 600 }}>{selectedNode || search}</span>
                {refFile && <><br/>File: <span style={{ color: '#a78bfa' }}>{refFile}</span></>}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6, marginBottom: 12 }}>
                Open your .toe project with maestra.tox installed.<br/>
                The node will appear in the slot grid when it connects.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setWizardStage('pick')}
                  style={{ flex: 1, padding: '6px', fontSize: 10, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>
                  ← Back
                </button>
                <button onClick={() => { setWizardOpen(false); setWizardStage('pick'); setSelectedNode(null); setSearch(''); setRefFile(null); }}
                  style={{ flex: 1, padding: '6px', fontSize: 10, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', cursor: 'pointer', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slot info when selected */}
      {slot && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-dim)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>{slot.label}</span>
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.5 }}>Available</span>
        </div>
      )}

      {/* TDConnectGuide — below wizard */}
      <TDConnectGuide
        slot={slot || {
          id: 'slot_3', label: 'Connect .toe', entity_id: '', endpoint: '',
          active: false, fps: null, frameUrl: null, cloudNode: false,
          connection_status: 'disconnected', last_heartbeat: null,
          active_stream: null, state_summary: {}, signalType: 'touchdesigner',
          nodeRole: 'two_way', stateSchema: {},
          suggestion: { title: 'Connect .toe', desc: 'Link a local TouchDesigner project.', tag: 'td' as const, tagLabel: 'TouchDesigner' },
          _frameTimes: [], _fpsSmooth: null,
        } as FleetSlot}
        onConnect={onAutoConnect}
        onReconnect={onAutoConnect}
        onDisconnect={onDisconnect}
        onSignalSourceChange={onSignalTypeChange ? (src) => onSignalTypeChange(src) : undefined}
        onRoleChange={onNodeRoleChange}
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

      <WSLog entries={logEntries} />
    </div>
  );
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

  // For inactive slots: show wizard banner + connect guide
  if (!slot || (slot && !isSlotActive)) {
    return (
      <DetailPanelWizard
        slot={slot}
        eventEntries={eventEntries}
        logEntries={logEntries}
        onAutoConnect={onAutoConnect}
        onDisconnect={onDisconnect}
        onSignalTypeChange={onSignalTypeChange}
        onNodeRoleChange={onNodeRoleChange}
      />
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
