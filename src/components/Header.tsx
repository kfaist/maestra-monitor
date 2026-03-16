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
  onJoinMaestra?: () => void;
}

export default function Header({
  wsStatus,
  streamFps,
  activeSlots,
  totalSlots,
  audioActive,
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
        {/* Minimal status bar inline */}
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
      </header>
    </>
  );
}
