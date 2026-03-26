'use client';

import { TOX_CUSTOM_PARAMS, TOX_INTERNAL_OPERATORS } from '@/mock/tox-reference';

export default function ToxReferenceTab() {
  return (
    <div>
      {/* ── QUICKSTART — build_maestra_tox.py ── */}
      <div className="tox-section" style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.18)', marginBottom: 0 }}>
        <div className="tox-title" style={{ color: 'var(--active)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>Quick Start — Auto-Setup Script</span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 400 }}>v2 · Jordan Snyder</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.8, marginBottom: 14 }}>
          Drop <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>build_maestra_tox.py</code> into your project
          and run it once. It creates <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>/project1/maestra</code>,
          registers your entity, and pushes your <strong style={{ color: 'var(--accent)' }}>TOE name + available TOPs</strong> to the Monitor
          so the slot wizard can auto-name and show a TOP dropdown.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Option A — Text DAT (Recommended)</div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.7 }}>
            <span style={{ color: 'var(--text-dim)', opacity: 0.5 }}># In TouchDesigner Textport (Alt+P / Opt+P):</span><br />
            <span style={{ color: 'var(--accent)' }}>exec</span>(<span style={{ color: 'var(--active)' }}>open</span>(<span style={{ color: '#fbbf24' }}>&apos;/path/to/build_maestra_tox.py&apos;</span>).<span style={{ color: 'var(--active)' }}>read</span>())<br /><br />
            <span style={{ color: 'var(--text-dim)', opacity: 0.5 }}># Or create a Text DAT, paste the script, right-click → Run Script</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2, marginTop: 8 }}>What it publishes to your entity state</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              { key: 'toe_name', desc: 'your .toe filename → auto-names the slot' },
              { key: 'tops', desc: 'array of TOP paths → wizard dropdown' },
              { key: 'server', desc: 'which server connected' },
              { key: 'active', desc: 'true when alive' },
              { key: 'chops', desc: 'array of CHOP paths available' },
            ].map(({ key, desc }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', padding: '4px 8px', fontSize: 9 }}>
                <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{key}</code>
                <span style={{ color: 'var(--text-dim)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href="/build_maestra_tox.py"
            download="build_maestra_tox.py"
            className="btn primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 11, fontWeight: 700 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download build_maestra_tox.py
          </a>
        </div>

        <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.2)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: 8 }}>Manual Filepath Mode</div>
          <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.8 }}>
            No script? In the Monitor wizard reference step, type any TD operator path directly:<br />
            <code style={{ color: '#a78bfa', fontFamily: 'var(--font-mono)', fontSize: 10 }}>project1/out1</code>
            <span style={{ color: 'var(--text-dim)', margin: '0 6px' }}>or</span>
            <code style={{ color: '#a78bfa', fontFamily: 'var(--font-mono)', fontSize: 10 }}>project1/audio/rms</code>
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 6 }}>
            The path is stored on the slot and shown in the routing panel. Works across machines as long as your TD project uses the same internal structure.
          </div>
        </div>
      </div>

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
