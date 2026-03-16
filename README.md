# Maestra Monitor

Live monitoring and control interface for distributed installations built on [Jordan Snyder's Maestra](https://github.com/kfaist/maestra-fleet-tox) framework.

## What It Does

Maestra Monitor is a dark, operator-console-style dashboard for coordinating distributed creative installations. Each connected node (TouchDesigner, Max/MSP, Arduino, browser) appears as a **slot** with real-time status, video output, audio levels, and prompt state.

### Dashboard Sections

- **Fleet Slots** — Grid of connected entities with live video preview, FPS, and connection status
- **Audio Analysis** — Frequency bands, stem separation, and live BPM/RMS metrics with animated visualizers
- **Color Palette** — Pudding keycap-style color selector with HSV controls
- **Audio Reactive Modulation** — Map audio sources to visual parameters (motion, material, optical, geometry)
- **Slot Inspector** — Detailed view of selected slot with stream info and controls
- **Transcription** — Speech-to-text with noun extraction and live prompt injection
- **Base Prompt Injection** — Operator prompt blending with visitor speech
- **WebSocket Log** — Real-time event feed
- **Cloud Nodes / GPU Selector** — Preview and lock decentralized GPU rendering nodes (Scope/Daydream)
- **TOX Reference** — TouchDesigner component documentation

## How to Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE` | `https://maestra-backend-v2-production.up.railway.app` | Maestra backend API URL |
| `PORT` | `3000` | Server port (Railway sets this automatically) |

## Railway Deployment

This project deploys on [Railway](https://railway.app) with zero configuration.

1. Connect your GitHub repository to Railway
2. Railway auto-detects Next.js and runs `npm run build`
3. The standalone output mode keeps the deployment lightweight
4. The `start` script respects Railway's `PORT` environment variable

### Build Configuration

- **Build Command**: `npm run build`
- **Start Command**: `npm run start`
- **Output**: Standalone mode (`next.config.ts` → `output: 'standalone'`)

## How the Slot System Works

1. **Slots** represent positions in the installation grid
2. Each slot can be claimed by an **entity** (a device running a Maestra client)
3. Active slots show live video frames fetched from the backend
4. Slot state tracks: `entity_id`, `connection_status`, `last_heartbeat`, `active_stream`, `state_summary`
5. The **Connection Panel** appears when selecting an active slot, showing server URL and entity ID

### Slot Connection Flow

When a user joins or claims a slot:
1. Dashboard shows a Connection Panel with server details
2. User can copy connection info or download the Maestra TOX
3. The TOX connects to the Maestra server and registers as an entity
4. The entity appears in the fleet grid with live video and status

## How TouchDesigner Connects

A TouchDesigner project connects to Maestra through the **Maestra TOX**:

1. Drop `maestra_fleet.tox` into your TD project
2. Set **Entity ID** and **Server URL** in the custom parameters
3. Call `maestra.Connect()` — the TOX registers with the server
4. Push state with `maestra.UpdateState({...})`
5. Advertise streams with `maestra.AdvertiseStream(...)`
6. Other entities receive state updates via WebSocket

The TOX handles:
- Auto-reconnection
- Heartbeat keepalive
- State push/pull with debounce
- Stream registration and discovery
- OSC, WebSocket, and MQTT gateways

## What is Mocked vs Real

| Feature | Status |
|---------|--------|
| Video frame fetching | **Real** — fetches JPEG frames from the Maestra backend |
| WebSocket connection | **Real** — connects to `wss://` endpoint |
| API entity polling | **Real** — polls `/entities` endpoint |
| Audio analysis simulation | **Mock** — simulated beat-synced data when no real audio input |
| Transcription | **Real** — uses Web Speech API (Chrome only) |
| GPU node previewing | **Real** — fetches frames from user-specified endpoints |
| Audio reactive modulation | **Mock** — UI controls ready, wiring to TD state updates prepared |

## Project Structure

```
src/
├── app/              # Next.js app router
│   ├── layout.tsx    # Root layout with metadata
│   ├── page.tsx      # Main dashboard page (orchestration)
│   └── globals.css   # Complete dark-theme CSS
├── components/       # React UI components
│   ├── Header.tsx
│   ├── Explainer.tsx
│   ├── TabNav.tsx
│   ├── SlotGrid.tsx
│   ├── DetailPanel.tsx
│   ├── SignalPanel.tsx
│   ├── ConnectionPanel.tsx
│   ├── AudioAnalysis.tsx
│   ├── ColorPalette.tsx
│   ├── ModulationGrid.tsx
│   ├── CloudNodesTab.tsx
│   ├── ToxReferenceTab.tsx
│   ├── UseCases.tsx
│   ├── WSLog.tsx
│   ├── Footer.tsx
│   └── index.ts
├── lib/              # Utility functions
│   ├── constants.ts
│   ├── audio-utils.ts
│   ├── frame-fetcher.ts
│   └── index.ts
├── types/            # TypeScript type definitions
│   ├── maestra.ts
│   └── index.ts
└── mock/             # Mock data and simulation
    ├── suggestions.ts
    ├── slots.ts
    ├── gpu-nodes.ts
    ├── modulation.ts
    ├── tox-reference.ts
    ├── ws-simulator.ts
    └── index.ts
```

## Design Principles

- **Dark operator-console aesthetic** — `#080b0f` background, cyan/purple accents
- **Compact technical panels** with monospaced labels
- **Cards for slots** with real-time status indicators
- **Clear section separators** using subtle borders
- **Space Mono** for display text, **JetBrains Mono** for technical data
- Not a generic SaaS look — feels like a technical monitoring system

## License

AGPL-3.0. Dual licensing available for commercial deployments.
