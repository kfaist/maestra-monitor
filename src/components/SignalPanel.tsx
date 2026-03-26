'use client';

import { useState, useEffect, useRef } from 'react';

interface SignalPanelProps {
  injectActive: boolean;
  onInjectToggle: (active: boolean) => void;
  promptText: string;
  onPromptChange: (text: string) => void;
  onBroadcast: (prompt: string) => void;
  onP6Flush: (prompt: string) => void;
}

const EV_SERVER = 'https://maestra-backend-v2-production.up.railway.app';

interface MirrorState {
  prompt_text?: string;
  p6?: string;
  prompt?: string;
  audio_amplitude?: number;
  audio_level?: number;
  visitor_present?: boolean;
}

interface DmxState {
  active_cue_id?: string | null;
  active_sequence_id?: string | null;
  cues?: Array<{ id: string; name?: string; fade_duration?: number }>;
  sequences?: Array<{ id: string; name?: string; cue_count?: number }>;
}

async function fetchEntityState(slug: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${EV_SERVER}/entities?slug=${slug}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const entity = Array.isArray(d) ? d[0] : d;
    return entity?.state ?? null;
  } catch {
    return null;
  }
}

async function patchEntityState(slug: string, state: Record<string, unknown>) {
  try {
    await fetch(`${EV_SERVER}/entities/${slug}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
  } catch { /* silent */ }
}

export default function SignalPanel({}: SignalPanelProps) {
  const [mirrorState, setMirrorState] = useState<MirrorState>({});
  const [dmxState, setDmxState] = useState<DmxState>({});
  const [dmxOnline, setDmxOnline] = useState(false);
  const [mirrorOnline, setMirrorOnline] = useState(false);
  const promptFlashRef = useRef<HTMLDivElement>(null);
  const prevPromptRef = useRef<string>('');

  useEffect(() => {
    async function poll() {
      const [m, d] = await Promise.allSettled([
        fetchEntityState('krista1_visual'),
        fetchEntityState('dmx-lighting'),
      ]);
      if (m.status === 'fulfilled' && m.value) {
        setMirrorOnline(true);
        setMirrorState(m.value as MirrorState);
        const newPrompt = String((m.value as MirrorState).prompt_text || (m.value as MirrorState).p6 || '');
        if (newPrompt && newPrompt !== prevPromptRef.current) {
          prevPromptRef.current = newPrompt;
          if (promptFlashRef.current) {
            promptFlashRef.current.style.borderColor = 'rgba(0,212,255,0.7)';
            setTimeout(() => {
              if (promptFlashRef.current) promptFlashRef.current.style.borderColor = '';
            }, 500);
          }
        }
      } else {
        setMirrorOnline(false);
      }
      if (d.status === 'fulfilled' && d.value) {
        setDmxOnline(true);
        setDmxState(d.value as DmxState);
      } else {
        setDmxOnline(false);
      }
    }
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, []);

  const amp = parseFloat(String(mirrorState.audio_amplitude ?? mirrorState.audio_level ?? 0));
  const visitorPresent = !!mirrorState.visitor_present;
  const promptText = String(mirrorState.prompt_text || mirrorState.p6 || mirrorState.prompt || '--');
  const cues = dmxState.cues || [];
  const sequences = dmxState.sequences || [];

  return (
    <div className="signal-panel">

      {/* mirrors-echo entity */}
      <div className="signal-section">
        <div className="sp-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span className="sp-title">// mirrors-echo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
              background: mirrorOnline ? 'var(--active, #00ff88)' : 'var(--red, #f87171)',
              boxShadow: mirrorOnline ? '0 0 6px var(--active, #00ff88)' : 'none',
            }} />
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>krista1_visual</span>
          </div>
        </div>

        {/* prompt_text */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>prompt_text</span>
            <span style={{ fontSize: 8, color: 'var(--text-dim)', opacity: 0.5 }}>output · string</span>
          </div>
          <div ref={promptFlashRef} style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--accent, #00d4ff)',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            padding: '7px 9px', minHeight: 32, lineHeight: 1.6,
            wordBreak: 'break-all', transition: 'border-color 0.3s',
          }}>
            {promptText}
          </div>
        </div>

        {/* audio_amplitude */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>audio_amplitude</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--active, #00ff88)' }}>{amp.toFixed(2)}</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${Math.min(100, amp * 100)}%`,
              background: 'linear-gradient(90deg, var(--accent2, #7b2fff), var(--accent, #00d4ff))',
              transition: 'width 0.15s linear',
            }} />
          </div>
        </div>

        {/* visitor_present */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>visitor_present</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
              background: visitorPresent ? 'var(--active, #00ff88)' : 'var(--red, #f87171)',
              boxShadow: visitorPresent ? '0 0 8px var(--active, #00ff88)' : 'none',
            }} />
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 10,
              color: visitorPresent ? 'var(--active, #00ff88)' : 'var(--text-dim)',
            }}>{String(visitorPresent)}</span>
            <span style={{ fontSize: 8, color: 'var(--text-dim)', opacity: 0.4 }}>output · boolean</span>
          </div>
        </div>
      </div>

      {/* dmx-lighting entity */}
      <div className="signal-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="sp-title">// dmx-lighting</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
              background: dmxOnline ? 'var(--active, #00ff88)' : 'var(--text-dim, #4a6580)',
              boxShadow: dmxOnline ? '0 0 6px var(--active, #00ff88)' : 'none',
            }} />
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Aaron</span>
          </div>
        </div>

        {/* active cue / sequence */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>active_cue</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--amber, #fbbf24)', background: 'var(--surface2)', border: '1px solid var(--border)', padding: '5px 8px' }}>
              {dmxState.active_cue_id || 'idle'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>active_seq</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--pink, #f472b6)', background: 'var(--surface2)', border: '1px solid var(--border)', padding: '5px 8px' }}>
              {dmxState.active_sequence_id || 'idle'}
            </div>
          </div>
        </div>

        {/* cue list */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 5 }}>
            cues <span style={{ opacity: 0.4, fontWeight: 400 }}>({cues.length})</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 16 }}>
            {cues.length > 0 ? cues.map((c) => (
              <span
                key={c.id}
                onClick={() => patchEntityState('dmx-lighting', { active_cue_id: c.id })}
                style={{
                  fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: '0.08em',
                  border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.07)',
                  color: 'var(--amber, #fbbf24)',
                }}
                title={`fade: ${c.fade_duration ?? 0}s`}
              >{c.name || c.id}</span>
            )) : (
              <span style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.35 }}>none yet</span>
            )}
          </div>
        </div>

        {/* sequence list */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 5 }}>
            sequences <span style={{ opacity: 0.4, fontWeight: 400 }}>({sequences.length})</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 16 }}>
            {sequences.length > 0 ? sequences.map((s) => (
              <span
                key={s.id}
                onClick={() => patchEntityState('dmx-lighting', { active_sequence_id: s.id })}
                style={{
                  fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: '0.08em',
                  border: '1px solid rgba(244,114,182,0.3)', background: 'rgba(244,114,182,0.07)',
                  color: 'var(--pink, #f472b6)',
                }}
                title={`${s.cue_count ?? '?'} cues`}
              >{s.name || s.id}</span>
            )) : (
              <span style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.35 }}>none yet</span>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
