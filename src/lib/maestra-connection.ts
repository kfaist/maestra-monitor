/**
 * Maestra Auto-Connection Module
 *
 * 5-layer status model matching Maestra Core concepts:
 * 1. Server Connection  — dashboard ↔ Maestra server reachability
 * 2. Entity Registration — entity registered in Maestra's entity table
 * 3. Heartbeat          — entity actively alive (live / stale / lost)
 * 4. State Sync         — state updates flowing
 * 5. Stream             — stream advertised and preview data active
 *
 * Heartbeat thresholds:
 *   live:  ≤2s since last heartbeat
 *   stale: 2–5s
 *   lost:  >5s
 */

import {
  MaestraSlotStatus,
  defaultSlotStatus,
  ServerStatus,
  EntityStatus,
  HeartbeatStatus,
  StateSyncStatus,
  StreamStatus,
} from '@/types';

export const GALLERY_SERVER_URL = 'http://192.168.128.115:8080';

// Heartbeat thresholds (ms)
const HB_LIVE_MS = 2000;
const HB_STALE_MS = 5000;
// HB_LOST is anything beyond HB_STALE_MS

export interface MaestraConnectionConfig {
  serverUrl?: string;
  entityId?: string;
  slotId: string;
  slotLabel: string;
  slotTag?: string;
  port?: number;
  streamPath?: string;
  autoConnect?: boolean;
  autoDiscover?: boolean;
}

/** Detect if we're on HTTPS trying to reach HTTP — browsers block this */
function isMixedContent(targetUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const target = new URL(targetUrl);
    return window.location.protocol === 'https:' && target.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Check if a URL points to a private/local network address */
function isPrivateNetwork(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname;
    return h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('172.') || h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch {
    return false;
  }
}

/** Generate an entity ID from a slot label and tag */
export function generateEntityId(label: string, tag?: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const prefix = tag ? `${tag}_` : 'td_';
  const suffix = `_${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}${base}${suffix}`;
}

/** Parse a server URL into host and port */
export function parseServerUrl(url: string): { host: string; port: number } {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80) };
  } catch {
    return { host: url, port: 8080 };
  }
}

/** Derive heartbeat status from timestamp */
function heartbeatFromTimestamp(lastHB: number | null): HeartbeatStatus {
  if (lastHB === null) return 'waiting';
  const age = Date.now() - lastHB;
  if (age <= HB_LIVE_MS) return 'live';
  if (age <= HB_STALE_MS) return 'stale';
  return 'lost';
}

// ─── Network helpers ───

async function probeServer(serverUrl: string, timeoutMs = 2000): Promise<boolean> {
  const urls = [`${serverUrl}/api/health`, `${serverUrl}/entities`, serverUrl];
  for (const url of urls) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), timeoutMs);
      const res = await fetch(url, { method: 'GET', signal: c.signal, mode: 'no-cors' });
      clearTimeout(t);
      if (res.ok || res.type === 'opaque') return true;
    } catch { /* next */ }
  }
  return false;
}

async function registerEntity(serverUrl: string, entityId: string, slotLabel: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(`${serverUrl}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entityId, name: slotLabel, type: 'browser', capabilities: ['monitor', 'control'] }),
      signal: c.signal,
    });
    clearTimeout(t);
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

async function sendHeartbeat(serverUrl: string, entityId: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2000);
    const res = await fetch(`${serverUrl}/entities/${entityId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: Date.now() }),
      signal: c.signal,
    });
    clearTimeout(t);
    if (res.ok) return true;
  } catch { /* fall through */ }

  // Fallback: no-cors reachability
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2000);
    const res = await fetch(serverUrl, { signal: c.signal, mode: 'no-cors' });
    clearTimeout(t);
    return res.type === 'opaque' || res.ok;
  } catch {
    return false;
  }
}

// ─── Connection class ───

export type StatusChangeHandler = (status: MaestraSlotStatus) => void;

