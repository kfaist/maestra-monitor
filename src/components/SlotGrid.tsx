'use client';

import { useState, useEffect, useCallback } from 'react';
import { FleetSlot, slotStatusLabel, slotStatusClass, formatAge } from '@/types';

type InlineStage = 'idle' | 'connect' | 'role' | 'signal';
type NodeRole = 'receive' | 'send' | 'two_way';
type SignalSource = 'touchdesigner' | 'json_stream' | 'osc' | 'audio_reactive' | 'text' | 'test_signal';

interface SlotSetup {
  stage: InlineStage;
  role: NodeRole | null;
  signal: SignalSource | null;
}

interface SlotGridProps {
  slots: FleetSlot[];
  selectedId: string | null;
  onSelectSlot: (id: string) => void;
  onAddSlot: () => void;
  onJoinNode: () => void;
  onSlotSetupComplete?: (slotId: string, role: NodeRole, signal: SignalSource) => void;
}

const ROLES: { value: NodeRole; label: string; icon: string; color: string }[] = [
  { value: 'send', label: 'Send', icon: '↑', color: '#22c55e' },
  { value: 'receive', label: 'Receive', icon: '↓', color: '#5cc8ff' },
  { value: 'two_way', label: 'Both', icon: '↕', color: '#fbbf24' },
];

const SIGNALS: { value: SignalSource; label: string; icon: string }[] = [
  { value: 'touchdesigner', label: 'Visual', icon: '◆' },
  { value: 'audio_reactive', label: 'Audio', icon: '♫' },
  { value: 'json_stream', label: 'JSON', icon: '{}' },
  { value: 'text', label: 'Text', icon: 'A' },
  { value: 'osc', label: 'OSC', icon: '~' },
  { value: 'test_signal', label: 'Test', icon: '▶' },
];

