// src/app/api/tops/route.ts
// Persists TD project TOPs per slug to /tmp/maestra-tops.json
// GET /api/tops?slug=xxx  → { tops: [...] }
// POST /api/tops          → { slug, tops: [...] }

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const TOPS_FILE = '/tmp/maestra-tops.json';

function load(): Record<string, string[]> {
  try { return JSON.parse(fs.readFileSync(TOPS_FILE, 'utf8')); }
  catch { return {}; }
}

function save(store: Record<string, string[]>) {
  try { fs.writeFileSync(TOPS_FILE, JSON.stringify(store)); } catch {}
}

export async function GET(req: NextRequest) {
  const store = load();
  const slug  = req.nextUrl.searchParams.get('slug') || '';
  const tops  = slug ? (store[slug] || []) : Object.values(store).flat().filter((v,i,a) => a.indexOf(v) === i);
  return NextResponse.json({ slug, tops, all: store });
}

export async function POST(req: NextRequest) {
  try {
    const { slug, tops } = await req.json() as { slug: string; tops: string[] };
    if (!slug || !Array.isArray(tops)) return NextResponse.json({ error: 'slug and tops[] required' }, { status: 400 });
    const store = load();
    store[slug] = tops;
    save(store);
    console.log(`[tops] ${slug}: ${tops.length} TOPs stored`);
    return NextResponse.json({ ok: true, slug, count: tops.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
