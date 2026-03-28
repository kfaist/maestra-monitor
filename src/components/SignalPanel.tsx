'use client';

import { useState, useCallback, useMemo } from 'react';
import { FleetSlot } from '@/types';
import { getSlotColor, OutSignal, ALL_OUTS } from './GlobalOutBar';

export { SLOT_COLORS } from './GlobalOutBar';

interface SignalPanelProps {
  injectActive: boolean;
  onInjectToggle: (active: boolean) => void;
  promptText: string;
  onPromptChange: (text: string) => void;
  onBroadcast: (prompt: string) => void;
  onP6Flush: (prompt: string) => void;
  slots?: FleetSlot[];
  entityStates?: Record<string, Record<string, unknown>>;
  liveValues?: Record<string, string | number | boolean>;
}

type RoutingMap = Record<string, string[]>;

/** Map signal ID to live value from entityStates */
function getLiveValue(
  sigId: string,
  entityStates: Record<string, Record<string, unknown>>,
  slots: FleetSlot[]
): string {
  // mirrors-echo signals
  const mirrorSlug = 'KFaist_Ambient_Intelligence';
  const mirrorSlot = slots.find(s => s.entity_id === mirrorSlug || s.id === 'slot2');
  const mirrorState = entityStates[mirrorSlug] || entityStates[mirrorSlot?.entity_id || ''] || {};
  if (sigId === 'prompt_text') return String(mirrorState.prompt_text ?? mirrorState.p6 ?? mirrorState.prompt ?? '');
  if (sigId === 'audio_amplitude') return parseFloat(String(mirrorState.audio_amplitude ?? mirrorState.audio_level ?? 0)).toFixed(2);
  if (sigId === 'visitor_present') return String(!!mirrorState.visitor_present);

  // audio signals — from any slot's entity state
  if (sigId.startsWith('audio.')) {
    const key = sigId.replace('audio.', '');
    for (const st of Object.values(entityStates)) {
      const v = (st as Record<string, unknown>)[key];
      if (v !== undefined) return String(parseFloat(String(v)).toFixed(2));
    }
    return '';
  }

  // DMX signals
  const dmxState = entityStates['dmx-lighting'] || {};
  if (sigId === 'dmx.active_cue') return String(dmxState.active_cue_id ?? 'idle');
  if (sigId === 'dmx.active_sequence') return String(dmxState.active_sequence_id ?? 'idle');

  return '';
}

/** Derive OUT signals for a slot based on its signalType + entity state */
function getSlotOuts(slot: FleetSlot, entityState: Record<string, unknown>): OutSignal[] {
  if (!slot.active) return [];

  // If entity pushed explicit 'publishing' keys, use those
  const publishing = entityState?.publishing as string[] | undefined;
  if (publishing && Array.isArray(publishing)) {
    return ALL_OUTS.filter(s => publishing.some(p => s.id === p || s.id.endsWith(p)));
  }

  // Otherwise derive from signalType
  const sig = slot.signalType;
  if (sig === 'touchdesigner') return ALL_OUTS.filter(s =>
    s.id === 'prompt_text' || s.id === 'audio_amplitude' || s.id === 'visitor_present'
  );
  if (sig === 'audio_reactive') return ALL_OUTS.filter(s => s.id.startsWith('audio.'));
  if (sig === 'json_stream') return ALL_OUTS.filter(s => s.type === 'string');
  if (sig === 'osc') return ALL_OUTS.filter(s => s.id.startsWith('audio.') || s.type === 'string');

  // Fallback: expose any keys the entity is actively pushing
  const stateKeys = Object.keys(entityState || {}).filter(k =>
    !['toe_name', 'tops', 'server', 'metadata', 'publishing', 'listening'].includes(k)
  );
  if (stateKeys.length > 0) {
    return stateKeys.slice(0, 6).map(k => ({
      id: k, label: k, type: 'string' as const, color: 'var(--accent)', icon: '◈',
    }));
  }
  return [];
}

