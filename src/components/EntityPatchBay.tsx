'use client';

/**
 * EntityPatchBay — Signal routing panel below the slot grid
 * 
 * Top section: Global OUT chips (draggable) — mirrors-echo, audio, dmx
 * Bottom section: Per-slot IN drop zones + OUT declaration
 * 
 * Drag a chip to a slot's IN zone to wire it.
 * Click a chip to apply globally (broadcasts to all connected slots).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { FleetSlot } from '@/types';
import { getSlotColor, ALL_OUTS, OutSignal, SLOT_COLORS } from './GlobalOutBar';

interface EntityPatchBayProps {
  slots: FleetSlot[];
  entityStates: Record<string, Record<string, unknown>>;
  liveValues: Record<string, string | number | boolean>;
  onApplyGlobal?: (signalId: string, value: unknown) => void;
}

type RoutingMap = Record<string, string[]>; // slotId -> signalIds

const SIGNAL_GROUPS = [
  {
    label: 'mirrors-echo',
    dot: true,
    signals: ALL_OUTS.filter(s => s.id === 'prompt_text' || s.id === 'audio_amplitude' || s.id === 'visitor_present'),
  },
  {
    label: 'audio analysis',
    dot: false,
    signals: ALL_OUTS.filter(s => s.id.startsWith('audio.')),
  },
  {
    label: 'dmx-lighting',
    dot: true,
    signals: ALL_OUTS.filter(s => s.id.startsWith('dmx.')),
  },
];

export default function EntityPatchBay({ slots, entityStates, liveValues, onApplyGlobal }: EntityPatchBayProps) {
  const [routing, setRouting] = useState<RoutingMap>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<OutSignal | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const draggingRef = useRef<OutSignal | null>(null);

  const getLive = (sigId: string): string => {
    if (liveValues[sigId] !== undefined) return String(liveValues[sigId]).slice(0, 20);
    // also check entityStates
    for (const st of Object.values(entityStates)) {
      const mapped: Record<string, string> = {
        'prompt_text': String((st as Record<string,unknown>).prompt_text ?? (st as Record<string,unknown>).p6 ?? ''),
        'audio_amplitude': parseFloat(String((st as Record<string,unknown>).audio_amplitude ?? 0)).toFixed(2),
        'visitor_present': String(!!(st as Record<string,unknown>).visitor_present),
        'dmx.active_cue': String((st as Record<string,unknown>).active_cue_id ?? 'idle'),
        'dmx.active_sequence': String((st as Record<string,unknown>).active_sequence_id ?? 'idle'),
      };
      if (mapped[sigId] && mapped[sigId] !== 'undefined') return mapped[sigId];
    }
    return '';
  };

  const handleDragStart = useCallback((sig: OutSignal) => {
    setDragging(sig);
    draggingRef.current = sig;
    (window as unknown as Record<string, unknown>)._draggingSignal = sig;
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragging(null);
    draggingRef.current = null;
    (window as unknown as Record<string, unknown>)._draggingSignal = null;
  }, []);

  const handleDrop = useCallback((slotId: string) => {
    const sig = draggingRef.current;
    if (!sig) return;
    setRouting(prev => {
      const cur = prev[slotId] ?? [];
      if (cur.includes(sig.id)) return prev;
      return { ...prev, [slotId]: [...cur, sig.id] };
    });
    setDragOver(null);
  }, []);

  const removeRoute = useCallback((slotId: string, sigId: string) => {
    setRouting(prev => ({ ...prev, [slotId]: (prev[slotId] ?? []).filter(s => s !== sigId) }));
  }, []);

  const handleClickGlobal = useCallback((sig: OutSignal) => {
    const val = getLive(sig.id);
    onApplyGlobal?.(sig.id, val || sig.id);
    setFlash(sig.id);
    setTimeout(() => setFlash(null), 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onApplyGlobal, liveValues, entityStates]);

  const getSig = (id: string) => ALL_OUTS.find(s => s.id === id);

  return (
    <div style={{
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      padding: '16px 20px',
    }}>
      {/* ── GLOBAL OUT CHIPS ── */}
      <div style={{ marginBottom: 16 }}>
        {SIGNAL_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 10 }}>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {group.signals.map(sig => {
                const lv = getLive(sig.id);
                const isFlashing = flash === sig.id;
                const isDragging = dragging?.id === sig.id;
                return (
                  <div
                    key={sig.id}
                    draggable
                    onDragStart={() => handleDragStart(sig)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleClickGlobal(sig)}
                    title={`Drag to slot IN, or click to apply globally\nCurrent: ${lv || 'no data'}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: isFlashing ? `${sig.color}30` : `${sig.color}0e`,
                      border: `1px solid ${sig.color}${isFlashing ? '80' : '35'}`,
                      padding: sig.type === 'audio' ? '3px 8px' : '5px 10px',
                      cursor: 'grab', opacity: isDragging ? 0.4 : 1,
                      transition: 'all 0.15s', userSelect: 'none',
                      minWidth: sig.type === 'audio' ? 0 : 140,
                      transform: isFlashing ? 'scale(0.97)' : 'scale(1)',
                    }}
                  >
                    <span style={{ color: sig.color, fontSize: 10, flexShrink: 0 }}>{sig.icon}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: sig.type === 'audio' ? 9 : 10, color: sig.color }}>{sig.label}</span>
                    {lv && sig.type !== 'audio' && (
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--text-dim)', marginLeft: 'auto', paddingLeft: 6, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lv}</span>
                    )}
                    {sig.type !== 'audio' && (
                      <span style={{ fontSize: 7, color: 'var(--text-dim)', opacity: 0.3, marginLeft: 2 }}>{sig.type}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── NODE PATCH ROWS ── */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {slots.map((slot, idx) => {
            const color = getSlotColor(slot.id, idx);
            const ins = routing[slot.id] ?? [];
            const isLive = slot.active;
            const eid = slot.entity_id || slot.id;
            const slotEntityState = entityStates[eid] || {};
            const toeName = (slotEntityState as Record<string,unknown>).toe_name as string | undefined;

            // Derive OUT signals from entity state
            const publishing = (slotEntityState as Record<string,unknown>).publishing as string[] | undefined;
            const outKeys = publishing ?? Object.keys(slotEntityState).filter(k =>
              !['toe_name','tops','server','metadata','publishing','listening','active'].includes(k)
            ).slice(0, 4);

            return (
              <div key={slot.id} style={{
                border: `1px solid ${color}${isLive ? '50' : '20'}`,
                background: `${color}04`,
                padding: '8px 10px',
              }}>
                {/* Slot header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: isLive ? color : 'var(--text-dim)',
                    boxShadow: isLive ? `0 0 6px ${color}` : 'none',
                  }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color, letterSpacing: '0.07em' }}>
                    {toeName || slot.label}
                  </span>
                  {isLive && <span style={{ fontSize: 7, padding: '1px 4px', border: `1px solid ${color}50`, color, letterSpacing: '0.1em' }}>LIVE</span>}
                  {slot.fps && <span style={{ fontSize: 8, color: 'var(--text-dim)', opacity: 0.5, marginLeft: 'auto' }}>{slot.fps}fps</span>}
                </div>

                {/* IN drop zone */}
                <div style={{ marginBottom: outKeys.length > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 7, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 4 }}>IN</div>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(slot.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => handleDrop(slot.id)}
                    style={{
                      minHeight: 24,
                      border: `1px dashed ${dragOver === slot.id ? color : 'rgba(255,255,255,0.08)'}`,
                      background: dragOver === slot.id ? `${color}12` : 'rgba(0,0,0,0.2)',
                      padding: '3px 5px',
                      display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center',
                      transition: 'all 0.12s',
                    }}
                  >
                    {ins.length === 0 ? (
                      <span style={{ fontSize: 8, color: 'var(--text-dim)', opacity: 0.25 }}>drop signals here</span>
                    ) : ins.map(sigId => {
                      const s = getSig(sigId);
                      if (!s) return null;
                      return (
                        <div key={sigId} style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          background: `${color}15`, border: `1px solid ${color}45`,
                          padding: '1px 5px', fontSize: 8,
                        }}>
                          <span style={{ color }}>{s.icon}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color }}>{s.label}</span>
                          <span
                            onClick={() => removeRoute(slot.id, sigId)}
                            style={{ marginLeft: 3, color, opacity: 0.5, cursor: 'pointer', fontSize: 10, lineHeight: 1 }}
                          >×</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* OUT — in slot color */}
                {outKeys.length > 0 && (
                  <div>
                    <div style={{ fontSize: 7, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 4 }}>OUT</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {outKeys.map(key => {
                        const val = slotEntityState[key];
                        return (
                          <div
                            key={key}
                            draggable
                            onDragStart={() => {
                              const pseudoSig: OutSignal = { id: `${eid}.${key}`, label: key, type: 'string', color, icon: '◈', sourceSlotId: slot.id };
                              handleDragStart(pseudoSig);
                            }}
                            onDragEnd={handleDragEnd}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              background: `${color}12`, border: `1px solid ${color}40`,
                              padding: '2px 6px', fontSize: 8, cursor: 'grab',
                            }}
                          >
                            <span style={{ color }}>◈</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color }}>{key}</span>
                            {val !== undefined && (
                              <span style={{ color: 'var(--text-dim)', marginLeft: 2 }}>
                                {String(val).slice(0, 12)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!isLive && ins.length === 0 && outKeys.length === 0 && (
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', opacity: 0.22, fontStyle: 'italic' }}>wire state_in CHOP → channels appear here</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
