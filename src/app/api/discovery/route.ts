import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-discovery.json';
const BACKEND = 'https://maestra-backend-v2-production.up.railway.app';
const CONFIG_SLUG = '_monitor_config';
const MAX_EVENTS = 200;

interface StateKeyRecord { value: unknown; type: string; first_seen: number; last_seen: number; }
interface DiscoveredEntity {
  slug: string; label: string; entity_id: string; type: string; source_server: string;
  first_seen: number; last_seen: number; heartbeat_status: string; stream_status: string;
  state_keys: Record<string, StateKeyRecord>;
}
interface DiscoveryEvent { timestamp: number; entity_slug: string; event_type: string; message: string; }
interface DiscoveryStore { entities: Record<string, DiscoveredEntity>; events: DiscoveryEvent[]; last_sync: number; }

function emptyStore(): DiscoveryStore { return { entities: {}, events: [], last_sync: 0 }; }
function load(): DiscoveryStore { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return emptyStore(); } }
function save(d: DiscoveryStore) { try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch {} }

async function loadFromBackend(): Promise<DiscoveryStore> {
  try {
    const res = await fetch(`${BACKEND}/entities`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return emptyStore();
    const all = await res.json() as Record<string, unknown>[];
    const configs = all.filter(e => e.slug === CONFIG_SLUG).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (configs.length === 0) return emptyStore();
    const state = (configs[0].state as Record<string, unknown>) || {};
    return { ...emptyStore(), ...(state.discovery as DiscoveryStore || emptyStore()) };
  } catch { return emptyStore(); }
}

function syncToBackend(store: DiscoveryStore) {
  fetch(`${BACKEND}/entities`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: CONFIG_SLUG, slug: CONFIG_SLUG, state: { discovery: store }, tags: ['system'] }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

function mergeEntity(store: DiscoveryStore, incoming: {
  slug: string; label?: string; entity_id?: string; type?: string; source_server?: string;
  heartbeat_status?: string; stream_status?: string; state?: Record<string, unknown>;
}): boolean {
  const now = Date.now();
  if (!incoming.slug) return false;
  const existing = store.entities[incoming.slug];
  const isNew = !existing;
  const entity: DiscoveredEntity = existing || {
    slug: incoming.slug, label: incoming.label || incoming.slug, entity_id: incoming.entity_id || '',
    type: incoming.type || 'unknown', source_server: incoming.source_server || '',
    first_seen: now, last_seen: now, heartbeat_status: 'unknown', stream_status: 'none', state_keys: {},
  };
  entity.last_seen = now;
  if (incoming.label) entity.label = incoming.label;
  if (incoming.entity_id) entity.entity_id = incoming.entity_id;
  if (incoming.type) entity.type = incoming.type;
  if (incoming.source_server) entity.source_server = incoming.source_server;
  if (incoming.heartbeat_status) entity.heartbeat_status = incoming.heartbeat_status;
  if (incoming.stream_status) entity.stream_status = incoming.stream_status;
  if (incoming.state && typeof incoming.state === 'object') {
    for (const [key, value] of Object.entries(incoming.state)) {
      if (key.startsWith('_')) continue;
      const ek = entity.state_keys[key];
      if (ek) { ek.value = value; ek.last_seen = now; }
      else { entity.state_keys[key] = { value, type: typeof value, first_seen: now, last_seen: now }; }
    }
  }
  store.entities[incoming.slug] = entity;
  if (isNew) {
    store.events.push({ timestamp: now, entity_slug: incoming.slug, event_type: 'entity_discovered',
      message: `New entity: ${entity.label} (${entity.type}) from ${entity.source_server}` });
    if (store.events.length > MAX_EVENTS) store.events = store.events.slice(-MAX_EVENTS);
  }
  return isNew;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' };

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function GET() {
  let store = load();
  if (Object.keys(store.entities).length === 0) {
    store = await loadFromBackend();
    if (Object.keys(store.entities).length > 0) save(store);
  }
  return NextResponse.json(store, { headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      entities?: Array<{ slug: string; label?: string; entity_id?: string; type?: string; source_server?: string; heartbeat_status?: string; stream_status?: string; state?: Record<string, unknown> }>;
      events?: Array<{ entity_slug: string; event_type: string; message: string }>;
    };
    let store = load();
    if (Object.keys(store.entities).length === 0) store = await loadFromBackend();
    let newCount = 0, updateCount = 0;
    if (body.entities) {
      for (const e of body.entities) { if (mergeEntity(store, e)) newCount++; else updateCount++; }
    }
    if (body.events) {
      for (const evt of body.events) {
        store.events.push({ timestamp: Date.now(), entity_slug: evt.entity_slug, event_type: evt.event_type, message: evt.message });
        if (store.events.length > MAX_EVENTS) store.events = store.events.slice(-MAX_EVENTS);
      }
    }
    store.last_sync = Date.now();
    save(store);
    syncToBackend(store);
    return NextResponse.json({ ok: true, new: newCount, updated: updateCount, total: Object.keys(store.entities).length }, { headers: CORS });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500, headers: CORS }); }
}
