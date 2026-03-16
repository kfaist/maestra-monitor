'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Header,
  Explainer,
  TabNav,
  Footer,
  SlotGrid,
  DetailPanel,
  AudioAnalysis,
  ColorPalette,
  ModulationGrid,
  CloudNodesTab,
  ToxReferenceTab,
  UseCases,
  ConnectionPanel,
} from '@/components';
import { FleetSlot, LogEntry, AudioAnalysisData, SlotConnectionInfo } from '@/types';
import { createInitialSlots, SUGGESTIONS } from '@/mock';
import { WSSimulator } from '@/mock/ws-simulator';
import { API_BASE } from '@/mock/gpu-nodes';
import { formatTimestamp } from '@/lib/audio-utils';
import { FRAME_FETCH_INTERVAL } from '@/lib/constants';
import {
  MaestraConnection,
  MaestraConnectionState,
  GALLERY_SERVER_URL,
  generateEntityId,
} from '@/lib/maestra-connection';

export default function Home() {
  // State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsStatus, setWsStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  const [apiStatus, setApiStatus] = useState<'online' | 'offline'>('offline');
  const [slots, setSlots] = useState<FleetSlot[]>(createInitialSlots);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [audioData, setAudioData] = useState<AudioAnalysisData>({
    sub: 65, bass: 82, mid: 45, high: 73, rms: 0.76, bpm: 128,
    drums: 88, stemBass: 70, vocals: 56, melody: 62, keys: 44, other: 38, peak: 94,
  });
  const [connectionInfo, setConnectionInfo] = useState<SlotConnectionInfo | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simulatorRef = useRef<WSSimulator | null>(null);
  const activeNodeUrlRef = useRef<string | null>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Maestra connection instances per slot
  const connectionsRef = useRef<Map<string, MaestraConnection>>(new Map());

  // Logging
  const log = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLogEntries(prev => {
      const entry: LogEntry = { timestamp: formatTimestamp(), message: msg, type };
      const next = [entry, ...prev];
      if (next.length > 30) next.length = 30;
      return next;
    });
  }, []);

  // Sync MaestraConnectionState → SlotConnectionInfo for UI
  const syncConnectionInfo = useCallback((slotId: string, state: MaestraConnectionState) => {
    setConnectionInfo(prev => {
      // Only update if this is the currently selected slot
      if (prev && prev.slotId !== slotId) return prev;
      return {
        serverUrl: state.serverUrl,
        entityId: state.entityId,
        slotId: state.slotId,
        connected: state.status === 'connected',
        status: state.status,
        autoConnect: state.autoConnect,
        autoDiscover: state.autoDiscover,
        port: state.port,
        streamPath: state.streamPath,
        discoveredUrl: state.discoveredUrl,
        errorMessage: state.errorMessage,
      };
    });

    // Also update the slot's connection_status
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return {
        ...s,
        connection_status: state.status === 'connected' ? 'connected'
          : state.status === 'error' ? 'error'
          : state.status === 'connecting' || state.status === 'discovering' ? 'connecting'
          : 'disconnected',
        entity_id: state.entityId || s.entity_id,
        last_heartbeat: state.lastHeartbeat || s.last_heartbeat,
      };
    }));
  }, []);

  // Auto-connect a slot to the gallery Maestra server
  const autoConnectSlot = useCallback((slotId: string) => {
    const slot = slotsRef.current.find(s => s.id === slotId);
    if (!slot) return;

    // Destroy existing connection for this slot
    const existing = connectionsRef.current.get(slotId);
    if (existing) existing.destroy();

    const entityId = slot.entity_id || generateEntityId(slot.label, slot.suggestion?.tag);
    const conn = new MaestraConnection({
      slotId,
      slotLabel: slot.label,
      slotTag: slot.suggestion?.tag,
      entityId,
      serverUrl: GALLERY_SERVER_URL,
      autoConnect: true,
      autoDiscover: true,
    });

    conn.onStateChange((state) => {
      syncConnectionInfo(slotId, state);

      // Log status transitions
      if (state.status === 'discovering') {
        log(`[${slotId}] Discovering Maestra server...`, 'info');
      } else if (state.status === 'connecting') {
        log(`[${slotId}] Connecting to ${state.serverUrl}...`, 'info');
      } else if (state.status === 'connected') {
        log(`[${slotId}] Connected to Maestra as ${state.entityId}`, 'ok');
      } else if (state.status === 'error') {
        log(`[${slotId}] ${state.errorMessage || 'Connection error'}`, 'error');
      }
    });

    connectionsRef.current.set(slotId, conn);

    // Activate the slot
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return {
        ...s,
        active: true,
        entity_id: entityId,
        connection_status: 'connecting',
      };
    }));

    // Show connection info immediately
    const initialState = conn.getState();
    syncConnectionInfo(slotId, initialState);

    // Start the connection flow
    conn.connect();
  }, [log, syncConnectionInfo]);

  // Disconnect a slot
  const disconnectSlot = useCallback((slotId: string) => {
    const conn = connectionsRef.current.get(slotId);
    if (conn) {
      conn.disconnect();
      connectionsRef.current.delete(slotId);
    }

    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return { ...s, connection_status: 'disconnected' };
    }));

    setConnectionInfo(prev => {
      if (prev && prev.slotId === slotId) {
        return { ...prev, connected: false, status: 'disconnected', errorMessage: null };
      }
      return prev;
    });

    log(`[${slotId}] Disconnected from Maestra`, 'warn');
  }, [log]);

  // Update connection config (from Advanced Settings)
  const updateConnectionConfig = useCallback((config: { serverUrl?: string; entityId?: string; port?: number; streamPath?: string }) => {
    if (!connectionInfo) return;
    const slotId = connectionInfo.slotId;
    const conn = connectionsRef.current.get(slotId);

    if (conn) {
      conn.updateConfig(config);
      // Reconnect with new settings
      conn.disconnect();
      conn.connect();
      log(`[${slotId}] Reconnecting with updated settings...`, 'info');
    }
  }, [connectionInfo, log]);

  // Frame fetching
  const fetchFrame = useCallback(async () => {
    const currentSlots = slotsRef.current;
    const slot = currentSlots.find(s => s.id === 'krista1');
    if (!slot) return;

    const endpoint = activeNodeUrlRef.current || `${API_BASE}/video/frame/td`;
    try {
      const res = await fetch(`${endpoint}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setSlots(prev => prev.map(s => {
        if (s.id !== 'krista1') return s;
        if (s.frameUrl && s.frameUrl.startsWith('blob:')) URL.revokeObjectURL(s.frameUrl);
        const now = performance.now();
        const times = [...s._frameTimes, now].filter(t => now - t < 1000);
        let fps = s.fps;
        let smooth = s._fpsSmooth;
        if (times.length >= 2) {
          const span = (times[times.length - 1] - times[0]) / 1000;
          const raw = (times.length - 1) / span;
          smooth = smooth != null ? smooth * 0.6 + raw * 0.4 : raw;
          fps = Math.round(smooth);
        }
        return { ...s, frameUrl: url, fps, _frameTimes: times, _fpsSmooth: smooth };
      }));
    } catch {
      // silent
    }
  }, []);

  // WebSocket connection
  const connectWS = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === 0 || wsRef.current.readyState === 1)) return;

    const WS_URL = API_BASE.replace('https', 'wss') + '/ws';
    log('Connecting to WebSocket...', 'info');
    setWsStatus('connecting');

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('online');
        log('WebSocket connected', 'ok');
      };

      ws.onmessage = (e) => {
        if (e.data instanceof Blob) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'audio_analysis') {
            const { bands, stems, bpm } = msg;
            if (bands || stems || bpm) {
              setAudioData(prev => ({
                ...prev,
                ...(bands ? { sub: bands.sub || 0, bass: bands.bass || 0, mid: bands.mid || 0, high: bands.high || 0 } : {}),
                ...(stems ? { drums: stems.drums || 0, stemBass: stems.bass || 0, melody: stems.melody || 0, vocals: stems.vocals || 0 } : {}),
                ...(bpm ? { bpm } : {}),
              }));
            }
            return;
          }
          if (msg.type === 'heartbeat' || msg.type === 'ping') return;
          log(`WS: ${JSON.stringify(msg).slice(0, 80)}`, 'info');
        } catch {
          // skip non-JSON
        }
      };

      ws.onerror = () => log('WebSocket error', 'error');

      ws.onclose = () => {
        setWsStatus('offline');
        log('WebSocket closed, retrying in 3s...', 'warn');
        if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = setTimeout(connectWS, 3000);
      };
    } catch (err) {
      log('WS connect failed: ' + (err as Error).message, 'error');
    }
  }, [log]);

  // API polling
  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/entities`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setApiStatus('online');
    } catch {
      setApiStatus('offline');
    }
  }, []);

  // Slot selection — also shows connection panel for any selected slot
  const selectSlot = useCallback((id: string) => {
    setSelectedId(id);
    const slot = slotsRef.current.find(s => s.id === id);
    if (!slot) return;

    // Check if we have a MaestraConnection for this slot
    const conn = connectionsRef.current.get(id);
    if (conn) {
      const state = conn.getState();
      syncConnectionInfo(id, state);
    } else if (slot.active && slot.entity_id) {
      // Legacy: slot was active before MaestraConnection was created (e.g., krista1)
      setConnectionInfo({
        serverUrl: GALLERY_SERVER_URL,
        entityId: slot.entity_id,
        slotId: id,
        connected: slot.connection_status === 'connected',
        status: slot.connection_status === 'connected' ? 'connected' : 'disconnected',
        autoConnect: true,
        autoDiscover: true,
        port: 8080,
        streamPath: '/ws',
        discoveredUrl: null,
        errorMessage: null,
      });
    } else {
      // Inactive slot — show connection panel in disconnected state so user can claim it
      setConnectionInfo({
        serverUrl: GALLERY_SERVER_URL,
        entityId: generateEntityId(slot.label, slot.suggestion?.tag),
        slotId: id,
        connected: false,
        status: 'disconnected',
        autoConnect: true,
        autoDiscover: true,
        port: 8080,
        streamPath: '/ws',
        discoveredUrl: null,
        errorMessage: null,
      });
    }
  }, [syncConnectionInfo]);

  // Add slot
  const addSlot = useCallback(() => {
    setSlots(prev => {
      const n = prev.length + 1;
      return [...prev, {
        id: `slot${n}`,
        label: `Slot ${n}`,
        entity_id: null,
        endpoint: null,
        active: false,
        fps: null,
        frameUrl: null,
        cloudNode: false,
        connection_status: 'disconnected',
        last_heartbeat: null,
        active_stream: null,
        state_summary: {},
        suggestion: SUGGESTIONS[(n - 2) % SUGGESTIONS.length],
        _frameTimes: [],
        _fpsSmooth: null,
      }];
    });
  }, []);

  // Reconnect stream
  const reconnectStream = useCallback(() => {
    setSlots(prev => prev.map(s => {
      if (s.id !== 'krista1') return s;
      if (s.frameUrl && s.frameUrl.startsWith('blob:')) URL.revokeObjectURL(s.frameUrl);
      return { ...s, frameUrl: null, fps: null, _frameTimes: [], _fpsSmooth: null };
    }));
    log('Stream reconnect triggered', 'info');
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    setTimeout(() => {
      fetchFrame();
      frameIntervalRef.current = setInterval(fetchFrame, FRAME_FETCH_INTERVAL);
      log('Fetch loop restarted', 'ok');
    }, 400);
  }, [fetchFrame, log]);

  // Cycle to cloud nodes
  const cycleStreamSource = useCallback(() => {
    setActiveTab('scope');
  }, []);

  // Handle auto-connect button click
  const handleAutoConnect = useCallback(() => {
    if (connectionInfo) {
      autoConnectSlot(connectionInfo.slotId);
    }
  }, [connectionInfo, autoConnectSlot]);

  // Handle disconnect button click
  const handleDisconnect = useCallback(() => {
    if (connectionInfo) {
      disconnectSlot(connectionInfo.slotId);
    }
  }, [connectionInfo, disconnectSlot]);

  // Initialize
  useEffect(() => {
    // Start WS simulator for audio data
    simulatorRef.current = new WSSimulator();
    simulatorRef.current.subscribe((event) => {
      if (event.type === 'audio_analysis' && event.data) {
        setAudioData(event.data as unknown as AudioAnalysisData);
      }
      if (event.type === 'entity_connected') {
        setSlots(prev => prev.map(s => {
          if (s.id === 'krista1') {
            return { ...s, connection_status: 'connected', last_heartbeat: Date.now() };
          }
          return s;
        }));
        log(`Entity connected: ${event.entity_id}`, 'ok');
      }
      if (event.type === 'heartbeat') {
        setSlots(prev => prev.map(s => {
          if (s.entity_id === event.entity_id) {
            return { ...s, last_heartbeat: Date.now() };
          }
          return s;
        }));
      }
      if (event.type === 'state_update') {
        log(`State update from ${event.entity_id}: ${JSON.stringify(event.data).slice(0, 60)}`, 'info');
      }
    });
    simulatorRef.current.start();

    // Connect WS
    connectWS();

    // Fetch entities
    fetchEntities();
    const entityInterval = setInterval(fetchEntities, 10000);

    // Start frame fetch
    fetchFrame();
    frameIntervalRef.current = setInterval(fetchFrame, FRAME_FETCH_INTERVAL);

    // Auto-select and auto-connect krista1
    setTimeout(() => {
      selectSlot('krista1');
      // Auto-connect krista1 to the gallery Maestra server
      autoConnectSlot('krista1');
    }, 100);

    return () => {
      simulatorRef.current?.stop();
      if (wsRef.current) wsRef.current.close();
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      clearInterval(entityInterval);
      // Clean up all connections
      connectionsRef.current.forEach(conn => conn.destroy());
      connectionsRef.current.clear();
    };
  }, [connectWS, fetchEntities, fetchFrame, selectSlot, autoConnectSlot, log]);

  const selectedSlot = slots.find(s => s.id === selectedId) || null;

  return (
    <>
      <Header wsStatus={wsStatus} apiStatus={apiStatus} />
      <Explainer />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* DASHBOARD TAB */}
      <div className={`tab-content ${activeTab === 'dashboard' ? 'active' : ''}`}>
        <div className="fleet-layout">
          {/* Left: Slot Grid + Audio + Palette + Modulation */}
          <div className="fleet-panel">
            <SlotGrid
              slots={slots}
              selectedId={selectedId}
              onSelectSlot={selectSlot}
              onAddSlot={addSlot}
            />

            {/* Connection Panel (shown for any selected slot) */}
            <ConnectionPanel
              connectionInfo={connectionInfo}
              onAutoConnect={handleAutoConnect}
              onDisconnect={handleDisconnect}
              onUpdateConfig={updateConnectionConfig}
            />

            {/* Audio Analysis */}
            <AudioAnalysis audioData={audioData} />

            {/* Color Palette */}
            <ColorPalette />

            {/* Audio Reactive Modulation */}
            <ModulationGrid />
          </div>

          {/* Right: Detail Panel */}
          <DetailPanel
            slot={selectedSlot}
            logEntries={logEntries}
            onReconnect={reconnectStream}
            onCycleSource={cycleStreamSource}
          />
        </div>

        {/* Use Cases + Code Block */}
        <UseCases />
      </div>

      {/* CLOUD NODES TAB */}
      <div className={`tab-content ${activeTab === 'scope' ? 'active' : ''}`}>
        <CloudNodesTab />
      </div>

      {/* TOX REFERENCE TAB */}
      <div className={`tab-content ${activeTab === 'tox' ? 'active' : ''}`}>
        <ToxReferenceTab />
      </div>

      <Footer />
    </>
  );
}
