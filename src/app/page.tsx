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
  JoinModal,
} from '@/components';
import { JoinNodeData } from '@/components/JoinModal';
import { FleetSlot, LogEntry, EventEntry, AudioAnalysisData, SlotConnectionInfo } from '@/types';
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

const LS_KEY = 'maestra_connected_slots';

export default function Home() {
  // State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsStatus, setWsStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  const [apiStatus, setApiStatus] = useState<'online' | 'offline'>('offline');
  const [slots, setSlots] = useState<FleetSlot[]>(createInitialSlots);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [eventEntries, setEventEntries] = useState<EventEntry[]>([]);
  const [audioData, setAudioData] = useState<AudioAnalysisData>({
    sub: 65, bass: 82, mid: 45, high: 73, rms: 0.76, bpm: 128,
    drums: 88, stemBass: 70, vocals: 56, melody: 62, keys: 44, other: 38, peak: 94,
  });
  const [connectionInfo, setConnectionInfo] = useState<SlotConnectionInfo | null>(null);
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  // Lifted inject state (shared between page and SignalPanel)
  const [injectActive, setInjectActive] = useState(false);
  const [promptText, setPromptText] = useState('');

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

  // Event logging
  const logEvent = useCallback((eventType: EventEntry['eventType'], entityId: string, message: string) => {
    setEventEntries(prev => {
      const entry: EventEntry = { timestamp: formatTimestamp(), eventType, entityId, message };
      const next = [entry, ...prev];
      if (next.length > 20) next.length = 20;
      return next;
    });
  }, []);

  // Persist connected slots to localStorage
  const saveConnectedSlots = useCallback(() => {
    try {
      const connected = slotsRef.current
        .filter(s => s.active && s.entity_id)
        .map(s => ({ id: s.id, label: s.label, entityId: s.entity_id }));
      localStorage.setItem(LS_KEY, JSON.stringify(connected));
    } catch {
      // localStorage may not be available
    }
  }, []);

  // Sync MaestraConnectionState → SlotConnectionInfo for UI
  const syncConnectionInfo = useCallback((slotId: string, state: MaestraConnectionState) => {
    setConnectionInfo(prev => {
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

      if (state.status === 'discovering') {
        log(`[${slotId}] Discovering Maestra server...`, 'info');
      } else if (state.status === 'connecting') {
        log(`[${slotId}] Connecting to ${state.serverUrl}...`, 'info');
      } else if (state.status === 'connected') {
        log(`[${slotId}] Connected to Maestra as ${state.entityId}`, 'ok');
        logEvent('connect', state.entityId, `${slotId} joined the fleet`);
        saveConnectedSlots();
      } else if (state.status === 'error') {
        log(`[${slotId}] ${state.errorMessage || 'Connection error'}`, 'error');
      }
    });

    connectionsRef.current.set(slotId, conn);

    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return {
        ...s,
        active: true,
        entity_id: entityId,
        connection_status: 'connecting',
      };
    }));

    const initialState = conn.getState();
    syncConnectionInfo(slotId, initialState);
    conn.connect();
  }, [log, logEvent, syncConnectionInfo, saveConnectedSlots]);

  // Disconnect a slot
  const disconnectSlot = useCallback((slotId: string) => {
    const conn = connectionsRef.current.get(slotId);
    if (conn) {
      conn.disconnect();
      connectionsRef.current.delete(slotId);
    }

    const slot = slotsRef.current.find(s => s.id === slotId);
    logEvent('disconnect', slot?.entity_id || slotId, `${slotId} left the fleet`);

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
    saveConnectedSlots();
  }, [log, logEvent, saveConnectedSlots]);

  // Update connection config (from Advanced Settings)
  const updateConnectionConfig = useCallback((config: { serverUrl?: string; entityId?: string; port?: number; streamPath?: string }) => {
    if (!connectionInfo) return;
    const slotId = connectionInfo.slotId;
    const conn = connectionsRef.current.get(slotId);

    if (conn) {
      conn.updateConfig(config);
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

  // Slot selection
  const selectSlot = useCallback((id: string) => {
    setSelectedId(id);
    const slot = slotsRef.current.find(s => s.id === id);
    if (!slot) return;

    const conn = connectionsRef.current.get(id);
    if (conn) {
      const state = conn.getState();
      syncConnectionInfo(id, state);
    } else if (slot.active && slot.entity_id) {
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

  // Join node from modal
  const handleJoinNode = useCallback((data: JoinNodeData) => {
    setJoinModalOpen(false);

    // Find first available (non-active) slot
    const availableSlot = slotsRef.current.find(s => !s.active);
    if (!availableSlot) {
      // Create a new slot
      const n = slotsRef.current.length + 1;
      const newId = `slot${n}`;
      setSlots(prev => [...prev, {
        id: newId,
        label: data.name,
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
        _frameTimes: [],
        _fpsSmooth: null,
      }]);
      // Auto-connect after creation
      setTimeout(() => {
        setSlots(prev => prev.map(s => s.id === newId ? { ...s, label: data.name } : s));
        autoConnectSlot(newId);
        selectSlot(newId);
      }, 50);
    } else {
      // Claim the available slot
      setSlots(prev => prev.map(s => {
        if (s.id !== availableSlot.id) return s;
        return { ...s, label: data.name, suggestion: undefined };
      }));
      autoConnectSlot(availableSlot.id);
      selectSlot(availableSlot.id);
    }

    log(`[JoinNode] ${data.name} (${data.role}) — ${data.intent}`, 'ok');
    logEvent('connect', data.name, `${data.name} joined as ${data.role}`);
  }, [autoConnectSlot, selectSlot, log, logEvent]);

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

  // Broadcast prompt to all connected nodes via WS + Maestra
  const broadcastPrompt = useCallback((prompt: string) => {
    const payload = JSON.stringify({
      type: 'prompt_inject',
      prompt,
      timestamp: Date.now(),
    });

    // Send via WebSocket if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload);
    }

    // Send via each MaestraConnection
    connectionsRef.current.forEach((conn, slotId) => {
      const state = conn.getState();
      if (state.status === 'connected') {
        try {
          fetch(`${state.serverUrl}/entities/${state.entityId}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, timestamp: Date.now() }),
          }).catch(() => {
            // Silently handle CORS/network errors
          });
        } catch {
          // ignore
        }
      }
      void slotId; // suppress unused
    });

    log(`[Inject] Broadcast: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`, 'ok');
    logEvent('stream', 'fleet', `Prompt injected: ${prompt.slice(0, 40)}`);
  }, [log, logEvent]);

  // P6 flush to TD
  const p6Flush = useCallback((prompt: string) => {
    const payload = JSON.stringify({
      type: 'p6_flush',
      prompt,
      timestamp: Date.now(),
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload);
    }

    connectionsRef.current.forEach((conn) => {
      const state = conn.getState();
      if (state.status === 'connected') {
        try {
          fetch(`${state.serverUrl}/entities/${state.entityId}/p6`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, timestamp: Date.now() }),
          }).catch(() => {});
        } catch {
          // ignore
        }
      }
    });

    log('[P6 Flush] Sent prompt + p6 to TouchDesigner', 'info');
    logEvent('stream', 'fleet', 'P6 flush sent to TD');
  }, [log, logEvent]);

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

    // Auto-reconnect from localStorage
    let reconnectedFromStorage = false;
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const savedSlots = JSON.parse(stored) as { id: string; label: string; entityId: string }[];
        if (savedSlots.length > 0) {
          reconnectedFromStorage = true;
          setTimeout(() => {
            savedSlots.forEach(saved => {
              autoConnectSlot(saved.id);
            });
            selectSlot(savedSlots[0].id);
            log('Auto-reconnected from previous session', 'ok');
          }, 100);
        }
      }
    } catch {
      // localStorage not available
    }

    // Default: auto-select and auto-connect krista1
    if (!reconnectedFromStorage) {
      setTimeout(() => {
        selectSlot('krista1');
        autoConnectSlot('krista1');
      }, 100);
    }

    return () => {
      simulatorRef.current?.stop();
      if (wsRef.current) wsRef.current.close();
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      clearInterval(entityInterval);
      connectionsRef.current.forEach(conn => conn.destroy());
      connectionsRef.current.clear();
    };
  }, [connectWS, fetchEntities, fetchFrame, selectSlot, autoConnectSlot, log]);

  // Derived values for Header
  const selectedSlot = slots.find(s => s.id === selectedId) || null;
  const activeSlots = slots.filter(s => s.active).length;
  const streamFps = slots.find(s => s.id === 'krista1')?.fps ?? null;
  const audioActive = audioData.rms > 0.1;

  return (
    <>
      <Header
        wsStatus={wsStatus}
        apiStatus={apiStatus}
        streamFps={streamFps}
        activeSlots={activeSlots}
        totalSlots={slots.length}
        audioActive={audioActive}
        onJoinNode={() => setJoinModalOpen(true)}
      />
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
              onJoinNode={() => setJoinModalOpen(true)}
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
            eventEntries={eventEntries}
            onReconnect={reconnectStream}
            onCycleSource={cycleStreamSource}
            injectActive={injectActive}
            onInjectToggle={setInjectActive}
            promptText={promptText}
            onPromptChange={setPromptText}
            onBroadcast={broadcastPrompt}
            onP6Flush={p6Flush}
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

      {/* Join Node Modal */}
      <JoinModal
        open={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoin={handleJoinNode}
      />
    </>
  );
}
