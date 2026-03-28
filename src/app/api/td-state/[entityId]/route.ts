import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/td-state/[entityId]
 * Lightweight in-memory state store for TD scripts.
 * POST: TD sends { prompt_text, fps, visitor_present, device }
 * GET:  Monitor frontend polls to render state chips
 */

const stateMap = new Map<string, { data: Record<string, unknown>; ts: number }>();

function gc() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, v] of stateMap) {
    if (v.ts < cutoff) stateMap.delete(k);
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Name',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params;
  const entry = stateMap.get(entityId);
  if (!entry) return NextResponse.json(null, { status: 404, headers: CORS });
  return NextResponse.json(entry.data, { headers: CORS });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params;
  try {
    const body = await req.json();
    stateMap.set(entityId, { data: body, ts: Date.now() });
    gc();
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400, headers: CORS });
  }
}
