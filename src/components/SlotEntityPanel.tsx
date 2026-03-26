'use client';

/**
 * SlotEntityPanel — per-slot TD entity OUT panels
 *
 * Renders one colored card per slot (same color as the slot border).
 * Shows the slot's live entity state keys as draggable OUT chips.
 * Designed for TD: channel names from state_in CHOP become state keys here.
 *
 * Jordan Snyder / Maestra SDK:
 *   state_in CHOP channels → entity state keys → appear here as OUT chips
 *   Other nodes can drag these chips to their own IN (routing)
 */

import { useState, useRef, useCallback } from 'react';
import { FleetSlot } from '@/types';
import { getSlotColor, ALL_OUTS } from './GlobalOutBar';

interface SlotEntityPanelProps {
  slots: FleetSlot[];
  entityStates: Record<string, Record<string, unknown>>;
  liveValues: Record<string, string | number | boolean>;
}

// Signals we know come from Maestra audio analysis — not TD entity state
const SYSTEM_KEYS = new Set([
  'toe_name','tops','server','metadata','publishing','listening',
  'active','entity_id','device_id',
]);

// Pull OUT signals for a slot: prefer known signals, fall back to entity state keys
function getSlotSignals(
  slot: FleetSlot,
  entityState: Record<string, unknown>
): Array<{ id: string; label: string; value: string; isKnown: boolean; color: string }> {
  const color = '#888';
  const results: ReturnType<typeof getSlotSignals> = [];

  // Known global signals this slot might publish
  const known = ALL_OUTS.filter(s => {
    if (!slot.active) return false;
    const sig = slot.signalType;
    if (sig === 'touchdesigner') return ['prompt_text','audio_amplitude','visitor_present'].includes(s.id);
    if (sig === 'audio_reactive') return s.id.startsWith('audio.');
    if (sig === 'json_stream') return s.type === 'string';
    return false;
  });

  for (const s of known) {
    results.push({ id: s.id, label: s.label, value: '', isKnown: true, color: s.color });
  }

  // Entity state keys (from state_in CHOP channels in TD)
  for (const [k, v] of Object.entries(entityState)) {
    if (SYSTEM_KEYS.has(k)) continue;
    if (results.find(r => r.id === k)) continue;
    results.push({
      id: `${slot.entity_id || slot.id}.${k}`,
      label: k,
      value: String(v).slice(0, 16),
      isKnown: false,
      color,
    });
  }

  return results;
}

