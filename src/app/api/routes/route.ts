// src/app/api/routes/route.ts
// Server-side wiring map — connects + slots (publishers) to - slots (receivers)
//
// A "route" is: sourceSlug.sourceKey → targetSlug.targetKey
// When a + slot's state updates, the fan-out logic pushes that value to all wired - slots.

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-routes.json';
const BACKEND = 'https://maestra-backend-v2-production.up.railway.app';
const CONFIG_SLUG = '_monitor_config';

export interface WireRoute {
  id: string;                // unique route ID
  sourceSlug: string;        // + slot entity slug
  sourceKey: string;         // output signal key on source
  targetSlug: string;        // - slot entity slug
  targetKey: string;         // input key on target
  active: boolean;           // can be temporarily disabled
  amount: number;            // 0.0–1.0 gain/multiplier
  createdAt: number;         // epoch ms
}

interface RouteStore {
  routes: WireRoute[];
}

/** Fetch routes from Maestra backend (durable) */
async function loadFromBackend(): Promise<RouteStore> {
  try {
    const res = await fetch(`${BACKEND}/entities`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { routes: [] };
    const entities = await res.json() as Record<string, unknown>[];
    // Find latest _monitor_config by created_at
    const configs = entities
      .filter(e => e.slug === CONFIG_SLUG)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (configs.length === 0) return { routes: [] };
    const state = (configs[0].state as Record<string, unknown>) || {};
    const routes = (state.routes as WireRoute[]) || [];
    routes.forEach(r => { if (r.amount == null) r.amount = 1.0; });
    console.log(`[routes] Restored ${routes.length} routes from backend`);
    return { routes };
  } catch { return { routes: [] }; }
}

/** Sync routes to Maestra backend (durable, fire-and-forget) */
function syncToBackend(store: RouteStore) {
  // Read current tops from /tmp to preserve them
  let tops: string[] = [];
  let tree: Record<string, string[]> = {};
  try {
    const topsData = JSON.parse(fs.readFileSync('/tmp/maestra-tops.json', 'utf8'));
    // Flatten all tops
    Object.values(topsData).forEach((s: unknown) => {
      const entry = s as { tops?: string[]; tree?: Record<string, string[]> };
      if (entry.tops) tops = [...tops, ...entry.tops];
      if (entry.tree) tree = { ...tree, ...entry.tree };
    });
  } catch {}

  fetch(`${BACKEND}/entities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: CONFIG_SLUG,
      slug: CONFIG_SLUG,
      state: { routes: store.routes, tops, tree },
      tags: ['system'],
    }),
    signal: AbortSignal.timeout(5000),
  }).then(() => {
    console.log(`[routes] Synced ${store.routes.length} routes to backend`);
  }).catch(() => {});
}

function load(): RouteStore {
  try {
    const store = JSON.parse(fs.readFileSync(FILE, 'utf8')) as RouteStore;
    // Backfill amount for legacy routes
    store.routes.forEach(r => { if (r.amount == null) r.amount = 1.0; });
    return store;
  }
  catch { return { routes: [] }; }
}

function save(d: RouteStore) {
  try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch {}
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** GET /api/routes — list all routes, optionally filtered by slug */
export async function GET(req: NextRequest) {
  let store = load();
  // If /tmp is empty (Railway restart), restore from Maestra backend
  if (store.routes.length === 0) {
    store = await loadFromBackend();
    if (store.routes.length > 0) {
      save(store); // Cache locally for subsequent reads
    }
  }
  const slug = req.nextUrl.searchParams.get('slug');
  if (slug) {
    const filtered = store.routes.filter(
      r => r.sourceSlug === slug || r.targetSlug === slug
    );
    return NextResponse.json({ routes: filtered });
  }
  return NextResponse.json(store);
}

/** POST /api/routes — create a new wire route */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sourceSlug: string;
      sourceKey: string;
      targetSlug: string;
      targetKey: string;
    };

    if (!body.sourceSlug || !body.sourceKey || !body.targetSlug || !body.targetKey) {
      return NextResponse.json(
        { error: 'sourceSlug, sourceKey, targetSlug, and targetKey are all required' },
        { status: 400 }
      );
    }

    // Prevent self-wiring
    if (body.sourceSlug === body.targetSlug && body.sourceKey === body.targetKey) {
      return NextResponse.json({ error: 'Cannot wire a signal to itself' }, { status: 400 });
    }

    const store = load();

    // Check for duplicate
    const exists = store.routes.find(
      r => r.sourceSlug === body.sourceSlug &&
           r.sourceKey === body.sourceKey &&
           r.targetSlug === body.targetSlug &&
           r.targetKey === body.targetKey
    );
    if (exists) {
      return NextResponse.json({ ok: true, route: exists, duplicate: true });
    }

    const route: WireRoute = {
      id: makeId(),
      sourceSlug: body.sourceSlug,
      sourceKey: body.sourceKey,
      targetSlug: body.targetSlug,
      targetKey: body.targetKey,
      active: true,
      amount: (body as Record<string,unknown>).amount != null ? Number((body as Record<string,unknown>).amount) : 1.0,
      createdAt: Date.now(),
    };

    store.routes.push(route);
    save(store);
    syncToBackend(store);

    console.log(`[routes] Wire: ${route.sourceSlug}.${route.sourceKey} → ${route.targetSlug}.${route.targetKey}`);
    return NextResponse.json({ ok: true, route });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** DELETE /api/routes — remove a route by id */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { id: string };
    if (!body.id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const store = load();
    const before = store.routes.length;
    store.routes = store.routes.filter(r => r.id !== body.id);
    save(store);
    syncToBackend(store);

    return NextResponse.json({ ok: true, removed: before !== store.routes.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** PATCH /api/routes — toggle active/inactive on a route */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id: string; active?: boolean };
    if (!body.id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const store = load();
    const route = store.routes.find(r => r.id === body.id);
    if (!route) {
      return NextResponse.json({ error: 'route not found' }, { status: 404 });
    }

    if (body.active !== undefined) {
      route.active = body.active;
    } else if ((body as Record<string,unknown>).amount !== undefined) {
      route.amount = Number((body as Record<string,unknown>).amount);
    } else {
      route.active = !route.active; // toggle
    }
    save(store);
    syncToBackend(store);

    return NextResponse.json({ ok: true, route });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
