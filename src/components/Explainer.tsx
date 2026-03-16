'use client';

export default function Explainer() {
  return (
    <div className="explainer">
      <span style={{ color: '#ff8c42', fontWeight: 600 }}>Maestra Live Ops Dashboard</span> is a monitoring and control interface for distributed installations built on{' '}
      <span style={{ color: 'var(--accent)', textShadow: '0 0 8px rgba(0,212,255,0.4)' }}>Jordan Snyder's Maestra</span> framework. Each connected node appears as a slot with real-time status, video output, audio levels, and prompt state. Operators can speak directly into the shared prompt space, blending their input with visitor speech.
      <br /><br />
      <span style={{ color: 'var(--accent)', textShadow: '0 0 8px rgba(0,212,255,0.4)' }}>Maestra</span> is the underlying coordination layer, developed during{' '}
      <span style={{ color: 'var(--accent)' }}>Jordan Snyder</span>'s time as VP of Platform at{' '}
      <span style={{ color: 'var(--accent)' }}>Meow Wolf</span>, where it ran across all three permanent installations. Imagine{' '}
      <span style={{ color: 'var(--active)', textShadow: '0 0 8px rgba(0,255,136,0.4)' }}>four projectors, two audio zones, and three sensor stations</span>{' '}
      across a venue connected through the Maestra network. Devices register themselves, sync shared state, advertise streams (NDI, Syphon, Spout), and receive commands via REST, WebSocket, or MQTT. Each device runs a lightweight client — TouchDesigner, Max/MSP, Arduino, or a browser — that talks to the Maestra server.
      <br /><br />
      <em style={{ color: 'var(--text-dim)' }}>The TouchDesigner TOX and Maestra Live Ops Dashboard are released under AGPL-3.0, with dual licensing available for commercial deployments.</em>
      <br /><br />
      <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
        Artist / Technical: <a href="mailto:kristabluedoor@gmail.com" style={{ color: 'var(--accent)', textDecoration: 'none' }}>kristabluedoor@gmail.com</a>
        &nbsp;&middot;&nbsp;
        Curatorial / Institutional: <a href="mailto:chaoscontemporarycraft@gmail.com" style={{ color: 'var(--accent)', textDecoration: 'none' }}>chaoscontemporarycraft@gmail.com</a>
      </span>
    </div>
  );
}
