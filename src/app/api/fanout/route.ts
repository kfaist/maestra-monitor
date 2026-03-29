// src/app/api/fanout/route.ts
// Server fan-out: when a + slot's state updates, push values to all wired - slots
//
// Called by the dashboard's entity polling loop when it detects a state change.
// Reads /api/routes to find active wires, then delivers state to target entities.
//
// IMPORTANT: The Maestra backend only supports POST /entities (upsert).
// PATCH /entities/:slug/state returns 404 on Railway, 403 on gallery.
// So we: GET current entity → merge keys → POST upsert with merged state.

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
  amount?: number;
  createdAt: number;
}

interface RouteStore {
  routes: WireRoute[];
}

function loadRoutes(): RouteStore {
  try { return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')); }
  catch { return { routes: [] }; }
}

/** GET existing entity state from backend, returns {} if not found */
async function getEntityState(serverUrl: string, targetSlug: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${serverUrl}/entities`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return {};
    const entities = await res.json() as Array<Record<string, unknown>>;
    // Find entity by slug (normalize spaces/underscores)
    const norm = (s: string) => s.replace(/[\s_]+/g, '_').toLowerCase();
    const target = norm(targetSlug);
    const match = entities.find(e => {
      const slug = norm(String(e.slug || ''));
      const name = norm(String(e.name || ''));
      return slug === target || name === target;
    });
    if (!match) return {};
    return (match.state as Record<string, unknown>) || {};
  } catch {
    return {};
  }
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
 * merge the value into the target entity's state via POST /entities upsert.
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
    const results: { route: string; ok: boolean; error?: string; delivered?: Record<string, unknown> }[] = [];

    // Group by target slug to batch updates
    const targetUpdates = new Map<string, Record<string, unknown>>();

    for (const route of activeRoutes) {
      const sourceValue = body.state[route.sourceKey];
      if (sourceValue === undefined) continue;

      const existing = targetUpdates.get(route.targetSlug) || {};
      // Apply amount/gain if present
      const amount = route.amount ?? 1.0;
      if (typeof sourceValue === 'number' && amount !== 1.0) {
        existing[route.targetKey] = sourceValue * amount;
      } else {
        existing[route.targetKey] = sourceValue;
      }
      targetUpdates.set(route.targetSlug, existing);
    }

    // Deliver to each target entity via POST upsert (merge state)
    for (const [targetSlug, newKeys] of targetUpdates) {
      try {
        // Step 1: GET current state so we can merge (not overwrite)
        const currentState = await getEntityState(serverUrl, targetSlug);

        // Step 2: Merge — new keys win, existing keys preserved
        const mergedState = { ...currentState, ...newKeys };

        // Step 3: POST upsert with merged state
        const res = await fetch(`${serverUrl}/entities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: targetSlug,
            slug: targetSlug,
            state: mergedState,
            tags: ['fanout'],
          }),
          signal: AbortSignal.timeout(5000),
        });

        const keys = Object.keys(newKeys);
        results.push({
          route: `${body.sourceSlug} → ${targetSlug} [${keys.join(', ')}]`,
          ok: res.ok,
          delivered: newKeys,
          error: res.ok ? undefined : `HTTP ${res.status}`,
        });

        if (res.ok) {
          console.log(`[fanout] Delivered: ${body.sourceSlug} → ${targetSlug} [${keys.join(', ')}]`);
        }
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
