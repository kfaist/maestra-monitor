'use client';

import { useState, useCallback } from 'react';
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
  /** Signal dropped onto a slot's IN zone: { slotId, signal } */
  routing?: Record<string, string[]>;
  onRoute?: (slotId: string, signalId: string) => void;
  onUnroute?: (slotId: string, signalId: string) => void;
  liveValues?: Record<string, string | number | boolean>;
}

type RoutingMap = Record<string, string[]>;

function getSlotOuts(slot: FleetSlot): OutSignal[] {
  if (!slot.active) return [];
  const sig = slot.signalType;
  if (sig === 'touchdesigner') return ALL_OUTS.filter(s => s.id.startsWith('prompt') || s.id === 'audio_amplitude' || s.id === 'visitor_present');
  if (sig === 'audio_reactive') return ALL_OUTS.filter(s => s.id.startsWith('audio.'));
  if (sig === 'json_stream') return ALL_OUTS.filter(s => s.type === 'string');
  return [];
}

export default function SignalPanel({ slots = [], liveValues = {} }: SignalPanelProps) {
  const [routing, setRouting] = useState<RoutingMap>({});
  const [dragOver, setDragOver] = useState<string | null>(null);

  const getSig = (id: string) => ALL_OUTS.find(s => s.id === id);

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
            const outs = getSlotOuts(slot);
            const isLive = slot.active;

            return (
              <div key={slot.id} style={{ border: `1px solid ${color}40`, background: `${color}06`, padding: '8px 10px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: isLive ? color : 'var(--text-dim)', boxShadow: isLive ? `0 0 6px ${color}` : 'none', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color, letterSpacing: '0.08em' }}>{slot.label}</span>
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

                {/* OUT — slot color */}
                {outs.length > 0 && (
                  <div>
                    <div style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 4 }}>OUT</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {outs.map(sig => (
                        <div key={sig.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${color}12`, border: `1px solid ${color}45`, padding: '3px 7px', fontSize: 9 }}>
                          <span style={{ color }}>{sig.icon}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color }}>{sig.label}</span>
                          {liveValues[sig.id] !== undefined && (
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 8, color: 'var(--text-dim)', marginLeft: 2 }}>{String(liveValues[sig.id]).slice(0, 14)}</span>
                          )}
                        </div>
                      ))}
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
