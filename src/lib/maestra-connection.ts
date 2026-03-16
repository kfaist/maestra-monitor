/**
 * Maestra Auto-Connection Module
 *
 * Handles automatic connection to a Maestra server with:
 * 1. Auto-discovery (mDNS/broadcast probe)
 * 2. Fallback to configured gallery server
 * 3. Entity ID generation from slot name/role
 * 4. Health checks and reconnection
 */

export const GALLERY_SERVER_URL = 'http://192.168.128.115:8080';

export type MaestraConnectionStatus = 'disconnected' | 'discovering' | 'connecting' | 'connected' | 'error';

export interface MaestraConnectionState {
  status: MaestraConnectionStatus;
  serverUrl: string;
  entityId: string;
  slotId: string;
  port: number;
  streamPath: string;
  autoConnect: boolean;
  autoDiscover: boolean;
  discoveredUrl: string | null;
  errorMessage: string | null;
  lastHeartbeat: number | null;
}

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

/** Generate an entity ID from a slot label and tag */
export function generateEntityId(label: string, tag?: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const prefix = tag ? `${tag}_` : 'td_';
  const suffix = `_${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}${base}${suffix}`;
}

/** Parse a server URL into host and port */
export function parseServerUrl(url: string): { host: string; port: number } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80),
    };
  } catch {
    return { host: url, port: 8080 };
  }
}

/** Attempt to discover a Maestra server via HTTP probe */
async function discoverServer(timeoutMs = 2000): Promise<string | null> {
  // Try common discovery endpoints
  const probeUrls = [
    `${GALLERY_SERVER_URL}/api/health`,
    `${GALLERY_SERVER_URL}/entities`,
    `${GALLERY_SERVER_URL}/api/status`,
    GALLERY_SERVER_URL,
  ];

  for (const url of probeUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors', // Allow opaque responses for reachability check
      });
      clearTimeout(timeout);
      // If we get any response (even opaque), the server is reachable
      if (res.ok || res.type === 'opaque') {
        return GALLERY_SERVER_URL;
      }
    } catch {
      // Continue to next probe
    }
  }
  return null;
}

/** Attempt to register an entity with the Maestra server */
async function registerEntity(
  serverUrl: string,
  entityId: string,
  slotLabel: string,
  timeoutMs = 3000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${serverUrl}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_id: entityId,
        name: slotLabel,
        type: 'browser',
        capabilities: ['monitor', 'control'],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok || res.status === 409; // 409 = already registered, that's fine
  } catch {
    return false;
  }
}

/** Send a heartbeat to the Maestra server */
async function sendHeartbeat(serverUrl: string, entityId: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${serverUrl}/entities/${entityId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: Date.now() }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export type ConnectionEventHandler = (state: MaestraConnectionState) => void;

/**
 * MaestraConnection manages the full auto-connection lifecycle:
 * discover → connect → register → heartbeat
 */
export class MaestraConnection {
  private state: MaestraConnectionState;
  private handlers: ConnectionEventHandler[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MaestraConnectionConfig) {
    const entityId = config.entityId || generateEntityId(config.slotLabel, config.slotTag);
    const parsed = parseServerUrl(config.serverUrl || GALLERY_SERVER_URL);

    this.state = {
      status: 'disconnected',
      serverUrl: config.serverUrl || GALLERY_SERVER_URL,
      entityId,
      slotId: config.slotId,
      port: config.port || parsed.port,
      streamPath: config.streamPath || '/ws',
      autoConnect: config.autoConnect ?? true,
      autoDiscover: config.autoDiscover ?? true,
      discoveredUrl: null,
      errorMessage: null,
      lastHeartbeat: null,
    };
  }

  /** Subscribe to state changes */
  onStateChange(handler: ConnectionEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  /** Get current state snapshot */
  getState(): MaestraConnectionState {
    return { ...this.state };
  }

  /** Update state and notify */
  private setState(partial: Partial<MaestraConnectionState>) {
    this.state = { ...this.state, ...partial };
    this.handlers.forEach(h => h({ ...this.state }));
  }

  /** Update config (for advanced settings) */
  updateConfig(partial: Partial<Pick<MaestraConnectionState, 'serverUrl' | 'entityId' | 'port' | 'streamPath'>>) {
    this.setState(partial);
  }

  /** Full connection flow: discover → connect → register → heartbeat */
  async connect(): Promise<void> {
    // Step 1: Auto-discovery
    if (this.state.autoDiscover) {
      this.setState({ status: 'discovering', errorMessage: null });

      const discovered = await discoverServer();
      if (discovered) {
        this.setState({ discoveredUrl: discovered, serverUrl: discovered });
      }
      // If discovery fails, we fall through to the configured serverUrl
    }

    // Step 2: Connect / Register
    this.setState({ status: 'connecting' });

    const registered = await registerEntity(
      this.state.serverUrl,
      this.state.entityId,
      this.state.slotId
    );

    if (registered) {
      this.setState({
        status: 'connected',
        lastHeartbeat: Date.now(),
        errorMessage: null,
      });
      this.startHeartbeat();
      return;
    }

    // Even if registration fails (server might not have /entities POST),
    // try to verify the server is reachable
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(this.state.serverUrl, {
        signal: controller.signal,
        mode: 'no-cors',
      });
      clearTimeout(timeout);

      if (res.ok || res.type === 'opaque') {
        // Server is reachable even if registration endpoint doesn't exist
        this.setState({
          status: 'connected',
          lastHeartbeat: Date.now(),
          errorMessage: null,
        });
        this.startHeartbeat();
        return;
      }
    } catch {
      // Server unreachable
    }

    this.setState({
      status: 'error',
      errorMessage: 'Could not reach Maestra server. Will retry...',
    });

    // Retry in 5s
    setTimeout(() => {
      if (this.state.status === 'error') {
        this.connect();
      }
    }, 5000);
  }

  /** Disconnect and stop heartbeat */
  disconnect() {
    this.stopHeartbeat();
    this.setState({
      status: 'disconnected',
      lastHeartbeat: null,
      errorMessage: null,
    });
  }

  /** Start heartbeat loop */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(async () => {
      const ok = await sendHeartbeat(this.state.serverUrl, this.state.entityId);
      if (ok) {
        this.setState({ lastHeartbeat: Date.now() });
      } else {
        // Server might have gone away — keep connected status but note the failure
        // After 3 missed heartbeats, reconnect
        const timeSinceLastHB = this.state.lastHeartbeat
          ? Date.now() - this.state.lastHeartbeat
          : Infinity;
        if (timeSinceLastHB > 20000) {
          this.setState({ status: 'error', errorMessage: 'Heartbeat lost. Reconnecting...' });
          this.stopHeartbeat();
          setTimeout(() => this.connect(), 2000);
        }
      }
    }, 5000);
  }

  /** Stop heartbeat loop */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /** Clean up */
  destroy() {
    this.disconnect();
    this.handlers = [];
  }
}