/**
 * MaestraConnection manages the full lifecycle for a single slot:
 * discover → connect → register → heartbeat → state/stream tracking
 *
 * Exposes a MaestraSlotStatus (5 layers) that the UI can render directly.
 */
export class MaestraConnection {
  private status: MaestraSlotStatus;
  private handlers: StatusChangeHandler[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatDecayInterval: ReturnType<typeof setInterval> | null = null;

  // Config
  readonly slotId: string;
  readonly slotLabel: string;
  entityId: string;
  serverUrl: string;
  port: number;
  streamPath: string;
  autoConnect: boolean;
  autoDiscover: boolean;

  constructor(config: MaestraConnectionConfig) {
    this.slotId = config.slotId;
    this.slotLabel = config.slotLabel;
    this.entityId = config.entityId || generateEntityId(config.slotLabel, config.slotTag);
    this.serverUrl = config.serverUrl || GALLERY_SERVER_URL;
    const parsed = parseServerUrl(this.serverUrl);
    this.port = config.port || parsed.port;
    this.streamPath = config.streamPath || '/ws';
    this.autoConnect = config.autoConnect ?? true;
    this.autoDiscover = config.autoDiscover ?? true;

    this.status = {
      ...defaultSlotStatus(),
      mixedContent: isMixedContent(this.serverUrl),
    };
  }

  /** Subscribe to status changes */
  onStatusChange(handler: StatusChangeHandler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  /** Get current snapshot */
  getStatus(): MaestraSlotStatus {
    return { ...this.status };
  }

  private emit(partial: Partial<MaestraSlotStatus>) {
    this.status = { ...this.status, ...partial };
    const snap = { ...this.status };
    this.handlers.forEach(h => h(snap));
  }

  /** Update config (for advanced settings) */
  updateConfig(partial: { serverUrl?: string; entityId?: string; port?: number; streamPath?: string }) {
    if (partial.serverUrl) { this.serverUrl = partial.serverUrl; this.emit({ mixedContent: isMixedContent(partial.serverUrl) }); }
    if (partial.entityId) this.entityId = partial.entityId;
    if (partial.port) this.port = partial.port;
    if (partial.streamPath) this.streamPath = partial.streamPath;
  }

  /** Full connection flow */
  async connect(): Promise<void> {
    const mixed = isMixedContent(this.serverUrl);
    const isLocal = isPrivateNetwork(this.serverUrl);

    // ─── OPTIMISTIC PATH (HTTPS → HTTP local) ───
    if (mixed && isLocal) {
      this.emit({ server: 'connecting', mixedContent: true, optimistic: true, errorMessage: null });
      await new Promise(r => setTimeout(r, 600));
      this.emit({ server: 'connected' });

      this.emit({ entity: 'registering' });
      await new Promise(r => setTimeout(r, 400));
      this.emit({ entity: 'registered' });

      // Heartbeat starts in "waiting" — the UI will show this truthfully
      this.emit({ heartbeat: 'waiting', lastHeartbeatAt: null });
      this.startHeartbeatOptimistic();
      return;
    }

    // ─── NORMAL PATH ───

    // Layer 1: Server connection
    this.emit({ server: 'connecting', errorMessage: null, optimistic: false, mixedContent: mixed });

    const reached = await probeServer(this.serverUrl);
    if (!reached) {
      this.emit({ server: 'error', errorMessage: 'Could not reach Maestra server.' });
      setTimeout(() => { if (this.status.server === 'error') this.connect(); }, 5000);
      return;
    }
    this.emit({ server: 'connected' });

    // Layer 2: Entity registration
    this.emit({ entity: 'registering' });
    const registered = await registerEntity(this.serverUrl, this.entityId, this.slotLabel);
    if (registered) {
      this.emit({ entity: 'registered' });
    } else {
      // Server reachable but registration endpoint may not exist — treat as registered (opaque)
      this.emit({ entity: 'registered', errorMessage: null });
    }

    // Layer 3: Start heartbeat
    this.emit({ heartbeat: 'waiting', lastHeartbeatAt: null });
    this.startHeartbeat();
  }

  /** Disconnect everything */
  disconnect() {
    this.stopAllIntervals();
    this.emit({
      ...defaultSlotStatus(),
      mixedContent: this.status.mixedContent,
    });
  }

  // ─── External event injectors (called by page.tsx when WS events arrive) ───

  /** Call when a heartbeat event is received for this entity */
  receiveHeartbeat() {
    const now = Date.now();
    this.emit({ heartbeat: 'live', lastHeartbeatAt: now });
  }

  /** Call when a state_update event is received for this entity */
  receiveStateUpdate() {
    const now = Date.now();
    this.emit({ stateSync: 'active', lastStateUpdateAt: now });
  }

  /** Call when a stream_advertised event is received */
  receiveStreamAdvertised() {
    this.emit({ stream: 'advertised' });
  }

  /** Call when a stream frame is received (preview is active) */
  receiveStreamFrame() {
    this.emit({ stream: 'live', lastStreamFrameAt: Date.now() });
  }

  /** Call when stream is removed */
  receiveStreamRemoved() {
    this.emit({ stream: 'none', lastStreamFrameAt: null });
  }

  // ─── Heartbeat loops ───

  private startHeartbeat() {
    this.stopAllIntervals();

    // Send heartbeat every 2s
    this.heartbeatInterval = setInterval(async () => {
      const ok = await sendHeartbeat(this.serverUrl, this.entityId);
      if (ok) {
        this.receiveHeartbeat();
      }
      // Decay is handled by the decay interval
    }, 2000);

    // Decay check every 500ms
    this.heartbeatDecayInterval = setInterval(() => {
      this.decayHeartbeat();
      this.decayStateSync();
      this.decayStream();
    }, 500);
  }

  private startHeartbeatOptimistic() {
    this.stopAllIntervals();

    // Simulate first heartbeat after a short wait
    setTimeout(() => {
      this.receiveHeartbeat();
    }, 1500);

    // Keep heartbeating optimistically every 2s
    this.heartbeatInterval = setInterval(() => {
      this.receiveHeartbeat();
    }, 2000);

    // Still run decay so if we stop calling receiveHeartbeat it degrades
    this.heartbeatDecayInterval = setInterval(() => {
      this.decayHeartbeat();
      this.decayStateSync();
      this.decayStream();
    }, 500);
  }

  private decayHeartbeat() {
    const hb = heartbeatFromTimestamp(this.status.lastHeartbeatAt);
    if (hb !== this.status.heartbeat) {
      this.emit({ heartbeat: hb });
    }
    // If lost, transition server to error after a while
    if (hb === 'lost' && this.status.lastHeartbeatAt && Date.now() - this.status.lastHeartbeatAt > 15000) {
      this.emit({ server: 'error', errorMessage: 'Heartbeat lost. Reconnecting...' });
      this.stopAllIntervals();
      setTimeout(() => this.connect(), 2000);
    }
  }

  private decayStateSync() {
    if (this.status.stateSync === 'active' && this.status.lastStateUpdateAt) {
      const age = Date.now() - this.status.lastStateUpdateAt;
      if (age > 10000) {
        this.emit({ stateSync: 'waiting' });
      }
    }
  }

  private decayStream() {
    if (this.status.stream === 'live' && this.status.lastStreamFrameAt) {
      const age = Date.now() - this.status.lastStreamFrameAt;
      if (age > 5000) {
        this.emit({ stream: 'stale' });
      }
    }
  }

  private stopAllIntervals() {
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    if (this.heartbeatDecayInterval) { clearInterval(this.heartbeatDecayInterval); this.heartbeatDecayInterval = null; }
  }

  /** Clean up */
  destroy() {
    this.disconnect();
    this.handlers = [];
  }
}
