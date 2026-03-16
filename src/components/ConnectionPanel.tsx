'use client';

import { SlotConnectionInfo } from '@/types';
import { useCallback, useState } from 'react';

interface ConnectionPanelProps {
  connectionInfo: SlotConnectionInfo | null;
}

export default function ConnectionPanel({ connectionInfo }: ConnectionPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!connectionInfo) return;
    const text = `Server URL: ${connectionInfo.serverUrl}\nEntity ID: ${connectionInfo.entityId}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [connectionInfo]);

  if (!connectionInfo?.connected) return null;

  return (
    <div className="connection-panel">
      <h3>Connected to Maestra</h3>
      <div className="connection-info">
        <div className="connection-info-row">
          <span className="connection-info-label">Slot:</span>
          <span className="connection-info-value">{connectionInfo.slotId}</span>
        </div>
        <div className="connection-info-row">
          <span className="connection-info-label">Server:</span>
          <span className="connection-info-value">{connectionInfo.serverUrl}</span>
        </div>
        <div className="connection-info-row">
          <span className="connection-info-label">Entity ID:</span>
          <span className="connection-info-value">{connectionInfo.entityId}</span>
        </div>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
        Next Step: Connect your TouchDesigner project
      </div>
      <div className="connection-actions">
        <a
          href="https://github.com/kfaist/maestra-fleet-tox/raw/main/touchdesigner/maestra_fleet.tox"
          download
          target="_blank"
          rel="noopener noreferrer"
          className="btn primary"
        >
          Download Maestra TOX
        </a>
        <button className="btn primary" onClick={handleCopy}>
          {copied ? '✓ Copied!' : 'Copy Connection Info'}
        </button>
        <button className="btn">Open Slot Monitor</button>
      </div>
    </div>
  );
}
