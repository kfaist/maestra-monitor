'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Header,
  TabNav,
  Footer,
  SlotGrid,
  DetailPanel,
  AudioAnalysis,
  ToxReferenceTab,
  ConnectionPanel,
  JoinModal,
  LightingPanel,
  ScenePanel,
  ColorPalette,
  ModulationGrid,
} from '@/components';
import { JoinMaestraResult } from '@/components/JoinModal';
import { EntityBusEntry } from '@/components/DetailPanel';
import { DmxState, defaultDmxState, SCENE_CUE_MAP } from '@/components/LightingPanel';
import { FleetSlot, LogEntry, EventEntry, AudioAnalysisData, SlotConnectionInfo, MaestraSlotStatus, defaultSlotStatus } from '@/types';
import { createInitialSlots, SUGGESTIONS } from '@/mock';
import { WSSimulator } from '@/mock/ws-simulator';
import { API_BASE } from '@/mock/gpu-nodes';
import { GALLERY_URL, RAILWAY_URL } from '@/lib/maestra-client';
import { formatTimestamp } from '@/lib/audio-utils';
import { FRAME_FETCH_INTERVAL } from '@/lib/constants';
import {
  MaestraConnection,
  MAESTRA_API_URL,
  generateEntityId} from '@/lib/maestra-connection';

const LS_KEY = 'maestra_connected_slots';

if (typeof window !== 'undefined') {
  console.log('[Maestra Monitor] Build 2026-03-26T21:00Z — per-slot isolation + slug-skip fix active');
}

