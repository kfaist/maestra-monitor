'use client';

import { MaestraSlotStatus } from '@/types';

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

function StatusRow({ label, value }: { label: string; value: string }) {
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
      </span>
    </div>
  );
}

export default function MaestraStatusPanel({ status }: MaestraStatusPanelProps) {
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
        <StatusRow label="Heartbeat" value={status.heartbeat} />
        <StatusRow label="State Sync" value={status.stateSync} />
        <StatusRow label="Stream" value={status.stream} />
      </div>
      {status.errorMessage && (
        <div className="msp-error">{status.errorMessage}</div>
      )}
    </div>
  );
}
