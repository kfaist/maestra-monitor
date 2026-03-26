'use client';

import { useEffect, useState } from 'react';
import { ConnectionStatus } from '@/types';

interface HeaderProps {
  wsStatus: 'online' | 'offline' | 'connecting';
  apiStatus?: 'online' | 'offline';
  maestraStatus?: ConnectionStatus;
  streamFps: number | null;
  activeSlots: number;
  totalSlots: number;
  audioActive: boolean;
  frameRelayCount?: number;
  onJoinMaestra?: () => void;
  /** Current server mode */
  serverMode?: ServerMode;
  customUrl?: string;
  onCustomUrlChange?: (url: string) => void;
  onServerModeChange?: (mode: ServerMode) => void;
}

export const RAILWAY_URL  = 'https://maestra-backend-v2-production.up.railway.app';
export const GALLERY_URL  = 'http://192.168.128.115:8080';
export const AUTO_DETECT  = 'auto';

export type ServerMode = 'railway' | 'gallery' | 'auto' | 'custom';

export default function Header({
  wsStatus,
  streamFps,
  activeSlots,
  totalSlots,
  audioActive,
  frameRelayCount,
  serverMode = 'auto',
  customUrl = '',
  onCustomUrlChange,
  onServerModeChange,
}: HeaderProps) {
  const [clock, setClock] = useState('--:--:--');

  useEffect(() => {
    const update = () => setClock(new Date().toTimeString().slice(0, 8));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <header>
        <div className="logo">Maestra <span>Monitor</span></div>
        <div className="system-status-bar">
          <div className="sys-stat">
            <div className={`dot ${wsStatus}`} />
            <span>WS</span>
            <span className="sys-stat-val">{wsStatus === 'online' ? 'LIVE' : wsStatus === 'connecting' ? '...' : 'OFF'}</span>
          </div>
          <div className="sys-stat-sep" />
          <div className="sys-stat">
            <span>Stream</span>
            <span className="sys-stat-val">{streamFps != null ? `${streamFps} FPS` : '-- FPS'}</span>
          </div>
          <div className="sys-stat-sep" />
          <div className="sys-stat">
            <span>Slots</span>
            <span className="sys-stat-val">{activeSlots}/{totalSlots}</span>
          </div>
          <div className="sys-stat-sep" />
          <div className="sys-stat">
            <div className={`dot ${audioActive ? 'online' : 'offline'}`} />
            <span>Audio</span>
            <span className="sys-stat-val">{audioActive ? 'RX' : 'OFF'}</span>
          </div>
          {frameRelayCount != null && frameRelayCount > 0 && (
            <>
              <div className="sys-stat-sep" />
              <div className="sys-stat">
                <div className="dot online" style={{ animation: 'pulse-dot 1s ease-in-out infinite' }} />
                <span>Relay</span>
                <span className="sys-stat-val">{frameRelayCount > 999 ? `${(frameRelayCount / 1000).toFixed(1)}k` : frameRelayCount}</span>
              </div>
            </>
          )}
          <div className="sys-stat-sep" />
          <div className="sys-stat">
            <span>{clock}</span>
          </div>

          {/* ── Server Toggle ── */}
          {onServerModeChange && (
            <>
              <div className="sys-stat-sep" />
              <div
                onClick={() => onServerModeChange(isGallery ? 'railway' : 'gallery')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  cursor: 'pointer', padding: '2px 8px',
                  border: `1px solid ${isGallery ? 'rgba(0,255,136,0.4)' : 'rgba(0,212,255,0.3)'}`,
                  borderRadius: 2,
                  background: isGallery ? 'rgba(0,255,136,0.07)' : 'rgba(0,212,255,0.05)',
                  transition: 'all 0.2s',
                  userSelect: 'none',
                }}
                title={isGallery ? 'Connected to Gallery server (192.168.128.115:8080)' : 'Offline — switch to Gallery when on-site at the venue'}
              >
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: isGallery ? 'var(--active)' : 'var(--accent)',
                  boxShadow: isGallery ? '0 0 6px var(--active)' : '0 0 6px var(--accent)',
                }} />
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: isGallery ? 'var(--active)' : 'rgba(255,255,255,0.3)',
                }}>
                  {isGallery ? '⚡ Gallery' : '☁ Offline'}
                </span>
              </div>
            </>
          )}
        </div>
      </header>
    </>
  );
}