export default function Home() {
  // State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsStatus, setWsStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  type ServerMode = 'railway' | 'gallery' | 'auto' | 'custom';
  const [serverMode, setServerMode] = useState<ServerMode>('auto');
  const [customUrl, setCustomUrl] = useState('');
  const [serverConnected, setServerConnected] = useState(false);
  const [resolvedServerUrl, setResolvedServerUrl] = useState('');
  const serverModeRef = useRef<ServerMode>('auto');
  const customUrlRef = useRef('');
  const [apiStatus, setApiStatus] = useState<'online' | 'offline'>('offline');
  const [slots, setSlots] = useState<FleetSlot[]>(createInitialSlots); // seeded from mock, hydrated from server
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [eventEntries, setEventEntries] = useState<EventEntry[]>([]);
  const [audioData, setAudioData] = useState<AudioAnalysisData>({
    sub: 65, bass: 82, mid: 45, high: 73, rms: 0.76, bpm: 128,
    drums: 88, stemBass: 70, vocals: 56, melody: 62, keys: 44, other: 38, peak: 94});
  const [connectionInfo, setConnectionInfo] = useState<SlotConnectionInfo | null>(null);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [entityBus, setEntityBus] = useState<EntityBusEntry[]>([]);

  // Entity state — accumulated key/value state per entity for live debugging
  const [entityStates, setEntityStates] = useState<Record<string, Record<string, string>>>({});
  const entityStatesRef = useRef(entityStates);
  entityStatesRef.current = entityStates;

  // DMX Lighting state — reflects dmx-lighting entity
  const [dmxState, setDmxState] = useState<DmxState>(defaultDmxState);
  const [bassThreshold, setBassThreshold] = useState(0.75);
  const [audioReactiveEnabled, setAudioReactiveEnabled] = useState(true);
  const audioReactiveEnabledRef = useRef(true);
  audioReactiveEnabledRef.current = audioReactiveEnabled;
  const bassThresholdRef = useRef(0.75);
  bassThresholdRef.current = bassThreshold;
  const bassCooldownRef = useRef(0); // timestamp of last bass trigger

  // Lifted inject state
  const [injectActive, setInjectActive] = useState(false);
  const [promptText, setPromptText] = useState('');

  // Webcam state
  const [webcamActive, setWebcamActive] = useState(false);

  // Entity targeting for color/modulation sends
  const [remoteEntityList, setRemoteEntityList] = useState<string[]>([]);
  const [sendTarget, setSendTarget] = useState<string>('global'); // 'global' or a specific entity_id

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simulatorRef = useRef<WSSimulator | null>(null);
  const activeNodeUrlRef = useRef<string | null>(null);
  // Resolve active server URL from mode
  const resolveActiveBase = () => {
    const mode = serverModeRef.current;
    const cu = customUrlRef.current;
    if (mode === 'gallery') return GALLERY_URL;
    if (mode === 'custom' && cu) return cu;
    if (mode === 'railway') return RAILWAY_URL;
    return GALLERY_URL; // auto: try gallery first
  };

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  serverModeRef.current = serverMode;
  customUrlRef.current = customUrl;
  // Track remote entity IDs (e.g. TD nodes) so we can target prompt/p6 at them
  const remoteEntitiesRef = useRef<Set<string>>(new Set());
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const webcamActiveRef = useRef(webcamActive);
  webcamActiveRef.current = webcamActive;

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

  // Entity bus — live signal stream
  const pushBusEntry = useCallback((key: string, value: string) => {
    setEntityBus(prev => {
      const entry: EntityBusEntry = { timestamp: formatTimestamp(), key, value };
      const next = [entry, ...prev];
      if (next.length > 30) next.length = 30;
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
    // Update connectionInfo ONLY if this is the selected slot — never overwrite another slot's info
    setConnectionInfo(prev => {
      if (!prev || prev.slotId !== slotId) return prev;
      return {
        ...prev,
        serverUrl: prev?.serverUrl || MAESTRA_API_URL,
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
        maestraStatus: status};
    });

    // Update slot in grid — preserve stream status if incoming status has default 'none'
    // (autoConnectSlot sets stream: 'advertised' before MaestraConnection emits its first status)
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      const mergedStream = status.stream === 'none' && s.maestraStatus?.stream && s.maestraStatus.stream !== 'none'
        ? s.maestraStatus.stream
        : status.stream;
      return {
        ...s,
        maestraStatus: { ...status, stream: mergedStream },
        connection_status: status.server === 'connected' ? 'connected'
          : status.server === 'error' ? 'error'
          : status.server === 'connecting' ? 'connecting'
          : 'disconnected',
        last_heartbeat: status.lastHeartbeatAt || s.last_heartbeat};
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
      serverUrl: MAESTRA_API_URL,
      autoConnect: true,
      autoDiscover: true});

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
          // Add to remote entities so prompt/p6 targets this entity
          if (!remoteEntitiesRef.current.has(conn.entityId)) {
            remoteEntitiesRef.current.add(conn.entityId);
            setRemoteEntityList(Array.from(remoteEntitiesRef.current));
          }
        }
        prevEntity = status.entity;
      }
    });

    connectionsRef.current.set(slotId, conn);

    // Set slot active immediately — derive endpoint from slot's suggestion tag
    // For krista1: also mark stream as 'advertised' so fetchFrame starts pulling SD frames
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      // Match wizard behavior: krista1 TD slot uses /video/frame/td
      const isSDSlot = slotId === 'krista1';
      const endpoint = s.endpoint || (isSDSlot ? '/video/frame/td' : `/video/frame/${entityId}`);
      return {
        ...s,
        active: true,
        entity_id: entityId,
        endpoint,
        connection_status: 'connecting',
        active_stream: s.active_stream || entityId,
        maestraStatus: {
          ...defaultSlotStatus(),
          server: 'connecting',
          stream: 'advertised'}};
    }));

    // Set initial connectionInfo
    setConnectionInfo({
      serverUrl: MAESTRA_API_URL,
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
      maestraStatus: { ...defaultSlotStatus(), server: 'connecting' }});

    conn.connect();
  }, [log, logEvent, syncSlotStatus, saveConnectedSlots]);

  // Disconnect a slot
  const disconnectSlot = useCallback((slotId: string) => {
    const conn = connectionsRef.current.get(slotId);
    if (conn) {
      conn.destroy();
      connectionsRef.current.delete(slotId);
    }

    const slot = slotsRef.current.find(s => s.id === slotId);
    logEvent('disconnect', slot?.entity_id || slotId, `${slotId} left the fleet`);

    // Fully deactivate the slot — revoke blob, clear frame, mark inactive
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      if (s.frameUrl && s.frameUrl.startsWith('blob:')) URL.revokeObjectURL(s.frameUrl);
      return {
        ...s,
        active: false,
        fps: null,
        frameUrl: null,
        connection_status: 'disconnected',
        maestraStatus: defaultSlotStatus(),
        _frameTimes: [],
        _fpsSmooth: null,
        suggestion: SUGGESTIONS[(prev.indexOf(s)) % SUGGESTIONS.length]};
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
  const handleServerModeChange = useCallback((mode: 'railway' | 'gallery' | 'auto' | 'custom') => {
    setServerMode(mode);
    // Reconnect WS to new server — use ref to avoid forward declaration issue
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    // wsReconnect will fire from the ws.onclose handler automatically
  }, []);

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

  // Frame fetching — only fetch for slots with an advertised/live stream
  // Streams are NOT attached on slot click — only via stream_advertised WS event
  const frameErrorCountRef = useRef(0);
  const firstFrameSlotsRef = useRef(new Set<string>());
  const frameRelayPostingRef = useRef(false); // gate: one WS relay at a time
  const httpRelayPostingRef = useRef(false);  // gate: one HTTP relay at a time
  const frameRelayCountRef = useRef(0);       // total frames relayed
  const [frameRelayCount, setFrameRelayCount] = useState(0);
  const frameRelayCountUpdateRef = useRef(0); // throttle UI updates

  const fetchFrame = useCallback(async () => {
    const currentSlots = slotsRef.current;
    // Fetch for ALL active slots that are streaming
    const streamingSlots = currentSlots.filter(s => {
      return s.active && (
        (s.maestraStatus && (s.maestraStatus.stream === 'live' || s.maestraStatus.stream === 'advertised'))
        || s.endpoint
      );
    });
    if (streamingSlots.length === 0) return;

    for (const slot of streamingSlots) {
      // Skip the slot that owns the webcam — webcam handler sets frameUrl directly
      if (webcamActiveRef.current && slot.id === webcamSlotRef.current) continue;

      const entityId = slot.entity_id || slot.id;
      const endpoint = slot.endpoint
        ? `${API_BASE}${slot.endpoint}`
        : `${API_BASE}/video/frame/${entityId}`;
      try {
        const res = await fetch(`${endpoint}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.size < 100) continue; // Skip tiny/empty responses
        const url = URL.createObjectURL(blob);

        // Notify MaestraConnection that a stream frame arrived
        const conn = connectionsRef.current.get(slot.id);
        if (conn) conn.receiveStreamFrame();

        const entityId = conn?.entityId || slot.entity_id || slot.id;

        // ── Relay frame to Maestra backend via WS + HTTP (continuous ~80ms) ──
        // WS relay — fast path for connected nodes
        if (wsRef.current?.readyState === WebSocket.OPEN && !frameRelayPostingRef.current) {
          frameRelayPostingRef.current = true;
          blob.arrayBuffer().then(buf => {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const b64 = btoa(binary);
            wsRef.current?.send(JSON.stringify({
              type: 'stream_frame',
              entity_id: entityId,
              data: { frame: b64, format: 'jpeg', source: slot.active_stream || 'unknown' },
              timestamp: Date.now()}));
            frameRelayPostingRef.current = false;

            // Bump relay counter
            frameRelayCountRef.current++;
            const now = Date.now();
            if (now - frameRelayCountUpdateRef.current > 500) {
              frameRelayCountUpdateRef.current = now;
              setFrameRelayCount(frameRelayCountRef.current);
            }
          }).catch(() => { frameRelayPostingRef.current = false; });
        }

        // NOTE: No HTTP relay needed for SD frames — we're already pulling from the backend
        // (/video/frame/td). TD polls that same endpoint directly. The fetch loop is
        // display-only for the monitor UI.

        // Reset error counter on success
        if (frameErrorCountRef.current > 0) {
          frameErrorCountRef.current = 0;
          log('[Frames] Stream recovered', 'ok');
        }
        // Log first frame per slot so we know the pipe is working
        if (!firstFrameSlotsRef.current.has(slot.id)) {
          firstFrameSlotsRef.current.add(slot.id);
          log(`[Frames] First frame for ${slot.id}: ${blob.size}B from ${endpoint}`, 'ok');
        }

        setSlots(prev => prev.map(s => {
          if (s.id !== slot.id) return s;
          if (s.frameUrl && s.frameUrl.startsWith('blob:')) URL.revokeObjectURL(s.frameUrl);
          const now = performance.now();
          const times = [...s._frameTimes, now].filter(t => now - t < 1000);
          let fps = s.fps;
          let smooth = s._fpsSmooth;
          if (times.length >= 2) {
            const span = (times[times.length - 1] - times[0]) / 1000;
            if (span > 0) {
              const raw = (times.length - 1) / span;
              smooth = smooth != null ? smooth * 0.6 + raw * 0.4 : raw;
              fps = Math.round(smooth);
            }
          }
          // Auto-activate slot when frames arrive — makes the live node panel visible
          // For HTTP-only slots (no WS), synthesise maestraStatus so the UI shows "connected" / "live"
          const prevM = s.maestraStatus;
          const httpMaestra = (!prevM || prevM.server !== 'connected')
            ? { ...(prevM || {}), server: 'connected' as const, entity: 'registered' as const, heartbeat: 'live' as const, stream: 'live' as const, stateSync: 'active' as const, lastStreamFrameAt: Date.now() }
            : { ...prevM, stream: 'live' as const, lastStreamFrameAt: Date.now() };
          return { ...s, frameUrl: url, fps, active: true, connection_status: 'connected', maestraStatus: httpMaestra as typeof prevM, _frameTimes: times, _fpsSmooth: smooth };
        }));
      } catch (err) {
        frameErrorCountRef.current++;
        // Log first error and then every 50th to avoid flooding
        if (frameErrorCountRef.current === 1 || frameErrorCountRef.current % 50 === 0) {
          log(`[Frames] Fetch failed for ${slot.id}: ${(err as Error).message} (${frameErrorCountRef.current} total)`, 'warn');
        }
      }
    }
  }, [log]);

  // WebSocket connection
  const connectWS = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === 0 || wsRef.current.readyState === 1)) return;

    // Railway backend has no WebSocket — only connect in gallery mode (on-site)
    if (serverModeRef.current === 'railway') {
      setWsStatus('offline');
      log('Railway mode: WebSocket not available — switch to Gallery on-site', 'warn');
      return;
    }

    const activeBase = GALLERY_URL;
    const WS_URL = activeBase.replace('https', 'wss').replace('http', 'ws') + '/ws';
    log('Connecting to Gallery WebSocket...', 'info');
    setWsStatus('connecting');

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('online');
        log('WebSocket connected', 'ok');
      };

      // ── Shared handler for parsed JSON messages ──
      const handleJsonMsg = (msg: Record<string, unknown>) => {
        if (msg.type === 'audio_analysis') {
          const { bands, stems, bpm } = msg as Record<string, Record<string, number> | number | undefined>;
          if (bands || stems || bpm) {
            const b = bands as Record<string, number> | undefined;
            const s = stems as Record<string, number> | undefined;
            setAudioData(prev => ({
              ...prev,
              ...(b ? { sub: b.sub || 0, bass: b.bass || 0, mid: b.mid || 0, high: b.high || 0 } : {}),
              ...(s ? { drums: s.drums || 0, stemBass: s.bass || 0, melody: s.melody || 0, vocals: s.vocals || 0 } : {}),
              ...(bpm ? { bpm: bpm as number } : {})}));
          }
          return;
        }

        // ── init: bootstrap entity list from backend ──
        if (msg.type === 'init' && Array.isArray(msg.entities)) {
          const entities = msg.entities as Array<Record<string, unknown>>;
          log(`[WS] init — ${entities.length} entities from Maestra`, 'ok');
          // Populate remote entity list with live/known entities
          const liveIds = entities
            .filter(e => e.name && e.status !== 'deleted')
            .map(e => String(e.name || e.slug || e.id))
            .slice(0, 50); // cap to avoid flooding
          liveIds.forEach(id => remoteEntitiesRef.current.add(id));
          setRemoteEntityList(Array.from(remoteEntitiesRef.current));
          // Bootstrap entity state from entities that have state
          const stateUpdates: Record<string, Record<string, string>> = {};
          entities.forEach(e => {
            const eid = String(e.name || e.slug || e.id);
            const state = e.state as Record<string, unknown> | undefined;
            if (state && Object.keys(state).length > 0) {
              const flat: Record<string, string> = {};
              Object.entries(state).forEach(([k, v]) => { flat[k] = String(v); });
              stateUpdates[eid] = flat;
            }
          });
          if (Object.keys(stateUpdates).length > 0) {
            setEntityStates(prev => {
              const next = { ...prev };
              Object.entries(stateUpdates).forEach(([eid, s]) => {
                next[eid] = { ...(next[eid] || {}), ...s };
              });
              return next;
            });
          }
          pushBusEntry('maestra.init', `${entities.length} entities`);
          return;
        }

        // Track remote entity IDs (TD nodes, etc.) from any event
        if (msg.entity_id) {
          const eid = String(msg.entity_id);
          if (!remoteEntitiesRef.current.has(eid)) {
            remoteEntitiesRef.current.add(eid);
            setRemoteEntityList(Array.from(remoteEntitiesRef.current));
          }
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

        // ── stream_frame: display frames from WS ──
        if (msg.type === 'stream_frame' && msg.entity_id && msg.data) {
          const d = msg.data as Record<string, unknown>;
          const frame = d.frame as string | undefined;
          if (frame) {
            const entityId = String(msg.entity_id);
            // Find the slot that matches this entity
            const slot = slotsRef.current.find(s =>
              s.entity_id === entityId || s.id === entityId
            );
            if (slot) {
              const conn = connectionsRef.current.get(slot.id);
              if (conn) conn.receiveStreamFrame();
              // Convert base64 to blob URL for display
              try {
                const binary = atob(frame);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'image/jpeg' });
                const url = URL.createObjectURL(blob);
                setSlots(prev => prev.map(s => {
                  if (s.id !== slot.id) return s;
                  if (s.frameUrl && s.frameUrl.startsWith('blob:')) URL.revokeObjectURL(s.frameUrl);
                  return { ...s, frameUrl: url };
                }));
              } catch { /* bad frame data */ }
            }
          }
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

          // Always store full state into entityStates keyed by entity_id AND slug
          if (msg.data && typeof msg.data === 'object') {
            const _d = msg.data as Record<string, unknown>;
            const _eid = msg.entity_id as string;
            // Store under entity_id
            setEntityStates(prev => ({ ...prev, [_eid]: { ...prev[_eid], ..._d as Record<string,string> } }));
            // Also store under slug if we have it
            const _slug = _d.toe_name ? String(_d.toe_name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') : null;
            if (_slug) setEntityStates(prev => ({ ...prev, [_slug]: { ...prev[_slug], ..._d as Record<string,string> } }));
          }

          // Auto-claim: if entity pushed toe_name, claim first available slot
          if (msg.data && typeof msg.data === 'object') {
            const d = msg.data as Record<string, unknown>;
            if (d.toe_name && msg.entity_id) {
              const eid = msg.entity_id as string;
              const toeName = String(d.toe_name);
              setSlots(prev => {
                // Already claimed?
                if (prev.some(s => s.entity_id === eid)) return prev;
                // Find first available slot
                const idx = prev.findIndex(s => !s.active && !s.entity_id);
                if (idx === -1) return prev;
                const updated = [...prev];
                updated[idx] = { ...updated[idx], label: toeName, entity_id: eid };
                log(`Auto-claimed Slot ${idx + 1} for ${toeName} (${eid})`, 'ok');
                return updated;
              });
            }
          }
          // Push to entity bus + accumulate entity state
          if (msg.data && typeof msg.data === 'object') {
            const eid = msg.entity_id as string;
            const updates: Record<string, string> = {};
            Object.entries(msg.data as Record<string, unknown>).forEach(([k, v]) => {
              pushBusEntry(`${eid}.${k}`, String(v));
              updates[k] = String(v);
            });
            setEntityStates(prev => ({
              ...prev,
              [eid]: { ...(prev[eid] || {}), ...updates }}));
          }
          // ── Reflect dmx-lighting entity state updates into local DmxState ──
          if (msg.entity_id === 'dmx-lighting' && msg.data) {
            const d = msg.data as Record<string, unknown>;
            setDmxState(prev => ({
              ...prev,
              ...(d.cue !== undefined ? { currentCue: String(d.cue) } : {}),
              ...(d.sequence !== undefined ? { sequence: String(d.sequence) } : {}),
              ...(d.step !== undefined ? { step: Number(d.step) } : {}),
              ...(d.progress !== undefined ? { progress: Number(d.progress) } : {}),
              ...(d.paused !== undefined ? { paused: Boolean(d.paused) } : {}),
              lastTrigger: Date.now()}));
          }
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
      };

      ws.onmessage = (e) => {
        // ── Handle binary messages (Maestra sends all WS data as binary) ──
        if (e.data instanceof Blob) {
          e.data.arrayBuffer().then(buf => {
            const bytes = new Uint8Array(buf);
            // Check for JPEG magic bytes (0xFF 0xD8)
            if (bytes.length > 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
              // Raw JPEG frame — route to first active slot
              const blob = new Blob([bytes], { type: 'image/jpeg' });
              const url = URL.createObjectURL(blob);
              const activeSlots = slotsRef.current.filter(s => s.active);
              const targetSlot = activeSlots.length > 0 ? activeSlots[0] : null;
              if (targetSlot) {
                const conn = connectionsRef.current.get(targetSlot.id);
                if (conn) conn.receiveStreamFrame();
                setSlots(prev => prev.map(s => {
                  if (s.id !== targetSlot.id) return s;
                  if (s.frameUrl && s.frameUrl.startsWith('blob:')) URL.revokeObjectURL(s.frameUrl);
                  return { ...s, frameUrl: url, active: true, connection_status: 'connected' };
                }));
              }
              return;
            }
            // Try to parse as JSON
            try {
              const text = new TextDecoder().decode(bytes);
              const msg = JSON.parse(text);
              handleJsonMsg(msg);
            } catch {
              // Unknown binary data
            }
          }).catch(() => {});
          return;
        }
        // ── Handle text messages ──
        try {
          const msg = JSON.parse(e.data);
          handleJsonMsg(msg);
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
    const base = resolveActiveBase();
    setResolvedServerUrl(base);
    try {
      const res = await fetch(`${base}/entities`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) { setServerConnected(false); return; }
      const data = await res.json();
      const rawEntities: Record<string, unknown>[] = Array.isArray(data) ? data : (data.entities ?? []);
      setServerConnected(true);

      // Filter: only create slots for entity types that represent live nodes
      // Skip organizational entities (Installation, Room, Space, Zone, Group)
      const SLOT_TYPES = new Set(['device', 'controller', 'sensor', 'actuator', 'media', 'light']);
      const entities = rawEntities.filter(e => {
        // Always keep entities that match existing active slots (scope, krista1_visual, etc.)
        const slug = (e.slug as string) || (e.name as string) || String(e.id);
        // Extract entity_type — could be a string or an object with .name
        const rawType = e.entity_type;
        const typeName = typeof rawType === 'string' ? rawType
          : typeof rawType === 'object' && rawType !== null ? (rawType as Record<string, unknown>).name as string
          : '';
        const typeStr = (typeName || '').toLowerCase();
        // Keep if it's a known device-like type, has state, or has no type (legacy)
        return SLOT_TYPES.has(typeStr)
          || !typeStr  // no type = legacy entity, keep it
          || (e.state && Object.keys(e.state as object).length > 0)  // has live state
          || (e.device_id != null);  // has a physical device
      });

      log(`[Server] ${entities.length}/${rawEntities.length} entities (filtered) from ${base.replace('https://','').replace('http://','').slice(0,30)}`, 'ok');

      // Hydrate slots from server entities — server is truth
      if (entities.length > 0) {
        setSlots(prev => {
          const bySlug = new Map(prev.map(s => [s.entity_id || s.id, s]));
          const hydrated = entities.map((e, i) => {
            const slug = (e.slug as string) || (e.name as string) || String(e.id);
            const existing = bySlug.get(slug) || bySlug.get(String(e.id));
            const state = (e.state as Record<string, unknown>) || {};
            return {
              ...(existing || {
                id: slug,
                label: (e.name as string) || slug,
                endpoint: null,
                cloudNode: false,
                connection_status: 'disconnected' as const,
                last_heartbeat: null,
                active_stream: null,
                state_summary: {},
                _frameTimes: [],
                _fpsSmooth: null,
                fps: null,
                frameUrl: null,
                active: false,
              }),
              entity_id: slug,
              entityId: String(e.id),      // UUID from server
              slug,                          // human slug
              label: (state.toe_name as string) || (e.name as string) || slug,
              last_heartbeat: (e.last_heartbeat as number) || null,
              state_summary: state,
              stateSchema: (e.metadata as Record<string, unknown>)?.stateSchema as Record<string, {type: string; direction: string}> | undefined,
              active: !!(existing?.active),
            } as import('@/types').FleetSlot;
          });
          // Keep any local-only active slots not yet on server
          const serverSlugs = new Set(hydrated.map(s => s.entity_id));
          const localOnly = prev.filter(s => s.active && !serverSlugs.has(s.entity_id || s.id));
          const merged = [...hydrated, ...localOnly];
          // Ensure scope slot is always present (HTTP-only frame polling, no WS registration)
          if (!merged.some(s => s.entity_id === 'scope')) {
            const initial = createInitialSlots();
            const scopeSlot = initial.find(s => s.entity_id === 'scope');
            if (scopeSlot) merged.push(scopeSlot);
          }
          return merged;
        });
      }

      // Update entityStates from server state
      entities.forEach(e => {
        const slug = (e.slug as string) || String(e.id);
        const eid = String(e.id);
        const state = (e.state as Record<string, unknown>) || {};
        const meta = (e.metadata as Record<string, unknown>) || {};
        // Merge state + metadata — tops may be in either
        const merged = { ...meta, ...state };
        if (Object.keys(merged).length > 0) {
          setEntityStates(prev => ({ ...prev, [slug]: merged as Record<string,string>, [eid]: merged as Record<string,string> }));
        }
      });

      // Also update remoteEntityList
      setRemoteEntityList(entities.map(e => (e.slug as string) || String(e.id)));

      // Fan-out: for each entity with state, trigger route-based forwarding
      // (runs server-side via /api/fanout — lightweight, no client-side CORS issues)
      entities.forEach(e => {
        const slug = (e.slug as string) || String(e.id);
        const state = (e.state as Record<string, unknown>) || {};
        if (Object.keys(state).length > 0) {
          fetch('/api/fanout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceSlug: slug, state, serverUrl: base }),
          }).catch(() => {}); // fire and forget
        }
      });

      // (entity count logged above after filtering)
    } catch (err) {
      setServerConnected(false);
      log(`[Server] ${base.replace('https://','').replace('http://','')} unreachable`, 'warn');
      // Auto mode: if gallery failed, try Railway
      if (serverModeRef.current === 'auto') {
        try {
          const res2 = await fetch(`${RAILWAY_URL}/entities`, { signal: AbortSignal.timeout(6000) });
          if (res2.ok) {
            setResolvedServerUrl(RAILWAY_URL);
            setServerConnected(true);
            log('[Server] Fell back to Railway', 'ok');
          }
        } catch { /* both failed */ }
      }
    }
  }, [log]);

  // Send a message via WS to all connected entities
  const sendViaAll = useCallback((payload: Record<string, unknown>, target?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const ts = Date.now();
    if (target && target !== 'global') {
      ws.send(JSON.stringify({ ...payload, entity_id: target, timestamp: ts }));
    } else {
      ws.send(JSON.stringify({ ...payload, timestamp: ts }));
    }
  }, []);

    // Broadcast prompt — sends via WS broadcast + targeted state_update
  const broadcastPrompt = useCallback((prompt: string) => {
    const targets = slotsRef.current.map(s => s.entity_id || s.id).filter(Boolean);
    // Send as prompt_inject (fleet-wide) AND as state_update with { prompt } key
    sendViaAll(
      { type: 'prompt_inject', prompt, data: { prompt } }
    );
    targets.forEach(t => sendViaAll({ type: 'prompt_inject', prompt, data: { prompt } }, t));
    logEvent('state', 'fleet', `Prompt injected: ${prompt.slice(0, 40)}`);
    pushBusEntry('fleet.prompt', prompt.slice(0, 50));
  }, [sendViaAll, logEvent, pushBusEntry]);

  // P6 flush — sends the prompt to TD's p6 field directly
  const p6Flush = useCallback((prompt: string) => {
    const targets = slotsRef.current.map(s => s.entity_id || s.id).filter(Boolean);
    // TD expects data.p6 = "the prompt text", NOT data.prompt with a field tag
    sendViaAll(
      { type: 'p6_flush', prompt, data: { p6: prompt, prompt } }
    );
    targets.forEach(t => sendViaAll({ type: 'p6_flush', prompt, data: { p6: prompt, prompt } }, t));
    logEvent('state', 'fleet', `P6 flush → ${prompt.slice(0, 40)}`);
    pushBusEntry('fleet.p6', prompt.slice(0, 50));
  }, [sendViaAll, logEvent, pushBusEntry]);

  // Send a state_update to the current target (single entity or global)
  const sendToTarget = useCallback((data: Record<string, unknown>) => {
    const ts = Date.now();
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const ws = wsRef.current;

    if (sendTarget === 'global') {
      // Fleet-wide broadcast (no entity_id)
      ws.send(JSON.stringify({ type: 'state_update', data, timestamp: ts }));
      // Also target every known entity individually
      const targets = slotsRef.current.map(s => s.entity_id || s.id).filter(Boolean);
      targets.forEach(entityId => {
        ws.send(JSON.stringify({ type: 'state_update', entity_id: entityId, data, timestamp: ts }));
      });
    } else {
      // Single entity
      ws.send(JSON.stringify({ type: 'state_update', entity_id: sendTarget, data, timestamp: ts }));
    }
  }, [sendTarget]);

  // Color palette change — sends hue/saturation/value to TD via Maestra
  const handleColorChange = useCallback((color: { hue: number; saturation: number; value: number }) => {
    sendToTarget({ ...color, field: 'color' });
    // Also publish to lighting_palette entity for DMX color mapping
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'state_update',
        entity_id: 'lighting_palette',
        data: { hue: color.hue, saturation: color.saturation, brightness: color.value },
        timestamp: Date.now()}));
    }
    pushBusEntry('lighting_palette.hue', String(color.hue));
  }, [sendToTarget, pushBusEntry]);

  // Modulation change — sends source/amount for a parameter to TD
  const handleModulationChange = useCallback((paramName: string, source: string, amount: number) => {
    sendToTarget({ param: paramName, source, amount, field: 'modulation' });
  }, [sendToTarget]);

  // Webcam frame handler — injects captured frames into the CURRENTLY selected slot,
  // but ONLY if that slot is active (has a connection). Prevents frame leakage to inactive slots.
  const webcamLastUpdateRef = useRef(0);
  const webcamLatestBlobRef = useRef<string | null>(null);
  const webcamSlotRef = useRef<string | null>(null); // tracks which slot "owns" the webcam
  // Webcam entity-state throttle — push fps/resolution to entity state every ~1s
  const webcamEntityStateRef = useRef(0);

  const handleWebcamFrame = useCallback((blobUrl: string, fps: number) => {
    const currentSelected = selectedIdRef.current || 'krista1';
    // Lock webcam to the first slot that started it — don't follow selection changes
    if (!webcamSlotRef.current) webcamSlotRef.current = currentSelected;
    const slotId = webcamSlotRef.current;

    // Find the slot — allow frames even if not yet "active" (user may start webcam before connecting)
    const slot = slotsRef.current.find(s => s.id === slotId);
    if (!slot) return;

    const conn = connectionsRef.current.get(slotId);
    if (conn) conn.receiveStreamFrame();

    // Revoke old blob immediately to prevent memory leak
    if (webcamLatestBlobRef.current && webcamLatestBlobRef.current !== blobUrl) {
      URL.revokeObjectURL(webcamLatestBlobRef.current);
    }
    webcamLatestBlobRef.current = blobUrl;

    // Throttle React state updates to ~5fps (every 200ms) to prevent UI jitter
    const now = performance.now();
    if (now - webcamLastUpdateRef.current < 200) return;
    webcamLastUpdateRef.current = now;

    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      if (s.frameUrl && s.frameUrl.startsWith('blob:') && s.frameUrl !== blobUrl) {
        URL.revokeObjectURL(s.frameUrl);
      }
      const times = [...s._frameTimes, now].filter(t => now - t < 1000);
      let slotFps = s.fps;
      let smooth = s._fpsSmooth;
      if (times.length >= 2) {
        const span = (times[times.length - 1] - times[0]) / 1000;
        if (span > 0) {
          const raw = (times.length - 1) / span;
          smooth = smooth != null ? smooth * 0.7 + raw * 0.3 : raw;
          slotFps = Math.round(smooth);
        }
      }
      return { ...s, frameUrl: blobUrl, fps: slotFps || fps, _frameTimes: times, _fpsSmooth: smooth };
    }));

    // ── Push webcam stats into entity state every ~1s ──
    const entityId = conn?.entityId || slot?.entity_id || slotId;
    const nowMs = Date.now();
    if (nowMs - webcamEntityStateRef.current > 1000) {
      webcamEntityStateRef.current = nowMs;
      const computedFps = fps || 0;
      setEntityStates(prev => ({
        ...prev,
        [entityId]: {
          ...(prev[entityId] || {}),
          stream_source: 'webcam',
          status: 'live',
          fps: String(computedFps),
          frames: String(frameRelayCountRef.current)}}));
      pushBusEntry(`${entityId}.webcam_fps`, String(computedFps));
    }
  }, [pushBusEntry]); // uses refs for everything else

  // Relay webcam frame data (base64 JPEG) via WS + HTTP to Maestra backend
  const webcamHttpPostingRef = useRef(false);
  const webcamFirstRelayRef = useRef(false);
  const webcamRelayBusRef = useRef(0);
  const webcamHttpOkCountRef = useRef(0);
  const webcamHttpErrCountRef = useRef(0);

  const handleWebcamFrameData = useCallback((base64: string) => {
    const slotId = webcamSlotRef.current || selectedIdRef.current || 'krista1';
    const conn = connectionsRef.current.get(slotId);
    const slot = slotsRef.current.find(s => s.id === slotId);
    const entityId = conn?.entityId || slot?.entity_id || slotId;
    const ts = Date.now();
    const sizeKB = Math.round(base64.length / 1024);

    // Log first relay so we know the pipe is working
    if (!webcamFirstRelayRef.current) {
      webcamFirstRelayRef.current = true;
      log(`[Webcam → Maestra] First frame → ${entityId} (${sizeKB}KB b64)`, 'ok');
      pushBusEntry(`${entityId}.webcam`, 'stream_started');
    }

    // ── WS relay — send as binary JPEG (same format backend sends us) ──
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Send raw binary JPEG over WS — backend expects this format
      try {
        const binary = atob(base64);
        const wsBuf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) wsBuf[i] = binary.charCodeAt(i);
        wsRef.current.send(wsBuf);
      } catch {
        // Fallback: send as JSON stream_frame
        wsRef.current.send(JSON.stringify({
          type: 'stream_frame',
          entity_id: entityId,
          data: { frame: base64, format: 'jpeg', source: 'webcam' },
          timestamp: ts}));
      }
    }

    // ── HTTP relay — POST raw JPEG to Maestra backend /video/frame/td ──
    // This is the endpoint TD polls, so webcam frames merge into the SD pipeline
    if (!webcamHttpPostingRef.current) {
      webcamHttpPostingRef.current = true;
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        // Use the Uint8Array directly as body (not .buffer which can be wrong size)
        fetch(`${API_BASE}/video/frame/td`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: bytes}).then(res => {
          webcamHttpPostingRef.current = false;
          if (res.ok) {
            webcamHttpOkCountRef.current++;
            // Log first successful POST
            if (webcamHttpOkCountRef.current === 1) {
              log(`[Webcam → Maestra] HTTP relay active — frames posting to /video/frame/td`, 'ok');
            }
          } else {
            webcamHttpErrCountRef.current++;
            if (webcamHttpErrCountRef.current <= 3) {
              log(`[Webcam → Maestra] HTTP POST failed: ${res.status} ${res.statusText}`, 'error');
            }
          }
        }).catch(err => {
          webcamHttpPostingRef.current = false;
          webcamHttpErrCountRef.current++;
          if (webcamHttpErrCountRef.current <= 3) {
            log(`[Webcam → Maestra] HTTP relay error: ${(err as Error).message}`, 'error');
          }
        });
      } catch (err) {
        webcamHttpPostingRef.current = false;
        log(`[Webcam → Maestra] Encode error: ${(err as Error).message}`, 'error');
      }
    }

    // Bump relay counter
    frameRelayCountRef.current++;
    if (ts - frameRelayCountUpdateRef.current > 500) {
      frameRelayCountUpdateRef.current = ts;
      setFrameRelayCount(frameRelayCountRef.current);
    }

    // Push relay stats to entity state + bus (throttled ~2s)
    if (ts - webcamRelayBusRef.current > 2000) {
      webcamRelayBusRef.current = ts;
      const httpOk = webcamHttpOkCountRef.current;
      const httpErr = webcamHttpErrCountRef.current;
      pushBusEntry(`${entityId}.relay→maestra`, `${httpOk} ok / ${httpErr} err`);
      setEntityStates(prev => ({
        ...prev,
        [entityId]: {
          ...(prev[entityId] || {}),
          relay_frames: String(frameRelayCountRef.current),
          relay_http_ok: String(httpOk),
          relay_http_err: String(httpErr),
          frame_size: `${sizeKB}KB`}}));
    }
  }, [log, pushBusEntry]); // uses refs for everything else

  // When webcam activates — DON'T kill frame polling for other slots
  // fetchFrame already skips the webcam slot via webcamActiveRef check
  const handleWebcamToggle = useCallback((active: boolean) => {
    setWebcamActive(active);
    if (active) {
      // Auto-select first slot if nothing is selected
      if (!selectedIdRef.current) setSelectedId('krista1');
      // Lock webcam to the currently selected slot
      webcamSlotRef.current = selectedIdRef.current || 'krista1';
      const target = webcamSlotRef.current;

      // Auto-activate the target slot if it's inactive (so frames display in the card)
      const slot = slotsRef.current.find(s => s.id === target);
      if (slot && !slot.active) {
        setSlots(prev => prev.map(s => {
          if (s.id !== target) return s;
          return { ...s, active: true, connection_status: 'connected', active_stream: 'webcam' };
        }));
      }

      // ── Register webcam entity in the state system ──
      const conn = connectionsRef.current.get(target);
      const entityId = conn?.entityId || slot?.entity_id || target;
      setEntityStates(prev => ({
        ...prev,
        [entityId]: {
          ...(prev[entityId] || {}),
          stream_source: 'webcam',
          status: 'starting',
          fps: '0',
          frames: '0',
          relay_frames: '0'}}));
      pushBusEntry(`${entityId}.stream_source`, 'webcam');
      pushBusEntry(`${entityId}.status`, 'starting');

      // Publish webcam entity via WS so other nodes see it
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'state_update',
          entity_id: entityId,
          data: { stream_source: 'webcam', status: 'live', device: target },
          timestamp: Date.now()}));
      }

      // Reset relay tracking for fresh session
      webcamFirstRelayRef.current = false;
      frameRelayCountRef.current = 0;
      webcamEntityStateRef.current = 0;
      webcamRelayBusRef.current = 0;

      log(`[Webcam] Started — streaming to ${target} (other slots still polling)`, 'ok');
      logEvent('stream', target, 'Webcam stream started');
    } else {
      const target = webcamSlotRef.current || 'krista1';
      const slot = slotsRef.current.find(s => s.id === target);
      const conn = connectionsRef.current.get(target);
      const entityId = conn?.entityId || slot?.entity_id || target;

      // ── Mark webcam stopped in entity state ──
      setEntityStates(prev => ({
        ...prev,
        [entityId]: {
          ...(prev[entityId] || {}),
          status: 'stopped',
          stream_source: 'webcam (off)'}}));
      pushBusEntry(`${entityId}.webcam`, 'stream_stopped');

      // Notify backend
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'state_update',
          entity_id: entityId,
          data: { stream_source: 'none', status: 'idle', device: target },
          timestamp: Date.now()}));
      }

      webcamSlotRef.current = null; // release lock
      log('[Webcam] Stopped', 'info');
      logEvent('stream', target, 'Webcam stream stopped');
    }
  }, [log, logEvent, pushBusEntry]);

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

  // Handle signal type / node role changes from TDConnectGuide
  const handleSignalTypeChange = useCallback((source: string) => {
    const slotId = selectedIdRef.current;
    if (!slotId) return;
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return { ...s, signalType: source as FleetSlot['signalType'] };
    }));
    log(`[${slotId}] Signal type → ${source}`, 'info');
  }, [log]);

  const handleNodeRoleChange = useCallback((role: 'receive' | 'send' | 'two_way') => {
    const slotId = selectedIdRef.current;
    if (!slotId) return;
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return { ...s, nodeRole: role };
    }));
    log(`[${slotId}] Node role → ${role}`, 'info');
  }, [log]);

  // Inline wizard complete — auto-connect + set role + signal on the slot
  const handleSlotSetupComplete = useCallback((slotId: string, role: 'receive' | 'send' | 'two_way', signal: string) => {
    // Set role + signal on the slot first
    setSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return { ...s, nodeRole: role, signalType: signal as FleetSlot['signalType'] };
    }));
    log(`[${slotId}] Setup complete: ${role} / ${signal}`, 'ok');
    // Trigger connection
    autoConnectSlot(slotId);
  }, [log, autoConnectSlot]);

  // ═══ Signal injection from Live Node Panel ═══
  const handleInjectSignal = useCallback((slotId: string, field: string, value: string) => {
    const slot = slotsRef.current.find(s => s.id === slotId);
    const entityId = slot?.entity_id || slotId;
    const payload = { type: 'state_update', entity_id: entityId, data: { [field]: value } };
    // Send via WS
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
    log(`[${slotId}] Injected ${field} = ${value}`, 'ok');
    logEvent('state', entityId, `${field} injected → ${value}`);
    pushBusEntry(`${entityId}.${field}`, value);
  }, [log, logEvent, pushBusEntry]);

  // ═══ Scene activation — publish scene state to all listeners ═══
  // ═══ DMX Lighting — patch dmx-lighting entity state ═══
  const triggerDmxCue = useCallback((cueId: string) => {
    const ts = Date.now();
    const data = { cue: cueId };
    // Patch dmx-lighting entity via WS
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'state_update', entity_id: 'dmx-lighting', data, timestamp: ts }));
    }
    // Update local DMX state for display
    setDmxState(prev => ({
      ...prev,
      currentCue: cueId,
      lastTrigger: ts,
      history: [{ cue: cueId, time: ts }, ...prev.history].slice(0, 20)}));
    log(`[DMX] Cue triggered: ${cueId}`, 'ok');
    logEvent('state', 'dmx-lighting', `Cue → ${cueId}`);
    pushBusEntry('dmx-lighting.cue', cueId);
  }, [log, logEvent, pushBusEntry]);

  const handleDmxPauseExternal = useCallback(() => {
    const ts = Date.now();
    const newPaused = !dmxState.paused;
    const data = { paused: newPaused };
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'state_update', entity_id: 'dmx-lighting', data, timestamp: ts }));
    }
    setDmxState(prev => ({ ...prev, paused: newPaused }));
    log(`[DMX] ${newPaused ? 'Paused' : 'Resumed'} external playback`, 'info');
    pushBusEntry('dmx-lighting.paused', String(newPaused));
  }, [dmxState.paused, log, pushBusEntry]);

  const handleDmxFadeOut = useCallback(() => {
    const ts = Date.now();
    const data = { cue: 'fade_out', fade: true };
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'state_update', entity_id: 'dmx-lighting', data, timestamp: ts }));
    }
    setDmxState(prev => ({
      ...prev,
      currentCue: 'fade_out',
      lastTrigger: ts,
      history: [{ cue: 'fade_out', time: ts }, ...prev.history].slice(0, 20)}));
    log('[DMX] Fade out triggered', 'info');
    pushBusEntry('dmx-lighting.cue', 'fade_out');
  }, [log, pushBusEntry]);

  // ═══ Scene activation — publish scene state + trigger DMX cue set ═══
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleActivateScene = useCallback((scene: { id?: string; label: string; state: Record<string, unknown> }) => {
    const payload = { type: 'state_update', entity_id: 'scene_controller', data: scene.state };
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
    log(`Scene activated: ${scene.label}`, 'ok');
    logEvent('state', 'scene_controller', `Scene → ${scene.label}`);
    // Push each scene state key to the entity bus
    Object.entries(scene.state).forEach(([k, v]) => {
      pushBusEntry(`scene.${k}`, String(v));
    });
    // Trigger DMX cue set for this scene
    const cueSet = SCENE_CUE_MAP[(scene as {id?:string}).id ?? scene.label.toLowerCase()];
    if (cueSet && cueSet.length > 0) {
      const ts = Date.now();
      // Patch dmx-lighting with the scene's cue set
      const dmxData = { cue: cueSet[0], sequence: `scene_${scene.id}`, cue_set: cueSet };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'state_update', entity_id: 'dmx-lighting', data: dmxData, timestamp: ts }));
      }
      setDmxState(prev => ({
        ...prev,
        currentCue: cueSet[0],
        sequence: `scene_${scene.id}`,
        step: 0,
        progress: 0,
        lastTrigger: ts,
        history: [{ cue: cueSet[0], time: ts }, ...prev.history].slice(0, 20)}));
      pushBusEntry('dmx-lighting.sequence', `scene_${scene.id}`);
      pushBusEntry('dmx-lighting.cue', cueSet[0]);
      log(`[DMX] Scene cue set: ${cueSet.join(', ')}`, 'ok');
    }
  }, [log, logEvent, pushBusEntry]);

  // ═══ Audio → DMX: bass spike threshold trigger ═══
  const audioDataRef = useRef(audioData);
  audioDataRef.current = audioData;

  useEffect(() => {
    // Poll audio data at 250ms for bass threshold check
    const timer = setInterval(() => {
      if (!audioReactiveEnabledRef.current) return;
      const now = Date.now();
      // Cooldown: don't re-trigger within 500ms
      if (now - bassCooldownRef.current < 500) return;
      const ad = audioDataRef.current;
      const bassNorm = ad.bass / 100; // bass is 0-100, normalize to 0-1
      if (bassNorm > bassThresholdRef.current) {
        bassCooldownRef.current = now;
        triggerDmxCue('bass_hit');
      }
    }, 250);
    return () => clearInterval(timer);
  }, [triggerDmxCue]);

  // Initialize
  useEffect(() => {
    simulatorRef.current = new WSSimulator();
    simulatorRef.current.subscribe((event) => {
      if (event.type === 'audio_analysis' && event.data) {
        setAudioData(event.data as unknown as AudioAnalysisData);
        // Push a few key audio signals to entity bus (throttled — only bpm/bass/rms)
        const ad = event.data as Record<string, unknown>;
        if (ad.bpm !== undefined) pushBusEntry('audio_reactive.bpm', String(ad.bpm));
        if (ad.bass !== undefined) pushBusEntry('audio_reactive.bass', String(((ad.bass as number) / 100).toFixed(2)));
        if (ad.rms !== undefined) pushBusEntry('audio_reactive.rms', String(ad.rms));
        // Accumulate audio state for any audio_reactive entity
        setEntityStates(prev => {
          const audioState: Record<string, string> = {};
          if (ad.bpm !== undefined) audioState['audio.bpm'] = String(Math.round(ad.bpm as number));
          if (ad.bass !== undefined) audioState['audio.bass'] = ((ad.bass as number) / 100).toFixed(2);
          if (ad.mid !== undefined) audioState['audio.mid'] = ((ad.mid as number) / 100).toFixed(2);
          if (ad.rms !== undefined) audioState['audio.rms'] = String(ad.rms);
          // Find all audio_reactive slots and merge state
          const next = { ...prev };
          slotsRef.current.forEach(s => {
            if (s.signalType === 'audio_reactive' && s.entity_id) {
              next[s.entity_id] = { ...(next[s.entity_id] || {}), ...audioState };
            }
          });
          return next;
        });
      }
      if (event.type === 'entity_connected') {
        // Route to the matching connection by entityId (not slotId)
        connectionsRef.current.forEach((conn) => {
          if (conn.entityId === event.entity_id) conn.receiveHeartbeat();
        });
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
        // Accumulate entity state from simulator
        if (event.entity_id && event.data && typeof event.data === 'object') {
          const updates: Record<string, string> = {};
          Object.entries(event.data as Record<string, unknown>).forEach(([k, v]) => {
            updates[k] = String(v);
          });
          setEntityStates(prev => ({
            ...prev,
            [event.entity_id!]: { ...(prev[event.entity_id!] || {}), ...updates }}));
        }
      }
    });
    simulatorRef.current.start();

    connectWS();
    fetchEntities();
    const entityInterval = setInterval(fetchEntities, 10000);

    fetchFrame();
    frameIntervalRef.current = setInterval(fetchFrame, FRAME_FETCH_INTERVAL);

    // SD frame endpoint health check — probe on load to confirm frames are flowing
    (async () => {
      try {
        const probeUrl = `${API_BASE}/video/frame/td?t=${Date.now()}`;
        const res = await fetch(probeUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        log(`[SD Health] ✓ Frame endpoint live — ${blob.size} bytes (${res.headers.get('content-type')})`, 'ok');
        logEvent('stream', 'krista1', `SD probe: ${blob.size}B frame OK`);
      } catch (err) {
        log(`[SD Health] ✗ Frame endpoint failed: ${(err as Error).message}`, 'error');
        logEvent('stream', 'krista1', `SD probe FAILED: ${(err as Error).message}`);
      }
    })();

    // Auto-connect slot 1 on load — SD stream appears immediately, zero clicks needed.
    // Other slots stay available — users connect them explicitly via the setup wizard.
    setTimeout(() => {
      autoConnectSlot('krista1');
    }, 100);

    // ── State sidecar polling ──────────────────────────────────────
    // For HTTP-only slots (no WebSocket), fetch state from /video/frame/{entityId}_state
    // This provides prompt_text, visitor_present, per-machine fps, device name
    const stateSidecarInterval = setInterval(async () => {
      const currentSlots = slotsRef.current;
      for (const slot of currentSlots) {
        if (!slot.active || !slot.entity_id) continue;
        const entityId = slot.entity_id;
        try {
          const res = await fetch(
            `/api/td-state/${entityId}?t=${Date.now()}`,
            { cache: 'no-store', signal: AbortSignal.timeout(3000) }
          );
          if (!res.ok) continue;
          const text = await res.text();
          if (!text || text.length < 2) continue;
          const state = JSON.parse(text) as Record<string, string>;
          setEntityStates(prev => ({
            ...prev,
            [entityId]: { ...prev[entityId], ...state, _sidecar: 'true' },
          }));
        } catch {
          // Sidecar not available for this entity — skip silently
        }
      }
    }, 5000); // Poll every 5s — lightweight, doesn't need to be fast

    // SD feed watchdog — keep krista1 alive 24/7. If it drops, reconnect after 10s.
    const sdWatchdog = setInterval(() => {
      const k1 = slotsRef.current.find(s => s.id === 'krista1');
      if (!k1) return;
      const conn = connectionsRef.current.get('krista1');
      const isHealthy = k1.active && conn && k1.maestraStatus?.server === 'connected';
      if (!isHealthy) {
        console.log('[SD Watchdog] krista1 not healthy — reconnecting');
        autoConnectSlot('krista1');
      }
    }, 10000);

    return () => {
      simulatorRef.current?.stop();
      if (wsRef.current) wsRef.current.close();
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      clearInterval(entityInterval);
      clearInterval(sdWatchdog);
      clearInterval(stateSidecarInterval);
      connectionsRef.current.forEach(conn => conn.destroy());
      connectionsRef.current.clear();
    };
  }, [connectWS, fetchEntities, fetchFrame, autoConnectSlot, log]);

  // Derived values
  const selectedSlot = slots.find(s => s.id === selectedId) || null;
  const activeSlots = slots.filter(s => s.active).length;
  const streamFps = selectedSlot?.fps ?? slots.find(s => s.active && s.fps)?.fps ?? null;
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

    const handleJoinMaestra = useCallback((result: JoinMaestraResult) => {
    setJoinModalOpen(false);
    if (result?.entityId) {
      log('[Join] Entity registered: ' + result.entityId, 'ok');
    }
  }, [log]);

  return (
    <>
      <Header
        wsStatus={wsStatus}
        streamFps={streamFps}
        activeSlots={activeSlots}
        totalSlots={slots.length}
        audioActive={audioActive}
        frameRelayCount={frameRelayCount}
        serverMode={serverMode}
        onServerModeChange={handleServerModeChange}
        customUrl={customUrl}
        onCustomUrlChange={setCustomUrl}
        serverUrl={resolvedServerUrl}
        serverConnected={serverConnected}
      />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* DASHBOARD TAB */}
      <div className={`tab-content ${activeTab === 'dashboard' ? 'active' : ''}`}>
        <div className="fleet-layout">

          {/* Left: Slot Grid + Patch Bay + Audio + Scenes + DMX + Palette + Modulation */}
          <div className="fleet-panel">
            <SlotGrid
              slots={slots}
              selectedId={selectedId}
              onSelectSlot={setSelectedId}
              onAddSlot={() => setSlots(prev => [...prev, { id: `slot-${Date.now()}`, slug: '', entityId: null, label: 'New Slot', entity_id: null, endpoint: null, cloudNode: false, connection_status: 'disconnected' as const, last_heartbeat: null, active_stream: null, state_summary: {}, _frameTimes: [], _fpsSmooth: null, fps: null, frameUrl: null, active: false }])}
              onJoinNode={() => setJoinModalOpen(true)}
              onSlotSetupComplete={handleSlotSetupComplete}
              onInjectSignal={handleInjectSignal}
              eventEntries={eventEntries}
              entityStates={entityStates}
            />

            <LightingPanel
              dmxState={dmxState}
              onTriggerCue={triggerDmxCue}
              onPauseExternal={handleDmxPauseExternal}
              onFadeOut={handleDmxFadeOut}
              bassThreshold={bassThreshold}
              onBassThresholdChange={setBassThreshold}
              audioReactiveEnabled={audioReactiveEnabled}
              onAudioReactiveToggle={setAudioReactiveEnabled}
            />

            <AudioAnalysis audioData={audioData} onSendAudio={sendToTarget} />

            <ColorPalette onColorChange={handleColorChange} />
            <ModulationGrid onModulationChange={handleModulationChange} />
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
            connectionInfo={connectionInfo}
            onAutoConnect={handleAutoConnect}
            onDisconnect={handleDisconnect}
            onUpdateConfig={updateConnectionConfig}
            remoteEntities={remoteEntityList}
            onSignalTypeChange={handleSignalTypeChange}
            onNodeRoleChange={handleNodeRoleChange}
            entityBus={entityBus}
            slots={slots}
            entityStates={entityStates as Record<string, Record<string, unknown>>}
          />
        </div>
      </div>

      {/* TOX REFERENCE TAB */}
      <div className={`tab-content ${activeTab === 'tox' ? 'active' : ''}`}>
        <ToxReferenceTab />
      </div>

      <Footer />

      <JoinModal
        open={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoin={() => {}}
      />
    </>
  );
}
