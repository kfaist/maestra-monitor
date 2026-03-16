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

export interface FleetSlot {
  id: string;
  label: string;
  entity_id: string | null;
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
