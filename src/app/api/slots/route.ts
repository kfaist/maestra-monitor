// src/app/api/slots/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-slots.json';

function load(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function save(d: Record<string, unknown>) {
  try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch {}
}

export async function GET() {
  return NextResponse.json(load());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { slug: string; outputSignals: unknown[] };
    if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
    const store = load();
    store[body.slug] = body.outputSignals;
    save(store);
    return NextResponse.json({ ok: true, slug: body.slug });
  } catch(e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