export default function SignalPanel({ slots = [], entityStates = {}, liveValues = {} }: SignalPanelProps) {
  const [routing, setRouting] = useState<RoutingMap>({});
  const [dragOver, setDragOver] = useState<string | null>(null);

  const getSig = (id: string) => ALL_OUTS.find(s => s.id === id);

  const resolvedLive = useMemo(() => {
    const merged: Record<string, string> = {};
    // From passed liveValues
    for (const [k, v] of Object.entries(liveValues)) merged[k] = String(v);
    // Override with entityStates-derived values
    for (const sig of ALL_OUTS) {
      const v = getLiveValue(sig.id, entityStates, slots);
      if (v) merged[sig.id] = v;
    }
    return merged;
  }, [liveValues, entityStates, slots]);

  const handleDrop = useCallback((slotId: string) => {
    const sig = (window as unknown as Record<string, unknown>)._draggingSignal as OutSignal | null;
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

  return (
    <div className="signal-panel">
      <div className="signal-section" style={{ paddingTop: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>
          // Slot Signal Routing
        </div>

        {slots.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.35, fontStyle: 'italic' }}>No slots — connect a node to configure routing</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {slots.map((slot, idx) => {
            const color = getSlotColor(slot.id, idx);
            const ins = routing[slot.id] ?? [];
            const slotEntityState = entityStates[slot.entity_id || slot.id] || {};
            const outs = getSlotOuts(slot, slotEntityState);
            const isLive = slot.active;

            return (
              <div key={slot.id} style={{ border: `1px solid ${color}40`, background: `${color}06`, padding: '8px 10px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: isLive ? color : 'var(--text-dim)', boxShadow: isLive ? `0 0 6px ${color}` : 'none', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color, letterSpacing: '0.08em' }}>
                      {/* Auto-name from TOE if available */}
                      {(slotEntityState.toe_name as string) || slot.label}
                    </span>
                    {isLive && <span style={{ fontSize: 8, padding: '1px 5px', border: `1px solid ${color}50`, color }}>LIVE</span>}
                    {isLive && slot.fps && <span style={{ fontSize: 8, color: 'var(--text-dim)', opacity: 0.5 }}>{slot.fps}fps</span>}
                  </div>
                  {isLive && <span style={{ fontSize: 7, color: 'var(--text-dim)', opacity: 0.3, fontStyle: 'italic' }}>protected</span>}
                </div>

                {/* IN — drop zone */}
                <div style={{ marginBottom: outs.length > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 4 }}>IN</div>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(slot.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => handleDrop(slot.id)}
                    style={{
                      minHeight: 26, border: `1px dashed ${dragOver === slot.id ? color : 'var(--border)'}`,
                      background: dragOver === slot.id ? `${color}10` : 'var(--surface2)',
                      padding: '4px 6px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', transition: 'all 0.15s',
                    }}
                  >
                    {ins.length === 0 && <span style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.28 }}>drag signals here</span>}
                    {ins.map(sigId => {
                      const s = getSig(sigId);
                      if (!s) return null;
                      return (
                        <div key={sigId} style={{ display: 'flex', alignItems: 'center', gap: 3, background: `${s.color}15`, border: `1px solid ${s.color}40`, padding: '2px 6px', fontSize: 9 }}>
                          <span style={{ color: s.color }}>{s.icon}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: s.color }}>{s.label}</span>
                          {!isLive && <span onClick={() => removeRoute(slot.id, sigId)} style={{ marginLeft: 2, color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11 }}>×</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* OUT — slot color + live values */}
                {outs.length > 0 && (
                  <div>
                    <div style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 4 }}>OUT</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {outs.map(sig => {
                        const val = resolvedLive[sig.id] || (slotEntityState[sig.id] !== undefined ? String(slotEntityState[sig.id]).slice(0,18) : '');
                        return (
                          <div
                            key={sig.id}
                            draggable
                            onDragStart={() => { (window as unknown as Record<string,unknown>)._draggingSignal = sig; }}
                            onDragEnd={() => { (window as unknown as Record<string,unknown>)._draggingSignal = null; }}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${color}12`, border: `1px solid ${color}45`, padding: '3px 7px', fontSize: 9, cursor: 'grab' }}
                          >
                            <span style={{ color }}>{sig.icon}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color }}>{sig.label}</span>
                            {val && <span style={{ fontFamily: 'var(--font-display)', fontSize: 8, color: 'var(--text-dim)', marginLeft: 2 }}>{val.slice(0,16)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!isLive && outs.length === 0 && ins.length === 0 && (
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.25, fontStyle: 'italic' }}>connect to configure</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
