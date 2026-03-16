'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Header,
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
import { JoinMaestraResult } from '@/components/JoinModal';
import { FleetSlot, LogEntry, EventEntry, AudioAnalysisData, SlotConnectionInfo, MaestraSlotStatus, defaultSlotStatus } from '@/types';
import { createInitialSlots, SUGGESTIONS } from '@/mock';
import { WSSimulator } from '@/mock/ws-simulator';
import { API_BASE } from '@/mock/gpu-nodes';
import { formatTimestamp } from '@/lib/audio-utils';
import { FRAME_FETCH_INTERVAL } from '@/lib/constants';
import {
  MaestraConnection,
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

  // Lifted inject state
  const [injectActive, setInjectActive] = useState(false);
  const [promptText, setPromptText] = useState('');

  // Webcam state
  const [webcamActive, setWebcamActive] = useState(false);

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
    } catch { /* */ }
  }, []);

  // Sync MaestraSlotStatus → UI state for a given slot
  const syncSlotStatus = useCallback((slotId: string, status: MaestraSlotStatus) => {
    // Update connectionInfo if this is the selected slot
    setConnectionInfo(prev => {
      if (prev && prev.slotId !== slotId) return prev;
      return {
        ...prev!,
        serverUrl: prev?.serverUrl || GALLERY_SERVER_URL,
        entityId: prev?.entityId || '',
        slotId,
        connected: status.server === 'connected' && status.entity === 'registered',
        status: status.server === 'connected' ? 'connected'
          : status.server === 'error' ? 'error'
          : status.server === 'connecting' ? 'connecting'
          : 'disconnected',
        autoConnect: prev?.autoConnect ?? true,
        autoDiscover: prev?.autoDiscover ?? true,
        port: prev?.port ?? 8080,
        streamPath: prev?.streamPath ?? '/ws',
        discoveredUrl: prev?.discoveredUrl ?? null,
        errorMessage: status.errorMessage,
        optimistic: status.optimistic,
        mixedContent: status.mixedContent,
        maestraStatus: status,
      };
    });

    // Update slot in grid
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return {
        ...s,
        maestraStatus: status,
        connection_status: status.server === 'connected' ? 'connected'
          : status.server === 'error' ? 'error'
          : status.server === 'connecting' ? 'connecting'
          : 'disconnected',
        last_heartbeat: status.lastHeartbeatAt || s.last_heartbeat,
      };
    }));
  }, []);

  // Auto-connect a slot
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

    // Track previous server status for logging
    let prevServer = 'disconnected';
    let prevEntity = 'not_registered';

    conn.onStatusChange((status) => {
      syncSlotStatus(slotId, status);

      // Log transitions
      if (status.server !== prevServer) {
        if (status.server === 'connecting') {
          log(`[${slotId}] Connecting to Maestra...`, 'info');
        } else if (status.server === 'connected' && prevServer !== 'connected') {
          log(`[${slotId}] Server connected`, 'ok');
        } else if (status.server === 'error') {
          log(`[${slotId}] ${status.errorMessage || 'Server error'}`, 'error');
        }
        prevServer = status.server;
      }
      if (status.entity !== prevEntity) {
        if (status.entity === 'registered' && prevEntity !== 'registered') {
          log(`[${slotId}] Entity registered as ${conn.entityId}`, 'ok');
          logEvent('connect', conn.entityId, `${slotId} registered`);
          saveConnectedSlots();
        }
        prevEntity = status.entity;
      }
    });

    connectionsRef.current.set(slotId, conn);

    // Set slot active immediately
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return {
        ...s,
        active: true,
        entity_id: entityId,
        connection_status: 'connecting',
        maestraStatus: { ...defaultSlotStatus(), server: 'connecting' },
      };
    }));

    // Set initial connectionInfo
    setConnectionInfo({
      serverUrl: GALLERY_SERVER_URL,
      entityId,
      slotId,
      connected: false,
      status: 'connecting',
      autoConnect: true,
      autoDiscover: true,
      port: 8080,
      streamPath: '/ws',
      discoveredUrl: null,
      errorMessage: null,
      maestraStatus: { ...defaultSlotStatus(), server: 'connecting' },
    });

    conn.connect();
  }, [log, logEvent, syncSlotStatus, saveConnectedSlots]);

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
      return { ...s, connection_status: 'disconnected', maestraStatus: defaultSlotStatus() };
    }));

    setConnectionInfo(prev => {
      if (prev && prev.slotId === slotId) {
        return { ...prev, connected: false, status: 'disconnected', errorMessage: null, maestraStatus: defaultSlotStatus() };
      }
      return prev;
    });

    log(`[${slotId}] Disconnected from Maestra`, 'warn');
    saveConnectedSlots();
  }, [log, logEvent, saveConnectedSlots]);

  // Update connection config
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

      // Notify MaestraConnection that a stream frame arrived
      const conn = connectionsRef.current.get('krista1');
      if (conn) conn.receiveStreamFrame();

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
          // Route heartbeat events to the right MaestraConnection
          if (msg.type === 'heartbeat' && msg.entity_id) {
            connectionsRef.current.forEach((conn) => {
              if (conn.entityId === msg.entity_id) {
                conn.receiveHeartbeat();
              }
            });
            return;
          }
          // Route state_update events
          if (msg.type === 'state_update' && msg.entity_id) {
            connectionsRef.current.forEach((conn) => {
              if (conn.entityId === msg.entity_id) {
                conn.receiveStateUpdate();
              }
            });
            log(`State update from ${msg.entity_id}: ${JSON.stringify(msg.data).slice(0, 60)}`, 'info');
            return;
          }
          // Route stream events
          if (msg.type === 'stream_advertised' && msg.entity_id) {
            connectionsRef.current.forEach((conn) => {
              if (conn.entityId === msg.entity_id) {
                conn.receiveStreamAdvertised();
              }
            });
            return;
          }
          if (msg.type === 'stream_removed' && msg.entity_id) {
            connectionsRef.current.forEach((conn) => {
              if (conn.entityId === msg.entity_id) {
                conn.receiveStreamRemoved();
              }
            });
            return;
          }
          if (msg.type === 'ping') return;
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
      syncSlotStatus(id, conn.getStatus());
    } else {
      const entityId = slot.entity_id || generateEntityId(slot.label, slot.suggestion?.tag);
      setConnectionInfo({
        serverUrl: GALLERY_SERVER_URL,
        entityId,
        slotId: id,
        connected: false,
        status: slot.connection_status === 'connected' ? 'connected' : 'disconnected',
        autoConnect: true,
        autoDiscover: true,
        port: 8080,
        streamPath: '/ws',
        discoveredUrl: null,
        errorMessage: null,
        maestraStatus: slot.maestraStatus || defaultSlotStatus(),
      });
    }
  }, [syncSlotStatus]);

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

  // Join Maestra from modal
  const handleJoinMaestra = useCallback((result: JoinMaestraResult) => {
    setJoinModalOpen(false);

    const label = result.method === 'monitor_only' ? 'Monitor' : 'Operator';
    const availableSlot = slotsRef.current.find(s => !s.active);

    if (!availableSlot) {
      const n = slotsRef.current.length + 1;
      const newId = result.slotId || `slot${n}`;
      setSlots(prev => [...prev, {
        id: newId,
        label,
        entity_id: result.entityId,
        endpoint: null,
        active: true,
        fps: null,
        frameUrl: null,
        cloudNode: false,
        connection_status: 'connected',
        last_heartbeat: Date.now(),
        active_stream: null,
        state_summary: {},
        maestraStatus: { ...defaultSlotStatus(), server: 'connected', entity: 'registered', heartbeat: 'waiting' },
        _frameTimes: [],
        _fpsSmooth: null,
      }]);
      setTimeout(() => {
        selectSlot(newId);
        saveConnectedSlots();
      }, 50);
    } else {
      setSlots(prev => prev.map(s => {
        if (s.id !== availableSlot.id) return s;
        return {
          ...s,
          label,
          entity_id: result.entityId,
          active: true,
          connection_status: 'connected',
          last_heartbeat: Date.now(),
          suggestion: undefined,
          maestraStatus: { ...defaultSlotStatus(), server: 'connected', entity: 'registered', heartbeat: 'waiting' },
        };
      }));
      selectSlot(availableSlot.id);
      saveConnectedSlots();
    }

    const methodLabel = result.method === 'join_show' ? 'Join Show'
      : result.method === 'claim_station' ? 'Claim Station'
      : 'Monitor Only';
    const roleLabel = result.tdRole ? ` (${result.tdRole})` : '';

    log(`[Maestra] ${methodLabel}${roleLabel} — Entity: ${result.entityId}`, 'ok');
    logEvent('connect', result.entityId, `${methodLabel}${roleLabel} joined the fleet`);
  }, [selectSlot, log, logEvent, saveConnectedSlots]);

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

  // Broadcast prompt — sends via WS (backend relay) and Maestra state_update
  const broadcastPrompt = useCallback((prompt: string) => {
    const ts = Date.now();
    // Send via backend WS relay
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'prompt_inject', prompt, timestamp: ts }));
    }
    // Also send as Maestra state_update via WS (TD listens for these)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      connectionsRef.current.forEach((conn) => {
        wsRef.current!.send(JSON.stringify({
          type: 'state_update',
          entity_id: conn.entityId,
          data: { prompt, field: 'prompt' },
          timestamp: ts,
        }));
      });
    }
    log(`[Inject] "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"`, 'ok');
    logEvent('state', 'fleet', `Prompt injected: ${prompt.slice(0, 40)}`);
  }, [log, logEvent]);

  // P6 flush — sends the prompt to TD's p6 field via WS state_update
  const p6Flush = useCallback((prompt: string) => {
    const ts = Date.now();
    // Send via backend WS relay
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'p6_flush', prompt, timestamp: ts }));
    }
    // Also send as Maestra state_update targeting p6 field
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      connectionsRef.current.forEach((conn) => {
        wsRef.current!.send(JSON.stringify({
          type: 'state_update',
          entity_id: conn.entityId,
          data: { prompt, field: 'p6' },
          timestamp: ts,
        }));
      });
    }
    log('[P6 Flush] → TD p6 field', 'info');
    logEvent('state', 'fleet', 'P6 flush → TD');
  }, [log, logEvent]);

  // Webcam frame handler — injects captured frames into the selected slot
  const handleWebcamFrame = useCallback((blobUrl: string, fps: number) => {
    const slotId = selectedId || 'krista1';
    // Notify MaestraConnection that a stream frame arrived
    const conn = connectionsRef.current.get(slotId);
    if (conn) conn.receiveStreamFrame();

    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      if (s.frameUrl && s.frameUrl.startsWith('blob:')) URL.revokeObjectURL(s.frameUrl);
      const now = performance.now();
      const times = [...s._frameTimes, now].filter(t => now - t < 1000);
      let slotFps = s.fps;
      let smooth = s._fpsSmooth;
      if (times.length >= 2) {
        const span = (times[times.length - 1] - times[0]) / 1000;
        const raw = (times.length - 1) / span;
        smooth = smooth != null ? smooth * 0.6 + raw * 0.4 : raw;
        slotFps = Math.round(smooth);
      }
      return { ...s, frameUrl: blobUrl, fps: slotFps || fps, _frameTimes: times, _fpsSmooth: smooth };
    }));
  }, [selectedId]);

  // Relay webcam frame data (base64 JPEG) via WebSocket to backend
  const handleWebcamFrameData = useCallback((base64: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const slotId = selectedId || 'krista1';
      const conn = connectionsRef.current.get(slotId);
      wsRef.current.send(JSON.stringify({
        type: 'stream_frame',
        entity_id: conn?.entityId || slotId,
        data: { frame: base64, format: 'jpeg' },
        timestamp: Date.now(),
      }));
    }
  }, [selectedId]);

  // When webcam activates, pause the remote frame polling (avoid overwriting)
  // When webcam deactivates, resume remote frame polling
  const handleWebcamToggle = useCallback((active: boolean) => {
    setWebcamActive(active);
    if (active) {
      // Pause remote frame polling so webcam frames aren't overwritten
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      log('[Webcam] Started — local camera streaming to slot', 'ok');
      logEvent('stream', selectedId || 'krista1', 'Webcam stream started');
    } else {
      // Resume remote frame polling
      fetchFrame();
      frameIntervalRef.current = setInterval(fetchFrame, FRAME_FETCH_INTERVAL);
      log('[Webcam] Stopped — resuming remote frame fetch', 'info');
      logEvent('stream', selectedId || 'krista1', 'Webcam stream stopped');
    }
  }, [fetchFrame, log, logEvent, selectedId]);

  // Cycle to cloud nodes
  const cycleStreamSource = useCallback(() => {
    setActiveTab('scope');
  }, []);

  // Handle auto-connect button
  const handleAutoConnect = useCallback(() => {
    if (connectionInfo) autoConnectSlot(connectionInfo.slotId);
  }, [connectionInfo, autoConnectSlot]);

  // Handle disconnect button
  const handleDisconnect = useCallback(() => {
    if (connectionInfo) disconnectSlot(connectionInfo.slotId);
  }, [connectionInfo, disconnectSlot]);

  // Initialize
  useEffect(() => {
    simulatorRef.current = new WSSimulator();
    simulatorRef.current.subscribe((event) => {
      if (event.type === 'audio_analysis' && event.data) {
        setAudioData(event.data as unknown as AudioAnalysisData);
      }
      if (event.type === 'entity_connected') {
        // Route to connection
        const conn = connectionsRef.current.get('krista1');
        if (conn) conn.receiveHeartbeat();

        setSlots(prev => prev.map(s => {
          if (s.id === 'krista1') return { ...s, connection_status: 'connected', last_heartbeat: Date.now() };
          return s;
        }));
        log(`Entity connected: ${event.entity_id}`, 'ok');
      }
      if (event.type === 'heartbeat') {
        // Route heartbeat to the matching connection
        connectionsRef.current.forEach((conn) => {
          if (conn.entityId === event.entity_id) {
            conn.receiveHeartbeat();
          }
        });
        setSlots(prev => prev.map(s => {
          if (s.entity_id === event.entity_id) return { ...s, last_heartbeat: Date.now() };
          return s;
        }));
      }
      if (event.type === 'state_update') {
        connectionsRef.current.forEach((conn) => {
          if (conn.entityId === event.entity_id) {
            conn.receiveStateUpdate();
          }
        });
        log(`State update from ${event.entity_id}: ${JSON.stringify(event.data).slice(0, 60)}`, 'info');
      }
    });
    simulatorRef.current.start();

    connectWS();
    fetchEntities();
    const entityInterval = setInterval(fetchEntities, 10000);

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
            savedSlots.forEach(saved => autoConnectSlot(saved.id));
            selectSlot(savedSlots[0].id);
            log('Auto-reconnected from previous session', 'ok');
          }, 100);
        }
      }
    } catch { /* */ }

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

  // Derived values
  const selectedSlot = slots.find(s => s.id === selectedId) || null;
  const activeSlots = slots.filter(s => s.active).length;
  const streamFps = slots.find(s => s.id === 'krista1')?.fps ?? null;
  const audioActive = audioData.rms > 0.1;

  // Derive overall Maestra status for header
  const maestraHeaderStatus = (() => {
    const statuses = slots.filter(s => s.maestraStatus).map(s => s.maestraStatus!);
    if (statuses.some(s => s.heartbeat === 'live' || s.stream === 'live')) return 'connected' as const;
    if (statuses.some(s => s.server === 'connected')) return 'connected' as const;
    if (statuses.some(s => s.server === 'connecting')) return 'connecting' as const;
    if (statuses.some(s => s.server === 'error')) return 'error' as const;
    // Fallback to old slot-level status
    if (slots.some(s => s.connection_status === 'connected')) return 'connected' as const;
    if (slots.some(s => s.connection_status === 'connecting')) return 'connecting' as const;
    return 'disconnected' as const;
  })();

  return (
    <>
      <Header
        wsStatus={wsStatus}
        apiStatus={apiStatus}
        maestraStatus={maestraHeaderStatus}
        streamFps={streamFps}
        activeSlots={activeSlots}
        totalSlots={slots.length}
        audioActive={audioActive}
        onJoinMaestra={() => setJoinModalOpen(true)}
      />
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

            <ConnectionPanel
              connectionInfo={connectionInfo}
              onAutoConnect={handleAutoConnect}
              onDisconnect={handleDisconnect}
              onUpdateConfig={updateConnectionConfig}
            />

            <AudioAnalysis audioData={audioData} />
            <ColorPalette />
            <ModulationGrid />
          </div>

          {/* Right: Detail Panel */}
          <DetailPanel
            slot={selectedSlot}
            logEntries={logEntries}
            eventEntries={eventEntries}
            injectActive={injectActive}
            onInjectToggle={setInjectActive}
            promptText={promptText}
            onPromptChange={setPromptText}
            onBroadcast={broadcastPrompt}
            onP6Flush={p6Flush}
            webcamActive={webcamActive}
            onWebcamToggle={handleWebcamToggle}
            onWebcamFrame={handleWebcamFrame}
            onWebcamFrameData={handleWebcamFrameData}
          />
        </div>

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

      <JoinModal
        open={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoin={handleJoinMaestra}
      />
    </>
  );
}