export default function SlotEntityPanel({ slots, entityStates, liveValues }: SlotEntityPanelProps) {
  const [routing, setRouting] = useState<Record<string, string[]>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const draggingRef = useRef<{ id: string; label: string; color: string } | null>(null);

  const onDrop = useCallback((slotId: string) => {
    const d = draggingRef.current;
    if (!d) return;
    setRouting(prev => {
      const cur = prev[slotId] ?? [];
      if (cur.includes(d.id)) return prev;
      return { ...prev, [slotId]: [...cur, d.id] };
    });
    setDragOver(null);
  }, []);

  const removeRoute = (slotId: string, sigId: string) =>
    setRouting(prev => ({ ...prev, [slotId]: (prev[slotId] ?? []).filter(s => s !== sigId) }));

  return (
    <div style={{ padding: '0 0 4px 0' }}>
      {/* Section header */}
      <div style={{
        padding: '14px 20px 10px',
        fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dim)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>// TD Entity Signals</span>
        <span style={{ fontSize: 8, opacity: 0.4, fontWeight: 400, letterSpacing: '0.1em' }}>
          drag OUT → slot IN &nbsp;·&nbsp; state_in CHOP channels appear here
        </span>
      </div>

      {/* One panel per slot */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, padding: '0 1px 1px' }}>
        {slots.map((slot, idx) => {
          const color = getSlotColor(slot.id, idx);
          const eid = slot.entity_id || slot.id;
          const entityState = entityStates[eid] || {};
          const toeName = entityState.toe_name as string | undefined;
          const tops = entityState.tops as string[] | undefined;
          const signals = getSlotSignals(slot, entityState);
          const ins = routing[slot.id] ?? [];
          const isLive = slot.active;

          return (
            <div key={slot.id} style={{
              background: `${color}06`,
              border: `1px solid ${color}${isLive ? '35' : '18'}`,
              padding: '10px 12px',
              minHeight: 80,
              transition: 'border-color 0.2s',
            }}>
              {/* Slot header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <div style={{
                  width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                  background: isLive ? color : 'rgba(255,255,255,0.1)',
                  boxShadow: isLive ? `0 0 5px ${color}` : 'none',
                }} />
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700,
                  color: isLive ? color : 'rgba(255,255,255,0.3)',
                  letterSpacing: '0.07em', flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {toeName || slot.label}
                </span>
                {isLive && (
                  <span style={{ fontSize: 7, padding: '1px 4px', border: `1px solid ${color}45`, color, letterSpacing: '0.08em', flexShrink: 0 }}>
                    LIVE
                  </span>
                )}
              </div>

              {/* OUT signals — draggable chips */}
              {signals.length > 0 ? (
                <div>
                  <div style={{ fontSize: 7, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 5 }}>OUT</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {signals.map(sig => {
                      const lv = liveValues[sig.id] !== undefined
                        ? String(liveValues[sig.id]).slice(0, 12)
                        : sig.value;
                      return (
                        <div
                          key={sig.id}
                          draggable
                          onDragStart={() => {
                            draggingRef.current = { id: sig.id, label: sig.label, color };
                            (window as unknown as Record<string,unknown>)._draggingSignal = {
                              id: sig.id, label: sig.label, type: 'string',
                              color, icon: '◈', sourceSlotId: slot.id,
                            };
                          }}
                          onDragEnd={() => {
                            draggingRef.current = null;
                            (window as unknown as Record<string,unknown>)._draggingSignal = null;
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            background: sig.isKnown ? `${sig.color}12` : `${color}10`,
                            border: `1px solid ${sig.isKnown ? sig.color : color}35`,
                            padding: '2px 6px', fontSize: 8, cursor: 'grab',
                          }}
                        >
                          <span style={{ color: sig.isKnown ? sig.color : color }}>◈</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: sig.isKnown ? sig.color : color }}>{sig.label}</span>
                          {lv && <span style={{ color: 'var(--text-dim)', marginLeft: 2, opacity: 0.6 }}>{lv}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 8, color: 'var(--text-dim)', opacity: 0.22, lineHeight: 1.5 }}>
                  {isLive
                    ? 'Wire a CHOP into state_in\nChannel names appear here'
                    : 'Connect a TD node'}
                </div>
              )}

              {/* IN drop zone */}
              <div style={{ marginTop: signals.length > 0 ? 8 : 0 }}>
                <div style={{ fontSize: 7, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.35, marginBottom: 3 }}>IN</div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(slot.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => onDrop(slot.id)}
                  style={{
                    minHeight: 20, border: `1px dashed ${dragOver === slot.id ? color : 'rgba(255,255,255,0.07)'}`,
                    background: dragOver === slot.id ? `${color}10` : 'transparent',
                    padding: '2px 5px', display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center',
                    transition: 'all 0.12s',
                  }}
                >
                  {ins.length === 0 ? (
                    <span style={{ fontSize: 7, color: 'var(--text-dim)', opacity: 0.22 }}>drop signals here</span>
                  ) : ins.map(sigId => (
                    <div key={sigId} style={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      background: `${color}15`, border: `1px solid ${color}35`,
                      padding: '1px 5px', fontSize: 7,
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color }}>{sigId.split('.').pop()}</span>
                      <span onClick={() => removeRoute(slot.id, sigId)} style={{ cursor: 'pointer', color: 'var(--text-dim)', marginLeft: 1 }}>×</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* TOPs hint when available */}
              {tops && tops.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 7, color: 'var(--text-dim)', opacity: 0.35 }}>
                  {tops.length} TOP{tops.length > 1 ? 's' : ''} available
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
