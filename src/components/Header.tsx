'use client';

import { useEffect, useState } from 'react';

export const RAILWAY_URL = 'https://maestra-backend-v2-production.up.railway.app';
export const GALLERY_URL  = 'http://192.168.128.115:8080';

export type ServerMode = 'auto' | 'gallery' | 'railway' | 'custom';

interface HeaderProps {
  wsStatus: 'online' | 'offline' | 'connecting';
  streamFps: number | null;
  activeSlots: number;
  totalSlots: number;
  audioActive: boolean;
  frameRelayCount?: number;
  serverMode?: ServerMode;
  serverUrl?: string;        // resolved URL currently in use
  serverConnected?: boolean; // did /entities succeed?
  onServerModeChange?: (mode: ServerMode) => void;
  customUrl?: string;
  onCustomUrlChange?: (url: string) => void;
}

export default function Header({
  wsStatus, streamFps, activeSlots, totalSlots, audioActive,
  frameRelayCount, serverMode = 'auto', serverUrl, serverConnected,
  onServerModeChange, customUrl = '', onCustomUrlChange,
}: HeaderProps) {
  const [clock, setClock] = useState('--:--:--');

  useEffect(() => {
    const update = () => setClock(new Date().toTimeString().slice(0, 8));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  const modes: { key: ServerMode; label: string; color: string }[] = [
    { key: 'auto',    label: 'Auto',   color: '#fbbf24' },
    { key: 'gallery', label: '⚡ Local', color: '#00ff88' },
    { key: 'railway', label: '☁ Cloud', color: '#00d4ff' },
    { key: 'custom',  label: 'Custom', color: '#a78bfa' },
  ];

  return (
    <header>
      <div className="logo">Maestra <span>Monitor</span></div>
      <div className="system-status-bar">

        {/* WS status */}
        <div className="sys-stat">
          <div className={`dot ${wsStatus}`} />
          <span>WS</span>
          <span className="sys-stat-val">{wsStatus === 'online' ? 'LIVE' : wsStatus === 'connecting' ? '...' : 'OFF'}</span>
        </div>
        <div className="sys-stat-sep" />

        {/* Stream FPS */}
        <div className="sys-stat">
          <span>Stream</span>
          <span className="sys-stat-val">{streamFps != null ? `${streamFps} FPS` : '-- FPS'}</span>
        </div>
        <div className="sys-stat-sep" />

        {/* Slots */}
        <div className="sys-stat">
          <span>Slots</span>
          <span className="sys-stat-val">{activeSlots}/{totalSlots}</span>
        </div>
        <div className="sys-stat-sep" />

        {/* Audio */}
        <div className="sys-stat">
          <div className={`dot ${audioActive ? 'online' : 'offline'}`} />
          <span>Audio</span>
          <span className="sys-stat-val">{audioActive ? 'RX' : 'OFF'}</span>
        </div>

        {/* Frame relay */}
        {frameRelayCount != null && frameRelayCount > 0 && (
          <>
            <div className="sys-stat-sep" />
            <div className="sys-stat">
              <div className="dot online" style={{ animation: 'pulse-dot 1s ease-in-out infinite' }} />
              <span>Relay</span>
              <span className="sys-stat-val">{frameRelayCount > 999 ? `${(frameRelayCount/1000).toFixed(1)}k` : frameRelayCount}</span>
            </div>
          </>
        )}

        <div className="sys-stat-sep" />
        <div className="sys-stat"><span>{clock}</span></div>

        {/* ── Server picker + connection truth ── */}
        {onServerModeChange && (
          <>
            <div className="sys-stat-sep" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {modes.map(({ key, label, color }) => {
                const active = serverMode === key;
                return (
                  <button key={key} onClick={() => onServerModeChange(key)}
                    style={{
                      fontSize: 7, fontFamily: 'var(--font-display)', fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '2px 6px', cursor: 'pointer',
                      background: active ? `${color}18` : 'none',
                      border: `1px solid ${active ? color + '60' : 'rgba(255,255,255,0.08)'}`,
                      color: active ? color : 'rgba(255,255,255,0.25)',
                      transition: 'all 0.15s',
                    }}
                  >{label}</button>
                );
              })}
              {serverMode === 'custom' && onCustomUrlChange && (
                <input value={customUrl} onChange={e => onCustomUrlChange(e.target.value)}
                  placeholder="http://..."
                  style={{
                    fontSize: 8, fontFamily: 'var(--font-mono)', padding: '2px 6px',
                    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(167,139,250,0.3)',
                    color: '#a78bfa', outline: 'none', width: 130,
                  }}
                />
              )}
            </div>

            {/* Server connection truth */}
            {serverUrl && (
              <>
                <div className="sys-stat-sep" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: serverConnected ? 'var(--active)' : '#ef4444',
                    boxShadow: serverConnected ? '0 0 5px var(--active)' : '0 0 5px #ef4444',
                  }} />
                  <span style={{
                    fontSize: 8, fontFamily: 'var(--font-mono)',
                    color: serverConnected ? 'var(--active)' : '#ef4444',
                    maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {serverConnected ? '' : 'FAILED · '}{serverUrl.replace('https://','').replace('http://','')}
                  </span>
                </div>
              </>
            )}
          </>
        )}

      </div>
    </header>
  );
}
