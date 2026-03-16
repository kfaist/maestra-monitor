'use client';

import { useEffect, useState } from 'react';

interface HeaderProps {
  wsStatus: 'online' | 'offline' | 'connecting';
  apiStatus: 'online' | 'offline';
}

export default function Header({ wsStatus, apiStatus }: HeaderProps) {
  const [clock, setClock] = useState('--:--:--');

  useEffect(() => {
    const update = () => setClock(new Date().toTimeString().slice(0, 8));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const wsLabel = wsStatus === 'online' ? 'WS LIVE' : wsStatus === 'connecting' ? 'CONNECTING' : 'WS OFFLINE';
  const apiLabel = apiStatus === 'online' ? 'API OK' : 'API ERR';

  return (
    <header>
      <div className="logo">Maestra <span>Monitor</span></div>
      <div className="header-right">
        <div className="status-pill">
          <div className={`dot ${wsStatus}`} />
          <span>{wsLabel}</span>
        </div>
        <div className="status-pill">
          <div className={`dot ${apiStatus}`} />
          <span>{apiLabel}</span>
        </div>
        <div className="header-time">{clock}</div>
      </div>
    </header>
  );
}
