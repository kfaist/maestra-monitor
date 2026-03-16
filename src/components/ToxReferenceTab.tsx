'use client';

import { TOX_CUSTOM_PARAMS, TOX_INTERNAL_OPERATORS } from '@/mock/tox-reference';

export default function ToxReferenceTab() {
  return (
    <div>
      <div className="tox-section">
        <div className="tox-title">Custom Parameters</div>
        <div className="tox-params">
          {TOX_CUSTOM_PARAMS.map(param => (
            <div key={param.title} className="tox-param">
              <div className="tox-param-title">{param.title}</div>
              <div className="tox-param-list">
                {param.items.map((item, i) => (
                  <span key={i}>{item}{i < param.items.length - 1 ? <br /> : null}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="tox-section">
        <div className="tox-title">Internal Operators</div>
        <div className="tox-params-2col">
          {TOX_INTERNAL_OPERATORS.map(param => (
            <div key={param.title} className="tox-param">
              <div className="tox-param-title">{param.title}</div>
              <div className="tox-param-list">
                {param.items.map((item, i) => (
                  <span key={i}>{item}{i < param.items.length - 1 ? <br /> : null}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="tox-section">
        <div className="tox-title">Resources</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a
            href="https://github.com/kfaist/maestra-fleet-tox/raw/main/touchdesigner/maestra_fleet.tox"
            download
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(167,139,250,0.08)', border: '1px solid var(--accent)',
              borderRadius: '4px', padding: '10px 16px', color: 'var(--accent)',
              textDecoration: 'none', fontSize: '11px', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download TOX
          </a>
          <a href="https://github.com/kfaist/maestra-fleet-tox" target="_blank" rel="noopener noreferrer" className="btn">GitHub README</a>
          <a href="https://github.com/kfaist/maestra-fleet-tox/blob/main/docs/SETUP.md" target="_blank" rel="noopener noreferrer" className="btn">Setup Guide</a>
        </div>
      </div>

      {/* Auto-Connect Defaults section */}
      <div className="tox-section">
        <div className="tox-title">Auto-Connect Defaults</div>
        <div className="tox-params">
          <div className="tox-param">
            <div className="tox-param-title">Connection Parameters</div>
            <div className="tox-param-list">
              <span><strong style={{ color: 'var(--accent)' }}>Auto Connect:</strong> true (ON by default)</span><br />
              <span><strong style={{ color: 'var(--accent)' }}>Auto Discover:</strong> true (ON by default)</span><br />
              <span><strong style={{ color: 'var(--accent)' }}>Server URL:</strong> http://192.168.128.115:8080</span><br />
              <span><strong style={{ color: 'var(--accent)' }}>Entity ID:</strong> Auto-generated from slot name</span><br />
              <span><strong style={{ color: 'var(--accent)' }}>Stream Path:</strong> /ws</span>
            </div>
          </div>
          <div className="tox-param">
            <div className="tox-param-title">TOX Custom Parameters</div>
            <div className="tox-param-list">
              <span><strong style={{ color: 'var(--accent)' }}>Serverurl</strong> — Gallery Maestra server address</span><br />
              <span><strong style={{ color: 'var(--accent)' }}>Entityid</strong> — Unique identifier for this node</span><br />
              <span><strong style={{ color: 'var(--accent)' }}>Autoconnect</strong> — Toggle automatic connection on load</span><br />
              <span><strong style={{ color: 'var(--accent)' }}>Autodiscover</strong> — Toggle mDNS/broadcast discovery</span>
            </div>
          </div>
          <div className="tox-param">
            <div className="tox-param-title">Connection Flow</div>
            <div className="tox-param-list">
              <span>1. Attempt auto-discovery (mDNS probe)</span><br />
              <span>2. Fallback to http://192.168.128.115:8080</span><br />
              <span>3. Generate entity ID if not provided</span><br />
              <span>4. Register entity via REST API</span><br />
              <span>5. Start heartbeat loop (5s interval)</span><br />
              <span>6. Advertise streams if available</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px', fontSize: '11px', color: 'var(--text)' }}>
          Artists can drop the TOX into TouchDesigner and it will connect automatically to the gallery Maestra instance — no server URLs or entity IDs needed.
        </div>
      </div>

      <div className="code-block">
        <span className="cmt"># Quick start — auto-connects to gallery Maestra:</span><br />
        <span className="kw">maestra</span> = op(<span className="str">&apos;maestra&apos;</span>).ext.MaestraExt<br />
        <span className="cmt"># Auto-connect is ON by default, no config needed!</span><br />
        <span className="cmt"># Override if needed:</span><br />
        maestra.<span className="fn">SetServerUrl</span>(<span className="str">&apos;http://192.168.128.115:8080&apos;</span>)<br />
        maestra.<span className="fn">SetEntityId</span>(<span className="str">&apos;my_custom_node&apos;</span>)<br />
        <br />
        <span className="cmt"># Normal operations:</span><br />
        maestra.<span className="fn">UpdateState</span>(&#123;<span className="str">&apos;brightness&apos;</span>: <span className="num">50</span>, <span className="str">&apos;scene&apos;</span>: <span className="num">2</span>&#125;)<br />
        maestra.<span className="fn">AdvertiseStream</span>(name=<span className="str">&apos;My NDI&apos;</span>, stream_type=<span className="str">&apos;ndi&apos;</span>)<br />
        streams = maestra.<span className="fn">ListStreams</span>()
      </div>
    </div>
  );
}
