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
type SetupStage = 'connect' | 'source' | 'role' | 'live' | 'reconnect';

function slotEntityName(slot: FleetSlot): string {
  if (slot.entity_id) return slot.entity_id;
  const clean = slot.label.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^_|_$/g, '');
  return clean || slot.id.replace('slot_', '');
}

const SIGNAL_SOURCES: { value: SignalSource; title: string; desc: string; icon: string }[] = [
  { value: 'touchdesigner', title: 'TouchDesigner', desc: 'CHOP or DAT operators from your TD project.', icon: '◆' },
  { value: 'json_stream', title: 'JSON Stream', desc: 'Structured data from external tools.', icon: '{ }' },
  { value: 'osc', title: 'OSC / Ableton', desc: 'OSC messages from audio tools.', icon: '~' },
  { value: 'audio_reactive', title: 'Audio Reactive', desc: 'Analyze audio for BPM and bands.', icon: '♫' },
  { value: 'text', title: 'Text / Lyrics', desc: 'Send keywords to influence visuals.', icon: 'A' },
  { value: 'test_signal', title: 'Test Signal', desc: 'Generate test values for debugging.', icon: '▶' },
];

const ROLES: { value: NodeRole; title: string; desc: string; color: string; nodeType: string; examples: string[] }[] = [
  {
    value: 'receive', title: 'Receive State',
    desc: 'This node listens for state updates from other nodes.',
    color: '#5cc8ff', nodeType: 'Visual node',
    examples: ['Receive BPM from audio node', 'Receive color palette from controller', 'Receive scene state and intensity'],
  },
  {
    value: 'send', title: 'Send State',
    desc: 'This node publishes signals to the network.',
    color: '#22c55e', nodeType: 'Audio node',
    examples: ['Send BPM and frequency bands', 'Send sensor data to fleet', 'Send color palette to lighting node'],
  },
  {
    value: 'two_way', title: 'Two-Way Sync',
    desc: 'This node both sends and receives signals.',
    color: '#fbbf24', nodeType: 'Full sync',
    examples: ['Send video, receive prompts', 'Send audio analysis, receive color state', 'Full bidirectional state sync'],
  },
];

const STEPS: { key: SetupStage; label: string }[] = [
  { key: 'connect', label: 'Connect Node' },
  { key: 'source', label: 'Signal Source' },
  { key: 'role', label: 'Node Role' },
  { key: 'live', label: 'Live Node' },
];

