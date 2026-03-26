// src/app/api/fanout/route.ts
// Server fan-out: when a + slot's state updates, push values to all wired - slots
//
// Called by the dashboard's entity polling loop when it detects a state change.
// Reads /api/routes to find active wires, then PATCHes the target entity's state
// on the Maestra Fleet Manager.

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const ROUTES_FILE = '/tmp/maestra-routes.json';

interface WireRoute {
  id: string;
  sourceSlug: string;
  sourceKey: string;
  targetSlug: string;
  targetKey: string;
  active: boolean;
  createdAt: number;
}

interface RouteStore {
  routes: WireRoute[];
}

function loadRoutes(): RouteStore {
  try { return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')); }
  catch { return { routes: [] }; }
}

/**
 * POST /api/fanout
 *
 * Body: {
 *   sourceSlug: string,          // the + slot that just updated
 *   state: Record<string, any>,  // the full current state of the source entity
 *   serverUrl: string            // Maestra Fleet Manager base URL
 * }
 *
 * For each active route where sourceSlug matches and sourceKey is in state,
 * PATCH the target entity's state on the Fleet Manager.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sourceSlug: string;
      state: Record<string, unknown>;
      serverUrl: string;
    };

    if (!body.sourceSlug || !body.state || !body.serverUrl) {
      return NextResponse.json(
        { error: 'sourceSlug, state, and serverUrl required' },
        { status: 400 }
      );
    }

    const store = loadRoutes();
    const activeRoutes = store.routes.filter(
      r => r.active && r.sourceSlug === body.sourceSlug
    );

    if (activeRoutes.length === 0) {
      return NextResponse.json({ ok: true, pushed: 0, message: 'No active routes for this source' });
    }

    const serverUrl = body.serverUrl.replace(/\/$/, '');
    const results: { route: string; ok: boolean; error?: string }[] = [];

    // Group by target slug to batch updates
    const targetUpdates = new Map<string, Record<string, unknown>>();

    for (const route of activeRoutes) {
      const sourceValue = body.state[route.sourceKey];
      if (sourceValue === undefined) continue;

      const existing = targetUpdates.get(route.targetSlug) || {};
      existing[route.targetKey] = sourceValue;
      targetUpdates.set(route.targetSlug, existing);
    }

    // Push to each target entity
    for (const [targetSlug, stateUpdate] of targetUpdates) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${serverUrl}/entities/${targetSlug}/state`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stateUpdate),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const keys = Object.keys(stateUpdate);
        results.push({
          route: `${body.sourceSlug} → ${targetSlug} [${keys.join(', ')}]`,
          ok: res.ok,
          error: res.ok ? undefined : `HTTP ${res.status}`,
        });
      } catch (e) {
        results.push({
          route: `${body.sourceSlug} → ${targetSlug}`,
          ok: false,
          error: String(e),
        });
      }
    }

    const pushed = results.filter(r => r.ok).length;
    console.log(`[fanout] ${body.sourceSlug}: ${pushed}/${results.length} targets updated`);

    return NextResponse.json({ ok: true, pushed, total: results.length, results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
