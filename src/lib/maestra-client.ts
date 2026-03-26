/**
 * MaestraClient — all real Maestra API calls
 * 
 * Architecture: this dashboard is the FRONTEND for Jordan's Maestra system.
 * We never duplicate data — we read from /entities, write to /state.
 * 
 * Endpoints:
 *   GET  /entities           — list all entities (periodic reconciliation)
 *   POST /entities           — register new entity (wizard step 1)
 *   GET  /entities/{id}      — get single entity (active card updates)
 *   PATCH /entities/{id}     — update metadata/schema (wizard step 2)
 *   PATCH /entities/{id}/state — publish live state (TD publishes, not us)
 *   POST /entities/{slug}/heartbeat — keep alive
 */

export interface MaestraEntity {
  id: string;           // UUID from server
  slug: string;         // human slug
  name: string;
  state: Record<string, unknown>;
  metadata: {
    stateSchema?: Record<string, {
      type: string;
      direction: 'input' | 'output';
      default?: unknown;
      description?: string;
    }>;
    bindings?: Record<string, unknown>;
    toe_name?: string;
    tops?: string[];
    server?: string;
  };
  last_heartbeat?: number;
  created_at?: string;
}

export class MaestraClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setUrl(url: string) { this.baseUrl = url.replace(/\/$/, ''); }

  private async req<T>(path: string, opts?: RequestInit): Promise<T | null> {
    try {
      const r = await fetch(this.baseUrl + path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...opts?.headers },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return null;
      return await r.json() as T;
    } catch { return null; }
  }

  /** GET /entities — full list for grid reconciliation */
  async listEntities(): Promise<MaestraEntity[]> {
    const res = await this.req<MaestraEntity[] | { entities: MaestraEntity[] }>('/entities');
    if (!res) return [];
    return Array.isArray(res) ? res : (res as { entities: MaestraEntity[] }).entities ?? [];
  }

  /** GET /entities/{id} — single entity for active card */
  async getEntity(id: string): Promise<MaestraEntity | null> {
    return this.req<MaestraEntity>(`/entities/${id}`);
  }

  /** POST /entities — wizard step 1: create entity */
  async createEntity(slug: string, name: string): Promise<MaestraEntity | null> {
    return this.req<MaestraEntity>('/entities', {
      method: 'POST',
      body: JSON.stringify({
        name,
        slug,
        metadata: { stateSchema: {}, bindings: {} },
      }),
    });
  }

  /** PATCH /entities/{id} — wizard step 2: register stateSchema */
  async registerSchema(
    id: string,
    schema: Record<string, { type: string; direction: 'input' | 'output'; description?: string }>
  ): Promise<MaestraEntity | null> {
    return this.req<MaestraEntity>(`/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ metadata: { stateSchema: schema } }),
    });
  }

  /** PATCH /entities/{id}/state — wizard step 3: initialize empty state keys */
  async initState(id: string, keys: string[]): Promise<boolean> {
    const state: Record<string, null> = {};
    keys.forEach(k => { state[k] = null; });
    const res = await this.req(`/entities/${id}/state`, {
      method: 'PATCH',
      body: JSON.stringify(state),
    });
    return res !== null;
  }

  /** PATCH /entities/{id}/state — live state publish (TD does this, not UI) */
  async publishState(id: string, state: Record<string, unknown>): Promise<boolean> {
    const res = await this.req(`/entities/${id}/state`, {
      method: 'PATCH',
      body: JSON.stringify(state),
    });
    return res !== null;
  }

  /** Probe server reachability */
  async probe(): Promise<boolean> {
    try {
      const r = await fetch(this.baseUrl + '/health', { signal: AbortSignal.timeout(3000) });
      return r.ok;
    } catch {
      try {
        const r = await fetch(this.baseUrl + '/entities', { signal: AbortSignal.timeout(3000) });
        return r.ok;
      } catch { return false; }
    }
  }
}

export const GALLERY_URL  = 'http://192.168.128.115:8080';
export const RAILWAY_URL  = 'https://maestra-backend-v2-production.up.railway.app';

/** Resolve active server URL from mode */
export function resolveServerUrl(
  mode: 'auto' | 'gallery' | 'railway' | 'custom',
  customUrl = ''
): string {
  if (mode === 'gallery') return GALLERY_URL;
  if (mode === 'custom' && customUrl) return customUrl;
  if (mode === 'railway') return RAILWAY_URL;
  return GALLERY_URL; // auto starts with gallery
}
