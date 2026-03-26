// src/app/api/tops/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-tops.json';

interface Store { [slug: string]: { tops: string[]; tree: Record<string, string[]> } }

function load(): Store {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(d: Store) {
  try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch {}
}

export async function GET(req: NextRequest) {
  const store = load();
  const slug = req.nextUrl.searchParams.get('slug') || '';
  if (slug) return NextResponse.json(store[slug] || { tops: [], tree: {} });
  // Return union of all tops + merged tree
  const tops: string[] = [];
  const tree: Record<string, string[]> = {};
  Object.values(store).forEach(s => {
    (s.tops || []).forEach(t => { if (!tops.includes(t)) tops.push(t); });
    Object.entries(s.tree || {}).forEach(([k, v]) => { tree[k] = v; });
  });
  return NextResponse.json({ tops, tree, all: store });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { slug: string; tops: string[]; tree: Record<string, string[]> };
    if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
    const store = load();
    store[body.slug] = { tops: body.tops || [], tree: body.tree || {} };
    save(store);
    console.log('[tops] ' + body.slug + ': ' + (body.tops||[]).length + ' TOPs, ' + Object.keys(body.tree||{}).length + ' nodes');
    return NextResponse.json({ ok: true, slug: body.slug, count: (body.tops||[]).length });
  } catch(e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
