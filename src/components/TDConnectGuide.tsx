'use client';

import { useState, useCallback, useEffect } from 'react';
import { FleetSlot, formatAge } from '@/types';
import { MAESTRA_API_URL } from '@/lib/maestra-connection';
import MaestraStatusPanel from './MaestraStatusPanel';

interface TDConnectGuideProps {
  slot: FleetSlot;
  onRoleChange?: (role: 'receive' | 'send' | 'two_way') => void;
  onSignalSourceChange?: (source: SignalSource) => void;
}

type SignalSource = 'touchdesigner' | 'json_stream' | 'osc' | 'audio_reactive' | 'text' | 'test_signal';
type NodeRole = 'receive' | 'send' | 'two_way';
type GuideSection = 'connect' | 'signal' | 'role' | 'advanced';

/** Generate a clean entity name from slot */
function slotEntityName(slot: FleetSlot): string {
  if (slot.entity_id) return slot.entity_id;
  const clean = slot.label.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^_|_$/g, '');
  return clean || slot.id.replace('slot_', '');
}

const SIGNAL_SOURCES: { value: SignalSource; title: string; desc: string; icon: string }[] = [
  { value: 'touchdesigner', title: 'TouchDesigner', desc: 'Use CHOP or DAT operators from your TD project.', icon: '◆' },
  { value: 'json_stream', title: 'JSON Stream', desc: 'Receive structured data from external tools.', icon: '{ }' },
  { value: 'osc', title: 'OSC / Ableton', desc: 'Send or receive OSC messages from audio tools.', icon: '~' },
  { value: 'audio_reactive', title: 'Audio Reactive', desc: 'Analyze incoming audio for BPM and frequency bands.', icon: '♫' },
  { value: 'text', title: 'Text / Lyrics', desc: 'Send text or keywords to influence prompts or visuals.', icon: 'A' },
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

export default function TDConnectGuide({ slot, onRoleChange, onSignalSourceChange }: TDConnectGuideProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [signalSource, setSignalSource] = useState<SignalSource>('touchdesigner');
  const [nodeRole, setNodeRole] = useState<NodeRole>('receive');
  const [expandedSection, setExpandedSection] = useState<GuideSection | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [prevLive, setPrevLive] = useState(false);

  // TD-specific config
  const [tdOpPath, setTdOpPath] = useState('/project1/audio_analysis');
  const [tdSignalType, setTdSignalType] = useState<'chop' | 'dat' | 'json'>('chop');
  const [tdChannels, setTdChannels] = useState('bass, mid, high');

  // JSON stream config
  const [jsonTransport, setJsonTransport] = useState<'udp' | 'websocket' | 'http'>('websocket');
  const [jsonPort, setJsonPort] = useState('9000');

  // OSC config
  const [oscPort, setOscPort] = useState('8000');
  const [oscAddress, setOscAddress] = useState('/ableton/bpm');

  // Audio reactive config
  const [audioInput, setAudioInput] = useState<'mic' | 'line'>('mic');

  const entityId = slotEntityName(slot);
  const serverUrl = MAESTRA_API_URL;
  const isLive = slot.maestraStatus?.heartbeat === 'live';
  const isConnected = slot.maestraStatus?.server === 'connected' && slot.maestraStatus?.entity === 'registered';
  const hasStream = slot.maestraStatus?.stream === 'live';

  // Celebration: show when connection goes from not-live → live
  useEffect(() => {
    if (isLive && !prevLive) {
      setShowCelebration(true);
      const t = setTimeout(() => setShowCelebration(false), 5000);
      setPrevLive(true);
      return () => clearTimeout(t);
    }
    if (!isLive) setPrevLive(false);
  }, [isLive, prevLive]);

  // Last event age for celebration
  const lastEventAge = slot.maestraStatus?.lastHeartbeatAt
    ? Math.max(0, Date.now() - slot.maestraStatus.lastHeartbeatAt)
    : null;

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }, []);

  const toggleSection = useCallback((section: GuideSection) => {
    setExpandedSection(prev => prev === section ? null : section);
  }, []);

  const handleRoleChange = useCallback((role: NodeRole) => {
    setNodeRole(role);
    onRoleChange?.(role);
  }, [onRoleChange]);

  const handleSignalSourceChange = useCallback((source: SignalSource) => {
    setSignalSource(source);
    onSignalSourceChange?.(source);
  }, [onSignalSourceChange]);

  return (
    <div className="td-connect-guide">

      {/* ═══════ CELEBRATION STATE ═══════ */}
      {showCelebration && (
        <div className="td-celebration">
          <div className="td-celebration-dot" />
          <div className="td-celebration-content">
            <div className="td-celebration-title">Connected to Maestra</div>
            <div className="td-celebration-detail">
              Node: <strong>{entityId}</strong>
              {' '}&middot; Heartbeat: <span style={{ color: '#22c55e' }}>Live</span>
              {lastEventAge != null && (
                <> &middot; Last event: <span style={{ color: '#5cc8ff' }}>{formatAge(lastEventAge)} ago</span></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SECTION 1: CONNECT THIS NODE ═══════ */}
      <div className={`td-section ${expandedSection === 'connect' || !isConnected ? 'expanded' : ''}`}>
        <div className="td-section-header" onClick={() => isConnected && toggleSection('connect')}>
          <div className="td-section-num">1</div>
          <div className="td-section-title-group">
            <span className="td-section-title">Connect Your TouchDesigner Node</span>
            <span className="td-section-subtitle">
              {isLive
                ? 'Connected and live'
                : isConnected
                  ? 'Connected — waiting for heartbeat'
                  : 'Join this node to the Maestra network so it can share signals with other systems in the show'}
            </span>
          </div>
          {isConnected && (
            <div className={`td-section-status ${isLive ? 'live' : 'connected'}`}>
              <div className="td-section-status-dot" />
              {isLive ? 'LIVE' : 'OK'}
            </div>
          )}
        </div>

        {(expandedSection === 'connect' || !isConnected) && (
          <div className="td-section-body">
            {/* Connection info */}
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

            {/* Action buttons */}
            <div className="td-connect-actions">
              <a
                href="https://github.com/kfaist/maestra-fleet-tox/raw/main/touchdesigner/maestra_fleet.tox"
                download
                target="_blank"
                rel="noopener noreferrer"
                className="td-action-btn td-action-primary"
              >
                Download TouchDesigner Connector
              </a>
              <button className="td-action-btn" onClick={() => copyToClipboard(serverUrl, 'serverUrl')}>
                {copiedField === 'serverUrl' ? '✓ Copied' : 'Copy Server URL'}
              </button>
              <button className="td-action-btn" onClick={() => copyToClipboard(entityId, 'entityId')}>
                {copiedField === 'entityId' ? '✓ Copied' : 'Copy Entity ID'}
              </button>
            </div>

            {/* Instructions */}
            <div className="td-steps">
              <div className="td-step"><span className="td-step-n">1</span> Download the TouchDesigner connector (.tox)</div>
              <div className="td-step"><span className="td-step-n">2</span> Drag it into your TouchDesigner project</div>
              <div className="td-step"><span className="td-step-n">3</span> Paste the Server URL and Entity ID into the connector parameters</div>
              <div className="td-step"><span className="td-step-n">4</span> Click <strong>Connect</strong></div>
            </div>

            {/* Expected result */}
            <div className="td-expected">
              <div className="td-expected-label">When your node connects, this slot will show:</div>
              <div className="td-expected-items">
                <span>Live heartbeat</span>
                <span>State updates</span>
                <span>Stream preview (if available)</span>
              </div>
            </div>

            {/* Node Status — embedded 5-layer status panel */}
            {slot.maestraStatus && (
              <div className="td-node-status">
                <div className="td-node-status-title">Node Status</div>
                <MaestraStatusPanel status={slot.maestraStatus} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════ SECTION 2: SIGNAL SOURCE ═══════ */}
      {isConnected && (
        <div className={`td-section ${expandedSection === 'signal' ? 'expanded' : ''}`}>
          <div className="td-section-header" onClick={() => toggleSection('signal')}>
            <div className="td-section-num">2</div>
            <div className="td-section-title-group">
              <span className="td-section-title">Choose Your Signal Source</span>
              <span className="td-section-subtitle">
                Select how this node sends or receives signals inside the Maestra network
              </span>
            </div>
            <div className="td-section-chevron">{expandedSection === 'signal' ? '▾' : '▸'}</div>
          </div>

          {expandedSection === 'signal' && (
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

              {/* Config panel per source type */}
              <div className="td-signal-config">
                {signalSource === 'touchdesigner' && (
                  <>
                    <div className="td-config-section-label">Signal Interface</div>
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
                      <label>Channels / Fields</label>
                      <input type="text" value={tdChannels} onChange={e => setTdChannels(e.target.value)} placeholder="bass, mid, high" />
                    </div>
                    {/* Live signal preview placeholder */}
                    <div className="td-preview-area">
                      <div className="td-preview-label">Preview</div>
                      <div className="td-preview-content">
                        {hasStream
                          ? <span style={{ color: '#22c55e' }}>Live signal preview active</span>
                          : <span style={{ color: '#666' }}>Live signal preview appears here when streaming</span>
                        }
                      </div>
                    </div>
                  </>
                )}

                {signalSource === 'json_stream' && (
                  <>
                    <div className="td-config-field">
                      <label>Transport</label>
                      <div className="td-config-pills">
                        {(['udp', 'websocket', 'http'] as const).map(t => (
                          <button key={t} className={`td-pill ${jsonTransport === t ? 'active' : ''}`} onClick={() => setJsonTransport(t)}>
                            {t.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="td-config-field">
                      <label>Port / URL</label>
                      <input type="text" value={jsonPort} onChange={e => setJsonPort(e.target.value)} placeholder="9000" />
                    </div>
                    <div className="td-config-field">
                      <label>Example JSON</label>
                      <pre className="td-code-block">{`{
  "bpm": 128,
  "bass": 0.7,
  "intensity": 0.45
}`}</pre>
                    </div>
                    <div className="td-config-field">
                      <label>Field Mapping</label>
                      <div className="td-field-mapping">
                        <div className="td-field-map-row">
                          <code>bpm</code> <span className="td-field-arrow">→</span> <span>animation speed</span>
                        </div>
                        <div className="td-field-map-row">
                          <code>bass</code> <span className="td-field-arrow">→</span> <span>shader intensity</span>
                        </div>
                        <div className="td-field-map-row">
                          <code>intensity</code> <span className="td-field-arrow">→</span> <span>global brightness</span>
                        </div>
                      </div>
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
                    <div className="td-config-field">
                      <label>Example</label>
                      <pre className="td-code-block">{`/ableton/bpm
/ableton/kick`}</pre>
                    </div>
                  </>
                )}

                {signalSource === 'audio_reactive' && (
                  <>
                    <div className="td-config-field">
                      <label>Audio Input</label>
                      <div className="td-config-pills">
                        <button className={`td-pill ${audioInput === 'mic' ? 'active' : ''}`} onClick={() => setAudioInput('mic')}>System mic</button>
                        <button className={`td-pill ${audioInput === 'line' ? 'active' : ''}`} onClick={() => setAudioInput('line')}>Line input</button>
                      </div>
                    </div>
                    <div className="td-config-field">
                      <label>Analysis</label>
                      <div className="td-expected-items">
                        <span>BPM detection</span>
                        <span>Frequency bands</span>
                      </div>
                    </div>
                    <div className="td-config-field">
                      <label>Outputs</label>
                      <div className="td-expected-items">
                        <span>bass</span><span>mid</span><span>high</span><span>energy</span>
                      </div>
                    </div>
                  </>
                )}

                {signalSource === 'text' && (
                  <div className="td-config-field">
                    <label>Text signals influence prompts and visuals in real time. Type or paste lyrics, keywords, or scene descriptions.</label>
                  </div>
                )}

                {signalSource === 'test_signal' && (
                  <div className="td-config-field">
                    <label>Generates sine/random test values for debugging. No configuration needed.</label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ SECTION 3: NODE ROLE ═══════ */}
      {isConnected && (
        <div className={`td-section ${expandedSection === 'role' ? 'expanded' : ''}`}>
          <div className="td-section-header" onClick={() => toggleSection('role')}>
            <div className="td-section-num">3</div>
            <div className="td-section-title-group">
              <span className="td-section-title">Node Role</span>
              <span className="td-section-subtitle">
                Choose how this node interacts with the Maestra system
              </span>
            </div>
            <div className="td-section-chevron">{expandedSection === 'role' ? '▾' : '▸'}</div>
          </div>

          {expandedSection === 'role' && (
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
          )}
        </div>
      )}

      {/* ═══════ SECTION 4: ADVANCED (collapsed by default) ═══════ */}
      {isConnected && (
        <div className="td-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
          <span>{showAdvanced ? '▾' : '▸'} Advanced Settings</span>
        </div>
      )}

      {showAdvanced && isConnected && (
        <div className="td-section expanded">
          <div className="td-section-body">
            <div className="td-config-field">
              <label>Manual Server URL</label>
              <input type="text" defaultValue={serverUrl} placeholder="https://..." />
            </div>
            <div className="td-config-field">
              <label>Custom Entity ID</label>
              <input type="text" defaultValue={entityId} placeholder="my_td_node" />
            </div>
            <div className="td-config-field">
              <label>Transport Mode</label>
              <div className="td-config-pills">
                <button className="td-pill active">WebSocket</button>
                <button className="td-pill">MQTT</button>
                <button className="td-pill">HTTP</button>
              </div>
            </div>
            <div className="td-config-field">
              <label>Reconnect Behavior</label>
              <div className="td-config-pills">
                <button className="td-pill active">Auto reconnect</button>
                <button className="td-pill">Manual reconnect</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
