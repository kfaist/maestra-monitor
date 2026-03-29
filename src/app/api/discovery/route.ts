// /api/discovery — shared entity/state/stream discovery store
// Gallery browser discovers from local server → POST here → persists to backend
// Every browser reads from GET → sees same canonical discovery state
//
// Stored on _monitor_config entity in Maestra backend (durable, cross-machine)

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-discovery.json';
const BACKEND = 'https://maestra-backend-v2-production.up.railway.app';
const CONFIG_SLUG = '_monitor_config';
const MAX_EVENTS = 200;

interface StateKeyRecord {
  value: unknown;
  type: string;
  first_seen: number;
  last_seen: number;
}

interface DiscoveredEntity {
  slug: string;
  label: string;
  entity_id: string;
  type: string;
  source_server: string;
  first_seen: number;
  last_seen: number;
  heartbeat_status: string; // live, stale, lost, unknown
  stream_status: string;    // live, advertised, stale, none
  state_keys: Record<string, StateKeyRecord>;
}

interface DiscoveryEvent {
  timestamp: number;
  entity_slug: string;
  event_type: string;
  message: string;
}

interface DiscoveryStore {
  entities: Record<string, DiscoveredEntity>;
  events: DiscoveryEvent[];
  last_sync: number;
}

function emptyStore(): DiscoveryStore {
  return { entities: {}, events: [], last_sync: 0 };
}

function load(): DiscoveryStore {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return emptyStore(); }
}

function save(d: DiscoveryStore) {
  try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch {}
}

// ── Backend sync ──

async function loadFromBackend(): Promise<DiscoveryStore> {
  try {
    const res = await fetch(`${BACKEND}/entities`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return emptyStore();
    const all = await res.json() as Record<string, unknown>[];
    const configs = all
      .filter(e => e.slug === CONFIG_SLUG)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (configs.length === 0) return emptyStore();
    const state = (configs[0].state as Record<string, unknown>) || {};
    const discovery = (state.discovery as DiscoveryStore) || emptyStore();
    if (discovery.entities) {
      console.log(`[discovery] Restored ${Object.keys(discovery.entities).length} entities from backend`);
    }
    return { ...emptyStore(), ...discovery };
  } catch { return emptyStore(); }
}

function syncToBackend(store: DiscoveryStore) {
  // Read existing config state to preserve routes/tree/tops
  const configState: Record<string, unknown> = {};
  try {
    const existing = JSON.parse(fs.readFileSync('/tmp/maestra-routes.json', 'utf8'));
    configState.routes = existing.routes || [];
  } catch { configState.routes = []; }
  try {
    const tops = JSON.parse(fs.readFileSync('/tmp/maestra-tops.json', 'utf8'));
    const allTops: string[] = [];
    const allTree: Record<string, string[]> = {};
    Object.values(tops).forEach((s: unknown) => {
      const entry = s as { tops?: string[]; tree?: Record<string, string[]> };
      if (entry.tops) allTops.push(...entry.tops);
      if (entry.tree) Object.assign(allTree, entry.tree);
    });
    configState.tops = allTops;
    configState.tree = allTree;
  } catch {}

  fetch(`${BACKEND}/entities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: CONFIG_SLUG,
      slug: CONFIG_SLUG,
      state: { ...configState, discovery: store },
      tags: ['system'],
    }),
    signal: AbortSignal.timeout(5000),
  }).then(() => {
    console.log(`[discovery] Synced ${Object.keys(store.entities).length} entities to backend`);
  }).catch(() => {});
}

// ── Merge logic (additive — never removes) ──

function mergeEntity(
  store: DiscoveryStore,
  incoming: {
    slug: string;
    label?: string;
    entity_id?: string;
    type?: string;
    source_server?: string;
    heartbeat_status?: string;
    stream_status?: string;
    state?: Record<string, unknown>;
  }
): boolean {
  const now = Date.now();
  const slug = incoming.slug;
  if (!slug) return false;

  const existing = store.entities[slug];
  const isNew = !existing;

  const entity: DiscoveredEntity = existing || {
    slug,
    label: incoming.label || slug,
    entity_id: incoming.entity_id || '',
    type: incoming.type || 'unknown',
    source_server: incoming.source_server || '',
    first_seen: now,
    last_seen: now,
    heartbeat_status: 'unknown',
    stream_status: 'none',
    state_keys: {},
  };

  // Update mutable fields
  entity.last_seen = now;
  if (incoming.label) entity.label = incoming.label;
  if (incoming.entity_id) entity.entity_id = incoming.entity_id;
  if (incoming.type) entity.type = incoming.type;
  if (incoming.source_server) entity.source_server = incoming.source_server;
  if (incoming.heartbeat_status) entity.heartbeat_status = incoming.heartbeat_status;
  if (incoming.stream_status) entity.stream_status = incoming.stream_status;

  // Merge state keys
  if (incoming.state && typeof incoming.state === 'object') {
    for (const [key, value] of Object.entries(incoming.state)) {
      if (key.startsWith('_')) continue; // skip internal keys
      const existingKey = entity.state_keys[key];
      if (existingKey) {
        existingKey.value = value;
        existingKey.last_seen = now;
      } else {
        entity.state_keys[key] = {
          value,
          type: typeof value,
          first_seen: now,
          last_seen: now,
        };
      }
    }
  }

  store.entities[slug] = entity;

  // Log discovery event
  if (isNew) {
    store.events.push({
      timestamp: now,
      entity_slug: slug,
      event_type: 'entity_discovered',
      message: `New entity: ${entity.label} (${entity.type}) from ${entity.source_server}`,
    });
  }

  return isNew;
}

function addEvent(store: DiscoveryStore, event: DiscoveryEvent) {
  store.events.push(event);
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(-MAX_EVENTS);
  }
}

// ── HTTP handlers ──

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** GET /api/discovery — canonical discovery state for all browsers */
export async function GET() {
  let store = load();
  // If /tmp is empty (Railway restart), restore from backend
  if (Object.keys(store.entities).length === 0) {
    store = await loadFromBackend();
    if (Object.keys(store.entities).length > 0) {
      save(store);
    }
  }
  return NextResponse.json(store, { headers: CORS });
}

/** POST /api/discovery — merge new discoveries from any browser
 *  Body: { entities: [ { slug, label?, entity_id?, type?, source_server?,
 *          heartbeat_status?, stream_status?, state?: {} } ] }
 *  Optional: { events: [ { entity_slug, event_type, message } ] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      entities?: Array<{
        slug: string;
        label?: string;
        entity_id?: string;
        type?: string;
        source_server?: string;
        heartbeat_status?: string;
        stream_status?: string;
        state?: Record<string, unknown>;
      }>;
      events?: Array<{ entity_slug: string; event_type: string; message: string }>;
    };

    let store = load();
    // Restore from backend if empty
    if (Object.keys(store.entities).length === 0) {
      store = await loadFromBackend();
    }

    let newCount = 0;
    let updateCount = 0;

    if (body.entities) {
      for (const incoming of body.entities) {
        const isNew = mergeEntity(store, incoming);
        if (isNew) newCount++;
        else updateCount++;
      }
    }

    if (body.events) {
      for (const evt of body.events) {
        addEvent(store, {
          timestamp: Date.now(),
          entity_slug: evt.entity_slug,
          event_type: evt.event_type,
          message: evt.message,
        });
      }
    }

    store.last_sync = Date.now();
    save(store);
    syncToBackend(store);

    return NextResponse.json(
      { ok: true, new: newCount, updated: updateCount, total: Object.keys(store.entities).length },
      { headers: CORS }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers: CORS });
  }
}
