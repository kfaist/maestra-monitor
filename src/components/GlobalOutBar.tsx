'use client';

import { useState, useEffect, useRef } from 'react';
import { FleetSlot } from '@/types';

export const SLOT_COLORS = [
  '#00d4ff', // cyan
  '#a78bfa', // violet
  '#34d399', // emerald
  '#f59e0b', // amber
  '#f472b6', // pink
  '#38bdf8', // sky
];

// Stable color from slot ID (deterministic, not random per render)
export function getSlotColor(slotId: string, index: number): string {
  // Use index if available, fallback to hash of ID
  if (index >= 0 && index < SLOT_COLORS.length) return SLOT_COLORS[index];
  let hash = 0;
  for (let i = 0; i < slotId.length; i++) hash = (hash * 31 + slotId.charCodeAt(i)) & 0xFFFF;
  return SLOT_COLORS[hash % SLOT_COLORS.length];
}

export interface OutSignal {
  id: string;
  label: string;
  type: 'string' | 'float' | 'boolean' | 'audio';
  color: string;
  icon: string;
  sourceSlotId?: string;   // which slot owns this signal
  value?: string | number | boolean;
}

// mirrors-echo global outputs
export const MIRRORS_ECHO_OUTS: OutSignal[] = [
  { id: 'prompt_text',     label: 'prompt_text',     type: 'string',  color: '#00d4ff', icon: '✦', sourceSlotId: 'krista1' },
  { id: 'audio_amplitude', label: 'audio_amplitude', type: 'float',   color: '#a78bfa', icon: '◈', sourceSlotId: 'krista1' },
  { id: 'visitor_present', label: 'visitor_present', type: 'boolean', color: '#34d399', icon: '◉', sourceSlotId: 'krista1' },
];

export const AUDIO_OUTS: OutSignal[] = [
  { id: 'audio.sub',  label: 'sub',  type: 'audio', color: '#7c3aed', icon: '▋' },
  { id: 'audio.bass', label: 'bass', type: 'audio', color: '#db2777', icon: '▋' },
  { id: 'audio.mid',  label: 'mid',  type: 'audio', color: '#d97706', icon: '▋' },
  { id: 'audio.high', label: 'high', type: 'audio', color: '#0891b2', icon: '▋' },
  { id: 'audio.rms',  label: 'rms',  type: 'audio', color: '#059669', icon: '◈' },
  { id: 'audio.bpm',  label: 'bpm',  type: 'audio', color: '#f59e0b', icon: '♩' },
];

export const DMX_OUTS: OutSignal[] = [
  { id: 'dmx.active_cue',      label: 'active_cue',      type: 'string', color: '#f59e0b', icon: '💡' },
  { id: 'dmx.active_sequence', label: 'active_sequence', type: 'string', color: '#f472b6', icon: '▶' },
];

export const ALL_OUTS = [...MIRRORS_ECHO_OUTS, ...AUDIO_OUTS, ...DMX_OUTS];

const EV_SERVER = 'https://maestra-backend-v2-production.up.railway.app';

