'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioAnalysisData } from '@/types';

interface AudioAnalysisProps {
  audioData: AudioAnalysisData;
  onSendAudio?: (payload: Record<string, unknown>) => void;
}

interface HistoryRow {
  t: string;
  sub: number;
  bass: number;
  mid: number;
  high: number;
  rms: string;
  bpm: number;
}

const BAND_CONFIG = [
  { key: 'sub', label: 'Sub', hue: 280 },
  { key: 'bass', label: 'Bass', hue: 340 },
  { key: 'mid', label: 'Mid', hue: 35 },
  { key: 'high', label: 'High', hue: 190 },
  { key: 'rms', label: 'RMS', hue: 160, max: 1.0 },
  { key: 'bpm', label: 'BPM', hue: 220, max: 200 },
];

const STEM_CONFIG = [
  { key: 'drums', label: 'Drums', hue: 340 },
  { key: 'stemBass', label: 'Bass', hue: 280 },
  { key: 'vocals', label: 'Vocals', hue: 190 },
  { key: 'melody', label: 'Melody', hue: 35 },
  { key: 'keys', label: 'Keys', hue: 160 },
  { key: 'other', label: 'Other', hue: 220 },
];

export default function AudioAnalysis({ audioData, onSendAudio }: AudioAnalysisProps) {
  const [enabled, setEnabled] = useState(true);
  const [sendActive, setSendActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'freq' | 'stems' | 'live'>('freq');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barHeightsRef = useRef(new Float32Array(64).fill(0));
  const historyRef = useRef<HistoryRow[]>([]);
  const lastHistTimeRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const sendActiveRef = useRef(false);
  const audioDataRef = useRef(audioData);

  // Keep refs in sync
  sendActiveRef.current = sendActive;
  audioDataRef.current = audioData;

  // Send audio data to TD on interval
  useEffect(() => {
    if (!onSendAudio) return;
    const timer = setInterval(() => {
      if (!sendActiveRef.current) return;
      const d = audioDataRef.current;
      onSendAudio({
        type: 'audio_analysis',
        sub: d.sub, bass: d.bass, mid: d.mid, high: d.high,
        rms: d.rms, bpm: d.bpm, peak: d.peak,
        drums: d.drums, vocals: d.vocals, melody: d.melody,
      });
    }, 250);
    return () => clearInterval(timer);
  }, [onSendAudio]);

  const drawBars = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement?.clientWidth || 600;
    canvas.width = w * dpr;
    canvas.height = 80 * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, 80);

    const NUM_BARS = 64;
    const barHeights = barHeightsRef.current;

    for (let i = 0; i < NUM_BARS; i++) {
      const norm = i / NUM_BARS;
      let val: number;
      if (norm < 0.1) val = audioData.sub * 0.9 + Math.random() * audioData.sub * 0.2;
      else if (norm < 0.25) val = audioData.bass * 0.9 + Math.random() * audioData.bass * 0.25;
      else if (norm < 0.6) val = audioData.mid * (0.8 + Math.random() * 0.4);
      else val = audioData.high * (0.6 + Math.random() * 0.5) * (1 - (norm - 0.6) * 0.8);

      const target = Math.min(100, Math.max(0, val));
      barHeights[i] = barHeights[i] + (target - barHeights[i]) * 0.12;
    }

    const barW = (w / NUM_BARS) - 1;
    for (let i = 0; i < NUM_BARS; i++) {
      const norm = i / NUM_BARS;
      const bh = (barHeights[i] / 100) * 80;
      const x = i * (barW + 1);
      const y = 80 - bh;

      let hue: number;
      if (norm < 0.1) hue = 280;
      else if (norm < 0.25) hue = 340;
      else if (norm < 0.6) hue = 35;
      else hue = 190;

      const alpha = 0.5 + (barHeights[i] / 100) * 0.5;
      ctx.fillStyle = `hsla(${hue}, 85%, 55%, ${alpha})`;
      ctx.fillRect(x, y, barW, bh);

      if (bh > 2) {
        ctx.fillStyle = `hsla(${hue}, 95%, 80%, 0.9)`;
        ctx.fillRect(x, y, barW, 2);
      }
    }
  }, [audioData]);

  useEffect(() => {
    if (!enabled || activeTab !== 'freq') return;
    const loop = () => {
      drawBars();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [enabled, activeTab, drawBars]);

  // Update history for live tab
  useEffect(() => {
    if (activeTab !== 'live') return;
    const now = Date.now();
    if (now - lastHistTimeRef.current < 1000) return;
    lastHistTimeRef.current = now;
    const t = new Date().toLocaleTimeString('en-US', { hour12: false });
    historyRef.current.unshift({
      t,
      sub: Math.round(audioData.sub),
      bass: Math.round(audioData.bass),
      mid: Math.round(audioData.mid),
      high: Math.round(audioData.high),
      rms: audioData.rms.toFixed(2),
      bpm: Math.round(audioData.bpm),
    });
    if (historyRef.current.length > 10) historyRef.current.pop();
  }, [audioData, activeTab]);

  const getValue = (key: string): number => {
    return (audioData as unknown as Record<string, number>)[key] ?? 0;
  };

  const formatValue = (key: string, val: number): string => {
    if (key === 'rms') return val.toFixed(2);
    return Math.round(val).toString();
  };

  return (
    <div className="audio-analysis-section">
      <div className="aa-header">
        <span className="aa-title">Audio Analysis</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onSendAudio && (
            <button
              className={`aa-send-btn ${sendActive ? 'active' : ''}`}
              onClick={() => setSendActive(!sendActive)}
              style={{
                padding: '3px 10px',
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                border: `1px solid ${sendActive ? '#22c55e' : '#333'}`,
                borderRadius: 4,
                background: sendActive ? 'rgba(34,197,94,0.15)' : 'transparent',
                color: sendActive ? '#22c55e' : '#888',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {sendActive ? '● SENDING' : 'SEND TO TD'}
            </button>
          )}
          <div
            className={`aa-toggle ${enabled ? 'on' : ''}`}
            onClick={() => setEnabled(!enabled)}
          />
        </div>
      </div>

      <div className="aa-tabs">
        {(['freq', 'stems', 'live'] as const).map(tab => (
          <button
            key={tab}
            className={`aa-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'freq' ? 'Frequencies' : tab === 'stems' ? 'Stems' : 'Live'}
          </button>
        ))}
      </div>

      {/* FREQUENCIES TAB */}
      {activeTab === 'freq' && (
        <div>
          <div className="aa-viz-wrap">
            <canvas ref={canvasRef} id="aaCanvas" />
          </div>
          <div className="aa-bands">
            {BAND_CONFIG.map(band => {
              const val = getValue(band.key);
              const max = band.max || 100;
              const pct = Math.min(100, Math.max(0, (val / max) * 100));
              return (
                <div className="aa-band" key={band.key}>
                  <div className="aa-band-dot" style={{ color: `hsl(${band.hue},80%,65%)`, background: `hsl(${band.hue},80%,65%)` }} />
                  <span className="aa-band-label">{band.label}</span>
                  <div className="aa-band-track">
                    <div
                      className="aa-band-fill"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, hsl(${band.hue},80%,40%), hsl(${band.hue},90%,65%))`,
                      }}
                    />
                  </div>
                  <span className="aa-band-val">{formatValue(band.key, val)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEMS TAB */}
      {activeTab === 'stems' && (
        <div className="aa-stems-grid">
          {STEM_CONFIG.map(stem => {
            const val = getValue(stem.key);
            const pct = Math.min(100, Math.max(0, val));
            return (
              <div className="aa-band" key={stem.key}>
                <div className="aa-band-dot" style={{ color: `hsl(${stem.hue},90%,60%)`, background: `hsl(${stem.hue},90%,60%)` }} />
                <span className="aa-band-label">{stem.label}</span>
                <div className="aa-band-track">
                  <div
                    className="aa-band-fill"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, hsl(${stem.hue},80%,40%), hsl(${stem.hue},90%,65%))`,
                    }}
                  />
                </div>
                <span className="aa-band-val">{Math.round(val)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* LIVE TAB */}
      {activeTab === 'live' && (
        <div>
          <div className="aa-live-row">
            <div className="aa-live-card">
              <div className="aa-live-label">BPM</div>
              <div className="aa-live-val" style={{ color: 'hsl(220,85%,70%)' }}>{Math.round(audioData.bpm)}</div>
            </div>
            <div className="aa-live-card">
              <div className="aa-live-label">RMS</div>
              <div className="aa-live-val" style={{ color: 'hsl(160,80%,60%)' }}>{audioData.rms.toFixed(2)}</div>
            </div>
            <div className="aa-live-card">
              <div className="aa-live-label">Peak</div>
              <div className="aa-live-val" style={{ color: 'hsl(340,90%,65%)' }}>{Math.round(audioData.peak)}</div>
            </div>
            <div className="aa-live-card">
              <div className="aa-live-label">Energy</div>
              <div className="aa-live-val" style={{ color: 'hsl(35,90%,65%)' }}>
                {(audioData.sub + audioData.bass) > 140 ? 'High' : (audioData.sub + audioData.bass) > 80 ? 'Med' : 'Low'}
              </div>
            </div>
          </div>
          <table className="aa-table">
            <thead>
              <tr>
                <th>Time</th><th>Sub</th><th>Bass</th><th>Mid</th><th>High</th><th>RMS</th><th>BPM</th>
              </tr>
            </thead>
            <tbody>
              {historyRef.current.length > 0 ? historyRef.current.map((row, i) => (
                <tr key={i}>
                  <td>{row.t}</td><td>{row.sub}</td><td>{row.bass}</td><td>{row.mid}</td><td>{row.high}</td><td>{row.rms}</td><td>{row.bpm}</td>
                </tr>
              )) : (
                <tr><td>--:--:--</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
