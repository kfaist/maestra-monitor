import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/gallery-cache
 * In-memory cache of gallery entity data, pushed from a local-network machine.
 *
 * POST: A local script fetches from http://192.168.128.115:8080/entities
 *       and pushes the full entity array here every ~10s.
 * GET:  The monitor frontend reads cached entities from here
 *       instead of hitting the local gallery IP directly.
 *
 * Data expires after 2 minutes if no fresh POST arrives.
 */

let cachedEntities: unknown[] = [];
let lastUpdate = 0;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  const age = Date.now() - lastUpdate;
  if (age > MAX_AGE_MS || cachedEntities.length === 0) {
    return NextResponse.json(
      { entities: [], stale: true, lastUpdate, ageMs: age },
      { headers: CORS }
    );
  }
  return NextResponse.json(
    { entities: cachedEntities, stale: false, lastUpdate, ageMs: age },
    { headers: CORS }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entities = Array.isArray(body) ? body : (body.entities ?? []);
    if (!Array.isArray(entities)) {
      return NextResponse.json({ error: 'expected array' }, { status: 400, headers: CORS });
    }
    cachedEntities = entities;
    lastUpdate = Date.now();
    return NextResponse.json(
      { ok: true, count: entities.length, ts: lastUpdate },
      { headers: CORS }
    );
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400, headers: CORS });
  }
}
