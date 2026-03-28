'use client';

import { useState, useCallback, useEffect } from 'react';
// ConnectionStatus imported for type reference only

import { MaestraSlotStatus } from '@/types';
import {
  MaestraConnection,
  MAESTRA_API_URL,
  generateEntityId,
} from '@/lib/maestra-connection';

export interface JoinMaestraResult {
  method: 'join_show' | 'claim_station' | 'monitor_only';
  serverUrl: string;
  entityId: string;
  slotId: string;
  tdRole?: 'receive' | 'send' | 'two_way';
}

interface JoinModalProps {
  open: boolean;
  onClose: () => void;
  onJoin: (result: JoinMaestraResult) => void;
}

type ModalStep = 'choose' | 'connecting' | 'success' | 'failure' | 'td_role';

const METHODS = [
  {
    value: 'join_show' as const,
    title: 'Join Show',
    desc: 'Connect as a new node in the active show. Auto-discovers the Maestra server and registers your station.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    value: 'claim_station' as const,
    title: 'Claim Station',
    desc: 'Take control of an existing station slot. Useful when replacing hardware or resuming a session.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    value: 'monitor_only' as const,
    title: 'Monitor Only',
    desc: 'View the fleet without registering a node. Read-only access to all status and streams.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      </svg>
    ),
  },
];

const TD_ROLES = [
  {
    value: 'receive' as const,
    title: 'Receive State',
    desc: 'This TD node receives prompts, parameters, and state from the Maestra network.',
    color: 'var(--accent)',
  },
  {
    value: 'send' as const,
    title: 'Send State',
    desc: 'This TD node publishes its state (audio, sensors, video) to the fleet.',
    color: 'var(--active)',
  },
  {
    value: 'two_way' as const,
    title: 'Two-Way Sync',
    desc: 'Full bidirectional sync — both receives and sends state across the network.',
    color: 'var(--amber)',
  },
];

