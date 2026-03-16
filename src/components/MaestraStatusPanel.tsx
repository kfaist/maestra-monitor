'use client';

import { useState, useEffect } from 'react';
import { MaestraSlotStatus, formatAge } from '@/types';

interface MaestraStatusPanelProps {
  status: MaestraSlotStatus;
}

/** Color for a layer value */
function layerColor(value: string): string {
  switch (value) {
    case 'connected': case 'registered': case 'live': case 'active':
      return 'var(--active)';
    case 'connecting': case 'registering': case 'syncing': case 'advertised':
      return 'var(--accent)';
    case 'waiting': case 'none':
      return 'var(--text-dim)';
    case 'stale':
      return 'var(--amber)';
    case 'lost': case 'error': case 'disconnected': case 'not_registered':
      return 'var(--red)';
    default:
      return 'var(--text-dim)';
  }
}

/** Display-friendly label */
function displayLabel(value: string): string {
  switch (value) {
    case 'not_registered': return 'Not Registered';
    case 'none': return 'None';
    default: return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

function StatusRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const color = layerColor(value);
  const isActive = ['connected', 'registered', 'live', 'active'].includes(value);
  const isPulsing = ['connecting', 'registering', 'syncing', 'waiting'].includes(value);

  return (
    <div className="msp-row">
      <span className="msp-label">{label}</span>
      <span className="msp-value-group">
        <span
          className={`msp-dot ${isPulsing ? 'pulsing' : ''}`}
          style={{
            background: color,
            boxShadow: isActive ? `0 0 6px ${color}` : 'none',
          }}
        />
        <span className="msp-value" style={{ color }}>
          {displayLabel(value)}
        </span>
        {detail && (
          <span className="msp-detail" style={{ color: 'var(--text-dim)', fontSize: '10px', marginLeft: '6px' }}>
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}

export default function MaestraStatusPanel({ status }: MaestraStatusPanelProps) {
  const [now, setNow] = useState(Date.now());

  // Tick every 200ms to keep ages current
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // Heartbeat detail
  let hbDetail: string | undefined;
  if (status.heartbeat === 'live' || status.heartbeat === 'stale' || status.heartbeat === 'lost') {
    if (status.lastHeartbeatAt) {
      hbDetail = `last seen ${formatAge(now - status.lastHeartbeatAt)}`;
    }
  } else if (status.heartbeat === 'waiting' && status.registeredAt) {
    hbDetail = `${formatAge(now - status.registeredAt)} since registration`;
  }

  // State sync detail
  let ssDetail: string | undefined;
  if (status.stateSync === 'active' && status.lastStateUpdateAt) {
    ssDetail = `last ${formatAge(now - status.lastStateUpdateAt)}`;
  }

  // Stream detail
  let stDetail: string | undefined;
  if ((status.stream === 'live' || status.stream === 'stale') && status.lastStreamFrameAt) {
    stDetail = `last frame ${formatAge(now - status.lastStreamFrameAt)}`;
  }

  return (
    <div className="maestra-status-panel">
      <div className="msp-title">Maestra Status</div>
      {status.optimistic && (
        <div className="msp-optimistic-badge">
          OPTIMISTIC — HTTPS → HTTP
        </div>
      )}
      <div className="msp-grid">
        <StatusRow label="Server" value={status.server} />
        <StatusRow label="Entity" value={status.entity} />
        <StatusRow label="Heartbeat" value={status.heartbeat} detail={hbDetail} />
        <StatusRow label="State Sync" value={status.stateSync} detail={ssDetail} />
        <StatusRow label="Stream" value={status.stream} detail={stDetail} />
      </div>
      {status.errorMessage && (
        <div className="msp-error">{status.errorMessage}</div>
      )}
    </div>
  );
}
