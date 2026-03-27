// ─── Connection Layer 1: Server Connection ───
export type ServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ─── Connection Layer 2: Entity Registration ───
export type EntityStatus = 'not_registered' | 'registering' | 'registered' | 'error';

// ─── Connection Layer 3: Heartbeat ───
export type HeartbeatStatus = 'waiting' | 'live' | 'stale' | 'lost';

// ─── Connection Layer 4: State Sync ───
export type StateSyncStatus = 'waiting' | 'syncing' | 'active' | 'error';

// ─── Connection Layer 5: Stream ───
export type StreamStatus = 'none' | 'advertised' | 'live' | 'stale' | 'error';

/** Granular 5-layer Maestra status for a single slot/entity */
export interface MaestraSlotStatus {
  server: ServerStatus;
  entity: EntityStatus;
  heartbeat: HeartbeatStatus;
  stateSync: StateSyncStatus;
  stream: StreamStatus;
  /** Timestamp when entity was registered (ms epoch) */
  registeredAt: number | null;
  /** Timestamp of last heartbeat received (ms) */
  lastHeartbeatAt: number | null;
  /** Timestamp of last state update received (ms) */
  lastStateUpdateAt: number | null;
  /** Timestamp of last stream frame received (ms) */
  lastStreamFrameAt: number | null;
  /** True when connected optimistically (HTTPS → HTTP mixed content) */
  optimistic: boolean;
  /** True when HTTPS page is trying to reach HTTP server */
  mixedContent: boolean;
  /** Error message, if any */
  errorMessage: string | null;
}

/** Default (empty) slot status */
export function defaultSlotStatus(): MaestraSlotStatus {
  return {
    server: 'disconnected',
    entity: 'not_registered',
    heartbeat: 'waiting',
    stateSync: 'waiting',
    stream: 'none',
    registeredAt: null,
    lastHeartbeatAt: null,
    lastStateUpdateAt: null,
    lastStreamFrameAt: null,
    optimistic: false,
    mixedContent: false,
    errorMessage: null,
  };
}

