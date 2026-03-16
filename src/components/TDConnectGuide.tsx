'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { FleetSlot, formatAge } from '@/types';
import { MAESTRA_API_URL } from '@/lib/maestra-connection';

interface TDConnectGuideProps {
  slot: FleetSlot;
  onRoleChange?: (role: 'receive' | 'send' | 'two_way') => void;
  onSignalSourceChange?: (source: SignalSource) => void;
  onReconnect?: () => void;
  onDisconnect?: () => void;
  onConnect?: () => void;
}

type SignalSource = 'touchdesigner' | 'json_stream' | 'osc' | 'audio_reactive' | 'text' | 'test_signal';
type NodeRole = 'receive' | 'send' | 'two_way';
type SetupStage = 'get_connector' | 'waiting' | 'role' | 'signal' | 'live' | 'reconnect';

function slotEntityName(slot: FleetSlot): string {
  if (slot.entity_id) return slot.entity_id;
  const clean = slot.label.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^_|_$/g, '');
  return clean || slot.id.replace('slot_', '');
}

const SIGNAL_SOURCES: { value: SignalSource; title: string; desc: string; icon: string }[] = [
  { value: 'touchdesigner', title: 'Visual Output', desc: 'CHOP or DAT operators from your TD project.', icon: '◆' },
  { value: 'audio_reactive', title: 'Audio Reactive', desc: 'Analyze audio for BPM and frequency bands.', icon: '♫' },
  { value: 'json_stream', title: 'JSON / UDP', desc: 'Structured data from external tools.', icon: '{ }' },
  { value: 'text', title: 'Text / Prompts', desc: 'Send keywords to influence visuals.', icon: 'A' },
  { value: 'osc', title: 'OSC / Ableton', desc: 'OSC messages from audio tools.', icon: '~' },
  { value: 'test_signal', title: 'Test Signal', desc: 'Generate test values for debugging.', icon: '▶' },
];

const ROLES: { value: NodeRole; title: string; desc: string; color: string; icon: string }[] = [
  {
    value: 'send', title: 'Send State',
    desc: 'This node publishes signals to the network.',
    color: '#22c55e', icon: '↑',
  },
  {
    value: 'receive', title: 'Receive State',
    desc: 'This node listens for state updates.',
    color: '#5cc8ff', icon: '↓',
  },
  {
    value: 'two_way', title: 'Two-Way Sync',
    desc: 'This node both sends and receives.',
    color: '#fbbf24', icon: '↕',
  },
];

const FLOW_STEPS: { key: SetupStage; label: string }[] = [
  { key: 'get_connector', label: 'Get Connector' },
  { key: 'waiting', label: 'Connecting' },
  { key: 'role', label: 'Behavior' },
  { key: 'signal', label: 'Signal Type' },
];