export default function SlotGrid({ slots, selectedId, onSelectSlot, onAddSlot, onJoinNode, onSlotSetupComplete }: SlotGridProps) {
  const activeCount = slots.filter(s => s.active).length;
  const hasActiveNodes = activeCount > 0;

  // Per-slot inline setup wizard state
  const [setupState, setSetupState] = useState<Record<string, SlotSetup>>({});

  // Tick every 500ms for age display (slower = less jitter)
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
      // Active slot — just select it
      onSelectSlot(slot.id);
      return;
    }
    // Inactive slot — check if already in setup mode
    const current = setupState[slot.id];
    if (current && current.stage !== 'idle') {
      // Already in setup — just select it too
      onSelectSlot(slot.id);
      return;
    }
    // Start the inline wizard at 'connect' stage
    onSelectSlot(slot.id);
    setSetupState(prev => ({
      ...prev,
      [slot.id]: { stage: 'connect', role: null, signal: null },
    }));
  }, [setupState, onSelectSlot]);

  const handleConnect = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Advance to role selection
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
    const setup = setupState[slotId];
    if (!setup?.role) return;
    // Complete! Call parent handler
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], signal, stage: 'idle' },
    }));
    onSlotSetupComplete?.(slotId, setup.role, signal);
  }, [setupState, onSlotSetupComplete]);

  const handleBack = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => {
      const current = prev[slotId];
      if (!current) return prev;
      if (current.stage === 'signal') return { ...prev, [slotId]: { ...current, stage: 'role', role: null } };
      if (current.stage === 'role') return { ...prev, [slotId]: { ...current, stage: 'connect' } };
      // 'connect' stage — cancel setup
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

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
          // Derive truthful status label from 5-layer model
          const mStatus = slot.maestraStatus;
          const statusText = mStatus ? slotStatusLabel(mStatus) : (
            slot.active ? (slot.connection_status === 'connected' ? 'Active' : 'Connecting') : ''
          );
          const statusCls = mStatus ? slotStatusClass(mStatus) : '';

          // "Last event" — pick the most recent timestamp across all layers
          let lastEventStr = '';
          if (mStatus && slot.active) {
            const timestamps = [mStatus.lastHeartbeatAt, mStatus.lastStateUpdateAt, mStatus.lastStreamFrameAt].filter(Boolean) as number[];
            if (timestamps.length > 0) {
              const mostRecent = Math.max(...timestamps);
              const age = Math.max(0, now - mostRecent);
              lastEventStr = `last: ${formatAge(age)}`;
            }
          }

          // Waiting timer for video area
          let waitingStr = '';
          if (mStatus && mStatus.heartbeat === 'waiting' && mStatus.entity === 'registered' && mStatus.registeredAt) {
            waitingStr = `${formatAge(Math.max(0, now - mStatus.registeredAt))} since registration`;
          }

          const setup = setupState[slot.id];
          const inSetup = setup && setup.stage !== 'idle';

          return (
            <div
              key={slot.id}
              className={[
                'slot',
                slot.active ? 'active-slot' : '',
                slot.id === selectedId ? 'selected' : '',
                slot.cloudNode ? 'cloud-node' : '',
                inSetup ? 'setup-mode' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleSlotClick(slot)}
            >
              <div className="slot-video-area">
                {slot.active ? (
                  slot.frameUrl ? (
                    <img src={slot.frameUrl} alt="stream" />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      {/* Signal type icon when active but no frame yet */}
                      {slot.signalType && (
                        <span style={{ fontSize: '20px', opacity: 0.5 }}>
                          {slot.signalType === 'audio_reactive' ? '♫'
                            : slot.signalType === 'json_stream' ? '{ }'
                            : slot.signalType === 'osc' ? '~'
                            : slot.signalType === 'touchdesigner' ? '◆'
                            : slot.signalType === 'text' ? 'A'
                            : slot.signalType === 'video' ? '▶'
                            : '●'}
                        </span>
                      )}
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: mStatus ? 'var(--accent)' : 'var(--text-dim)' }}>
                        {statusText}
                      </span>
                      {slot.signalType && (
                        <span style={{ fontSize: '8px', letterSpacing: '.06em', color: 'var(--accent)', opacity: 0.6 }}>
                          {slot.signalType === 'audio_reactive' ? 'Audio'
                            : slot.signalType === 'json_stream' ? 'JSON'
                            : slot.signalType === 'osc' ? 'OSC'
                            : slot.signalType === 'touchdesigner' ? 'TouchDesigner'
                            : slot.signalType === 'text' ? 'Text'
                            : slot.signalType === 'video' ? 'Video'
                            : slot.signalType}
                        </span>
                      )}
                      {!slot.signalType && waitingStr ? (
                        <span style={{ fontSize: '8px', letterSpacing: '.08em', color: 'var(--text-dim)', opacity: 0.6 }}>
                          {waitingStr}
                        </span>
                      ) : !slot.signalType && mStatus && mStatus.heartbeat === 'waiting' && mStatus.entity === 'registered' ? (
                        <span style={{ fontSize: '8px', letterSpacing: '.08em', color: 'var(--text-dim)', opacity: 0.5 }}>
                          Awaiting first heartbeat
                        </span>
                      ) : null}
                    </div>
                  )
                ) : inSetup ? (
                  /* ════ INLINE SETUP WIZARD ════ */
                  <div className="slot-inline-wizard">
                    {/* Step indicator */}
                    <div className="slot-wizard-steps">
                      <span className={`slot-wizard-dot ${setup.stage === 'connect' ? 'active' : 'done'}`} />
                      <span className="slot-wizard-line" />
                      <span className={`slot-wizard-dot ${setup.stage === 'role' ? 'active' : setup.stage === 'signal' ? 'done' : ''}`} />
                      <span className="slot-wizard-line" />
                      <span className={`slot-wizard-dot ${setup.stage === 'signal' ? 'active' : ''}`} />
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
                        <div className="slot-wizard-title">Signal Type</div>
                        <div className="slot-wizard-options slot-wizard-options-grid">
                          {SIGNALS.map(s => (
                            <button
                              key={s.value}
                              className="slot-wizard-option slot-wizard-option-sm"
                              onClick={(e) => handleSignalSelect(slot.id, s.value, e)}
                            >
                              <span className="slot-wizard-option-icon">{s.icon}</span>
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
                  </div>
                ) : (
                  /* ════ DEFAULT AVAILABLE STATE ════ */
                  <div className="slot-available-state">
                    <div className="slot-available-label">AVAILABLE</div>
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
              <div className="slot-footer">
                <div className="slot-label">{slot.label}</div>
                <div className="slot-meta">
                  <span className="slot-fps">
                    {slot.fps != null ? `${slot.fps}fps` : ''}
                    {slot.fps != null && lastEventStr ? ' · ' : ''}
                    {lastEventStr}
                  </span>
                  {slot.cloudNode && <span className="cloud-badge">&#x2601; Cloud</span>}
                  {slot.active ? (
                    <span className={`slot-tag active-tag ${statusCls}`}>
                      {statusText}
                    </span>
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
                <svg viewBox="0 0 10 10" fill="none" stroke="#000" strokeWidth="2">
                  <polyline points="1.5,5 4,7.5 8.5,2.5" />
                </svg>
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
