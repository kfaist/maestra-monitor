// src/app/api/fanout/route.ts
// Server fan-out: when a + slot's state updates, push values to all wired - slots
//
// ARCHITECTURE NOTE:
// The Maestra backend POST /entities ALWAYS creates a new entity — it does not upsert.
// PATCH /entities/:id/state returns 404 on Railway.
// So every fanout write creates a duplicate. The receiver must always pick the latest
// by created_at. This is an accepted tradeoff until the backend adds real upsert.

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const ROUTES_FILE = '/tmp/maestra-routes.json';
const BACKEND = 'https://maestra-backend-v2-production.up.railway.app';

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

function loadRoutes(): { routes: WireRoute[] } {
  try { return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')); }
  catch { return { routes: [] }; }
}

/** Resolve entity by slug — always picks LATEST by created_at */
async function resolveEntity(serverUrl: string, targetSlug: string): Promise<{
  id: string;
  state: Record<string, unknown>;
  matchCount: number;
} | null> {
  try {
    const res = await fetch(`${serverUrl}/entities`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const entities = await res.json() as Array<Record<string, unknown>>;
    const norm = (s: string) => s.replace(/[\s_]+/g, '_').toLowerCase();
    const target = norm(targetSlug);
    const matches = entities.filter(e => {
      const slug = norm(String(e.slug || ''));
      const name = norm(String(e.name || ''));
      return slug === target || name === target;
    });
    if (matches.length === 0) return null;
    const latest = matches.sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    )[0];
    return {
      id: String(latest.id),
      state: (latest.state as Record<string, unknown>) || {},
      matchCount: matches.length,
    };
  } catch { return null; }
}

/** Verify write by reading back latest entity */
async function verifyWrite(serverUrl: string, slug: string, key: string, expected: unknown): Promise<{
  verified: boolean; actual: unknown; entityId: string;
}> {
  try {
    const entity = await resolveEntity(serverUrl, slug);
    if (!entity) return { verified: false, actual: 'NOT_FOUND', entityId: '' };
    const actual = entity.state[key];
    return {
      verified: JSON.stringify(actual) === JSON.stringify(expected),
      actual,
      entityId: entity.id,
    };
  } catch { return { verified: false, actual: 'ERROR', entityId: '' }; }
}

/** Core write: resolve latest → merge → POST → verify */
async function writeState(
  serverUrl: string,
  targetSlug: string,
  newKeys: Record<string, unknown>,
  tag: string
): Promise<{ ok: boolean; debug: Record<string, unknown> }> {
  const entity = await resolveEntity(serverUrl, targetSlug);
  const currentState = entity?.state || {};
  const mergedState = { ...currentState, ...newKeys };
  const keys = Object.keys(newKeys);

  console.log(`[fanout] ${tag} → ${targetSlug} [${keys.join(', ')}]`);
  console.log(`[fanout]   resolved: ${entity?.id?.slice(0, 12) || 'NEW'} (${entity?.matchCount || 0} dupes)`);
  console.log(`[fanout]   values: ${JSON.stringify(newKeys)}`);
  console.log(`[fanout]   url: ${serverUrl}/entities`);

  const writeRes = await fetch(`${serverUrl}/entities`, {
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

  const writeData = await writeRes.json().catch(() => ({})) as Record<string, unknown>;
  console.log(`[fanout]   write: HTTP ${writeRes.status} id=${String(writeData.id || '?').slice(0, 12)}`);

  // Verify first key
  const firstKey = keys[0];
  const verify = writeRes.ok
    ? await verifyWrite(serverUrl, targetSlug, firstKey, newKeys[firstKey])
    : { verified: false, actual: 'WRITE_FAILED', entityId: '' };

  if (!verify.verified) {
    console.log(`[fanout]   VERIFY FAIL: ${firstKey} expected=${JSON.stringify(newKeys[firstKey])} actual=${JSON.stringify(verify.actual)}`);
  } else {
    console.log(`[fanout]   VERIFIED OK: ${firstKey}=${JSON.stringify(verify.actual)}`);
  }

  return {
    ok: writeRes.ok && verify.verified,
    debug: {
      resolvedId: entity?.id,
      writtenId: writeData.id,
      matchCount: entity?.matchCount,
      currentKeys: Object.keys(currentState),
      mergedKeys: Object.keys(mergedState),
      verified: verify.verified,
      verifiedActual: verify.actual,
      verifyEntityId: verify.entityId,
    },
  };
}

/**
 * POST /api/fanout
 *
 * Normal mode:
 *   { sourceSlug, state, serverUrl }
 *
 * Test mode (direct push, skips route lookup):
 *   { _test: true, _targetSlug, _key, _value, serverUrl? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sourceSlug?: string;
      state?: Record<string, unknown>;
      serverUrl?: string;
      _test?: boolean;
      _targetSlug?: string;
      _key?: string;
      _value?: unknown;
    };

    const serverUrl = (body.serverUrl || BACKEND).replace(/\/$/, '');

    // ── Test mode ──
    if (body._test && body._targetSlug && body._key !== undefined) {
      const tSlug = body._targetSlug;
      const tKey = body._key;
      const tVal = body._value;
      const result = await writeState(serverUrl, tSlug, { [tKey]: tVal }, 'TEST');
      return NextResponse.json({ ok: result.ok, test: true, debug: result.debug });
    }

    // ── Normal fanout mode ──
    if (!body.sourceSlug || !body.state) {
      return NextResponse.json({ error: 'sourceSlug and state required' }, { status: 400 });
    }

    const store = loadRoutes();
    const activeRoutes = store.routes.filter(r => r.active && r.sourceSlug === body.sourceSlug);
    if (activeRoutes.length === 0) {
      return NextResponse.json({ ok: true, pushed: 0, message: 'No active routes' });
    }

    // Group by target slug
    const targetUpdates = new Map<string, Record<string, unknown>>();
    for (const route of activeRoutes) {
      const sourceValue = body.state[route.sourceKey];
      if (sourceValue === undefined) continue;
      const existing = targetUpdates.get(route.targetSlug) || {};
      const amount = route.amount ?? 1.0;
      existing[route.targetKey] = (typeof sourceValue === 'number' && amount !== 1.0)
        ? sourceValue * amount : sourceValue;
      targetUpdates.set(route.targetSlug, existing);
    }

    const results: { route: string; ok: boolean; debug?: Record<string, unknown> }[] = [];

    for (const [targetSlug, newKeys] of targetUpdates) {
      try {
        const result = await writeState(serverUrl, targetSlug, newKeys, body.sourceSlug);
        results.push({
          route: `${body.sourceSlug} → ${targetSlug} [${Object.keys(newKeys).join(', ')}]`,
          ok: result.ok,
          debug: result.debug,
        });
      } catch (e) {
        results.push({ route: `${body.sourceSlug} → ${targetSlug}`, ok: false, debug: { error: String(e) } });
      }
    }

    const pushed = results.filter(r => r.ok).length;
    console.log(`[fanout] ${body.sourceSlug}: ${pushed}/${results.length} verified`);
    return NextResponse.json({ ok: true, pushed, total: results.length, results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
