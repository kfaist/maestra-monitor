// src/app/api/tops/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-tops.json';
const BACKEND = 'https://maestra-backend-v2-production.up.railway.app';
const CONFIG_SLUG = '_monitor_config';

interface Store { [slug: string]: { tops: string[]; tree: Record<string, string[]> } }

function load(): Store {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(d: Store) {
  try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch {}
}

/** Restore tree from backend config entity */
async function loadTreeFromBackend(): Promise<{ tops: string[]; tree: Record<string, string[]> }> {
  try {
    const res = await fetch(`${BACKEND}/entities`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { tops: [], tree: {} };
    const entities = await res.json() as Record<string, unknown>[];
    const configs = entities
      .filter(e => e.slug === CONFIG_SLUG)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (configs.length === 0) return { tops: [], tree: {} };
    const state = (configs[0].state as Record<string, unknown>) || {};
    const tops = (state.tops as string[]) || [];
    const tree = (state.tree as Record<string, string[]>) || {};
    if (Object.keys(tree).length > 0) {
      console.log(`[tops] Restored ${Object.keys(tree).length} nodes from backend`);
    }
    return { tops, tree };
  } catch { return { tops: [], tree: {} }; }
}

/** Sync tree+tops to backend config entity */
function syncTreeToBackend(store: Store) {
  // Merge all slugs into one tree/tops
  const tops: string[] = [];
  const tree: Record<string, string[]> = {};
  Object.values(store).forEach(s => {
    (s.tops || []).forEach(t => { if (!tops.includes(t)) tops.push(t); });
    Object.entries(s.tree || {}).forEach(([k, v]) => { tree[k] = v; });
  });

  // Also read routes from /tmp to preserve them
  let routes: unknown[] = [];
  try {
    const rd = JSON.parse(fs.readFileSync('/tmp/maestra-routes.json', 'utf8'));
    routes = rd.routes || [];
  } catch {}

  fetch(`${BACKEND}/entities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: CONFIG_SLUG,
      slug: CONFIG_SLUG,
      state: { routes, tops, tree },
      tags: ['system'],
    }),
    signal: AbortSignal.timeout(5000),
  }).then(() => {
    console.log(`[tops] Synced ${Object.keys(tree).length} nodes to backend`);
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  let store = load();
  const slug = req.nextUrl.searchParams.get('slug') || '';
  if (slug) return NextResponse.json(store[slug] || { tops: [], tree: {} });

  // Merge all slugs
  const tops: string[] = [];
  const tree: Record<string, string[]> = {};
  Object.values(store).forEach(s => {
    (s.tops || []).forEach(t => { if (!tops.includes(t)) tops.push(t); });
    Object.entries(s.tree || {}).forEach(([k, v]) => { tree[k] = v; });
  });

  // If /tmp is empty, try backend
  if (Object.keys(tree).length === 0) {
    const backend = await loadTreeFromBackend();
    if (Object.keys(backend.tree).length > 0) {
      // Cache locally
      store['_restored'] = backend;
      save(store);
      return NextResponse.json({ tops: backend.tops, tree: backend.tree, all: store });
    }
  }

  return NextResponse.json({ tops, tree, all: store });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { slug: string; tops: string[]; tree: Record<string, string[]> };
    if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
    const store = load();
    store[body.slug] = { tops: body.tops || [], tree: body.tree || {} };
    save(store);
    syncTreeToBackend(store);
    console.log('[tops] ' + body.slug + ': ' + (body.tops||[]).length + ' TOPs, ' + Object.keys(body.tree||{}).length + ' nodes');
    return NextResponse.json({ ok: true, slug: body.slug, count: (body.tops||[]).length });
  } catch(e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
