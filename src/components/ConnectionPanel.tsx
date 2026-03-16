'use client';

import { SlotConnectionInfo } from '@/types';
import { useCallback, useState } from 'react';
import MaestraStatusPanel from './MaestraStatusPanel';

interface ConnectionPanelProps {
  connectionInfo: SlotConnectionInfo | null;
  onAutoConnect?: () => void;
  onDisconnect?: () => void;
  onUpdateConfig?: (config: { serverUrl?: string; entityId?: string; port?: number; streamPath?: string }) => void;
}

export default function ConnectionPanel({
  connectionInfo,
  onAutoConnect,
  onDisconnect,
  onUpdateConfig,
}: ConnectionPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editUrl, setEditUrl] = useState('');
  const [editEntityId, setEditEntityId] = useState('');
  const [editPort, setEditPort] = useState('');
  const [editStreamPath, setEditStreamPath] = useState('');

  const handleCopy = useCallback(() => {
    if (!connectionInfo) return;
    const text = [
      `Server URL: ${connectionInfo.serverUrl}`,
      `Slot: ${connectionInfo.slotId}`,
      `Entity ID: ${connectionInfo.entityId}`,
      `Port: ${connectionInfo.port}`,
      `Stream Path: ${connectionInfo.streamPath}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [connectionInfo]);

  const handleToggleAdvanced = useCallback(() => {
    if (!showAdvanced && connectionInfo) {
      setEditUrl(connectionInfo.serverUrl);
      setEditEntityId(connectionInfo.entityId);
      setEditPort(String(connectionInfo.port));
      setEditStreamPath(connectionInfo.streamPath);
    }
    setShowAdvanced(prev => !prev);
  }, [showAdvanced, connectionInfo]);

  const handleSaveAdvanced = useCallback(() => {
    if (!onUpdateConfig) return;
    const update: Record<string, string | number> = {};
    if (editUrl && connectionInfo && editUrl !== connectionInfo.serverUrl) update.serverUrl = editUrl;
    if (editEntityId && connectionInfo && editEntityId !== connectionInfo.entityId) update.entityId = editEntityId;
    if (editPort && connectionInfo && parseInt(editPort) !== connectionInfo.port) update.port = parseInt(editPort);
    if (editStreamPath && connectionInfo && editStreamPath !== connectionInfo.streamPath) update.streamPath = editStreamPath;
    if (Object.keys(update).length > 0) onUpdateConfig(update);
    setShowAdvanced(false);
  }, [editUrl, editEntityId, editPort, editStreamPath, connectionInfo, onUpdateConfig]);

  if (!connectionInfo) return null;

  const isConnected = connectionInfo.maestraStatus
    ? connectionInfo.maestraStatus.server === 'connected'
    : connectionInfo.status === 'connected';

  return (
    <div className="connection-panel">
      {/* 5-layer Maestra Status Panel */}
      {connectionInfo.maestraStatus ? (
        <MaestraStatusPanel status={connectionInfo.maestraStatus} />
      ) : (
        // Fallback for slots without granular status
        <div className="connection-status-bar">
          <span
            className="connection-dot"
            style={{
              background: isConnected ? '#22c55e' : connectionInfo.status === 'error' ? '#ef4444' : '#eab308',
              boxShadow: `0 0 8px ${isConnected ? '#22c55e' : connectionInfo.status === 'error' ? '#ef4444' : '#eab308'}`,
            }}
          />
          <span className="connection-status-label">
            {isConnected ? 'Connected to gallery Maestra' : connectionInfo.status === 'error' ? 'Server unreachable' : 'Attempting connection'}
          </span>
        </div>
      )}

      {/* Connection Info */}
      <div className="connection-info">
        <div className="connection-info-row">
          <span className="connection-info-label">Server:</span>
          <span className="connection-info-value">{connectionInfo.serverUrl}</span>
        </div>
        <div className="connection-info-row">
          <span className="connection-info-label">Slot:</span>
          <span className="connection-info-value">{connectionInfo.slotId}</span>
        </div>
        <div className="connection-info-row">
          <span className="connection-info-label">Entity ID:</span>
          <span className="connection-info-value" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
            {connectionInfo.entityId}
          </span>
        </div>
        {connectionInfo.discoveredUrl && (
          <div className="connection-info-row">
            <span className="connection-info-label">Discovered:</span>
            <span className="connection-info-value" style={{ color: '#22c55e' }}>
              {connectionInfo.discoveredUrl}
            </span>
          </div>
        )}
        {connectionInfo.errorMessage && (
          <div className="connection-info-row">
            <span className="connection-info-label" style={{ color: '#ef4444' }}>Error:</span>
            <span className="connection-info-value" style={{ color: '#ef4444' }}>
              {connectionInfo.errorMessage}
            </span>
          </div>
        )}
      </div>

      <div className="connection-actions">
        {!isConnected ? (
          <button className="btn primary" onClick={onAutoConnect}>
            Connect Automatically
          </button>
        ) : (
          <button className="btn" onClick={onDisconnect} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
            Disconnect
          </button>
        )}
        <a
          href="https://github.com/kfaist/maestra-fleet-tox/raw/main/touchdesigner/maestra_fleet.tox"
          download
          target="_blank"
          rel="noopener noreferrer"
          className="btn primary"
        >
          Download TOX
        </a>
        <button className="btn primary" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy Info'}
        </button>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="connection-advanced-toggle" onClick={handleToggleAdvanced}>
        <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', cursor: 'pointer' }}>
          {showAdvanced ? '▾ Hide' : '▸ Advanced'} Settings
        </span>
      </div>

      {showAdvanced && (
        <div className="connection-advanced">
          <div className="connection-advanced-field">
            <label>Server URL</label>
            <input type="text" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="http://192.168.128.115:8080" />
          </div>
          <div className="connection-advanced-field">
            <label>Entity ID</label>
            <input type="text" value={editEntityId} onChange={e => setEditEntityId(e.target.value)} placeholder="Auto-generated" />
          </div>
          <div className="connection-advanced-field">
            <label>Port</label>
            <input type="number" value={editPort} onChange={e => setEditPort(e.target.value)} placeholder="8080" />
          </div>
          <div className="connection-advanced-field">
            <label>Stream Path</label>
            <input type="text" value={editStreamPath} onChange={e => setEditStreamPath(e.target.value)} placeholder="/ws" />
          </div>
          <div className="connection-actions" style={{ marginTop: '8px' }}>
            <button className="btn primary" onClick={handleSaveAdvanced}>Save & Reconnect</button>
            <button className="btn" onClick={() => setShowAdvanced(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
