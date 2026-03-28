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

/** Seed data — the 3 primary entities with frozen schemas.
 *  Always available on server boot, no manual POST needed.
 *  push_gallery.py overwrites with live gallery data when running on-site. */
const SEED_ENTITIES = [
  {
    id: 1, slug: 'KFaist_CineTech', name: 'KFaist_CineTech', state: {},
    metadata: { stateSchema: {
      scene_id: { type: 'string', direction: 'output', description: 'Active scene identifier' },
      playback_state: { type: 'string', direction: 'output', description: 'Transport state: playing, paused, stopped' },
      timecode: { type: 'string', direction: 'output', description: 'Current timecode position HH:MM:SS:FF' },
      media_path: { type: 'string', direction: 'input', description: 'Path to active media file or stream source' },
      opacity: { type: 'float', direction: 'input', description: 'Master layer opacity 0.0-1.0' },
    }},
  },
  {
    id: 2, slug: 'KFaist_Ambient_Intelligence', name: 'KFaist_Ambient_Intelligence', state: {},
    metadata: { stateSchema: {
      prompt_text: { type: 'string', direction: 'output', default: null, description: 'Current active prompt being sent to StreamDiffusion' },
      audio_amplitude: { type: 'float', direction: 'output', default: 0.0, description: 'Normalized audio amplitude 0.0-1.0 from audio analysis' },
      visitor_present: { type: 'boolean', direction: 'output', default: false, description: 'True when webcam detects an active visitor' },
      fps: { type: 'number', direction: 'output', default: 0, description: 'Current rendering / stream frame rate' },
    }},
  },
  {
    id: 3, slug: 'slot_3', name: 'Connect .toe', state: {},
    metadata: { stateSchema: {} },
  },
];

let cachedEntities: unknown[] = SEED_ENTITIES;
let lastUpdate = Date.now();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — seed data is always valid, push_gallery.py refreshes it when on-site

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
