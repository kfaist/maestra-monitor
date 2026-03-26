'use client';

import { SLOT_COLORS } from './SignalPanel';
import { useState, useEffect, useCallback } from 'react';
import { FleetSlot, slotStatusLabel, slotStatusClass, formatAge, EventEntry } from '@/types';

type InlineStage = 'idle' | 'connect' | 'slug' | 'top' | 'states';
type NodeRole = 'receive' | 'send' | 'two_way';
type SignalSource = 'touchdesigner' | 'json_stream' | 'osc' | 'audio_reactive' | 'text' | 'test_signal';

interface SlotSetup {
  stage: InlineStage;
  role: NodeRole | null;
  signal: SignalSource | null;
  refPath: string;
  refFile: string | null;
  selectedTop: string | null;
  stateKey: string;
  stateType: string;
  slug?: string;
  stateDesc?: string;
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
  // Per-slot server mode: which Maestra server this slot is targeting
  const [slotServerModes, setSlotServerModes] = useState<Record<string, 'auto' | 'gallery' | 'railway' | 'custom'>>({});
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
    setSetupState(prev => ({
      ...prev,
      [slot.id]: { stage: 'connect', role: null, signal: null, refPath: 'project1/', refFile: null, selectedTop: null, stateKey: '', stateType: 'string', slug: '', stateDesc: '' },
    }));
  }, [setupState, onSelectSlot]);

  const handleConnect = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], stage: 'slug' as InlineStage },
    }));
  }, []);

  const handleRoleSelect = useCallback((slotId: string, role: NodeRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], role: (prev[slotId]?.role ?? null), stage: 'slug' as const },
    }));
  }, []);

  const handleSignalSelect = useCallback((slotId: string, signal: SignalSource, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], role: (prev[slotId]?.role ?? null), stage: 'slug' as const },
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
    if (!setup?.role) return;
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], stage: 'idle' },
    }));
    onSlotSetupComplete?.(slotId, setup.role as NodeRole, (setup.signal || 'touchdesigner') as SignalSource);
  }, [setupState, onSlotSetupComplete]);

  const handleBack = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => {
      const current = prev[slotId];
      if (!current) return prev;
      if (current.stage === 'states') return { ...prev, [slotId]: { ...current, stage: 'top' } };
      if (current.stage === 'top') return { ...prev, [slotId]: { ...current, stage: 'slug' } };
      if (current.stage === 'slug') return { ...prev, [slotId]: { ...current, stage: 'connect' } };
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
              {/* ── Per-slot server toggle ── */}
              {(() => {
                const slotMode = slotServerModes[slot.id] || 'auto';
                const slotServerStr = (entityStates[slot.entity_id || slot.id] as Record<string,unknown>|undefined)?.server as string | undefined;
                const modes: { key: 'auto' | 'gallery' | 'railway' | 'custom'; label: string; color: string; title?: string }[] = [
                  { key: 'auto',    label: 'Auto',   color: '#fbbf24', title: 'Auto-detect: gallery first, then Railway' },
                  { key: 'gallery', label: '⚡ Local', color: '#00ff88', title: '192.168.128.115 — on-site only' },
                  { key: 'railway', label: '☁ Railway', color: '#00d4ff', title: 'Railway cloud — accessible anywhere' },
                  { key: 'custom',  label: 'Custom',  color: '#a78bfa', title: 'Custom server URL' },
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
                    {modes.map(({ key, label, color }) => {
                      const active = slotMode === key;
                      return (
                        <button key={key}
                          onClick={e => { e.stopPropagation(); setSlotServer(slot.id, key); }}
                          style={{
                            fontSize: 7, fontFamily: 'var(--font-display)', fontWeight: 700,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            padding: '1px 5px', cursor: 'pointer',
                            background: active ? `${color}20` : 'none',
                            border: `1px solid ${active ? color + '60' : 'rgba(255,255,255,0.06)'}`,
                            color: active ? color : 'rgba(255,255,255,0.2)',
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

                                    {/* ── Entity Identity ── */}
                  <div className="live-section">
                    <div className="live-section-head">Entity</div>
                    <div className="live-kv-grid">
                      <span className="live-kv-key">name</span>
                      <span className="live-kv-val" style={{ color: slotColor, fontWeight: 700 }}>
                        {(entityStates[slot.entity_id || slot.id] as Record<string,unknown>|undefined)?.toe_name as string || slot.entity_id || slot.id}
                      </span>
                      <span className="live-kv-key">slug</span>
                      <span className="live-kv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, opacity: 0.6 }}>
                        {slot.entity_id || slot.id}
                      </span>
                      <span className="live-kv-key">server</span>
                      <span className="live-kv-val" style={{ fontSize: 8, opacity: 0.45 }}>
                        {(() => { const s = (entityStates[slot.entity_id||slot.id] as Record<string,unknown>|undefined)?.server as string|undefined; return s ? s.replace('https://','').replace('http://','').slice(0,26) : '—'; })()}
                      </span>
                      <span className="live-kv-key">status</span>
                      <span className="live-kv-val" style={{ color: mStatus?.server === 'connected' ? slotColor : '#ef4444' }}>
                        {mStatus?.server === 'connected' ? 'connected' : mStatus?.server || 'offline'}
                      </span>
                      <span className="live-kv-key">last seen</span>
                      <span className={`live-kv-val ${mStatus?.heartbeat === 'live' ? 'val-ok' : 'val-dim'}`}>
                        {mStatus?.heartbeat === 'live' ? 'now' : mStatus?.lastHeartbeatAt ? `${formatAge(now - mStatus.lastHeartbeatAt)} ago` : 'waiting'}
                      </span>
                    </div>
                  </div>

                  {/* ── ↑ Output / ↓ Input state chips ── */}
                  {(() => {
                    const eid = slot.entity_id || slot.id;
                    const eState = entityStates[eid] as Record<string,unknown>|undefined;
                    const schema = eState?.stateSchema as Record<string,{type:string;direction:string}>|undefined;
                    const entries: [string,{type:string;direction:string}][] = schema
                      ? Object.entries(schema)
                      : Object.entries(eState||{})
                          .filter(([k])=>!['toe_name','tops','server','active','metadata','stateSchema'].includes(k))
                          .map(([k])=>[k,{type:'string',direction:'output'}]);
                    if (!entries.length) return null;
                    const outs = entries.filter(([,v])=>v.direction!=='input');
                    const ins  = entries.filter(([,v])=>v.direction==='input');
                    return (
                      <div className="live-section">
                        {outs.length > 0 && (
                          <>
                            <div className="live-section-head" style={{color:slotColor,letterSpacing:'0.12em'}}>↑ OUTPUT</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:3,marginBottom:4}}>
                              {outs.map(([key,v])=>{
                                const lv = eState?.[key]!=null ? String(eState[key]).slice(0,14) : null;
                                return (
                                  <div key={key} style={{display:'inline-flex',alignItems:'center',gap:3,background:`${slotColor}12`,border:`1px solid ${slotColor}40`,padding:'2px 5px',fontSize:8}}>
                                    <span style={{color:slotColor,fontSize:7}}>↑</span>
                                    <span style={{fontFamily:'var(--font-mono)',color:slotColor}}>{key}</span>
                                    <span style={{color:'rgba(255,255,255,0.2)',fontSize:7}}>{v.type}</span>
                                    {lv&&<span style={{color:'var(--text-dim)',borderLeft:'1px solid rgba(255,255,255,0.1)',paddingLeft:3}}>{lv}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                        {ins.length > 0 && (
                          <>
                            <div className="live-section-head" style={{color:'rgba(255,255,255,0.3)',letterSpacing:'0.12em',marginTop:outs.length?6:0}}>↓ INPUT</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                              {ins.map(([key,v])=>(
                                <div key={key} style={{display:'inline-flex',alignItems:'center',gap:3,background:'rgba(255,255,255,0.03)',border:`1px solid ${slotColor}20`,padding:'2px 5px',fontSize:8}}>
                                  <span style={{color:'rgba(255,255,255,0.3)',fontSize:7}}>↓</span>
                                  <span style={{fontFamily:'var(--font-mono)',color:'rgba(255,255,255,0.45)'}}>{key}</span>
                                  <span style={{color:'rgba(255,255,255,0.15)',fontSize:7}}>{v.type}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

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
                        {(['connect','role','path','top','states'] as string[]).map((s, i, arr) => (
                          <span key={s} style={{ display: 'flex', alignItems: 'center' }}>
                            <span className={`slot-wizard-dot ${
                              setup.stage === s ? 'active' :
                              (arr as string[]).indexOf(setup.stage) > i ? 'done' : ''
                            }`} />
                            {i < arr.length - 1 && <span className="slot-wizard-line" />}
                          </span>
                        ))}
                      </div>

                      {/* ══ STAGE: Connect — TOX onboarding ══ */}
                      {setup.stage === 'connect' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title">Connect Your Node</div>
                          {/* Drag-and-drop zone */}
                          <div
                            style={{
                              border: `2px dashed ${slotColor}50`,
                              background: `${slotColor}06`,
                              padding: '14px 10px',
                              textAlign: 'center',
                              cursor: 'default',
                              width: '100%',
                            }}
                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                          >
                            <div style={{ fontSize: 11, color: slotColor, marginBottom: 4 }}>
                              Drag <strong>maestra.tox</strong> into your .toe
                            </div>
                            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                              The TOX auto-registers when your project opens.<br/>
                              Once connected, this slot updates automatically.
                            </div>
                          </div>
                          {/* Download TOX link */}
                          <a
                            href='/maestra.tox'
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              fontSize: 8, color: slotColor, opacity: 0.6,
                              textDecoration: 'underline', alignSelf: 'flex-start',
                            }}
                          >↓ Download maestra.tox</a>
                          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', width: '100%' }}>
                            or if already running in TD →
                          </div>
                          <button
                            className="slot-wizard-btn slot-wizard-btn-primary"
                            style={{ width: '100%' }}
                            onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'slug' } })); }}
                          >Already connected — configure →</button>
                        </div>
                      )}

                      {/* ══ STAGE: Slug — confirm entity name from toe filename ══ */}
                      {setup.stage === 'slug' && (() => {
                        const eid = slot.entity_id || slot.id;
                        const toeName = (entityStates[eid] as Record<string,unknown>|undefined)?.toe_name as string | undefined;
                        const defaultSlug = toeName || eid;
                        return (
                          <div className="slot-wizard-content">
                            <div className="slot-wizard-title">Name Your Node</div>
                            <div className="slot-wizard-hint">
                              Slug from your .toe filename — edit if needed
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                              <input
                                type="text"
                                value={setup.slug ?? defaultSlug}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], slug: e.target.value } })); }}
                                style={{
                                  flex: 1, padding: '5px 8px', fontSize: 10,
                                  fontFamily: 'var(--font-mono)',
                                  background: 'rgba(0,0,0,0.4)',
                                  border: `1px solid ${slotColor}40`,
                                  color: slotColor, outline: 'none',
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'top' } })); }}}
                              />
                              <button
                                className="slot-wizard-btn slot-wizard-btn-primary"
                                style={{ padding: '5px 10px', flexShrink: 0 }}
                                onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'top' } })); }}
                              >↵</button>
                            </div>
                            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)' }}>
                              entity slug · used for API identity
                            </div>
                            <button className="slot-wizard-btn slot-wizard-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={e => handleBack(slot.id, e)}>← Back</button>
                          </div>
                        );
                      })()}

                      {/* ══ STAGE: TOP — select output TOP from entity metadata ══ */}
                      {setup.stage === 'top' && (() => {
                        const eid = slot.entity_id || slot.id;
                        const tops = (entityStates[eid] as Record<string,unknown>|undefined)?.tops;
                        const topList = Array.isArray(tops) ? tops as string[] : null;
                        return (
                          <div className="slot-wizard-content">
                            <div className="slot-wizard-title">Select Output TOP</div>
                            {topList && topList.length > 0 ? (
                              <>
                                <div className="slot-wizard-hint">TOPs found in your project</div>
                                <select
                                  value={setup.selectedTop || ''}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], selectedTop: e.target.value } })); }}
                                  style={{ width: '100%', padding: '5px 8px', fontSize: 10, fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.6)', border: `1px solid ${slotColor}50`, color: slotColor, outline: 'none', cursor: 'pointer' }}
                                >
                                  <option value="">— select a TOP —</option>
                                  {topList.map(t => <option key={t} value={t} style={{ background: '#0a0a14' }}>{t}</option>)}
                                </select>
                              </>
                            ) : (
                              <>
                                <div className="slot-wizard-hint" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  Waiting for TOX — run maestra.tox in TD to auto-populate
                                </div>
                                <input
                                  type="text"
                                  value={setup.selectedTop || ''}
                                  placeholder="/project1/out1"
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], selectedTop: e.target.value } })); }}
                                  style={{ width: '100%', padding: '5px 8px', fontSize: 10, fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: slotColor, outline: 'none' }}
                                />
                              </>
                            )}
                            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                              <button className="slot-wizard-btn slot-wizard-btn-ghost" onClick={e => handleBack(slot.id, e)}>← Back</button>
                              <button
                                className="slot-wizard-btn slot-wizard-btn-primary"
                                style={{ flex: 1 }}
                                onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'states' } })); }}
                              >{setup.selectedTop ? 'Add State →' : 'Skip →'}</button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* ══ STAGE: States — declare signal + type + description → chip ══ */}
                      {setup.stage === 'states' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title">Add State</div>
                          {/* Direction: ↑ Output / ↓ Input */}
                          <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                            {([['send','↑ Output','publish to network'],['receive','↓ Input','listen from network']] as const).map(([r,label,hint]) => (
                              <button key={r}
                                onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], role: r as 'send'|'receive' } })); }}
                                style={{
                                  flex: 1, padding: '5px 0', fontSize: 9, cursor: 'pointer',
                                  background: setup.role === r ? `${r === 'send' ? slotColor : 'rgba(52,211,153,1)'}20` : 'rgba(0,0,0,0.3)',
                                  border: `1px solid ${setup.role === r ? (r === 'send' ? slotColor : '#34d399') + '80' : 'rgba(255,255,255,0.1)'}`,
                                  color: setup.role === r ? (r === 'send' ? slotColor : '#34d399') : 'rgba(255,255,255,0.3)',
                                }}
                              >{label}</button>
                            ))}
                          </div>
                          {/* State key input */}
                          <input
                            type="text"
                            value={setup.stateKey}
                            placeholder={setup.role === 'receive' ? 'e.g. active_cue_id' : 'e.g. prompt_text'}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateKey: e.target.value } })); }}
                            style={{ width: '100%', padding: '5px 8px', fontSize: 10, fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5f9ff', outline: 'none' }}
                          />
                          {/* Quick-fill for receives */}
                          {setup.role === 'receive' && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, width: '100%' }}>
                              {[
                                { key: 'active_cue_id', type: 'string', color: '#f59e0b' },
                                { key: 'active_sequence_id', type: 'string', color: '#f472b6' },
                                { key: 'prompt_text', type: 'string', color: '#00d4ff' },
                                { key: 'audio_amplitude', type: 'float', color: '#a78bfa' },
                                { key: 'audio.rms', type: 'float', color: '#59FFD8' },
                                { key: 'audio.bpm', type: 'float', color: '#FFD84D' },
                              ].map(item => (
                                <button key={item.key}
                                  onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateKey: item.key, stateType: item.type } })); }}
                                  style={{ fontSize: 7, padding: '2px 5px', cursor: 'pointer', background: `${item.color}10`, border: `1px solid ${item.color}40`, color: item.color, fontFamily: 'var(--font-mono)' }}
                                >{item.key}</button>
                              ))}
                            </div>
                          )}
                          {/* Type chips */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, width: '100%' }}>
                            {['string','number','boolean','color','vector2','vector3','range','enum','array','object'].map(t => (
                              <button key={t}
                                onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateType: t } })); }}
                                style={{
                                  fontSize: 8, padding: '2px 6px', cursor: 'pointer',
                                  background: setup.stateType === t ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${setup.stateType === t ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                  color: setup.stateType === t ? '#00d4ff' : 'rgba(255,255,255,0.3)',
                                  fontFamily: 'var(--font-mono)', transition: 'all 0.1s',
                                }}
                              >{t}</button>
                            ))}
                          </div>
                          {/* Description */}
                          <input
                            type="text"
                            value={setup.stateDesc || ''}
                            placeholder="Add a description (optional)"
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateDesc: e.target.value } })); }}
                            style={{ width: '100%', padding: '4px 8px', fontSize: 9, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)', outline: 'none', fontStyle: 'italic' }}
                          />
                          {/* Live preview */}
                          {setup.stateKey && (
                            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', width: '100%', lineHeight: 1.6 }}>
                              {setup.role === 'send'
                                ? <><span style={{ color: slotColor }}>↑</span> <strong style={{ color: '#00d4ff' }}>publishes</strong> <span style={{ fontFamily: 'var(--font-mono)', color: '#e5f9ff' }}>{setup.stateKey}</span> · <span style={{ fontFamily: 'var(--font-mono)', color: '#a78bfa' }}>{setup.stateType}</span></>
                                : <><span style={{ color: '#34d399' }}>↓</span> <strong style={{ color: '#34d399' }}>receives</strong> <span style={{ fontFamily: 'var(--font-mono)', color: '#e5f9ff' }}>{setup.stateKey}</span> · <span style={{ fontFamily: 'var(--font-mono)', color: '#a78bfa' }}>{setup.stateType}</span></>
                              }
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                            <button className="slot-wizard-btn slot-wizard-btn-ghost" onClick={e => handleBack(slot.id, e)}>← Back</button>
                            <button
                              className="slot-wizard-btn slot-wizard-btn-primary"
                              style={{ flex: 1 }}
                              disabled={!setup.stateKey}
                              onClick={e => handleReferenceComplete(slot.id, e)}
                            >+ Add State</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ════ DEFAULT AVAILABLE STATE ════ */
                    <div className="slot-available-state">
                      <div className="slot-available-banner">
                        <span className="slot-available-flicker" style={{ color: slotColor, opacity: 0.7, fontSize: 11, letterSpacing: '0.2em', fontWeight: 700 }}>AVAILABLE</span>
                      </div>

                      <div className="slot-available-hover-btn" style={{ borderColor: slotColor, color: slotColor }}>
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
                      {setup.stage === 'connect' ? 'Setting up…' : false /* role stage removed */ ? 'Choose behavior' : 'Choose signal'}
                    </span>
                  ) : (
                    <span className="slot-tag available-tag">
                      <span className="available-label">Available</span>
                      <span className="available-connect-btn">Click to Connect</span>
                    </span>
                  )}
                </div>
              </div>
              {/* Top-right: lock + behavior — visible on hover, always on active */}
              <div className="slot-top-controls" style={{
                position: 'absolute', top: 6, right: 6,
                display: 'flex', alignItems: 'center', gap: 3,
                opacity: slot.active ? 1 : 0,
                transition: 'opacity 0.15s',
                zIndex: 10,
              }}>
                {/* Behavior indicator: ↑ send / ↓ receive / ↕ both */}
                {slot.active && slot.nodeRole && (
                  <span style={{
                    fontSize: 9, color: slotColor,
                    border: `1px solid ${slotColor}50`,
                    background: `${slotColor}15`,
                    borderRadius: 2, padding: '1px 5px',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.06em',
                  }}>
                    {slot.nodeRole === 'send' ? '↑ OUT' : slot.nodeRole === 'receive' ? '↓ IN' : '↕ BOTH'}
                  </span>
                )}
                {/* Lock/unlock */}
                {slot.active && (
                  <button
                    onClick={e => { e.stopPropagation(); toggleLock(slot.id, slot, entityStates[slot.entity_id || slot.id] as Record<string, unknown> || {}); }}
                    title={lockedSlots.has(slot.id) ? '🔒 Locked — click to unlock and modify' : '🔓 Click to lock and protect this slot'}
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: lockedSlots.has(slot.id) ? slotColor : 'rgba(0,0,0,0.5)',
                      border: `1px solid ${lockedSlots.has(slot.id) ? slotColor : 'rgba(255,255,255,0.15)'}`,
                      color: lockedSlots.has(slot.id) ? '#000' : 'rgba(255,255,255,0.4)',
                      cursor: 'pointer', fontSize: 9, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', flexShrink: 0,
                    }}
                  >{lockedSlots.has(slot.id) ? '🔒' : '🔓'}</button>
                )}
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
