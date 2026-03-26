// src/app/api/routes/route.ts
// Server-side wiring map — connects + slots (publishers) to - slots (receivers)
//
// A "route" is: sourceSlug.sourceKey → targetSlug.targetKey
// When a + slot's state updates, the fan-out logic pushes that value to all wired - slots.

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-routes.json';

export interface WireRoute {
  id: string;                // unique route ID
  sourceSlug: string;        // + slot entity slug
  sourceKey: string;         // output signal key on source
  targetSlug: string;        // - slot entity slug
  targetKey: string;         // input key on target
  active: boolean;           // can be temporarily disabled
  createdAt: number;         // epoch ms
}

interface RouteStore {
  routes: WireRoute[];
}

function load(): RouteStore {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
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
  const store = load();
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
      createdAt: Date.now(),
    };

    store.routes.push(route);
    save(store);

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
    } else {
      route.active = !route.active; // toggle
    }
    save(store);

    return NextResponse.json({ ok: true, route });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
