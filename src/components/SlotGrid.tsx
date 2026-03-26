'use client';

import { SLOT_COLORS } from './SignalPanel';
import { useState, useEffect, useCallback } from 'react';
import { FleetSlot, slotStatusLabel, slotStatusClass, formatAge, EventEntry } from '@/types';

type InlineStage = 'idle' | 'connect' | 'role' | 'signal' | 'reference';
type NodeRole = 'receive' | 'send' | 'two_way';
type SignalSource = 'touchdesigner' | 'json_stream' | 'osc' | 'audio_reactive' | 'text' | 'test_signal';

interface SlotSetup {
  stage: InlineStage;
  role: NodeRole | null;
  signal: SignalSource | null;
  refPath: string;
  refFile: string | null;
}

interface InjectState {
  field: string;
  value: string;
}

interface SourceState {
  path: string;
  fileName: string | null;
}

/** Per-entity state map: entity_id → { key: value } */
export type EntityStateMap = Record<string, Record<string, string>>;

interface SlotGridProps {
  slots: FleetSlot[];
  selectedId: string | null;
  onSelectSlot: (id: string) => void;
  onAddSlot: () => void;
  onJoinNode: () => void;
  onSlotSetupComplete?: (slotId: string, role: NodeRole, signal: SignalSource) => void;
  onInjectSignal?: (slotId: string, field: string, value: string) => void;
  onSourceUpdate?: (slotId: string, path: string, fileName: string | null) => void;
  eventEntries?: EventEntry[];
  /** Live entity state for each entity */
  entityStates?: EntityStateMap;
}

const ROLES: { value: NodeRole; label: string; icon: string; color: string }[] = [
  { value: 'send', label: 'Send', icon: '↑', color: '#22c55e' },
  { value: 'receive', label: 'Receive', icon: '↓', color: '#5cc8ff' },
  { value: 'two_way', label: 'Both', icon: '↕', color: '#fbbf24' },
];

const SIGNALS: { value: SignalSource; label: string; icon: string; color: string; refHint: string }[] = [
  { value: 'touchdesigner', label: 'Visual', icon: '◆', color: '#d946ef', refHint: 'Select the TOP that will be streamed' },
  { value: 'audio_reactive', label: 'Audio', icon: '♫', color: '#f59e0b', refHint: 'Select the CHOP that publishes analysis' },
  { value: 'json_stream', label: 'JSON', icon: '{}', color: '#38bdf8', refHint: 'Point to the DAT or script that emits JSON' },
  { value: 'text', label: 'Text', icon: 'A', color: '#22c55e', refHint: 'Enter the text source DAT path' },
  { value: 'osc', label: 'OSC', icon: '~', color: '#14b8a6', refHint: 'Configure the OSC In CHOP path' },
  { value: 'test_signal', label: 'Test', icon: '▶', color: '#6b7280', refHint: 'No operator needed — test pattern generated' },
];

/** Derive publishing signals from signal type */
function getPublishingSignals(slot: FleetSlot): string[] {
  const role = slot.nodeRole;
  if (role === 'receive') return [];
  const sig = slot.signalType;
  if (sig === 'audio_reactive') return ['bpm', 'bass', 'energy', 'rms'];
  if (sig === 'touchdesigner') return ['frame', 'render.state'];
  if (sig === 'json_stream') return ['data.payload'];
  if (sig === 'osc') return ['osc.msg'];
  if (sig === 'text') return ['text.content'];
  if (sig === 'test_signal') return ['test.ping'];
  return ['frame'];
}

/** Derive listening signals from signal type */
function getListeningSignals(slot: FleetSlot): string[] {
  const role = slot.nodeRole;
  if (role === 'send') return [];
  const sig = slot.signalType;
  if (sig === 'audio_reactive') return ['lighting.scene', 'visual.palette'];
  if (sig === 'touchdesigner') return ['prompt.keyword', 'visual.palette', 'lighting.scene'];
  if (sig === 'json_stream') return ['data.config'];
  if (sig === 'osc') return ['osc.control'];
  if (sig === 'text') return ['prompt.keyword'];
  if (sig === 'test_signal') return ['test.pong'];
  return ['prompt.keyword', 'lighting.scene'];
}

