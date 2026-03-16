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
      return '#22c55e'; // bright green
    case 'connecting': case 'registering': case 'syncing': case 'advertised':
      return '#5cc8ff'; // cyan-blue
    case 'waiting': case 'none':
      return '#8888aa';
    case 'stale':
      return '#fbbf24'; // amber
    case 'lost': case 'error': case 'disconnected': case 'not_registered':
      return '#ef4444'; // red
    default:
      return '#8888aa';
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
            boxShadow: isActive ? `0 0 8px ${color}` : 'none',
          }}
        />
        <span className="msp-value" style={{ color: isActive ? '#fff' : color, fontWeight: isActive ? 600 : 500 }}>
          {displayLabel(value)}
        </span>
        {detail && (
          <span className="msp-detail" style={{ color: '#aab', fontSize: '10px', marginLeft: '6px' }}>
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}

export default function MaestraStatusPanel({ status }: MaestraStatusPanelProps) {
  const [now, setNow] = useState(Date.now());

  // Tick every 500ms to keep ages current (slower to reduce jitter)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // Heartbeat detail
  let hbDetail: string | undefined;
  if (status.heartbeat === 'live' || status.heartbeat === 'stale' || status.heartbeat === 'lost') {
    if (status.lastHeartbeatAt) {
      hbDetail = `last seen ${formatAge(Math.max(0, now - status.lastHeartbeatAt))}`;
    }
  } else if (status.heartbeat === 'waiting' && status.registeredAt) {
    hbDetail = `${formatAge(Math.max(0, now - status.registeredAt))} since registration`;
  }

  // State sync detail
  let ssDetail: string | undefined;
  if (status.stateSync === 'active' && status.lastStateUpdateAt) {
    ssDetail = `last ${formatAge(Math.max(0, now - status.lastStateUpdateAt))}`;
  }

  // Stream detail
  let stDetail: string | undefined;
  if ((status.stream === 'live' || status.stream === 'stale') && status.lastStreamFrameAt) {
    stDetail = `last frame ${formatAge(Math.max(0, now - status.lastStreamFrameAt))}`;
  }

  return (
    <div className="maestra-status-panel">
      <div className="msp-title">Maestra Status</div>
      {status.optimistic && (
        <div className="msp-optimistic-badge">
          <strong>Browser connection limited</strong> — Dashboard is HTTPS, Maestra server is HTTP. TD connects normally.
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
