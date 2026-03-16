'use client';

import { useState, useCallback, useRef } from 'react';
import { GpuNode } from '@/types';
import { createInitialGpuNodes, API_BASE } from '@/mock/gpu-nodes';

export default function CloudNodesTab() {
  const [nodes, setNodes] = useState<GpuNode[]>(createInitialGpuNodes);
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const updateNode = useCallback((id: string, updates: Partial<GpuNode>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  const startPreview = useCallback((id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node?.url) return;
    updateNode(id, { previewing: true });

    const fetchNodeFrame = async () => {
      const endpoint = node.url.startsWith('http') ? node.url : API_BASE + node.url;
      try {
        const t0 = performance.now();
        const res = await fetch(`${endpoint}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const lat = Math.round(performance.now() - t0);
        const url = URL.createObjectURL(blob);
        updateNode(id, { frameUrl: url, lat, fps: Math.round(1000 / lat) });
      } catch { /* silent */ }
    };

    fetchNodeFrame();
    const interval = setInterval(fetchNodeFrame, 80);
    intervalsRef.current.set(id, interval);
  }, [nodes, updateNode]);

  const stopPreview = useCallback((id: string) => {
    const interval = intervalsRef.current.get(id);
    if (interval) { clearInterval(interval); intervalsRef.current.delete(id); }
    updateNode(id, { previewing: false });
  }, [updateNode]);

  const activateNode = useCallback((id: string) => {
    setNodes(prev => prev.map(n => ({ ...n, active: n.id === id })));
  }, []);

  const addNode = useCallback(() => {
    const n = nodes.length + 1;
    setNodes(prev => [...prev, {
      id: `gpu${n}`, label: `Node ${n}`, url: '', previewing: false, active: false,
      fps: null, lat: null, frameUrl: null, _interval: null, _frameTimes: [],
    }]);
  }, [nodes.length]);

  const removeNode = useCallback((index: number) => {
    const node = nodes[index];
    if (node) {
      const interval = intervalsRef.current.get(node.id);
      if (interval) clearInterval(interval);
    }
    setNodes(prev => prev.filter((_, i) => i !== index));
  }, [nodes]);

  const activeNode = nodes.find(n => n.active);

  return (
    <div>
      {/* Intro callout */}
      <div style={{ margin: 0, padding: '20px 28px', background: 'rgba(0,212,255,0.04)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
          // Cloud Nodes &mdash; Scope / Daydream API
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.8, maxWidth: '820px' }}>
          If you&apos;re using <strong style={{ color: 'var(--accent)' }}>Scope</strong> or the <strong style={{ color: 'var(--accent)' }}>Daydream API</strong> for your project, use this tab to test and select your connection before show day.
          Decentralized GPU routing can vary &mdash; this lets you <em style={{ color: 'var(--active)', fontStyle: 'normal' }}>audition nodes day-of</em> and bring the best ones into the main dashboard.
        </div>
      </div>

      {/* GPU Node Selector */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>// GPU Node Selector</div>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>Preview each node &mdash; select the best one to lock in as your active source</div>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '16px', maxWidth: '680px' }}>
          With decentralized GPU, once you commit to a node you&apos;re locked to that instance. Preview all available nodes here before committing &mdash; check stream quality, latency, and FPS. Hit <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Set Active</span> to route that node&apos;s output to your main Krista1 slot.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '32px' }}>
          {nodes.map((node, index) => (
            <div key={node.id} className={`gpu-node-card ${node.active ? 'active-node' : ''} ${node.previewing ? 'previewing' : ''}`}>
              <div className="gpu-node-video">
                {node.frameUrl ? (
                  <img src={node.frameUrl} alt="" />
                ) : (
                  <div className="gpu-node-placeholder">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="1">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                    </svg>
                    <p>{node.url ? 'Press Preview' : 'Enter URL below'}</p>
                  </div>
                )}
                <div className="gpu-node-stats">
                  {node.fps != null && <span className="gpu-node-fps">{node.fps} fps</span>}
                  {node.lat != null && <span className="gpu-node-lat">{node.lat}ms</span>}
                </div>
                {node.active && (
                  <div style={{ position: 'absolute', top: '6px', left: '6px', fontFamily: 'var(--font-display)', fontSize: '8px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#000', background: 'var(--active)', padding: '2px 6px', borderRadius: '2px' }}>ACTIVE</div>
                )}
              </div>
              <div className="gpu-node-footer">
                <div className="gpu-node-url-row">
                  <span className="gpu-node-label">{node.label}</span>
                  <input
                    className="gpu-node-url"
                    type="text"
                    placeholder="https://host/video/frame"
                    value={node.url}
                    onChange={(e) => updateNode(node.id, { url: e.target.value.trim() })}
                  />
                </div>
                <div className="gpu-node-btn-row">
                  <button
                    className={`gpu-btn ${node.previewing ? 'gpu-btn-stop' : 'gpu-btn-preview'}`}
                    onClick={() => node.previewing ? stopPreview(node.id) : startPreview(node.id)}
                  >
                    {node.previewing ? '■ Stop' : '▶ Preview'}
                  </button>
                  <button
                    className={`gpu-btn gpu-btn-activate ${node.active ? 'is-active' : ''}`}
                    onClick={() => activateNode(node.id)}
                  >
                    {node.active ? '✔ Active' : 'Set Active'}
                  </button>
                  <button
                    className="gpu-btn gpu-btn-stop"
                    onClick={() => removeNode(index)}
                    style={{ marginLeft: 'auto', fontSize: '7px', padding: '4px 7px' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '28px' }}>
          <button onClick={addNode} className="btn">+ Add Node</button>
          <button onClick={() => nodes.filter(n => n.url).forEach(n => { if (!n.previewing) startPreview(n.id); })} className="btn primary">
            &#x25B6; Preview All
          </button>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.06em', marginLeft: '8px' }}>
            {activeNode ? `Active: ${activeNode.label} → ${activeNode.url || 'no URL'}` : ''}
          </span>
        </div>
      </div>

      {/* Architecture Section */}
      <div className="arch-section">
        <div className="arch-title">How Scope Fits In</div>
        <div className="arch-subtitle">
          Scope runs on a single machine — it takes a video source and transforms it in real-time using AI diffusion models. Maestra runs across machines — it coordinates state and streams between devices. They solve different problems, and together they let you run coordinated AI-generated visuals across an entire venue.
        </div>
        <div className="arch-diagram">
          <pre>{`                       `}<span className="node-maestra">MAESTRA SERVER</span>{`
        state sync  stream registry  heartbeat monitor
             `}<span className="node-proto">REST API    NATS    MQTT    WebSocket</span>{`

 `}<span className="node-td">MACHINE A</span>{`              `}<span className="node-td">MACHINE B</span>{`              `}<span className="node-td">MACHINE C</span>{`

  `}<span className="node-scope">Scope</span>{`                  `}<span className="node-scope">Scope</span>{`                  `}<span className="node-td">TouchDesigner</span>{`
  `}<span className="dim">(AI diffusion)</span>{`         `}<span className="dim">(AI diffusion)</span>{`         `}<span className="dim">(generative)</span>{`
      `}<span className="node-stream">NDI out</span>{`                    `}<span className="node-stream">NDI out</span>{`                    `}<span className="node-stream">NDI out</span>{`

  `}<span className="node-td">TouchDesigner</span>{`         `}<span className="node-td">TouchDesigner</span>{`         `}<span className="dim">projector out</span>{`
  + `}<span className="node-maestra">Maestra TOX</span>{`         + `}<span className="node-maestra">Maestra TOX</span>{`         + `}<span className="node-maestra">Maestra TOX</span>{`
  `}<span className="dim">projector out</span>{`          `}<span className="dim">projector out</span></pre>
        </div>
        <div className="arch-cards">
          <div className="arch-card">
            <div className="arch-card-num">01</div>
            <div className="arch-card-title">Scope Generates Locally</div>
            <div className="arch-card-desc">Each machine runs Scope with its own GPU. Camera or media in, AI-transformed video out. Scope outputs via NDI — TouchDesigner picks it up with an <code>NDI In TOP</code>. Scope doesn&apos;t know about other machines.</div>
          </div>
          <div className="arch-card">
            <div className="arch-card-num">02</div>
            <div className="arch-card-title">Maestra Coordinates the Fleet</div>
            <div className="arch-card-desc">The TOX in each TD instance registers with the Maestra server. When you push a state change — <code>scene: 3</code>, <code>color: [0.8, 0.2, 1.0]</code> — every connected machine receives it.</div>
          </div>
          <div className="arch-card">
            <div className="arch-card-num">03</div>
            <div className="arch-card-title">Streams Stay Discoverable</div>
            <div className="arch-card-desc">Each machine advertises its NDI output through Maestra&apos;s stream registry. A monitor station can discover all streams on the network — no manual IP hunting. Heartbeats tell you instantly if a machine drops.</div>
          </div>
        </div>
      </div>

      {/* Code Block */}
      <div className="code-block">
        <span className="cmt"># Example: Maestra state change triggers Scope prompt update via OSC</span><br /><br />
        <span className="kw">def</span> <span className="fn">onValueChange</span>(par, prev):<br />
        &nbsp;&nbsp;&nbsp;&nbsp;<span className="kw">if</span> par.name == <span className="str">&apos;Scene&apos;</span>:<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;scene = par.eval()<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;prompts = &#123;<span className="num">0</span>: <span className="str">&apos;ethereal crystal cave, bioluminescent&apos;</span>, <span className="num">1</span>: <span className="str">&apos;baroque gold cathedral, dramatic lighting&apos;</span>&#125;<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;op(<span className="str">&apos;scope_osc_out&apos;</span>).sendOSC(<span className="str">&apos;/scope/prompt&apos;</span>, prompts.get(scene, <span className="str">&apos;&apos;</span>))
      </div>
    </div>
  );
}