/** Format a millisecond age as a compact human-readable string */
export function formatAge(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/** Derive a human-readable summary label from a MaestraSlotStatus */
export function slotStatusLabel(s: MaestraSlotStatus): string {
  if (s.server === 'disconnected') return 'Disconnected';
  if (s.server === 'connecting') return 'Connecting';
  if (s.server === 'error') return 'Server Error';
  // server === 'connected' from here
  if (s.entity === 'registering') return 'Registering';
  if (s.entity === 'error') return 'Registration Error';
  if (s.entity === 'not_registered') return 'Not Registered';
  // entity === 'registered' from here
  if (s.heartbeat === 'lost') return 'Lost';
  if (s.heartbeat === 'stale') return 'Stale';
  if (s.stream === 'live') return 'Stream Live';
  if (s.stream === 'advertised') return 'Stream Advertised';
  if (s.stateSync === 'active') return 'Live';
  if (s.heartbeat === 'live') return 'Live';
  if (s.heartbeat === 'waiting') return 'Waiting for Heartbeat';
  return 'Registered';
}

/** Derive a CSS-friendly status class from MaestraSlotStatus */
export function slotStatusClass(s: MaestraSlotStatus): string {
  if (s.server === 'disconnected' || s.server === 'error') return 'status-off';
  if (s.server === 'connecting') return 'status-connecting';
  if (s.heartbeat === 'lost' || s.heartbeat === 'stale') return 'status-warn';
  if (s.stream === 'live' || s.heartbeat === 'live') return 'status-live';
  if (s.entity === 'registered') return 'status-ok';
  return 'status-connecting';
}

// ─── Legacy ConnectionStatus (kept for backward compat in Header) ───
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'discovering' | 'error';

export interface MaestraEntity {
  entity_id: string;
  name: string;
  type: 'touchdesigner' | 'browser' | 'max_msp' | 'arduino' | 'scope' | 'unknown';
  connection_status: ConnectionStatus;
  last_heartbeat: number | null;
  active_stream: string | null;
  state_summary: Record<string, unknown>;
  registered_at: number;
}

export type SignalType = 'touchdesigner' | 'json_stream' | 'osc' | 'audio_reactive' | 'text' | 'test_signal' | 'video' | null;
export type StreamType = 'ndi' | 'syphon' | 'spout' | 'srt' | 'video' | 'audio' | 'texture' | 'midi' | 'osc' | 'sensor' | 'data';
export type NodeRole = 'receive' | 'send' | 'two_way' | null;


/** Entity variable — matches Jordan's schema */
export interface StateVariable {
  type: 'string' | 'number' | 'boolean' | 'float' | 'color' | 'vector2' | 'vector3' | 'range' | 'enum' | 'array' | 'object';
  direction: 'input' | 'output';
  default?: unknown;
  description?: string;
  value?: unknown;   // live value from /entities/{id}/state
}

/** Schema map: key -> variable definition */
export type StateSchema = Record<string, StateVariable>;

export interface FleetSlot {
  id: string;            // UI identity = slot index key
  slug?: string;          // human slug e.g. 'mirrors-echo' (used for POST /entities)
  entityId?: string | null; // UUID returned by server (canonical API identity)
  label: string;
  entity_id: string | null;  // legacy compat — same as entityId
  stateSchema?: StateSchema; // declared variables from wizard
  endpoint: string | null;
  active: boolean;
  fps: number | null;
  frameUrl: string | null;
  cloudNode: boolean;
  connection_status: ConnectionStatus;
  last_heartbeat: number | null;
  active_stream: string | null;
  state_summary: Record<string, unknown>;
  suggestion?: SlotSuggestion;
  /** Granular 5-layer status */
  maestraStatus?: MaestraSlotStatus;
  /** Signal type chosen during setup (audio, video, json, etc.) */
  signalType?: SignalType;
  /** Node role chosen during setup */
  nodeRole?: NodeRole;
  _frameTimes: number[];
  _fpsSmooth: number | null;
}

export interface SlotSuggestion {
  title: string;
  desc: string;
  tag: 'td' | 'scope' | 'max' | 'browser';
  tagLabel: string;
}

export interface GpuNode {
  id: string;
  label: string;
  url: string;
  previewing: boolean;
  active: boolean;
  fps: number | null;
  lat: number | null;
  frameUrl: string | null;
  _interval: ReturnType<typeof setInterval> | null;
  _frameTimes: number[];
}

export type WSEventType =
  | 'entity_connected'
  | 'entity_disconnected'
  | 'state_update'
  | 'stream_advertised'
  | 'stream_removed'
  | 'heartbeat'
  | 'transcription_update'
  | 'audio_analysis'
  | 'frame';

export interface WSEvent {
  type: WSEventType;
  entity_id?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface AudioAnalysisData {
  sub: number;
  bass: number;
  mid: number;
  high: number;
  rms: number;
  bpm: number;
  drums: number;
  stemBass: number;
  vocals: number;
  melody: number;
  keys: number;
  other: number;
  peak: number;
}

export interface TranscriptionData {
  text: string;
  nouns: string[];
  timestamp: number;
}

export interface ModulationParam {
  name: string;
  category: 'motion' | 'material' | 'optical' | 'geometry';
  source: AudioSource;
  amount: number;
}

export type AudioSource = 'none' | 'rms' | 'bpm' | 'sub' | 'bass' | 'mid' | 'high';

export interface SlotConnectionInfo {
  serverUrl: string;
  entityId: string;
  slotId: string;
  connected: boolean;
  status: ConnectionStatus;
  autoConnect: boolean;
  autoDiscover: boolean;
  port: number;
  streamPath: string;
  discoveredUrl: string | null;
  errorMessage: string | null;
  optimistic?: boolean;
  mixedContent?: boolean;
  /** Granular 5-layer status */
  maestraStatus?: MaestraSlotStatus;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'ok';
}

export interface EventEntry {
  timestamp: string;
  eventType: 'connect' | 'disconnect' | 'state' | 'stream';
  entityId: string;
  message: string;
}

export interface ToxParam {
  title: string;
  items: string[];
}

export interface ColorPaletteState {
  hue: number;
  saturation: number;
  value: number;
  activeIndex: number;
}