async function fetchState(slug: string) {
  try {
    const r = await fetch(`${EV_SERVER}/entities?slug=${slug}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const d = await r.json();
    return (Array.isArray(d) ? d[0] : d)?.state ?? null;
  } catch { return null; }
}

interface GlobalOutBarProps {
  slots: FleetSlot[];
  sendTarget: string;
  onSendTargetChange: (t: string) => void;
  onDragStart?: (signal: OutSignal) => void;
  onDragEnd?: () => void;
}

export default function GlobalOutBar({ slots, sendTarget, onSendTargetChange, onDragStart, onDragEnd }: GlobalOutBarProps) {
  const [live, setLive] = useState<Record<string, string | number | boolean>>({});
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    async function poll() {
      const [m, d] = await Promise.allSettled([fetchState('krista1_visual'), fetchState('dmx-lighting')]);
      const v: Record<string, string | number | boolean> = {};
      if (m.status === 'fulfilled' && m.value) {
        const s = m.value as Record<string, unknown>;
        v['prompt_text']     = String(s.prompt_text ?? s.p6 ?? s.prompt ?? '');
        v['audio_amplitude'] = parseFloat(String(s.audio_amplitude ?? s.audio_level ?? 0));
        v['visitor_present'] = !!s.visitor_present;
      }
      if (d.status === 'fulfilled' && d.value) {
        const s = d.value as Record<string, unknown>;
        v['dmx.active_cue']      = String(s.active_cue_id ?? '');
        v['dmx.active_sequence'] = String(s.active_sequence_id ?? '');
      }
      setLive(v);
    }
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, []);

  const handleDragStart = (sig: OutSignal) => {
    setDragging(sig.id);
    onDragStart?.(sig);
    // Set drag data for HTML5 drag API
    // We use a global to pass the signal object
    (window as unknown as Record<string, unknown>)._draggingSignal = sig;
  };

  const handleDragEnd = () => {
    setDragging(null);
    onDragEnd?.();
    (window as unknown as Record<string, unknown>)._draggingSignal = null;
  };

  const chip = (sig: OutSignal) => (
    <div
      key={sig.id}
      draggable
      onDragStart={() => handleDragStart(sig)}
      onDragEnd={handleDragEnd}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: `${sig.color}12`,
        border: `1px solid ${sig.color}40`,
        padding: '4px 9px',
        cursor: 'grab',
        opacity: dragging === sig.id ? 0.45 : 1,
        transition: 'opacity 0.15s, transform 0.1s',
        userSelect: 'none',
        fontSize: 10,
        flexShrink: 0,
      }}
    >
      <span style={{ color: sig.color, fontSize: 11 }}>{sig.icon}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: sig.color, letterSpacing: '0.02em' }}>{sig.label}</span>
      {live[sig.id] !== undefined && (
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--text-dim)', marginLeft: 2, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {String(live[sig.id]).slice(0, 18)}
        </span>
      )}
    </div>
  );

  const isGlobal = sendTarget === 'global';

  return (
    <div style={{ padding: '12px 0 0 0' }}>

      {/* ── Send target selector ─────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)', flexShrink: 0 }}>Send to</span>
        <button
          onClick={() => onSendTargetChange('global')}
          style={{
            padding: '3px 12px', fontSize: 9, fontFamily: 'var(--font-display)', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            border: `1px solid ${isGlobal ? 'var(--accent)' : 'var(--border)'}`,
            background: isGlobal ? 'rgba(0,212,255,0.1)' : 'var(--surface2)',
            color: isGlobal ? 'var(--accent)' : 'var(--text-dim)',
            cursor: 'pointer',
            boxShadow: isGlobal ? '0 0 12px rgba(0,212,255,0.2)' : 'none',
          }}
        >
          Global
        </button>
        {slots.map((slot, idx) => {
          const color = getSlotColor(slot.id, idx);
          const isActive = sendTarget === slot.entity_id || sendTarget === slot.id;
          return (
            <button
              key={slot.id}
              onClick={() => onSendTargetChange(slot.entity_id || slot.id)}
              style={{
                padding: '3px 10px', fontSize: 9, fontFamily: 'var(--font-display)', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                border: `1px solid ${isActive ? color : 'var(--border)'}`,
                background: isActive ? `${color}14` : 'var(--surface2)',
                color: isActive ? color : 'var(--text-dim)',
                cursor: 'pointer',
                boxShadow: isActive ? `0 0 10px ${color}30` : 'none',
                transition: 'all 0.15s',
              }}
            >
              {slot.label.length > 12 ? slot.label.slice(0, 11) + '…' : slot.label}
            </button>
          );
        })}
      </div>

      {/* ── Global OUT header ───────────────────── */}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
        // Global OUT — drag to slot
      </div>

      {/* mirrors-echo row */}
      <div style={{ marginBottom: 7 }}>
        <div style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 5 }}>mirrors-echo</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {MIRRORS_ECHO_OUTS.map(chip)}
        </div>
      </div>

      {/* audio row */}
      <div style={{ marginBottom: 7 }}>
        <div style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 5 }}>audio analysis</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {AUDIO_OUTS.map(chip)}
        </div>
      </div>

      {/* dmx row */}
      <div>
        <div style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', opacity: 0.4, marginBottom: 5 }}>dmx-lighting</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {DMX_OUTS.map(chip)}
        </div>
      </div>

    </div>
  );
}