export default function TDConnectGuide({ slot, onRoleChange, onSignalSourceChange, onReconnect, onDisconnect, onConnect }: TDConnectGuideProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [connectorAction, setConnectorAction] = useState<'download' | 'copy' | 'have' | null>(null);
  const [nodeRole, setNodeRole] = useState<NodeRole | null>(null);
  const [signalSource, setSignalSource] = useState<SignalSource | null>(null);

  // Activity log (live mode)
  const activityRef = useRef<{ time: string; msg: string }[]>([]);
  const [activityTick, setActivityTick] = useState(0);

  // Signal injection (live mode)
  const [injectField, setInjectField] = useState('audio.bpm');
  const [injectValue, setInjectValue] = useState('128');

  const entityId = slotEntityName(slot);
  const serverUrl = MAESTRA_API_URL;
  const isLive = slot.maestraStatus?.heartbeat === 'live';
  const isConnected = slot.maestraStatus?.server === 'connected' && slot.maestraStatus?.entity === 'registered';
  const hasStream = slot.maestraStatus?.stream === 'live';
  const isStale = slot.maestraStatus?.heartbeat === 'stale' || slot.maestraStatus?.heartbeat === 'lost';

  const lastEventAge = slot.maestraStatus?.lastHeartbeatAt
    ? Math.max(0, Date.now() - slot.maestraStatus.lastHeartbeatAt)
    : null;

  // Derive stage from state — linear progression
  const setupStage: SetupStage =
    isStale && isConnected ? 'reconnect' :
    signalSource !== null ? 'live' :
    nodeRole !== null ? 'signal' :
    (isLive || isConnected) && connectorAction !== null ? 'role' :
    connectorAction !== null ? 'waiting' :
    'get_connector';

  // Track activity in live mode
  useEffect(() => {
    if (setupStage !== 'live') return;
    const interval = setInterval(() => {
      if (slot.maestraStatus?.lastHeartbeatAt) {
        const age = Math.max(0, Date.now() - slot.maestraStatus.lastHeartbeatAt);
        if (age < 2000) {
          const t = new Date().toLocaleTimeString('en-US', { hour12: false });
          activityRef.current.unshift({ time: t, msg: `heartbeat ${age}ms` });
          if (activityRef.current.length > 8) activityRef.current.pop();
          setActivityTick(p => p + 1);
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [setupStage, slot.maestraStatus]);

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }, []);

  const handleRoleChange = useCallback((role: NodeRole) => {
    setNodeRole(role);
    onRoleChange?.(role);
  }, [onRoleChange]);

  const handleSignalSourceChange = useCallback((source: SignalSource) => {
    setSignalSource(source);
    onSignalSourceChange?.(source);
  }, [onSignalSourceChange]);

  const handleConnectorAction = useCallback((action: 'download' | 'copy' | 'have') => {
    setConnectorAction(action);
    // Auto-trigger connection when user picks any option
    onConnect?.();
  }, [onConnect]);

  // Step index for progress
  const stageIndex = FLOW_STEPS.findIndex(s => s.key === setupStage);

  // ════════════ RECONNECT / STALE MODE ════════════
  if (setupStage === 'reconnect') {
    const heartbeatAge = slot.maestraStatus?.lastHeartbeatAt
      ? Math.max(0, Date.now() - slot.maestraStatus.lastHeartbeatAt)
      : null;
    const heartbeatLabel = slot.maestraStatus?.heartbeat === 'lost' ? 'Lost' : 'Stale';
    const heartbeatColor = slot.maestraStatus?.heartbeat === 'lost' ? '#ef4444' : '#eab308';

    return (
      <div className="td-connect-guide">
        <div className="td-reconnect-panel">
          <div className="td-reconnect-header">
            <div className="td-reconnect-icon" style={{ background: heartbeatColor, boxShadow: `0 0 12px ${heartbeatColor}55` }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: heartbeatColor, letterSpacing: '.04em' }}>
                Node Appears {heartbeatLabel}
              </div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                Entity: <span style={{ color: '#5cc8ff' }}>{entityId}</span>
              </div>
            </div>
          </div>

          <div className="td-reconnect-details">
            <div className="td-reconnect-row">
              <span className="td-reconnect-label">Last Heartbeat</span>
              <span style={{ color: heartbeatColor }}>
                {heartbeatAge != null ? `${formatAge(heartbeatAge)} ago` : 'Never received'}
              </span>
            </div>
            <div className="td-reconnect-row">
              <span className="td-reconnect-label">Server</span>
              <span style={{ color: isConnected ? '#22c55e' : '#ef4444' }}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div className="td-reconnect-actions">
            {onReconnect && (
              <button className="td-action-btn td-action-primary" onClick={onReconnect}>
                Reconnect Node
              </button>
            )}
            {onDisconnect && (
              <button className="td-action-btn" onClick={onDisconnect}>
                Disconnect
              </button>
            )}
            <button className="td-action-btn" onClick={() => {
              setNodeRole(null);
              setSignalSource(null);
              setConnectorAction(null);
            }}>
              Re-run Setup
            </button>
          </div>

          <div className="td-reconnect-troubleshoot">
            <div style={{ fontSize: 10, fontWeight: 600, color: '#888', marginBottom: 6, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Troubleshooting
            </div>
            <div className="td-reconnect-tip">Check that TouchDesigner is running and the TOX is loaded</div>
            <div className="td-reconnect-tip">Verify the entity ID matches: <code style={{ color: '#5cc8ff' }}>{entityId}</code></div>
            <div className="td-reconnect-tip">Confirm network connectivity to <code style={{ color: '#aab' }}>{serverUrl}</code></div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════ LIVE MODE ════════════
  if (setupStage === 'live') {
    const selectedRole = ROLES.find(r => r.value === nodeRole);
    const selectedSource = SIGNAL_SOURCES.find(s => s.value === signalSource);

    return (
      <div className="td-connect-guide">
        {/* Compact setup summary */}
        <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.15)', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: '.06em', textTransform: 'uppercase' }}>Setup Complete</span>
          </div>
          <div style={{ fontSize: 9, color: '#888', lineHeight: 1.6 }}>
            <span style={{ color: '#5cc8ff' }}>{entityId}</span> · {selectedRole?.title || '—'} · {selectedSource?.title || '—'}
          </div>
        </div>

        {/* ═══ LIVE NODE PANEL ═══ */}
        <div className="td-live-panel">
          <div className="td-live-section">
            <div className="td-live-section-title">Node Status</div>
            <div className="td-live-status-row">
              <div className="td-live-status-dot" style={{
                background: isLive ? '#22c55e' : '#eab308',
                boxShadow: isLive ? '0 0 8px #22c55e' : 'none',
              }} />
              <span style={{ color: isLive ? '#22c55e' : '#eab308', fontWeight: 700, fontSize: 11 }}>
                {isLive ? 'LIVE' : 'CONNECTING'}
              </span>
            </div>
            <div className="td-live-meta">
              <div><span className="td-live-meta-label">Heartbeat:</span> <span style={{ color: isLive ? '#22c55e' : '#888' }}>{lastEventAge != null ? `${formatAge(lastEventAge)}` : '—'}</span></div>
              <div><span className="td-live-meta-label">Server:</span> <span style={{ color: isConnected ? '#22c55e' : '#888' }}>{isConnected ? 'connected' : 'disconnected'}</span></div>
              <div><span className="td-live-meta-label">Stream:</span> <span style={{ color: hasStream ? '#22c55e' : '#888' }}>{hasStream ? 'live' : 'none'}</span></div>
            </div>
          </div>

          {/* Signal Injection */}
          <div className="td-live-section">
            <div className="td-live-section-title">Inject Signal</div>
            <div className="td-live-inject">
              <div className="td-live-inject-row">
                <input type="text" value={injectField} onChange={e => setInjectField(e.target.value)} placeholder="field" className="td-live-inject-input" />
                <input type="text" value={injectValue} onChange={e => setInjectValue(e.target.value)} placeholder="value" className="td-live-inject-input" />
                <button className="td-live-inject-btn" onClick={() => {
                  const t = new Date().toLocaleTimeString('en-US', { hour12: false });
                  activityRef.current.unshift({ time: t, msg: `${injectField} → ${injectValue} (injected)` });
                  if (activityRef.current.length > 8) activityRef.current.pop();
                  setActivityTick(p => p + 1);
                }}>
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="td-live-section">
            <div className="td-live-section-title">Recent Activity</div>
            <div className="td-live-activity">
              {activityRef.current.length > 0 ? activityRef.current.map((a, i) => (
                <div key={`${i}-${activityTick}`} className="td-live-activity-row">
                  <span className="td-live-activity-time">{a.time}</span>
                  <span className="td-live-activity-msg">{a.msg}</span>
                </div>
              )) : (
                <div className="td-live-activity-row" style={{ color: '#555' }}>No recent activity</div>
              )}
            </div>
          </div>

          {/* Reconfigure */}
          <button className="td-action-btn" style={{ width: '100%', marginTop: 6, fontSize: 9, opacity: 0.5 }} onClick={() => {
            setNodeRole(null);
            setSignalSource(null);
          }}>
            Reconfigure
          </button>
        </div>
      </div>
    );
  }

  // ════════════ SETUP FLOW ════════════
  return (
    <div className="td-connect-guide">

      {/* Progress dots */}
      <div className="td-progress">
        {FLOW_STEPS.map((step, i) => {
          const completed = i < stageIndex;
          const current = i === stageIndex;
          return (
            <div key={step.key} className={`td-progress-step ${completed ? 'completed' : current ? 'current' : 'upcoming'}`}>
              <span className="td-progress-marker">
                {completed ? '✓' : current ? '●' : '○'}
              </span>
              <span className="td-progress-label">{step.label}</span>
              {i < FLOW_STEPS.length - 1 && <span className="td-progress-arrow">→</span>}
            </div>
          );
        })}
      </div>

      {/* ═══ STEP 1: GET CONNECTOR ═══ */}
      {setupStage === 'get_connector' && (
        <div className="td-section expanded">
          <div className="td-section-header">
            <div className="td-section-num">1</div>
            <div className="td-section-title-group">
              <span className="td-section-title">Get the Connector</span>
              <span className="td-section-subtitle">
                Load the Maestra connector into your TouchDesigner project
              </span>
            </div>
          </div>
          <div className="td-section-body">
            {/* Three options as large buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="td-onboard-action-btn"
                onClick={() => handleConnectorAction('download')}
              >
                <span className="td-onboard-action-icon">↓</span>
                <div className="td-onboard-action-text">
                  <span className="td-onboard-action-title">Download Connector for This Slot</span>
                  <span className="td-onboard-action-desc">Get a .tox file pre-configured for <span style={{ color: '#5cc8ff' }}>{slot.label}</span></span>
                </div>
              </button>

              <button
                className="td-onboard-action-btn"
                onClick={() => handleConnectorAction('copy')}
              >
                <span className="td-onboard-action-icon">⎘</span>
                <div className="td-onboard-action-text">
                  <span className="td-onboard-action-title">Copy Setup Info</span>
                  <span className="td-onboard-action-desc">Copy server URL and entity ID to paste into an existing node</span>
                </div>
              </button>

              <button
                className="td-onboard-action-btn td-onboard-subtle"
                onClick={() => handleConnectorAction('have')}
              >
                <span className="td-onboard-action-icon" style={{ opacity: 0.5 }}>✓</span>
                <div className="td-onboard-action-text">
                  <span className="td-onboard-action-title">I Already Have the Connector</span>
                  <span className="td-onboard-action-desc">Skip ahead — my TD node is ready to connect</span>
                </div>
              </button>
            </div>

            {/* Server info — always visible but subtle */}
            <div style={{ marginTop: 14, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="td-connect-row">
                <span className="td-connect-label">Server</span>
                <code className="td-connect-value" style={{ fontSize: 9 }}>{serverUrl}</code>
                <button className="td-copy-btn" onClick={() => copyToClipboard(serverUrl, 'server')}>
                  {copiedField === 'server' ? '✓' : 'Copy'}
                </button>
              </div>
              <div className="td-connect-row" style={{ marginTop: 4 }}>
                <span className="td-connect-label">Entity</span>
                <code className="td-connect-value td-connect-entity">{entityId}</code>
                <button className="td-copy-btn" onClick={() => copyToClipboard(entityId, 'entity')}>
                  {copiedField === 'entity' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: WAITING FOR CONNECTION ═══ */}
      {setupStage === 'waiting' && (
        <div className="td-section expanded">
          <div className="td-section-header">
            <div className="td-section-num">2</div>
            <div className="td-section-title-group">
              <span className="td-section-title">Waiting for Node...</span>
              <span className="td-section-subtitle">
                Open TouchDesigner and load the connector
              </span>
            </div>
          </div>
          <div className="td-section-body">
            <div className="td-waiting-container">
              {/* Pulsing dot */}
              <div className="td-waiting-pulse-wrap">
                <div className="td-waiting-pulse" />
                <div className="td-waiting-dot" />
              </div>
              <div className="td-waiting-text">
                Waiting for TouchDesigner node...
              </div>

              {/* Connection details */}
              <div className="td-waiting-details">
                <div className="td-waiting-detail-row">
                  <span className="td-waiting-detail-label">Slot</span>
                  <span style={{ color: 'var(--text)' }}>{slot.label}</span>
                </div>
                <div className="td-waiting-detail-row">
                  <span className="td-waiting-detail-label">Entity</span>
                  <span style={{ color: '#5cc8ff' }}>{entityId}</span>
                </div>
                <div className="td-waiting-detail-row">
                  <span className="td-waiting-detail-label">Server</span>
                  <span style={{ color: slot.maestraStatus?.server === 'connected' ? '#22c55e' : '#888' }}>
                    {slot.maestraStatus?.server === 'connected' ? 'Connected' : slot.maestraStatus?.server === 'connecting' ? 'Connecting...' : 'Waiting'}
                  </span>
                </div>
              </div>

              {/* Helpful nudge */}
              <div style={{ fontSize: 9, color: '#555', lineHeight: 1.6, marginTop: 10, textAlign: 'center' }}>
                Make sure the connector TOX is loaded and<br />
                the entity ID matches: <code style={{ color: '#5cc8ff' }}>{entityId}</code>
              </div>

              {/* Back button */}
              <button className="td-action-btn" style={{ width: '100%', marginTop: 12, fontSize: 9, opacity: 0.4 }} onClick={() => setConnectorAction(null)}>
                ← Back to connector options
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: NODE ROLE ═══ */}
      {setupStage === 'role' && (
        <div className="td-section expanded">
          <div className="td-section-header">
            <div className="td-section-num">3</div>
            <div className="td-section-title-group">
              <span className="td-section-title">What Should This Node Do?</span>
              <span className="td-section-subtitle">
                Node connected — choose its behavior
              </span>
            </div>
          </div>
          <div className="td-section-body">
            {/* Connected indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '6px 10px', background: 'rgba(34,197,94,0.08)', borderRadius: 4, border: '1px solid rgba(34,197,94,0.2)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
              <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Node connected</span>
              <span style={{ fontSize: 9, color: '#888', marginLeft: 'auto' }}>{entityId}</span>
            </div>

            <div className="td-role-grid">
              {ROLES.map(r => (
                <div
                  key={r.value}
                  className={`td-role-card ${nodeRole === r.value ? 'selected' : ''}`}
                  onClick={() => handleRoleChange(r.value)}
                  style={{ '--role-accent': r.color } as React.CSSProperties}
                >
                  <div className="td-role-card-header">
                    <span style={{ fontSize: 16, color: r.color, marginRight: 4 }}>{r.icon}</span>
                    <div className="td-role-card-title">{r.title}</div>
                  </div>
                  <div className="td-role-card-desc">{r.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 4: SIGNAL TYPE ═══ */}
      {setupStage === 'signal' && (
        <div className="td-section expanded">
          <div className="td-section-header">
            <div className="td-section-num">4</div>
            <div className="td-section-title-group">
              <span className="td-section-title">Signal Type</span>
              <span className="td-section-subtitle">
                What kind of data will this node {nodeRole === 'send' ? 'publish' : nodeRole === 'receive' ? 'listen for' : 'sync'}?
              </span>
            </div>
          </div>
          <div className="td-section-body">
            {/* Role summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 12, color: ROLES.find(r => r.value === nodeRole)?.color }}>{ROLES.find(r => r.value === nodeRole)?.icon}</span>
              <span style={{ fontSize: 10, color: '#aab' }}>{ROLES.find(r => r.value === nodeRole)?.title}</span>
              <button style={{ marginLeft: 'auto', fontSize: 8, color: '#555', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setNodeRole(null)}>change</button>
            </div>

            <div className="td-signal-grid">
              {SIGNAL_SOURCES.map(src => (
                <div
                  key={src.value}
                  className={`td-signal-option ${signalSource === src.value ? 'selected' : ''}`}
                  onClick={() => handleSignalSourceChange(src.value)}
                >
                  <span className="td-signal-icon">{src.icon}</span>
                  <div className="td-signal-text">
                    <div className="td-signal-name">{src.title}</div>
                    <div className="td-signal-desc">{src.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
