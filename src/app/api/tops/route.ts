// src/app/api/tops/route.ts
// Stores TD project TOPs per slug — POSTed by build_maestra_tox.py
// GET /api/tops?slug=xxx  → { tops: [...] }
// POST /api/tops          → { slug, tops: [...] }

import { NextRequest, NextResponse } from 'next/server';

// In-memory store — survives Railway process restarts via re-running script
const topsStore: Record<string, string[]> = {};

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || '';
  const tops = slug ? (topsStore[slug] || []) : Object.values(topsStore).flat();
  return NextResponse.json({ slug, tops, all: topsStore });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, tops } = body as { slug: string; tops: string[] };
    if (!slug || !Array.isArray(tops)) {
      return NextResponse.json({ error: 'slug and tops[] required' }, { status: 400 });
    }
    topsStore[slug] = tops;
    console.log(`[tops] ${slug}: ${tops.length} TOPs stored`);
    return NextResponse.json({ ok: true, slug, count: tops.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
