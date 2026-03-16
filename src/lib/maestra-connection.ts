/**
 * Maestra Auto-Connection Module
 *
 * Handles automatic connection to a Maestra server with:
 * 1. Auto-discovery (HTTP probe)
 * 2. Fallback to configured gallery server
 * 3. Mixed-content detection (HTTPS page → HTTP server)
 * 4. Optimistic connection when browser can't reach local server
 * 5. Entity ID generation from slot name/role
 * 6. Health checks and reconnection
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
  /** True when connected optimistically (browser can't verify due to mixed content) */
  optimistic: boolean;
  /** True when HTTPS page is trying to reach HTTP server */
  mixedContent: boolean;
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

/** Detect if we're on HTTPS trying to reach HTTP — browsers block this */
function isMixedContent(targetUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  const pageProtocol = window.location.protocol; // 'https:' or 'http:'
  try {
    const target = new URL(targetUrl);
    return pageProtocol === 'https:' && target.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Check if a URL points to a private/local network address */
function isPrivateNetwork(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname;
    return (
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.startsWith('172.') ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1'
    );
  } catch {
    return false;
  }
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
async function discoverServer(serverUrl: string, timeoutMs = 2000): Promise<string | null> {
  const probeUrls = [
    `${serverUrl}/api/health`,
    `${serverUrl}/entities`,
    `${serverUrl}/api/status`,
    serverUrl,
  ];

  for (const url of probeUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors',
      });
      clearTimeout(timeout);
      if (res.ok || res.type === 'opaque') {
        return serverUrl;
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
    return res.ok || res.status === 409;
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
    if (res.ok) return true;
  } catch {
    // Fall through to no-cors probe
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(serverUrl, {
      signal: controller.signal,
      mode: 'no-cors',
    });
    clearTimeout(timeout);
    return res.type === 'opaque' || res.ok;
  } catch {
    return false;
  }
}

export type ConnectionEventHandler = (state: MaestraConnectionState) => void;

/**
 * MaestraConnection manages the full auto-connection lifecycle:
 * discover → connect → register → heartbeat
 *
 * When a mixed-content situation is detected (HTTPS page → HTTP local server),
 * it connects optimistically — the dashboard works as a control surface
 * while real Maestra ↔ TD communication happens natively in TouchDesigner.
 */
export class MaestraConnection {
  private state: MaestraConnectionState;
  private handlers: ConnectionEventHandler[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MaestraConnectionConfig) {
    const entityId = config.entityId || generateEntityId(config.slotLabel, config.slotTag);
    const parsed = parseServerUrl(config.serverUrl || GALLERY_SERVER_URL);
    const targetUrl = config.serverUrl || GALLERY_SERVER_URL;

    this.state = {
      status: 'disconnected',
      serverUrl: targetUrl,
      entityId,
      slotId: config.slotId,
      port: config.port || parsed.port,
      streamPath: config.streamPath || '/ws',
      autoConnect: config.autoConnect ?? true,
      autoDiscover: config.autoDiscover ?? true,
      discoveredUrl: null,
      errorMessage: null,
      lastHeartbeat: null,
      optimistic: false,
      mixedContent: isMixedContent(targetUrl),
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
    if (partial.serverUrl) {
      const mixed = isMixedContent(partial.serverUrl);
      this.setState({ ...partial, mixedContent: mixed });
    } else {
      this.setState(partial);
    }
  }

  /** Full connection flow: discover → connect → register → heartbeat */
  async connect(): Promise<void> {
    const mixed = isMixedContent(this.state.serverUrl);
    const isLocal = isPrivateNetwork(this.state.serverUrl);
    this.setState({ mixedContent: mixed });

    // MIXED CONTENT: HTTPS → HTTP local server
    // Browser will block all requests. Connect optimistically.
    if (mixed && isLocal) {
      this.setState({ status: 'discovering' });

      // Brief pause to show discovering state
      await new Promise(r => setTimeout(r, 800));
      this.setState({ status: 'connecting' });
      await new Promise(r => setTimeout(r, 600));

      // Optimistic connect — we can't verify, but we know the config
      this.setState({
        status: 'connected',
        optimistic: true,
        lastHeartbeat: Date.now(),
        errorMessage: null,
      });
      this.startHeartbeatOptimistic();
      return;
    }

    // NORMAL CONNECTION FLOW (same protocol, or reachable server)

    // Step 1: Auto-discovery
    if (this.state.autoDiscover) {
      this.setState({ status: 'discovering', errorMessage: null });

      const discovered = await discoverServer(this.state.serverUrl);
      if (discovered) {
        this.setState({ discoveredUrl: discovered, serverUrl: discovered });
      }
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
        optimistic: false,
        lastHeartbeat: Date.now(),
        errorMessage: null,
      });
      this.startHeartbeat();
      return;
    }

    // Try no-cors reachability check
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(this.state.serverUrl, {
        signal: controller.signal,
        mode: 'no-cors',
      });
      clearTimeout(timeout);

      if (res.ok || res.type === 'opaque') {
        this.setState({
          status: 'connected',
          optimistic: false,
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
      optimistic: false,
    });
  }

  /** Start heartbeat loop — real server verification */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(async () => {
      const ok = await sendHeartbeat(this.state.serverUrl, this.state.entityId);
      if (ok) {
        this.setState({ lastHeartbeat: Date.now() });
      } else {
        const timeSinceLastHB = this.state.lastHeartbeat
          ? Date.now() - this.state.lastHeartbeat
          : Infinity;
        if (timeSinceLastHB > 45000) {
          this.setState({ status: 'error', errorMessage: 'Heartbeat lost. Reconnecting...' });
          this.stopHeartbeat();
          setTimeout(() => this.connect(), 2000);
        }
      }
    }, 5000);
  }

  /** Start heartbeat loop — optimistic mode (just update timestamp) */
  private startHeartbeatOptimistic() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.setState({ lastHeartbeat: Date.now() });
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