export default function TDConnectGuide({ slot, onRoleChange, onSignalSourceChange, onReconnect, onDisconnect, onConnect }: TDConnectGuideProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [signalSource, setSignalSource] = useState<SignalSource | null>(null);
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [nodeRole, setNodeRole] = useState<NodeRole | null>(null);

  // TD-specific config
  const [tdOpPath, setTdOpPath] = useState('/project1/audio_analysis');
  const [tdSignalType, setTdSignalType] = useState<'chop' | 'dat' | 'json'>('chop');
  const [tdChannels, setTdChannels] = useState('bass, mid, high');
  const [jsonTransport, setJsonTransport] = useState<'udp' | 'websocket' | 'http'>('websocket');
  const [jsonPort, setJsonPort] = useState('9000');
  const [oscPort, setOscPort] = useState('8000');
  const [oscAddress, setOscAddress] = useState('/ableton/bpm');
  const [audioInput, setAudioInput] = useState<'mic' | 'line'>('mic');

  // Signal injection (live mode)
  const [injectField, setInjectField] = useState('audio.bpm');
  const [injectValue, setInjectValue] = useState('128');

  // Activity log (live mode)
  const activityRef = useRef<{ time: string; msg: string }[]>([]);
  const [activityTick, setActivityTick] = useState(0);

  const entityId = slotEntityName(slot);
  const serverUrl = MAESTRA_API_URL;
  const isLive = slot.maestraStatus?.heartbeat === 'live';
  const isConnected = slot.maestraStatus?.server === 'connected' && slot.maestraStatus?.entity === 'registered';
  const hasStream = slot.maestraStatus?.stream === 'live';

  const lastEventAge = slot.maestraStatus?.lastHeartbeatAt
    ? Math.max(0, Date.now() - slot.maestraStatus.lastHeartbeatAt)
    : null;

  // Detect stale/lost nodes
  const isStale = slot.maestraStatus?.heartbeat === 'stale' || slot.maestraStatus?.heartbeat === 'lost';

  // Derive setupStage from state — stale overrides, live auto-advances
  const setupStage: SetupStage =
    isStale && isConnected ? 'reconnect' :
    nodeRole !== null ? 'live' :
    isLive ? 'live' :  // Auto-advance to live panel if heartbeat is already live
    sourceConfirmed ? 'role' :
    isConnected ? 'source' :
    'connect';

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

  const handleSignalSourceChange = useCallback((source: SignalSource) => {
    setSignalSource(source);
    onSignalSourceChange?.(source);
  }, [onSignalSourceChange]);

  const confirmSource = useCallback(() => {
    if (signalSource) setSourceConfirmed(true);
  }, [signalSource]);

  const handleRoleChange = useCallback((role: NodeRole) => {
    setNodeRole(role);
    onRoleChange?.(role);
  }, [onRoleChange]);

  // Step index for progress
  const stageIndex = STEPS.findIndex(s => s.key === setupStage);

  // Collapsed summary for completed step
  const renderCollapsedConnect = () => (
    <div className="td-collapsed-summary">
      <span style={{ color: '#22c55e' }}>✓</span>
      <span className="td-collapsed-title">Connect Your TouchDesigner Node</span>
      <span className="td-collapsed-detail">
        {isLive ? 'Connected and live' : 'Connected'} — Entity: <span style={{ color: '#5cc8ff' }}>{entityId}</span>
        {isLive && <> — Heartbeat: <span style={{ color: '#22c55e' }}>live</span></>}
      </span>
    </div>
  );

  const renderCollapsedSource = () => (
    <div className="td-collapsed-summary">
      <span style={{ color: '#22c55e' }}>✓</span>
      <span className="td-collapsed-title">Signal Source</span>
      <span className="td-collapsed-detail">
        {SIGNAL_SOURCES.find(s => s.value === signalSource)?.title || '—'}
      </span>
    </div>
  );

  const renderCollapsedRole = () => (
    <div className="td-collapsed-summary">
      <span style={{ color: '#22c55e' }}>✓</span>
      <span className="td-collapsed-title">Node Role</span>
      <span className="td-collapsed-detail">
        {ROLES.find(r => r.value === nodeRole)?.title || '—'}
      </span>
    </div>
  );

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
            <div className="td-reconnect-row">
              <span className="td-reconnect-label">Stream</span>
              <span style={{ color: hasStream ? '#22c55e' : '#888' }}>
                {hasStream ? 'Live' : slot.maestraStatus?.stream === 'stale' ? 'Stale' : 'None'}
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
              // Re-enter setup flow by resetting wizard state
              setNodeRole(null);
              setSourceConfirmed(false);
              setSignalSource(null);
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
            <div className="td-reconnect-tip">Try restarting the TOX or re-downloading it</div>
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
        {/* Completed setup summaries — clickable to reopen */}
        {renderCollapsedConnect()}
        {renderCollapsedSource()}
        {renderCollapsedRole()}

        {/* ═══ LIVE NODE PANEL ═══ */}
        <div className="td-live-panel">
          {/* Node Status */}
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
              <div><span className="td-live-meta-label">Entity:</span> <span style={{ color: '#5cc8ff' }}>{entityId}</span></div>
              <div><span className="td-live-meta-label">Server:</span> <span style={{ color: isConnected ? '#22c55e' : '#888' }}>{isConnected ? 'connected' : 'disconnected'}</span></div>
              <div><span className="td-live-meta-label">Heartbeat:</span> <span style={{ color: isLive ? '#22c55e' : '#888' }}>{lastEventAge != null ? `${formatAge(lastEventAge)}` : '—'}</span></div>
              <div><span className="td-live-meta-label">Role:</span> <span style={{ color: selectedRole?.color || '#888' }}>{selectedRole?.title}</span></div>
              <div><span className="td-live-meta-label">Source:</span> <span style={{ color: '#aab' }}>{selectedSource?.title}</span></div>
            </div>
          </div>

          {/* Signals */}
          <div className="td-live-section">
            <div className="td-live-section-title">Signals</div>
            {(nodeRole === 'send' || nodeRole === 'two_way') && (
              <div className="td-live-signal-group">
                <div className="td-live-signal-label" style={{ color: '#22c55e' }}>Publishing</div>
                <div className="td-live-signal-tags">
                  {(tdChannels || 'bpm, bass, energy').split(',').map((ch, i) => (
                    <span key={i} className="td-live-signal-tag" style={{ borderColor: '#22c55e33', color: '#22c55e' }}>{ch.trim()}</span>
                  ))}
                </div>
              </div>
            )}
            {(nodeRole === 'receive' || nodeRole === 'two_way') && (
              <div className="td-live-signal-group">
                <div className="td-live-signal-label" style={{ color: '#5cc8ff' }}>Listening to</div>
                <div className="td-live-signal-tags">
                  <span className="td-live-signal-tag" style={{ borderColor: '#5cc8ff33', color: '#5cc8ff' }}>lighting.scene</span>
                  <span className="td-live-signal-tag" style={{ borderColor: '#5cc8ff33', color: '#5cc8ff' }}>visual.palette</span>
                  <span className="td-live-signal-tag" style={{ borderColor: '#5cc8ff33', color: '#5cc8ff' }}>prompt.keyword</span>
                </div>
              </div>
            )}
          </div>

          {/* Signal Injection */}
          <div className="td-live-section">
            <div className="td-live-section-title">Inject Signal</div>
            <div className="td-live-inject">
              <div className="td-live-inject-row">
                <input
                  type="text"
                  value={injectField}
                  onChange={e => setInjectField(e.target.value)}
                  placeholder="field"
                  className="td-live-inject-input"
                />
                <input
                  type="text"
                  value={injectValue}
                  onChange={e => setInjectValue(e.target.value)}
                  placeholder="value"
                  className="td-live-inject-input"
                />
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
        </div>
      </div>
    );
  }

  // ════════════ SETUP MODE ════════════
  return (
    <div className="td-connect-guide">

      {/* Progress indicator */}
      <div className="td-progress">
        {STEPS.map((step, i) => {
          const completed = i < stageIndex;
          const current = i === stageIndex;
          return (
            <div key={step.key} className={`td-progress-step ${completed ? 'completed' : current ? 'current' : 'upcoming'}`}>
              <span className="td-progress-marker">
                {completed ? '✓' : current ? '●' : '○'}
              </span>
              <span className="td-progress-label">{step.label}</span>
              {i < STEPS.length - 1 && <span className="td-progress-arrow">→</span>}
            </div>
          );
        })}
      </div>

      {/* ═══ STEP 1: CONNECT ═══ */}
      {setupStage === 'connect' ? (
        <div className="td-section expanded">
          <div className="td-section-header">
            <div className="td-section-num">1</div>
            <div className="td-section-title-group">
              <span className="td-section-title">Connect Your TouchDesigner Node</span>
              <span className="td-section-subtitle">
                Join this node to the Maestra network
              </span>
            </div>
          </div>
          <div className="td-section-body">
            <div className="td-connect-info">
              <div className="td-connect-row">
                <span className="td-connect-label">Server</span>
                <code className="td-connect-value">{serverUrl}</code>
                <button className="td-copy-btn" onClick={() => copyToClipboard(serverUrl, 'server')}>
                  {copiedField === 'server' ? '✓' : 'Copy'}
                </button>
              </div>
              <div className="td-connect-row">
                <span className="td-connect-label">Entity ID</span>
                <code className="td-connect-value td-connect-entity">{entityId}</code>
                <button className="td-copy-btn" onClick={() => copyToClipboard(entityId, 'entity')}>
                  {copiedField === 'entity' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
            {/* Primary connect action */}
            {onConnect && !isConnected && (
              <button
                className="td-action-btn td-action-connect"
                onClick={onConnect}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '.04em',
                  background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.5)',
                  color: '#22c55e',
                  borderRadius: 6,
                  cursor: 'pointer',
                  marginBottom: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Connect Node
              </button>
            )}
            <div className="td-connect-actions">
              <a
                href="https://github.com/kfaist/maestra-fleet-tox/raw/main/touchdesigner/maestra_fleet.tox"
                download target="_blank" rel="noopener noreferrer"
                className="td-action-btn td-action-primary"
              >
                Download TOX
              </a>
              <button className="td-action-btn" onClick={() => copyToClipboard(serverUrl, 'serverUrl')}>
                {copiedField === 'serverUrl' ? '✓ Copied' : 'Copy Server URL'}
              </button>
              <button className="td-action-btn" onClick={() => copyToClipboard(entityId, 'entityId')}>
                {copiedField === 'entityId' ? '✓ Copied' : 'Copy Entity ID'}
              </button>
            </div>
            <div className="td-node-status-hint">
              <div className="td-node-status-dot" style={{
                background: isLive ? '#22c55e' : isConnected ? '#5cc8ff' : '#666',
                boxShadow: isLive ? '0 0 8px #22c55e' : 'none',
              }} />
              <span style={{ color: isLive ? '#22c55e' : isConnected ? '#5cc8ff' : '#888' }}>
                {isLive ? 'Heartbeat live' : isConnected ? 'Connected — waiting for heartbeat' : 'Waiting for node connection...'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        renderCollapsedConnect()
      )}

      {/* ═══ STEP 2: SIGNAL SOURCE ═══ */}
      {setupStage === 'source' ? (
        <div className="td-section expanded">
          <div className="td-section-header">
            <div className="td-section-num">2</div>
            <div className="td-section-title-group">
              <span className="td-section-title">Choose Your Signal Source</span>
              <span className="td-section-subtitle">
                Select how this node sends or receives signals
              </span>
            </div>
          </div>
          <div className="td-section-body">
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

            {/* Config per source type */}
            {signalSource && (
              <div className="td-signal-config">
                {signalSource === 'touchdesigner' && (
                  <>
                    <div className="td-config-field">
                      <label>Operator Path</label>
                      <input type="text" value={tdOpPath} onChange={e => setTdOpPath(e.target.value)} placeholder="/project1/audio_analysis" />
                    </div>
                    <div className="td-config-field">
                      <label>Signal Type</label>
                      <div className="td-config-pills">
                        {(['chop', 'dat', 'json'] as const).map(t => (
                          <button key={t} className={`td-pill ${tdSignalType === t ? 'active' : ''}`} onClick={() => setTdSignalType(t)}>
                            {t === 'chop' ? 'CHOP channels' : t === 'dat' ? 'DAT table' : 'JSON text'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="td-config-field">
                      <label>Channels</label>
                      <input type="text" value={tdChannels} onChange={e => setTdChannels(e.target.value)} placeholder="bass, mid, high" />
                    </div>
                  </>
                )}
                {signalSource === 'json_stream' && (
                  <>
                    <div className="td-config-field">
                      <label>Transport</label>
                      <div className="td-config-pills">
                        {(['udp', 'websocket', 'http'] as const).map(t => (
                          <button key={t} className={`td-pill ${jsonTransport === t ? 'active' : ''}`} onClick={() => setJsonTransport(t)}>{t.toUpperCase()}</button>
                        ))}
                      </div>
                    </div>
                    <div className="td-config-field">
                      <label>Port / URL</label>
                      <input type="text" value={jsonPort} onChange={e => setJsonPort(e.target.value)} placeholder="9000" />
                    </div>
                  </>
                )}
                {signalSource === 'osc' && (
                  <>
                    <div className="td-config-field">
                      <label>OSC Port</label>
                      <input type="text" value={oscPort} onChange={e => setOscPort(e.target.value)} placeholder="8000" />
                    </div>
                    <div className="td-config-field">
                      <label>OSC Address</label>
                      <input type="text" value={oscAddress} onChange={e => setOscAddress(e.target.value)} placeholder="/ableton/bpm" />
                    </div>
                  </>
                )}
                {signalSource === 'audio_reactive' && (
                  <div className="td-config-field">
                    <label>Audio Input</label>
                    <div className="td-config-pills">
                      <button className={`td-pill ${audioInput === 'mic' ? 'active' : ''}`} onClick={() => setAudioInput('mic')}>System mic</button>
                      <button className={`td-pill ${audioInput === 'line' ? 'active' : ''}`} onClick={() => setAudioInput('line')}>Line input</button>
                    </div>
                  </div>
                )}
                {signalSource === 'text' && (
                  <div className="td-config-field"><label>Text signals influence prompts and visuals in real time.</label></div>
                )}
                {signalSource === 'test_signal' && (
                  <div className="td-config-field"><label>Generates sine/random test values. No config needed.</label></div>
                )}

                {/* Confirm button */}
                <button className="td-action-btn td-action-primary" style={{ marginTop: 10 }} onClick={confirmSource}>
                  Continue with {SIGNAL_SOURCES.find(s => s.value === signalSource)?.title}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : sourceConfirmed ? (
        renderCollapsedSource()
      ) : null}

      {/* ═══ STEP 3: NODE ROLE ═══ */}
      {setupStage === 'role' ? (
        <div className="td-section expanded">
          <div className="td-section-header">
            <div className="td-section-num">3</div>
            <div className="td-section-title-group">
              <span className="td-section-title">Node Role</span>
              <span className="td-section-subtitle">
                Choose how this node interacts with the network
              </span>
            </div>
          </div>
          <div className="td-section-body">
            <div className="td-role-grid">
              {ROLES.map(r => (
                <div
                  key={r.value}
                  className={`td-role-card ${nodeRole === r.value ? 'selected' : ''}`}
                  onClick={() => handleRoleChange(r.value)}
                  style={{ '--role-accent': r.color } as React.CSSProperties}
                >
                  <div className="td-role-card-header">
                    <div className="td-role-radio">
                      <div className={`td-role-radio-dot ${nodeRole === r.value ? 'active' : ''}`} />
                    </div>
                    <div className="td-role-card-title">{r.title}</div>
                    <span className="td-role-node-type" style={{ color: r.color }}>{r.nodeType}</span>
                  </div>
                  <div className="td-role-card-desc">{r.desc}</div>
                  <div className="td-role-examples">
                    <div className="td-role-examples-label">Example behaviors</div>
                    {r.examples.map((ex, i) => (
                      <div key={i} className="td-role-example">{ex}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
