'use client';

import { useEffect, useState } from 'react';
import { ConnectionStatus } from '@/types';

interface HeaderProps {
  wsStatus: 'online' | 'offline' | 'connecting';
  apiStatus: 'online' | 'offline';
  maestraStatus: ConnectionStatus;
  streamFps: number | null;
  activeSlots: number;
  totalSlots: number;
  audioActive: boolean;
  onJoinMaestra: () => void;
}

export default function Header({
  wsStatus,
  apiStatus,
  maestraStatus,
  streamFps,
  activeSlots,
  totalSlots,
  audioActive,
  onJoinMaestra,
}: HeaderProps) {
  const [clock, setClock] = useState('--:--:--');

  useEffect(() => {
    const update = () => setClock(new Date().toTimeString().slice(0, 8));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const maestraLabel = maestraStatus === 'connected' ? 'CONNECTED'
    : maestraStatus === 'connecting' || maestraStatus === 'discovering' ? 'CONNECTING'
    : maestraStatus === 'error' ? 'ERROR'
    : 'DISCONNECTED';
  const maestraDotClass = maestraStatus === 'connected' ? 'online'
    : maestraStatus === 'connecting' || maestraStatus === 'discovering' ? 'connecting'
    : maestraStatus === 'error' ? 'offline'
    : '';

  return (
    <>
      <header>
        <div className="logo">Maestra <span>Monitor</span></div>
        <div className="header-right">
          {/* Primary status badges — large and readable */}
          <div className="header-badges">
            <div className={`header-badge ${wsStatus === 'online' ? 'badge-live' : wsStatus === 'connecting' ? 'badge-warn' : 'badge-off'}`}>
              <div className={`badge-dot ${wsStatus === 'online' ? 'live' : wsStatus === 'connecting' ? 'warn' : 'off'}`} />
              WS {wsStatus === 'online' ? 'LIVE' : wsStatus === 'connecting' ? '...' : 'OFF'}
            </div>
            <div className={`header-badge ${apiStatus === 'online' ? 'badge-live' : 'badge-off'}`}>
              <div className={`badge-dot ${apiStatus === 'online' ? 'live' : 'off'}`} />
              API {apiStatus === 'online' ? 'OK' : 'ERR'}
            </div>
            <div className={`header-badge badge-maestra ${maestraStatus === 'connected' ? 'badge-maestra-on' : maestraStatus === 'connecting' || maestraStatus === 'discovering' ? 'badge-warn' : 'badge-off'}`}>
              <div className={`badge-dot ${maestraDotClass || 'off'}`} />
              MAESTRA: {maestraLabel}
            </div>
          </div>

          <button className="btn-join-maestra" onClick={onJoinMaestra}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Join Maestra
          </button>
        </div>
      </header>

      {/* System Status Bar */}
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
        <div className="sys-stat-sep" />
        <div className="sys-stat">
          <span>{clock}</span>
        </div>
      </div>
    </>
  );
}