export default function SlotGrid({ slots, selectedId, onSelectSlot, onAddSlot, onJoinNode, onSlotSetupComplete, onInjectSignal, onSourceUpdate, eventEntries = [], entityStates = {} }: SlotGridProps) {
  const activeCount = slots.filter(s => s.active).length;
  const hasActiveNodes = activeCount > 0;

  const [setupState, setSetupState] = useState<Record<string, SlotSetup>>({});
  const [injectState, setInjectState] = useState<Record<string, InjectState>>({});
  const [sourceState, setSourceState] = useState<Record<string, SourceState>>({});
  // Lock state — active slots are auto-locked, can be manually unlocked
  const [lockedSlots, setLockedSlots] = useState<Set<string>>(new Set());
  const [lockedLabels, setLockedLabels] = useState<Record<string, string>>({});

  const toggleLock = (slotId: string, slot: FleetSlot, entityState: Record<string, unknown>) => {
    setLockedSlots(prev => {
      const n = new Set(prev);
      if (n.has(slotId)) {
        n.delete(slotId);
      } else {
        // On lock: derive label from tool type + entity name
        const toeName = entityState?.toe_name as string | undefined;
        const entityId = slot.entity_id || slotId;
        // Detect tool type from entity metadata or signal type
        const toolTag = slot.signalType === 'audio_reactive' ? 'Max/MSP'
          : slot.signalType === 'osc' ? 'Max/MSP'
          : slot.cloudNode ? 'Scope'
          : 'TouchDesigner';
        const shortName = toeName || entityId.replace(/_/g, ' ').replace(/\w/g, l => l.toUpperCase());
        setLockedLabels(p => ({ ...p, [slotId]: `${toolTag} · ${shortName}` }));
        n.add(slotId);
      }
      return n;
    });
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // When a slot becomes active, clear its setup state
  useEffect(() => {
    setSetupState(prev => {
      const next = { ...prev };
      let changed = false;
      slots.forEach(s => {
        if (s.active && next[s.id]) {
          delete next[s.id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [slots]);

  const handleSlotClick = useCallback((slot: FleetSlot) => {
    if (slot.active) {
      onSelectSlot(slot.id);
      return;
    }
    const current = setupState[slot.id];
    if (current && current.stage !== 'idle') {
      onSelectSlot(slot.id);
      return;
    }
    onSelectSlot(slot.id);
    setSetupState(prev => ({
      ...prev,
      [slot.id]: { stage: 'connect', role: null, signal: null, refPath: 'project1/', refFile: null },
    }));
  }, [setupState, onSelectSlot]);

  const handleConnect = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], stage: 'role' },
    }));
  }, []);

  const handleRoleSelect = useCallback((slotId: string, role: NodeRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], role, stage: 'signal' },
    }));
  }, []);

  const handleSignalSelect = useCallback((slotId: string, signal: SignalSource, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], signal, stage: 'reference' },
    }));
  }, []);

  const handleRefPathChange = useCallback((slotId: string, path: string) => {
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], refPath: path },
    }));
  }, []);

  const handleFileUpload = useCallback((slotId: string, file: File) => {
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], refFile: file.name },
    }));
  }, []);

  const handleReferenceComplete = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const setup = setupState[slotId];
    if (!setup?.role || !setup?.signal) return;
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], stage: 'idle' },
    }));
    onSlotSetupComplete?.(slotId, setup.role, setup.signal);
  }, [setupState, onSlotSetupComplete]);

  const handleBack = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => {
      const current = prev[slotId];
      if (!current) return prev;
      if (current.stage === 'reference') return { ...prev, [slotId]: { ...current, stage: 'signal', signal: null } };
      if (current.stage === 'signal') return { ...prev, [slotId]: { ...current, stage: 'role', role: null } };
      if (current.stage === 'role') return { ...prev, [slotId]: { ...current, stage: 'connect' } };
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  // ═══ Signal Injection handlers ═══
  const handleInjectFieldChange = useCallback((slotId: string, field: string) => {
    setInjectState(prev => ({ ...prev, [slotId]: { ...prev[slotId] || { field: '', value: '' }, field } }));
  }, []);

  const handleInjectValueChange = useCallback((slotId: string, value: string) => {
    setInjectState(prev => ({ ...prev, [slotId]: { ...prev[slotId] || { field: '', value: '' }, value } }));
  }, []);

  const handleInjectSend = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const state = injectState[slotId];
    if (!state?.field || !state?.value) return;
    onInjectSignal?.(slotId, state.field, state.value);
    // Clear value after send
    setInjectState(prev => ({ ...prev, [slotId]: { ...prev[slotId], value: '' } }));
  }, [injectState, onInjectSignal]);

  // ═══ Source/Reference handlers ═══
  const handleSourcePathChange = useCallback((slotId: string, path: string) => {
    setSourceState(prev => ({ ...prev, [slotId]: { ...prev[slotId] || { path: '', fileName: null }, path } }));
    onSourceUpdate?.(slotId, path, sourceState[slotId]?.fileName || null);
  }, [sourceState, onSourceUpdate]);

  const handleSourceFileUpload = useCallback((slotId: string, file: File) => {
    setSourceState(prev => ({ ...prev, [slotId]: { path: prev[slotId]?.path || '', fileName: file.name } }));
    onSourceUpdate?.(slotId, sourceState[slotId]?.path || '', file.name);
  }, [sourceState, onSourceUpdate]);

  return (
    <>
      <div className="panel-header">
        <div className="panel-title-sm">// Fleet Slots</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="entity-count">{activeCount} active / {slots.length} slots</div>
          <button className="btn-add" onClick={onAddSlot}>+ Add Slot</button>
        </div>
      </div>
      <div className="slot-grid">
        {slots.map(slot => {
          const mStatus = slot.maestraStatus;
          const statusText = mStatus ? slotStatusLabel(mStatus) : (
            slot.active ? (slot.connection_status === 'connected' ? 'Active' : 'Connecting') : ''
          );
          const statusCls = mStatus ? slotStatusClass(mStatus) : '';

          let lastEventStr = '';
          if (mStatus && slot.active) {
            const timestamps = [mStatus.lastHeartbeatAt, mStatus.lastStateUpdateAt, mStatus.lastStreamFrameAt].filter(Boolean) as number[];
            if (timestamps.length > 0) {
              const mostRecent = Math.max(...timestamps);
              const age = Math.max(0, now - mostRecent);
              lastEventStr = `last: ${formatAge(age)}`;
            }
          }

          let waitingStr = '';
          if (mStatus && mStatus.heartbeat === 'waiting' && mStatus.entity === 'registered' && mStatus.registeredAt) {
            waitingStr = `${formatAge(Math.max(0, now - mStatus.registeredAt))} since registration`;
          }

          const setup = setupState[slot.id];
          const inSetup = setup && setup.stage !== 'idle';

          // Heartbeat latency display
          let heartbeatMs = '';
          if (mStatus && mStatus.lastHeartbeatAt) {
            const age = Math.max(0, now - mStatus.lastHeartbeatAt);
            heartbeatMs = age < 1000 ? `${Math.round(age)} ms` : formatAge(age);
          }

          // Recent events for this slot
          const slotEvents = slot.entity_id
            ? eventEntries.filter(e => e.entityId === slot.entity_id || e.entityId === slot.id).slice(-4)
            : eventEntries.filter(e => e.entityId === slot.id).slice(-4);

          // Inject state for this slot
          const inject = injectState[slot.id] || { field: 'audio.bpm', value: '' };
          const source = sourceState[slot.id] || { path: 'project1/', fileName: null };

          // Publishing / listening signals
          const publishing = slot.active ? getPublishingSignals(slot) : [];
          const listening = slot.active ? getListeningSignals(slot) : [];

          // Derive state badge
          const stateBadge = (() => {
            if (!slot.active) return { text: '', cls: '' };
            if (mStatus?.stream === 'live') return { text: 'STREAMING', cls: 'badge-streaming' };
            if (mStatus?.heartbeat === 'live' || mStatus?.stateSync === 'active') return { text: 'ACTIVE', cls: 'badge-active' };
            if (mStatus?.heartbeat === 'stale' || mStatus?.heartbeat === 'lost') return { text: 'PAUSED', cls: 'badge-paused' };
            if (slot.nodeRole === 'receive') return { text: 'MONITOR', cls: 'badge-monitor' };
            return { text: 'ACTIVE', cls: 'badge-active' };
          })();

          const slotColor = SLOT_COLORS[slots.indexOf(slot) % SLOT_COLORS.length];
          return (
            <div
              key={slot.id}
              style={{ '--slot-color': slotColor } as React.CSSProperties}
              className={[
                'slot',
                slot.active ? 'active-slot' : '',
                slot.id === selectedId ? 'selected' : '',
                slot.cloudNode ? 'cloud-node' : '',
                inSetup ? 'setup-mode' : '',
                slot.active ? 'live-mode' : '',
                (slot.active && lockedSlots.has(slot.id)) ? 'locked-slot' : '',
              ].filter(Boolean).join(' ')}
              data-signal={slot.signalType || undefined}
              onClick={() => handleSlotClick(slot)}
            >
              {/* ═══════ ACTIVE SLOT: LIVE NODE PANEL ═══════ */}
              {slot.active ? (
                <div className="live-node-panel">
                  {/* Thumbnail frame at top */}
                  <div className="live-node-thumb">
                    {slot.frameUrl ? (
                      <img src={slot.frameUrl} alt="stream" />
                    ) : (
                      <div className="live-node-thumb-placeholder">
                        <span className="live-node-thumb-icon">
                          {slot.signalType === 'audio_reactive' ? '♫'
                            : slot.signalType === 'json_stream' ? '{}'
                            : slot.signalType === 'osc' ? '~'
                            : slot.signalType === 'touchdesigner' ? '◆'
                            : slot.signalType === 'text' ? 'A'
                            : '●'}
                        </span>
                        <span className="live-node-thumb-status">{statusText}</span>
                      </div>
                    )}
                    <div className={`live-node-badge ${statusCls}`}>LIVE</div>
                  </div>

                  {/* ── Section 1: Device · Entity · Heartbeat · Stream ── */}
                  <div className="live-section">
                    <div className="live-section-head">Status</div>
                    <div className="live-kv-grid">
                      <span className="live-kv-key">Device</span>
                      <span className={`live-kv-val ${mStatus?.server === 'connected' ? 'val-ok' : 'val-warn'}`}>
                        {mStatus?.server === 'connected' ? 'connected' : mStatus?.server || 'offline'}
                      </span>
                      <span className="live-kv-key">Entity</span>
                      <span className="live-kv-val">{slot.entity_id || slot.id}</span>
                      {/* Entity type from TOX metadata */}
                      {(() => {
                        const eid = slot.entity_id || slot.id;
                        const meta = entityStates[eid] as Record<string,unknown>|undefined;
                        const t = meta?.entity_type || meta?.type;
                        const st = meta?.stream_type;
                        if (!t && !st) return null;
                        return (<>
                          <span className="live-kv-key">Type</span>
                          <span className="live-kv-val" style={{ color: 'var(--slot-color, #00d4ff)', fontSize: 9 }}>
                            {t ? String(t) : ''}{st ? ` · ${String(st)}` : ''}
                          </span>
                        </>);
                      })()}
                      <span className="live-kv-key">Heartbeat</span>
                      <span className={`live-kv-val ${mStatus?.heartbeat === 'live' ? 'val-ok' : mStatus?.heartbeat === 'stale' ? 'val-warn' : ''}`}>
                        {heartbeatMs ? `${heartbeatMs} ago` : 'waiting'}
                      </span>
                      <span className="live-kv-key">Stream</span>
                      <span className={`live-kv-val ${mStatus?.stream === 'live' ? 'val-ok' : ''}`}>
                        {mStatus?.stream || 'none'}
                      </span>
                    </div>
                  </div>

                  {/* ── Section 2: Signals ── */}
                  <div className="live-section">
                    <div className="live-section-head">Signals</div>
                    {publishing.length > 0 && (
                      <div className="live-signal-group">
                        <span className="live-signal-dir">Publishing State</span>
                        <div className="live-signal-list">
                          {publishing.map(s => <span key={s} className="live-signal-tag pub">{s}</span>)}
                        </div>
                      </div>
                    )}
                    {listening.length > 0 && (
                      <div className="live-signal-group">
                        <span className="live-signal-dir">Listening State</span>
                        <div className="live-signal-list">
                          {listening.map(s => <span key={s} className="live-signal-tag sub">{s}</span>)}
                        </div>
                      </div>
                    )}
                    {publishing.length === 0 && listening.length === 0 && (
                      <span className="live-empty">No signals configured</span>
                    )}
                  </div>

                  {/* ── Section 3: Entity State ── */}
                  {(() => {
                    const eid = slot.entity_id || slot.id;
                    const stateObj = entityStates[eid];
                    const entries = stateObj ? Object.entries(stateObj) : [];
                    return entries.length > 0 ? (
                      <div className="live-section">
                        <div className="live-section-head">State</div>
                        <div className="live-state-table">
                          {entries.slice(0, 8).map(([k, v]) => (
                            <div key={k} className="live-state-row">
                              <span className="live-state-key">{k}</span>
                              <span className="live-state-val">{v}</span>
                            </div>
                          ))}
                          {entries.length > 8 && (
                            <div className="live-state-row">
                              <span className="live-state-key live-state-more">+{entries.length - 8} more</span>
                              <span className="live-state-val" />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* ── Section 4: Signal Injection ── */}
                  <div className="live-section">
                    <div className="live-section-head">Inject Signal</div>
                    <div className="live-inject-form">
                      <div className="live-inject-row">
                        <span className="live-inject-label">field</span>
                        <input
                          className="live-inject-input"
                          type="text"
                          value={inject.field}
                          onClick={e => e.stopPropagation()}
                          onChange={e => handleInjectFieldChange(slot.id, e.target.value)}
                          placeholder="audio.bpm"
                        />
                      </div>
                      <div className="live-inject-row">
                        <span className="live-inject-label">value</span>
                        <input
                          className="live-inject-input"
                          type="text"
                          value={inject.value}
                          onClick={e => e.stopPropagation()}
                          onChange={e => handleInjectValueChange(slot.id, e.target.value)}
                          placeholder="120"
                        />
                      </div>
                      <button
                        className="live-inject-send"
                        onClick={e => handleInjectSend(slot.id, e)}
                        disabled={!inject.field || !inject.value}
                      >
                        Send
                      </button>
                    </div>
                  </div>

                  {/* ── Section 4: Source / Reference ── */}
                  <div className="live-section">
                    <div className="live-section-head">Source</div>
                    <div className="live-source-form">
                      {/* Upload */}
                      <label className="live-source-upload" onClick={e => e.stopPropagation()}>
                        <span className="live-source-upload-icon">↑</span>
                        <span className="live-source-upload-text">{source.fileName || 'Upload .tox .toe .wav ...'}</span>
                        <input
                          type="file"
                          accept=".tox,.toe,.wav,.mp3,.mp4,.mov,.json,.txt,.py,.obj,.fbx,.glb,.gltf,.hdr,.exr,.png,.jpg,.jpeg,.gif,.svg"
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleSourceFileUpload(slot.id, f);
                          }}
                        />
                      </label>
                      {/* Local path */}
                      <div className="live-inject-row">
                        <span className="live-inject-label">path</span>
                        <input
                          className="live-inject-input"
                          type="text"
                          value={source.path}
                          onClick={e => e.stopPropagation()}
                          onChange={e => handleSourcePathChange(slot.id, e.target.value)}
                          placeholder="project1/mynode.tox"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Section 5: Recent Activity ── */}
                  <div className="live-section">
                    <div className="live-section-head">Recent Activity</div>
                    <div className="live-activity-log">
                      {slotEvents.length > 0 ? slotEvents.map((ev, i) => (
                        <div key={i} className="live-activity-row">
                          <span className="live-activity-time">{ev.timestamp}</span>
                          <span className="live-activity-msg">{ev.message}</span>
                        </div>
                      )) : (
                        <span className="live-empty">No recent events</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* ═══════ INACTIVE SLOT ═══════ */
                <div className="slot-video-area">
                  {inSetup ? (
                    /* ════ INLINE SETUP WIZARD ════ */
                    <div className="slot-inline-wizard">
                      {/* Step indicator — 4 steps */}
                      <div className="slot-wizard-steps">
                        <span className={`slot-wizard-dot ${setup.stage === 'connect' ? 'active' : 'done'}`} />
                        <span className="slot-wizard-line" />
                        <span className={`slot-wizard-dot ${setup.stage === 'role' ? 'active' : (setup.stage === 'signal' || setup.stage === 'reference') ? 'done' : ''}`} />
                        <span className="slot-wizard-line" />
                        <span className={`slot-wizard-dot ${setup.stage === 'signal' ? 'active' : setup.stage === 'reference' ? 'done' : ''}`} />
                        <span className="slot-wizard-line" />
                        <span className={`slot-wizard-dot ${setup.stage === 'reference' ? 'active' : ''}`} />
                      </div>

                      {/* STAGE: Connect */}
                      {setup.stage === 'connect' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title">Connect a Node</div>
                          <button
                            className="slot-wizard-btn slot-wizard-btn-primary"
                            onClick={(e) => handleConnect(slot.id, e)}
                          >
                            <span style={{ fontSize: 12 }}>⚡</span> Connect
                          </button>
                          <button
                            className="slot-wizard-btn slot-wizard-btn-ghost"
                            onClick={(e) => { e.stopPropagation(); handleBack(slot.id, e); }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* STAGE: Role */}
                      {setup.stage === 'role' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title">Behavior</div>
                          <div className="slot-wizard-options">
                            {ROLES.map(r => (
                              <button
                                key={r.value}
                                className="slot-wizard-option"
                                style={{ '--opt-color': r.color } as React.CSSProperties}
                                onClick={(e) => handleRoleSelect(slot.id, r.value, e)}
                              >
                                <span className="slot-wizard-option-icon">{r.icon}</span>
                                <span>{r.label}</span>
                              </button>
                            ))}
                          </div>
                          <button
                            className="slot-wizard-btn slot-wizard-btn-ghost"
                            onClick={(e) => handleBack(slot.id, e)}
                          >
                            ← Back
                          </button>
                        </div>
                      )}

                      {/* STAGE: Signal */}
                      {setup.stage === 'signal' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title">This Node Sends</div>
                          <div className="slot-wizard-options slot-wizard-options-grid">
                            {SIGNALS.map(s => (
                              <button
                                key={s.value}
                                className="slot-wizard-option slot-wizard-option-sm"
                                style={{ '--opt-color': s.color } as React.CSSProperties}
                                onClick={(e) => handleSignalSelect(slot.id, s.value, e)}
                              >
                                <span className="slot-wizard-option-icon" style={{ color: s.color }}>{s.icon}</span>
                                <span>{s.label}</span>
                              </button>
                            ))}
                          </div>
                          <button
                            className="slot-wizard-btn slot-wizard-btn-ghost"
                            onClick={(e) => handleBack(slot.id, e)}
                          >
                            ← Back
                          </button>
                        </div>
                      )}

                      {/* STAGE: Reference */}
                      {setup.stage === 'reference' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title">Connect Your Output</div>
                          <div className="slot-wizard-hint">
                            {SIGNALS.find(s => s.value === setup.signal)?.refHint || 'Select the operator or file'}
                          </div>
                          <label
                            className="slot-wizard-btn slot-wizard-btn-primary"
                            style={{ cursor: 'pointer', textAlign: 'center', position: 'relative' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span style={{ fontSize: 11 }}>↑</span>
                            {setup.refFile ? setup.refFile : 'Upload File'}
                            <input
                              type="file"
                              accept=".tox,.wav,.mp3,.mp4,.mov,.json,.txt,.py,.obj,.fbx,.glb,.gltf,.hdr,.exr,.png,.jpg,.jpeg,.gif,.svg"
                              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileUpload(slot.id, f);
                              }}
                            />
                          </label>
                          {/* TOP dropdown — populated when TOX pushes metadata.tops to entity state */}
                          {(() => {
                            const eid = slot.entity_id || slot.id;
                            const tops = (entityStates[eid] as Record<string, unknown> | undefined)?.tops;
                            const topList = Array.isArray(tops) ? tops as string[] : null;
                            if (!topList || topList.length === 0) return null;
                            return (
                              <div style={{ width: '100%' }} onClick={e => e.stopPropagation()}>
                                <div style={{ fontSize: 8, color: '#888', marginBottom: 3, letterSpacing: '0.1em' }}>TOPs available in this project:</div>
                                <select
                                  value={setup.refPath}
                                  onChange={e => handleRefPathChange(slot.id, e.target.value)}
                                  style={{
                                    width: '100%', padding: '4px 6px', fontSize: 9,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(123,47,255,0.4)',
                                    borderRadius: 2, color: '#a78bfa', outline: 'none', cursor: 'pointer',
                                  }}
                                >
                                  <option value="">— select a TOP —</option>
                                  {topList.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                            );
                          })()}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', fontSize: 8, color: '#666' }}>
                            <span style={{ flex: '0 0 auto' }}>or path:</span>
                            <input
                              type="text"
                              value={setup.refPath}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleRefPathChange(slot.id, e.target.value)}
                              placeholder="project1/myfile.tox"
                              style={{
                                flex: 1, padding: '2px 5px', fontSize: 9,
                                fontFamily: "'JetBrains Mono', monospace",
                                background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 2, color: '#a78bfa', outline: 'none', minWidth: 0,
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                            <button
                              className="slot-wizard-btn slot-wizard-btn-ghost"
                              onClick={(e) => handleBack(slot.id, e)}
                            >
                              ← Back
                            </button>
                            <button
                              className="slot-wizard-btn slot-wizard-btn-primary"
                              style={{ flex: 1 }}
                              onClick={(e) => handleReferenceComplete(slot.id, e)}
                            >
                              {setup.refFile ? 'Connect' : 'Skip'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ════ DEFAULT AVAILABLE STATE ════ */
                    <div className="slot-available-state">
                      <div className="slot-available-banner">
                        <span className="slot-available-flicker">AVAILABLE</span>
                      </div>
                      {slot.suggestion && (
                        <span className={`suggestion-tag ${slot.suggestion.tag}`}>{slot.suggestion.tagLabel}</span>
                      )}
                      <div className="slot-available-hover-btn">
                        <span className="slot-available-hover-icon">+</span>
                        Click to Connect
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="slot-footer">
                <div className="slot-footer-left">
                  <div className="slot-label">
                    <span className="slot-label-id">Slot {slots.indexOf(slot) + 1}</span>
                    <span className="slot-label-sep"> — </span>
                    <span className="slot-label-name">
                      {lockedSlots.has(slot.id) && lockedLabels[slot.id]
                        ? lockedLabels[slot.id]
                        : (() => {
                            const eid = slot.entity_id || slot.id;
                            const toeName = (entityStates[eid] as Record<string,unknown>|undefined)?.toe_name;
                            return toeName ? String(toeName) : slot.label;
                          })()
                      }
                    </span>
                  </div>
                  {/* Entity ID tag */}
                  {(slot.entity_id || slot.active) && (
                    <div className="slot-entity-tag">
                      <span className="slot-entity-label">ENTITY</span>
                      <span className="slot-entity-id">{slot.entity_id || slot.id}</span>
                    </div>
                  )}
                </div>
                <div className="slot-meta">
                  <span className="slot-fps">
                    {slot.fps != null ? `${slot.fps}fps` : ''}
                    {slot.fps != null && lastEventStr ? ' · ' : ''}
                    {lastEventStr}
                  </span>
                  {slot.cloudNode && <span className="cloud-badge">&#x2601; Cloud</span>}
                  {/* State badge for active slots */}
                  {slot.active && (
                    <button
                      onClick={e => { e.stopPropagation(); toggleLock(slot.id, slot, entityStates[slot.entity_id || slot.id] as Record<string, unknown> || {}); }}
                      title={lockedSlots.has(slot.id) ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
                      style={{
                        background: 'none',
                        border: `1px solid ${lockedSlots.has(slot.id) ? slotColor + '80' : 'rgba(255,255,255,0.1)'}`,
                        color: lockedSlots.has(slot.id) ? slotColor : 'rgba(255,255,255,0.2)',
                        borderRadius: 2, padding: '1px 5px', fontSize: 9, cursor: 'pointer',
                        transition: 'all 0.15s', lineHeight: 1.2,
                      }}
                    >
                      {lockedSlots.has(slot.id) ? '🔒' : '🔓'}
                    </button>
                  )}
                  {slot.active ? (
                    <span className={`slot-state-badge ${stateBadge.cls}`}>{stateBadge.text}</span>
                  ) : inSetup ? (
                    <span className="slot-tag setup-tag">
                      {setup.stage === 'connect' ? 'Setting up…' : setup.stage === 'role' ? 'Choose behavior' : 'Choose signal'}
                    </span>
                  ) : (
                    <span className="slot-tag available-tag">
                      <span className="available-label">Available</span>
                      <span className="available-connect-btn">Click to Connect</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="selected-badge">
                {slot.active ? (
                  <svg viewBox="0 0 10 10" fill="none" stroke="#000" strokeWidth="1.5">
                    <rect x="2.5" y="4.5" width="5" height="4" rx="0.5"/>
                    <path d="M3.5 4.5V3a2 2 0 0 1 4 0v1.5"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 10 10" fill="none" stroke="#000" strokeWidth="2">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}

        {/* Empty State CTA */}
        {!hasActiveNodes && (
          <div className="empty-state-cta" onClick={onJoinNode}>
            <svg className="cta-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <div className="cta-title">No Nodes Connected</div>
            <div className="cta-desc">
              Click &ldquo;Join Maestra&rdquo; in the header to connect your first TouchDesigner, browser, or Max/MSP node to the fleet.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
