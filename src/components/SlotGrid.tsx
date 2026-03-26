'use client';

import { SLOT_COLORS } from './SignalPanel';
import { useState, useEffect, useCallback } from 'react';
import { FleetSlot, slotStatusLabel, slotStatusClass, formatAge, EventEntry } from '@/types';

type InlineStage = 'idle' | 'connect' | 'slug' | 'addState';
type NodeRole = 'receive' | 'send' | 'two_way';
type SignalSource = 'touchdesigner' | 'json_stream' | 'osc' | 'audio_reactive' | 'text' | 'test_signal';

interface SlotSetup {
  stage: InlineStage;
  slug: string;
  refFile: string | null;
  selectedTop: string;
  stateKey: string;
  stateType: string;
  stateDesc: string;
  outputSignals: Array<{ key: string; type: string; desc: string; top: string }>;
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
  const [pinnedSlots, setPinnedSlots] = useState<Set<string>>(new Set());
  const togglePin = (slotId: string) =>
    setPinnedSlots(prev => { const n = new Set(prev); n.has(slotId) ? n.delete(slotId) : n.add(slotId); return n; });
  // Per-slot server mode: which Maestra server this slot is targeting
  const [slotServerModes, setSlotServerModes] = useState<Record<string, 'auto' | 'gallery' | 'railway' | 'custom'>>({});
  // Cached tops from /api/tops — populated by build_maestra_tox.py
  const [cachedTops, setCachedTops] = useState<string[]>([]);
  const [cachedTree, setCachedTree] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const load = () => fetch('/api/tops')
      .then(r => r.json())
      .then(d => {
        if (d.tops?.length) setCachedTops(d.tops);
        if (d.tree && Object.keys(d.tree).length) setCachedTree(d.tree);
      })
      .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  // Restore saved outputSignals from localStorage on mount
  useEffect(() => {
    slots.forEach(slot => {
      const slug = slot.entity_id || slot.id;
      try {
        const saved = localStorage.getItem('maestra_slot_' + slug);
        if (saved) {
          const sigs = JSON.parse(saved);
          if (Array.isArray(sigs) && sigs.length > 0) {
            setSetupState(prev => ({
              ...prev,
              [slot.id]: { ...prev[slot.id], outputSignals: sigs }
            }));
          }
        }
      } catch {}
    });
  }, [slots.length]);
  const setSlotServer = (slotId: string, mode: 'auto' | 'gallery' | 'railway' | 'custom') =>
    setSlotServerModes(prev => ({ ...prev, [slotId]: mode }));
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
    setSetupState(prev => ({ ...prev, [slot.id]: { stage: 'connect', slug: '', refFile: null, selectedTop: '', stateKey: '', stateType: 'string', stateDesc: '', outputSignals: [] } }));
  }, [setupState, onSelectSlot]);

  const handleConnect = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], stage: 'slug' },
    }));
  }, []);

  const handleRoleSelect = useCallback((slotId: string, role: NodeRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], role, stage: 'addState' },
    }));
  }, []);

  const handleSignalSelect = useCallback((slotId: string, signal: SignalSource, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], signal, stage: 'addState' },
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
    if (!setup) return;
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], stage: 'idle' },
    }));
    onSlotSetupComplete?.(slotId, 'send' as NodeRole, 'touchdesigner' as SignalSource);
  }, [setupState, onSlotSetupComplete]);

  const handleBack = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => {
      const s = prev[slotId]?.stage;
      if (s === 'addState') return { ...prev, [slotId]: { ...prev[slotId], stage: 'slug' } };
      if (s === 'slug')     return { ...prev, [slotId]: { ...prev[slotId], stage: 'connect' } };
      return prev;
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
              {/* ── Per-slot server toggle ── */}
              {(() => {
                const slotMode = slotServerModes[slot.id] || 'auto';
                const slotServerStr = (entityStates[slot.entity_id || slot.id] as Record<string,unknown>|undefined)?.server as string | undefined;
                const modes: { key: 'auto' | 'gallery' | 'railway' | 'custom'; label: string; color: string }[] = [
                  { key: 'auto',    label: 'Auto',   color: '#fbbf24' },
                  { key: 'gallery', label: '⚡ Local', color: '#00ff88' },
                  { key: 'railway', label: '☁ Railway', color: '#00d4ff' },
                  { key: 'custom',  label: '⚙ Adv', color: '#a78bfa' },
                ];
                const activeMode = modes.find(m => m.key === slotMode)!;
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '4px 8px',
                    background: 'rgba(0,0,0,0.3)',
                    borderBottom: `1px solid ${slotColor}18`,
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: 7, fontFamily: 'var(--font-display)', letterSpacing: '0.1em',
                      color: 'rgba(255,255,255,0.15)', marginRight: 3, whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                    }}>Server Mode: //</span>
                    {modes.map(({ key, label, color }) => {
                      const active = slotMode === key;
                      return (
                        <button key={key}
                          onClick={e => { e.stopPropagation(); setSlotServer(slot.id, key); }}
                          style={{
                            fontSize: 7, fontFamily: 'var(--font-display)', fontWeight: 700,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            padding: '1px 5px', cursor: 'pointer',
                            background: active ? `${color}15` : 'transparent',
                            border: `1px solid ${active ? color + '60' : 'rgba(255,255,255,0.04)'}`,
                            color: active ? color : 'rgba(255,255,255,0.15)',
                            transition: 'all 0.12s',
                          }}
                        >{label}</button>
                      );
                    })}
                    {/* Active server URL — shows what TD actually reported */}
                    {slotServerStr && (
                      <span style={{
                        fontSize: 7, fontFamily: 'var(--font-mono)',
                        color: `${activeMode.color}80`,
                        marginLeft: 'auto',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: 120,
                      }}>
                        {slotServerStr.replace('https://','').replace('http://','').slice(0, 22)}
                      </span>
                    )}
                  </div>
                );
              })()}

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

                                    {/* ── Entity Identity + Live Status ── */}
                  <div className="live-section">
                    <div className="live-section-head">Entity</div>
                    <div className="live-kv-grid">
                      {/* entity name / toe_name */}
                      <span className="live-kv-key">name</span>
                      <span className="live-kv-val" style={{ color: slotColor, fontWeight: 700 }}>
                        {(entityStates[slot.entity_id || slot.id] as Record<string,unknown>|undefined)?.toe_name as string
                          || slot.entity_id || slot.id}
                      </span>
                      {/* slug */}
                      <span className="live-kv-key">slug</span>
                      <span className="live-kv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                        {slot.entity_id || slot.id}
                      </span>
                      {/* server */}
                      <span className="live-kv-key">server</span>
                      <span className="live-kv-val" style={{ fontSize: 8, opacity: 0.55 }}>
                        {(() => {
                          const s = (entityStates[slot.entity_id || slot.id] as Record<string,unknown>|undefined)?.server as string | undefined;
                          if (!s) return '—';
                          return s.replace('https://','').replace('http://','').slice(0,28);
                        })()}
                      </span>
                      {/* connection status */}
                      <span className="live-kv-key">status</span>
                      <span className={`live-kv-val ${mStatus?.server === 'connected' ? 'val-ok' : 'val-warn'}`}
                        style={{ color: mStatus?.server === 'connected' ? slotColor : undefined }}>
                        {mStatus?.server === 'connected' ? 'connected' : mStatus?.server || 'offline'}
                      </span>
                      {/* last seen */}
                      <span className="live-kv-key">last seen</span>
                      <span className={`live-kv-val ${mStatus?.heartbeat === 'live' ? 'val-ok' : mStatus?.heartbeat === 'stale' ? 'val-warn' : 'val-dim'}`}>
                        {mStatus?.heartbeat === 'live' ? 'now'
                          : mStatus?.lastHeartbeatAt ? `${formatAge(now - mStatus.lastHeartbeatAt)} ago`
                          : 'waiting'}
                      </span>
                    </div>
                  </div>

                  {/* ── State Schema: ↑output + ↓input chips with live values ── */}
                  {(() => {
                    const eid = slot.entity_id || slot.id;
                    const eState = entityStates[eid] as Record<string,unknown> | undefined;
                    const schema = eState?.stateSchema as Record<string, {type:string; direction:string}> | undefined;
                    const entries = schema
                      ? Object.entries(schema)
                      : Object.entries(eState || {})
                          .filter(([k]) => !['toe_name','tops','server','active','metadata','stateSchema','publishing','listening'].includes(k))
                          .map(([k]) => [k, { type: 'string', direction: 'output' }] as [string, {type:string;direction:string}]);
                    if (!entries.length) return null;
                    const outs = entries.filter(([,v]) => v.direction !== 'input');
                    const ins  = entries.filter(([,v]) => v.direction === 'input');
                    return (
                      <div className="live-section">
                        <div className="live-section-head">State</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {outs.map(([key, varDef]) => {
                            const lv = eState?.[key] != null ? String(eState[key]).slice(0, 16) : null;
                            return (
                              <div key={key} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                background: `${slotColor}12`, border: `1px solid ${slotColor}40`,
                                padding: '2px 5px', fontSize: 8,
                              }}>
                                <span style={{ color: slotColor, fontSize: 7 }}>↑</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: slotColor }}>{key}</span>
                                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 7 }}>{varDef.type}</span>
                                {lv && <span style={{ color: 'var(--text-dim)', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 3 }}>{lv}</span>}
                              </div>
                            );
                          })}
                          {ins.map(([key, varDef]) => (
                            <div key={key} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              background: 'rgba(255,255,255,0.03)', border: `1px solid ${slotColor}20`,
                              padding: '2px 5px', fontSize: 8,
                            }}>
                              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 7 }}>↓</span>
                              <span style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.4)' }}>{key}</span>
                              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 7 }}>{varDef.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

{/* ── Section 2: Signals ── */}
                  <div className="live-section">
                    <div className="live-section-head">Signals</div>
                    {publishing.length > 0 && (
                      <div className="live-signal-group">
                        <span className="live-signal-dir">↑ Publishing</span>
                        <div className="live-signal-list">
                          {publishing.map(s => <span key={s} className="live-signal-tag pub">{s}</span>)}
                        </div>
                      </div>
                    )}
                    {listening.length > 0 && (
                      <div className="live-signal-group">
                        <span className="live-signal-dir">↓ Listening</span>
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
                    /* ════ INLINE SETUP WIZARD: connect → slug → addState ════ */
                    <div className="slot-inline-wizard">
                      {/* Step dots: 3 only */}
                      <div className="slot-wizard-steps">
                        {(['connect','slug','addState'] as InlineStage[]).map((s, i, arr) => (
                          <span key={s} style={{ display: 'flex', alignItems: 'center' }}>
                            <span className={`slot-wizard-dot ${
                              setup.stage === s ? 'active' :
                              arr.indexOf(setup.stage) > i ? 'done' : ''
                            }`} />
                            {i < arr.length - 1 && <span className="slot-wizard-line" />}
                          </span>
                        ))}
                      </div>

                      {/* ══ STAGE: connect ══ */}
                      {setup.stage === 'connect' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title" style={{ color: slotColor, letterSpacing: '0.15em' }}>
                            CONNECT YOUR NODE
                          </div>
                          <a href="/maestra.tox" download="maestra.tox"
                            onClick={e => e.stopPropagation()}
                            style={{ display: 'block', width: '100%', boxSizing: 'border-box',
                              padding: '10px 12px', textDecoration: 'none',
                              border: `1px solid ${slotColor}40`, background: `${slotColor}08` }}>
                            <div style={{ fontSize: 15.5, fontWeight: 700, color: slotColor,
                              fontFamily: 'var(--font-display)', letterSpacing: '0.05em', marginBottom: 3 }}>
                              ↓ Download maestra.tox
                            </div>
                            <div style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.35)' }}>
                              Drag into your .toe → auto-registers when project opens
                            </div>
                          </a>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>OR</span>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                          </div>
                          <label style={{ display: 'block', width: '100%', boxSizing: 'border-box',
                            padding: '10px 12px', cursor: 'pointer', position: 'relative',
                            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.6)', marginBottom: 4, pointerEvents: 'none' }}>
                              {setup.refFile ? `📁 ${setup.refFile}` : 'Browse to your .toe file'}
                            </div>
                            <div style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.25)', lineHeight: 1.7, pointerEvents: 'none' }}>
                              The TOX auto-registers when your project opens.<br/>
                              Once connected, this slot updates automatically.
                            </div>
                            <input type="file" accept=".toe,.tox"
                              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  const derived = f.name.replace(/\.(toe|tox)$/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
                                  setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], refFile: f.name, slug: derived, stage: 'slug' } }));
                                }
                              }} />
                          </label>
                        </div>
                      )}

                      {/* ══ STAGE: slug ══ */}
                      {setup.stage === 'slug' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title" style={{ color: slotColor }}>Name Your Node</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
                            Slug from your .toe filename — edit if needed
                          </div>
                          <input type="text"
                            value={setup.slug}
                            placeholder="e.g. mirrors-echo"
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], slug: e.target.value } })); }}
                            onKeyDown={e => { if (e.key === 'Enter' && setup.slug.trim()) setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'addState' } })); }}
                            style={{ width: '100%', padding: '6px 10px', fontSize: 13,
                              fontFamily: 'var(--font-mono)', color: slotColor, fontWeight: 700,
                              background: 'rgba(0,0,0,0.5)', border: `1px solid ${slotColor}50`,
                              outline: 'none', boxSizing: 'border-box' }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                            <button className="slot-wizard-btn slot-wizard-btn-ghost"
                              onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'connect' } })); }}>
                              ← Back
                            </button>
                            <button className="slot-wizard-btn slot-wizard-btn-primary" style={{ flex: 1 }}
                              disabled={!setup.slug.trim()}
                              onClick={e => { e.stopPropagation(); if (setup.slug.trim()) setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'addState' } })); }}>
                              {setup.slug.trim() ? 'Enter →' : 'Enter a slug first'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ══ STAGE: addState ══ */}
                      {setup.stage === 'addState' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title" style={{ color: slotColor }}>Add State</div>

                          {/* Accumulated output chips */}
                          {(setup.outputSignals || []).length > 0 && (
                            <div style={{ width: '100%', marginBottom: 6 }}>
                              <div style={{ fontSize: 7, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.25)',
                                textTransform: 'uppercase', marginBottom: 4 }}>↑ Outputs</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {(setup.outputSignals || []).map((sig, i) => (
                                  <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '2px 7px', fontSize: 9, fontFamily: 'var(--font-mono)',
                                    background: `${slotColor}18`, border: `1px solid ${slotColor}50`, color: slotColor }}>
                                    <span style={{ opacity: 0.6, fontSize: 8 }}>↑</span>
                                    {sig.key}
                                    <span style={{ opacity: 0.4, fontSize: 8 }}>· {sig.type}</span>
                                    <button onClick={e => { e.stopPropagation();
                                      setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id],
                                        outputSignals: prev[slot.id].outputSignals.filter((_,j) => j !== i) } })); }}
                                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                                        cursor: 'pointer', padding: '0 0 0 2px', fontSize: 10, lineHeight: 1 }}>×</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                                                                              {/* Step 1: Stream Type filter */}
                          {(() => {
                            // All tops from /api/tops cache + WS entityStates
                            const _all: string[] = [...cachedTops];
                            Object.values(entityStates).forEach((es: unknown) => {
                              const _t = (es as Record<string,unknown>)?.tops;
                              if (Array.isArray(_t)) (_t as string[]).forEach((t:string) => { if (!_all.includes(t)) _all.push(t); });
                            });

                            // Use cachedTree if available (from /api/tops — built by build_maestra_tox.py)
                            // cachedTree format: { nodeName: ["TYPE:name:path", ...] }
                            const nodeMap: Record<string,string[]> = Object.keys(cachedTree).length > 0
                              ? { ...cachedTree }
                              : (() => {
                                  // Fallback: group flat tops list by depth-2 component
                                  const m: Record<string,string[]> = {};
                                  _all.forEach(t => {
                                    const parts = t.split('/').filter(Boolean);
                                    if (parts.length < 2) return;
                                    const node = parts[1];
                                    if (!m[node]) m[node] = [];
                                    if (!m[node].includes(t)) m[node].push(t);
                                  });
                                  return m;
                                })();
                            const nodes = Object.keys(nodeMap).sort();

                            // Selected node + TOP derived from selectedTop
                            const stParts  = (setup.selectedTop || '').split('/').filter(Boolean);
                            const selNode  = stParts.length >= 2 ? stParts[1] : '';
                            const selTop   = setup.selectedTop || '';
                            const nodeTops = selNode ? (nodeMap[selNode] || []) : [];

                            // Stream type filter
                            // Exact Maestra stream types — https://jordansnyder.github.io/maestra-core/concepts/entities/
                            const STREAM_TYPES: { key: string; label: string; desc: string }[] = [
                              { key: '',        label: 'All',     desc: 'Show all TOPs' },
                              { key: 'ndi',     label: 'NDI',     desc: 'NDI video/audio (NewTek)' },
                              { key: 'syphon',  label: 'Syphon',  desc: 'Syphon texture (macOS)' },
                              { key: 'spout',   label: 'Spout',   desc: 'Spout texture (Windows)' },
                              { key: 'srt',     label: 'SRT',     desc: 'SRT video streaming' },
                              { key: 'video',   label: 'Video',   desc: 'Generic video' },
                              { key: 'audio',   label: 'Audio',   desc: 'Audio feeds' },
                              { key: 'texture', label: 'Texture', desc: 'GPU textures' },
                              { key: 'midi',    label: 'MIDI',    desc: 'MIDI data' },
                              { key: 'osc',     label: 'OSC',     desc: 'OSC message streams' },
                              { key: 'sensor',  label: 'Sensor',  desc: 'Sensor data' },
                              { key: 'data',    label: 'Data',    desc: 'Generic data' },
                            ];
                            const streamFilter = (setup.stateType === 'string' || !setup.stateType) ? '' : setup.stateType;

                            // Filter nodeTops by stream type hint in path
                            // Map stream type → op type prefixes in tree format
                            const STREAM_TO_TYPES: Record<string,string[]> = {
                              'ndi':     ['ndiinTOP','ndioutTOP','ndiin'],
                              'syphon':  ['syphonspoutinTOP','syphonspoutoutTOP','syphon'],
                              'spout':   ['syphonspoutinTOP','syphonspoutoutTOP','spout'],
                              'srt':     ['srtinTOP','srtoutTOP','srt'],
                              'video':   ['moviefileinTOP','videodeviceinTOP','compositeTOP','renderTOP','TOP'],
                              'audio':   ['audiofileinCHOP','audiodevinCHOP','audiospectrumCHOP','audio'],
                              'texture': ['TOP','nullTOP','outTOP','selectTOP'],
                              'midi':    ['midiinCHOP','midioutCHOP','midi'],
                              'osc':     ['oscinCHOP','oscoutCHOP','osc'],
                              'sensor':  ['lfoCHOP','noiseCHOP','slopeCHOP','triggerCHOP','thresholdCHOP','sensor'],
                              'data':    ['datexecuteDAT','tableDAT','textDAT','DAT','CHOP'],
                            };
                            const filteredTops = streamFilter
                              ? nodeTops.filter(t => {
                                  const low = t.toLowerCase();
                                  const prefixes = STREAM_TO_TYPES[streamFilter] || [streamFilter];
                                  return prefixes.some(p => low.includes(p.toLowerCase()));
                                })
                              : nodeTops;

                            return (
                              <>
                                {/* Stream type chips */}
                                <div style={{ width: '100%' }}>
                                  <div style={{ fontSize: 7, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 4 }}>
                                    Stream Type
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {STREAM_TYPES.map(({ key, label, desc }) => {
                                      const active = (key === '' && !streamFilter) || key === streamFilter;
                                      return (
                                        <button key={key}
                                          title={desc}
                                          onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateType: key || 'string' } })); }}
                                          style={{ fontSize: 8, padding: '2px 7px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                                            background: active ? `${slotColor}25` : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${active ? slotColor + '70' : 'rgba(255,255,255,0.08)'}`,
                                            color: active ? slotColor : 'rgba(255,255,255,0.3)',
                                            transition: 'all 0.1s' }}>
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Node picker */}
                                <div style={{ width: '100%' }}>
                                  <div style={{ fontSize: 7, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 3 }}>
                                    Select Node {nodes.length > 0 && <span style={{ color: slotColor }}>· {nodes.length} found</span>}
                                  </div>
                                  {nodes.length > 0 ? (
                                    <select value={selNode} onClick={e => e.stopPropagation()}
                                      onChange={e => {
                                        e.stopPropagation();
                                        const n = e.target.value;
                                        const tops = nodeMap[n] || [];
                                        const first = tops[0] || '';
                                        const key = first.split('/').pop() || '';
                                        setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], selectedTop: first, stateKey: key } }));
                                      }}
                                      style={{ width: '100%', padding: '5px 8px', fontSize: 10, fontFamily: 'var(--font-mono)',
                                        background: 'rgba(0,0,0,0.6)', border: `1px solid ${slotColor}40`, color: slotColor, outline: 'none' }}>
                                      <option value="">— select node —</option>
                                      {nodes.map(n => <option key={n} value={n} style={{ background: '#0a0a14' }}>{n}</option>)}
                                    </select>
                                  ) : (
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)', padding: '4px 0', lineHeight: 1.6 }}>
                                      No nodes detected. Run exec(open(r&apos;add_maestra_startup.py&apos;).read()) in TD once.
                                    </div>
                                  )}
                                </div>

                                {/* TOP picker — within selected node */}
                                {selNode && (
                                  <div style={{ width: '100%' }}>
                                    <div style={{ fontSize: 7, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 3 }}>
                                      TOP within {selNode} {filteredTops.length > 0 && <span style={{ color: slotColor }}>· {filteredTops.length}</span>}
                                    </div>
                                    {filteredTops.length > 0 ? (
                                      <select value={selTop} onClick={e => e.stopPropagation()}
                                        onChange={e => {
                                          e.stopPropagation();
                                          const full = e.target.value;
                                          const key = full.split('/').pop() || '';
                                          setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], selectedTop: full, stateKey: key } }));
                                        }}
                                        style={{ width: '100%', padding: '5px 8px', fontSize: 10, fontFamily: 'var(--font-mono)',
                                          background: 'rgba(0,0,0,0.6)', border: `1px solid ${slotColor}40`, color: slotColor, outline: 'none' }}>
                                        <option value="">— select TOP —</option>
                                        {filteredTops.map(t => {
                                          // Entry format: "TYPE:name:path" or plain "/path"
                                          let label = t, val = t;
                                          if (t.includes(':') && t.split(':').length >= 3) {
                                            const pts = t.split(':');
                                            // Clean type: lfoCHOP → CHOP, compositeTOP → TOP, textDAT → DAT
                                            const raw = pts[0];
                                            const kind = raw.endsWith('CHOP') ? 'CHOP' : raw.endsWith('TOP') ? 'TOP' : raw.endsWith('DAT') ? 'DAT' : raw.endsWith('COMP') ? 'COMP' : raw.replace(/[a-z]/g,'').slice(0,4);
                                            label = kind + ' · ' + pts[1];
                                            val   = t; // keep full entry as value
                                          } else {
                                            label = t.split('/').pop() || t;
                                          }
                                          return <option key={t} value={t} style={{ background: '#0a0a14' }}>{label}</option>;
                                        })}
                                      </select>
                                    ) : (
                                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>
                                        No TOPs match this stream type filter
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* State key — auto-filled, always editable */}
                                <div style={{ width: '100%' }}>
                                  <div style={{ fontSize: 7, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 3 }}>
                                    State Key <span style={{ opacity: 0.4 }}>(rename if needed)</span>
                                  </div>
                                  <input type="text" value={setup.stateKey}
                                    placeholder="e.g. prompt_concept"
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateKey: e.target.value } })); }}
                                    style={{ width: '100%', padding: '5px 8px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                      color: slotColor, fontWeight: 700, background: 'rgba(0,0,0,0.4)',
                                      border: `1px solid ${slotColor}40`, outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                              </>
                            );
                          })()}

                          {/* Type chips */}
                          <div style={{ width: '100%' }}>
                            <div style={{ fontSize: 7, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)',
                              textTransform: 'uppercase', marginBottom: 4 }}>Type</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {(['string','number','boolean','color','vector2','vector3','range','enum','array','object'] as const).map(t => (
                                <button key={t} onClick={e => { e.stopPropagation();
                                  setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateType: t } })); }}
                                  style={{ fontSize: 8, padding: '2px 6px', cursor: 'pointer',
                                    fontFamily: 'var(--font-mono)',
                                    background: setup.stateType === t ? `${slotColor}25` : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${setup.stateType === t ? slotColor+'70' : 'rgba(255,255,255,0.08)'}`,
                                    color: setup.stateType === t ? slotColor : 'rgba(255,255,255,0.3)',
                                    transition: 'all 0.1s' }}>{t}</button>
                              ))}
                            </div>
                          </div>

                          {/* Description — optional */}
                          <div style={{ width: '100%' }}>
                            <div style={{ fontSize: 7, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)',
                              textTransform: 'uppercase', marginBottom: 3 }}>
                              Description <span style={{ opacity: 0.5 }}>(optional)</span>
                            </div>
                            <input type="text" value={setup.stateDesc}
                              placeholder="e.g. Current prompt sent to StreamDiffusion"
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev,
                                [slot.id]: { ...prev[slot.id], stateDesc: e.target.value } })); }}
                              style={{ width: '100%', padding: '5px 8px', fontSize: 9,
                                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)',
                                color: 'rgba(255,255,255,0.5)', outline: 'none', boxSizing: 'border-box' }} />
                          </div>

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                            <button className="slot-wizard-btn slot-wizard-btn-ghost"
                              onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev,
                                [slot.id]: { ...prev[slot.id], stage: 'slug' } })); }}>
                              ← Back
                            </button>
                            <button
                              className="slot-wizard-btn slot-wizard-btn-primary"
                              style={{ flex: 1 }}
                              disabled={!setup.stateKey.trim()}
                              onClick={e => {
                                e.stopPropagation();
                                if (!setup.stateKey.trim()) return;
                                // Immutable update — this is why chips appear
                                setSetupState(prev => ({
                                  ...prev,
                                  [slot.id]: {
                                    ...prev[slot.id],
                                    outputSignals: [
                                      ...(prev[slot.id].outputSignals || []),
                                      { key: setup.stateKey.trim(), type: setup.stateType,
                                        desc: setup.stateDesc, top: setup.selectedTop }
                                    ],
                                    stateKey: '', stateDesc: '', selectedTop: '',
                                  }
                                }));
                              }}>
                              + Add State
                            </button>
                            {(setup.outputSignals || []).length > 0 && (
                              <button
                                className="slot-wizard-btn slot-wizard-btn-primary"
                                style={{ background: `${slotColor}25`, borderColor: slotColor, color: slotColor }}
                                onClick={e => handleReferenceComplete(slot.id, e)}>
                                Connect ✓
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ════ AVAILABLE — click to connect ════ */
                    <div
                      style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 14,
                        cursor: 'pointer', padding: '24px 20px',
                      }}
                      onClick={(e) => { e.stopPropagation(); handleSlotClick(slot); }}
                    >
                      <div style={{
                        fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        color: slotColor, opacity: 0.65,
                      }}>AVAILABLE</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSlotClick(slot); }}
                        style={{
                          fontSize: 10, fontFamily: 'var(--font-display)', fontWeight: 700,
                          letterSpacing: '0.1em', padding: '8px 22px', cursor: 'pointer',
                          background: `${slotColor}15`,
                          border: `1px solid ${slotColor}60`,
                          color: slotColor, transition: 'all 0.15s',
                        }}
                      >+ Connect Your Node</button>
                      <a
                        href='/maestra.tox'
                        target='_blank' rel='noreferrer'
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontSize: 8, color: `${slotColor}50`,
                          textDecoration: 'none',
                          borderBottom: `1px solid ${slotColor}25`,
                          paddingBottom: 1,
                          fontFamily: 'var(--font-display)',
                          letterSpacing: '0.06em',
                        }}
                      >↓ download maestra.tox</a>
                    </div>
                  )}
                </div>
              )}

              <div className="slot-footer">
                <div className="slot-footer-left">
                  <div className="slot-label">
                    {slot.active ? (
                      /* Active: entity/toe name + slot index */
                      <>
                        <span className="slot-label-name" style={{ color: slotColor, fontWeight: 700 }}>
                          {(() => {
                            const eid = slot.entity_id || slot.id;
                            const toeName = (entityStates[eid] as Record<string,unknown>|undefined)?.toe_name;
                            return toeName ? String(toeName) : (slot.entity_id || slot.label);
                          })()}
                        </span>
                        <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-dim)', opacity: 0.3, marginLeft: 4, textTransform: 'uppercase' }}>
                          slot {slots.indexOf(slot) + 1}
                        </span>
                      </>
                    ) : (
                      /* Inactive: "Connect Your Tool" dropdown in slot color */
                      <select
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); if (e.target.value) handleSlotClick(slot); }}
                        defaultValue=""
                        style={{
                          fontSize: 11, letterSpacing: '0.06em',
                          color: slotColor,
                          border: `1px solid ${slotColor}70`,
                          fontWeight: 600,
                          background: `${slotColor}0a`,
                          padding: '3px 6px',
                          cursor: 'pointer',
                          outline: 'none',
                          appearance: 'none',
                          WebkitAppearance: 'none',
                          fontFamily: 'var(--font-display)',
                          paddingRight: 20,
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='7' height='5' viewBox='0 0 7 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L3.5 4L6 1' stroke='${encodeURIComponent(slotColor)}' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 5px center',
                        }}
                      >
                        <option value="" disabled style={{ background: '#0a0a14', color: '#666' }}>Connect Your Tool</option>
                        <option value="touchdesigner" style={{ background: '#0a0a14', color: '#fff' }}>TouchDesigner</option>
                        <option value="max_msp" style={{ background: '#0a0a14', color: '#fff' }}>Max/MSP</option>
                        <option value="unreal" style={{ background: '#0a0a14', color: '#fff' }}>Unreal Engine</option>
                        <option value="unity" style={{ background: '#0a0a14', color: '#fff' }}>Unity</option>
                        <option value="arduino" style={{ background: '#0a0a14', color: '#fff' }}>Arduino / ESP32</option>
                        <option value="web" style={{ background: '#0a0a14', color: '#fff' }}>Web / React / Mobile</option>
                        <option value="python" style={{ background: '#0a0a14', color: '#fff' }}>Python</option>
                        <option value="raspberry_pi" style={{ background: '#0a0a14', color: '#fff' }}>Raspberry Pi</option>
                      </select>
                    )}
                  {/* Lock + controls — show on hover */}
                  {slot.active && (
                    <div className="slot-footer-controls" style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleLock(slot.id, slot, entityStates[slot.entity_id || slot.id] as Record<string, unknown> || {}); }}
                        title={lockedSlots.has(slot.id) ? '🔒 Locked — click to unlock and modify' : '🔓 Click to lock and protect this slot'}
                        style={{
                          background: 'none', border: 'none', padding: '0 2px',
                          color: lockedSlots.has(slot.id) ? slotColor : 'rgba(255,255,255,0.18)',
                          cursor: 'pointer', fontSize: 10, lineHeight: 1, transition: 'color 0.15s',
                        }}
                      >{lockedSlots.has(slot.id) ? (<svg width="11" height="13" viewBox="0 0 11 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="1" y="5.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M3 5.5V3.5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          <circle cx="5.5" cy="9" r="1" fill="currentColor"/>
                        </svg>) : (<svg width="11" height="13" viewBox="0 0 11 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="1" y="5.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M3 5.5V3.5a2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          <circle cx="5.5" cy="9" r="1" fill="currentColor"/>
                        </svg>)}</button>
                      <button
                        onClick={e => { e.stopPropagation(); onAddSlot?.(); }}
                        title="Add a new slot"
                        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)', borderRadius: 2, width: 14, height: 14, fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >+</button>
                      <button
                        onClick={e => { e.stopPropagation(); /* disconnect */ }}
                        title="Disconnect slot"
                        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)', borderRadius: 2, width: 14, height: 14, fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >−</button>
                    </div>
                  )}
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
                  {slot.active ? (
                    <span className={`slot-state-badge ${stateBadge.cls}`}>{stateBadge.text}</span>
                  ) : inSetup ? (
                    <span className="slot-tag setup-tag">
                      {setup.stage === 'connect' ? 'Setting up…' : setup.stage === 'slug' ? 'Name node' : 'Add State'}
                    </span>
                  ) : (
                    <span className="slot-tag available-tag">
                      <span className="available-label">Available</span>
                      <span className="available-connect-btn">Click to Connect</span>
                    </span>
                  )}
                </div>
              </div>
              {/* Top-right: + / - behavior indicator, lock/unlock, pin */}
              <div className="slot-top-controls" style={{
                position: 'absolute', top: 6, right: 6,
                display: 'flex', alignItems: 'center', gap: 3,
                zIndex: 10,
              }}>
                {/* ↑↓↕ send/receive/both indicator — always visible on active slots */}
                {slot.active && (
                  <span
                    title={slot.nodeRole === 'receive' ? 'Receiving only' : slot.nodeRole === 'send' ? 'Sending only' : 'Sending + Receiving'}
                    style={{
                      fontSize: 10, fontWeight: 700, lineHeight: 1,
                      color: slot.nodeRole === 'receive' ? '#34d399' : slot.nodeRole === 'two_way' ? '#f59e0b' : slotColor,
                      opacity: 0.8, cursor: 'default', padding: '1px 3px',
                    }}>
                    {slot.nodeRole === 'receive' ? '↓' : slot.nodeRole === 'two_way' ? '↕' : '↑'}
                  </span>
                )}
                {/* Lock / Unlock */}
                <button
                  title={lockedSlots.has(slot.id) ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
                  onClick={e => { e.stopPropagation(); toggleLock(slot.id, slot, entityStates[slot.entity_id || slot.id] as Record<string, unknown> || {}); }}
                  style={{
                    background: 'none', border: 'none', padding: '1px 2px',
                    cursor: 'pointer', color: lockedSlots.has(slot.id) ? slotColor : 'rgba(255,255,255,0.35)',
                    display: 'flex', alignItems: 'center',
                  }}>
                  {lockedSlots.has(slot.id) ? (
                    <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
                      <rect x="1.5" y="5.5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M3.5 5.5V3.5a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" style={{opacity:0.5}}>
                      <rect x="1.5" y="5.5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M3.5 5.5V3.5a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
                {/* PIN button — set a short code to identify this slot */}
                <button
                  title="Set PIN to identify this slot"
                  onClick={e => {
                    e.stopPropagation();
                    const pin = prompt('Set a PIN for this slot (short label, e.g. "CAM1"):');
                    if (pin) {
                      const label = pin.slice(0,6).toUpperCase();
                      setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateKey: label } }));
                    }
                  }}
                  style={{
                    background: 'none', border: 'none', padding: '1px 2px',
                    cursor: 'pointer', color: 'rgba(255,255,255,0.25)',
                    fontSize: 7, fontFamily: 'var(--font-display)', letterSpacing: '0.08em',
                  }}>
                  PIN
                </button>
              </div>
              <style>{'.slot:hover .slot-top-controls { opacity: 1 !important; }'}</style>
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