export default function JoinModal({ open, onClose, onJoin }: JoinModalProps) {
  const [step, setStep] = useState<ModalStep>('choose');
  const [method, setMethod] = useState<'join_show' | 'claim_station' | 'monitor_only'>('join_show');
  const [tdRole, setTdRole] = useState<'receive' | 'send' | 'two_way'>('receive');

  // Connection state (5-layer MaestraSlotStatus)
  const [connectionStatus, setConnectionStatus] = useState<MaestraSlotStatus | null>(null);
  const [connectionRef, setConnectionRef] = useState<MaestraConnection | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Generated values
  const [entityId, setEntityId] = useState(() => generateEntityId('operator', 'mon'));
  const [slotId] = useState(() => `slot_${Math.random().toString(36).slice(2, 6)}`);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverUrl, setServerUrl] = useState(MAESTRA_API_URL);
  const [customEntityId, setCustomEntityId] = useState('');
  const [port, setPort] = useState('8080');
  const [streamPath, setStreamPath] = useState('/ws');

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('choose');
      setMethod('join_show');
      setTdRole('receive');
      setConnectError(null);
      setConnectionStatus(null);
      setShowAdvanced(false);
      setEntityId(generateEntityId('operator', 'mon'));
      setServerUrl(MAESTRA_API_URL);
      setCustomEntityId('');
      setPort('8080');
      setStreamPath('/ws');
    }
  }, [open]);

  // Clean up connection on unmount
  useEffect(() => {
    return () => {
      connectionRef?.destroy();
    };
  }, [connectionRef]);

  const handleMethodSelect = useCallback((m: typeof method) => {
    setMethod(m);
  }, []);

  const handleConnect = useCallback(() => {
    setStep('connecting');
    setConnectError(null);

    const eid = customEntityId.trim() || entityId;
    const conn = new MaestraConnection({
      slotId,
      slotLabel: method === 'monitor_only' ? 'Monitor' : 'Operator',
      slotTag: 'mon',
      entityId: eid,
      serverUrl,
      port: parseInt(port, 10) || 8080,
      streamPath,
      autoConnect: true,
      autoDiscover: true,
    });

    setConnectionRef(conn);

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const status = conn.getStatus();
        setConnectionStatus(status);
        if (status.server === 'connected') {
          setStep('success');
        } else {
          setConnectError('Connection timed out. The server may be unreachable.');
          setStep('failure');
        }
      }
    }, 8000);

    conn.onStatusChange((status) => {
      setConnectionStatus(status);
      if (!resolved && status.server === 'connected' && status.entity === 'registered') {
        resolved = true;
        clearTimeout(timeout);
        setStep('success');
      } else if (!resolved && status.server === 'error') {
        resolved = true;
        clearTimeout(timeout);
        setConnectError(status.errorMessage || 'Failed to connect to Maestra server.');
        setStep('failure');
      }
    });

    conn.connect();
  }, [method, entityId, customEntityId, slotId, serverUrl, port, streamPath]);

  const handleRetry = useCallback(() => {
    connectionRef?.destroy();
    setConnectionRef(null);
    setStep('connecting');
    // Small delay then retry
    setTimeout(handleConnect, 200);
  }, [connectionRef, handleConnect]);

  const handleBackToChoose = useCallback(() => {
    connectionRef?.destroy();
    setConnectionRef(null);
    setStep('choose');
    setConnectError(null);
  }, [connectionRef]);

  const handleSuccessContinue = useCallback(() => {
    if (method === 'monitor_only') {
      const eid = customEntityId.trim() || entityId;
      onJoin({
        method,
        serverUrl,
        entityId: eid,
        slotId,
      });
    } else {
      setStep('td_role');
    }
  }, [method, entityId, customEntityId, slotId, serverUrl, onJoin]);

  const handleTdRoleConfirm = useCallback(() => {
    const eid = customEntityId.trim() || entityId;
    onJoin({
      method,
      serverUrl,
      entityId: eid,
      slotId,
      tdRole,
    });
  }, [method, entityId, customEntityId, slotId, serverUrl, tdRole, onJoin]);

  const handleCopyInfo = useCallback(() => {
    const eid = customEntityId.trim() || entityId;
    const info = [
      `Server: ${serverUrl}`,
      `Entity ID: ${eid}`,
      `Slot: ${slotId}`,
      `Port: ${port}`,
      `Stream: ${streamPath}`,
    ].join('\n');
    navigator.clipboard.writeText(info).catch(() => {});
  }, [entityId, customEntityId, slotId, serverUrl, port, streamPath]);

  const handleClose = useCallback(() => {
    connectionRef?.destroy();
    setConnectionRef(null);
    onClose();
  }, [connectionRef, onClose]);

  if (!open) return null;

  const effectiveEntityId = customEntityId.trim() || entityId;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card join-maestra-modal" onClick={e => e.stopPropagation()}>

        {/* ─── STEP: CHOOSE METHOD ─── */}
        {step === 'choose' && (
          <>
            <div className="modal-title">Join Maestra</div>
            <div className="modal-subtitle">
              Choose how you want to connect to the Maestra network.
            </div>
            <div className="modal-steps">
              <div className="modal-step current" />
              <div className="modal-step" />
              <div className="modal-step" />
            </div>

            <div className="join-methods">
              {METHODS.map(m => (
                <div
                  key={m.value}
                  className={`join-method ${method === m.value ? 'selected' : ''}`}
                  onClick={() => handleMethodSelect(m.value)}
                >
                  <div className="join-method-icon">{m.icon}</div>
                  <div className="join-method-content">
                    <div className="join-method-title">{m.title}</div>
                    <div className="join-method-desc">{m.desc}</div>
                  </div>
                  <div className="join-method-radio">
                    <div className={`radio-dot ${method === m.value ? 'active' : ''}`} />
                  </div>
                </div>
              ))}
            </div>

            {/* Advanced Settings */}
            <div
              className="connection-advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', cursor: 'pointer' }}>
                {showAdvanced ? '▾' : '▸'} Advanced Settings
              </span>
            </div>
            {showAdvanced && (
              <div className="connection-advanced" style={{ marginTop: '8px' }}>
                <div className="connection-advanced-field">
                  <label>Server URL</label>
                  <input
                    value={serverUrl}
                    onChange={e => setServerUrl(e.target.value)}
                    placeholder={MAESTRA_API_URL}
                  />
                </div>
                <div className="connection-advanced-field">
                  <label>Entity ID</label>
                  <input
                    value={customEntityId}
                    onChange={e => setCustomEntityId(e.target.value)}
                    placeholder={entityId}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="connection-advanced-field">
                    <label>Port</label>
                    <input
                      value={port}
                      onChange={e => setPort(e.target.value)}
                      placeholder="8080"
                    />
                  </div>
                  <div className="connection-advanced-field">
                    <label>Stream Path</label>
                    <input
                      value={streamPath}
                      onChange={e => setStreamPath(e.target.value)}
                      placeholder="/ws"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={handleClose}>Cancel</button>
              <button className="btn primary" onClick={handleConnect}>
                Connect
              </button>
            </div>
          </>
        )}

        {/* ─── STEP: CONNECTING ─── */}
        {step === 'connecting' && (
          <>
            <div className="modal-title">Connecting</div>
            <div className="modal-subtitle">
              {connectionStatus?.entity === 'registering'
                ? 'Registering entity with Maestra server...'
                : 'Establishing connection to Maestra server...'}
            </div>
            <div className="modal-steps">
              <div className="modal-step done" />
              <div className="modal-step current" />
              <div className="modal-step" />
            </div>

            <div className="connecting-animation">
              <div className="connecting-spinner" />
              <div className="connecting-status">
                <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  {connectionStatus?.entity === 'registering' ? 'REGISTERING...' : 'CONNECTING...'}
                </span>
                <span style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '4px' }}>
                  {serverUrl}
                </span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={handleBackToChoose}>Cancel</button>
            </div>
          </>
        )}

        {/* ─── STEP: SUCCESS ─── */}
        {step === 'success' && (
          <>
            <div className="modal-title" style={{ color: 'var(--active)' }}>
              {connectionStatus?.optimistic ? 'Connected (Local Network)' : 'Connected'}
            </div>
            <div className="modal-subtitle">
              {connectionStatus?.optimistic
                ? 'Optimistic connection — your browser can\'t directly verify the local Maestra server from HTTPS, but TD nodes on the gallery network will sync normally.'
                : 'Successfully connected to the Maestra network.'}
            </div>
            <div className="modal-steps">
              <div className="modal-step done" />
              <div className="modal-step done" />
              <div className="modal-step current" />
            </div>

            <div className="success-card">
              {connectionStatus?.optimistic && (
                <div style={{ fontSize: '9px', letterSpacing: '0.06em', color: 'var(--amber)', marginBottom: '10px', padding: '8px 10px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '3px', lineHeight: '1.5' }}>
                  <strong style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Browser connection limited</strong>
                  This dashboard runs over HTTPS, so your browser cannot directly verify the gallery&apos;s HTTP Maestra server. TouchDesigner can still connect normally.
                </div>
              )}
              <div className="success-info-row">
                <span className="success-label">Server</span>
                <span className="success-value">{serverUrl}</span>
              </div>
              <div className="success-info-row">
                <span className="success-label">Node</span>
                <span className="success-value">{slotId}</span>
              </div>
              <div className="success-info-row">
                <span className="success-label">Entity ID</span>
                <span className="success-value" style={{ color: 'var(--active)' }}>{effectiveEntityId}</span>
              </div>
            </div>

            <div className="success-actions">
              <button className="btn-sm" style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: '6px 12px' }} onClick={handleCopyInfo}>
                Copy Info
              </button>
              <button className="btn-sm" style={{ border: '1px solid rgba(0,212,255,0.3)', background: 'rgba(0,212,255,0.06)', color: 'var(--accent)', padding: '6px 12px' }} onClick={() => {
                const toxConfig = `# Maestra TOX Config\nserver_url = "${serverUrl}"\nentity_id = "${effectiveEntityId}"\nslot_id = "${slotId}"\nport = ${port}\nstream_path = "${streamPath}"`;
                const blob = new Blob([toxConfig], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'maestra_config.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}>
                Download TOX Config
              </button>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={handleClose}>Close</button>
              <button
                className="btn primary"
                onClick={handleSuccessContinue}
                style={method === 'monitor_only' ? { background: 'rgba(0,255,136,0.08)', borderColor: 'var(--active)', color: 'var(--active)' } : {}}
              >
                {method === 'monitor_only' ? 'Begin Monitoring' : 'Configure TD Role'}
              </button>
            </div>
          </>
        )}

        {/* ─── STEP: FAILURE ─── */}
        {step === 'failure' && (
          <>
            <div className="modal-title" style={{ color: 'var(--red)' }}>Connection Failed</div>
            <div className="modal-subtitle">
              {connectError || 'Could not reach the Maestra server.'}
            </div>
            <div className="modal-steps">
              <div className="modal-step done" />
              <div className="modal-step" style={{ background: 'var(--red)' }} />
              <div className="modal-step" />
            </div>

            <div className="failure-card">
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '12px' }}>
                The Maestra server at <strong style={{ color: 'var(--accent)' }}>{serverUrl}</strong> did not respond.
                Check that the server is running and accessible from this network.
              </div>
              <div className="success-info-row">
                <span className="success-label">Target</span>
                <span className="success-value">{serverUrl}</span>
              </div>
              <div className="success-info-row">
                <span className="success-label">Entity ID</span>
                <span className="success-value">{effectiveEntityId}</span>
              </div>
            </div>

            <div className="success-actions">
              <button className="btn-sm" style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: '6px 12px' }} onClick={handleCopyInfo}>
                Copy Info
              </button>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={handleBackToChoose}>Advanced Settings</button>
              <button className="btn primary" onClick={handleRetry}>
                Retry
              </button>
              <button className="btn" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}

        {/* ─── STEP: TD ROLE ─── */}
        {step === 'td_role' && (
          <>
            <div className="modal-title">TouchDesigner Role</div>
            <div className="modal-subtitle">
              Select how this node participates in the Maestra state network.
            </div>
            <div className="modal-steps">
              <div className="modal-step done" />
              <div className="modal-step done" />
              <div className="modal-step current" />
            </div>

            <div className="td-roles">
              {TD_ROLES.map(r => (
                <div
                  key={r.value}
                  className={`td-role-option ${tdRole === r.value ? 'selected' : ''}`}
                  onClick={() => setTdRole(r.value)}
                  style={{ '--role-color': r.color } as React.CSSProperties}
                >
                  <div className="td-role-title">{r.title}</div>
                  <div className="td-role-desc">{r.desc}</div>
                  <div className="join-method-radio">
                    <div className={`radio-dot ${tdRole === r.value ? 'active' : ''}`} style={tdRole === r.value ? { background: r.color, boxShadow: `0 0 8px ${r.color}` } : {}} />
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setStep('success')}>Back</button>
              <button
                className="btn primary"
                onClick={handleTdRoleConfirm}
                style={{ background: 'rgba(0,255,136,0.08)', borderColor: 'var(--active)', color: 'var(--active)' }}
              >
                Begin Monitoring
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
