// /api/ui-state — shared control surface state across all browsers
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-ui-state.json';
const BACKEND = 'https://maestra-backend-v2-production.up.railway.app';
const CONFIG_SLUG = '_monitor_ui';

interface UiState {
  palette: { hue: number; saturation: number; value: number; activeIndex: number };
  modulation: Array<{ name: string; source: string; amount: number }>;
  updatedAt: number; // epoch ms — used to detect stale local state
}

const DEFAULT: UiState = {
  palette: { hue: 280, saturation: 85, value: 50, activeIndex: 0 },
  modulation: [],
  updatedAt: 0,
};

function load(): UiState {
  try { return { ...DEFAULT, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
  catch { return DEFAULT; }
}

function save(d: UiState) {
  try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch {}
}

/** Sync to Maestra backend (fire and forget) */
function syncToBackend(state: UiState) {
  fetch(`${BACKEND}/entities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: CONFIG_SLUG,
      slug: CONFIG_SLUG,
      state,
      tags: ['system'],
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

/** Restore from backend if /tmp is empty */
async function loadFromBackend(): Promise<UiState> {
  try {
    const res = await fetch(`${BACKEND}/entities`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return DEFAULT;
    const entities = await res.json() as Record<string, unknown>[];
    const configs = entities
      .filter(e => e.slug === CONFIG_SLUG)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (configs.length === 0) return DEFAULT;
    const state = (configs[0].state as UiState) || DEFAULT;
    return { ...DEFAULT, ...state };
  } catch { return DEFAULT; }
}

export async function GET() {
  let state = load();
  if (state.updatedAt === 0) {
    state = await loadFromBackend();
    if (state.updatedAt > 0) save(state);
  }
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<UiState>;
    const state = load();
    if (body.palette) state.palette = body.palette;
    if (body.modulation) state.modulation = body.modulation;
    state.updatedAt = Date.now();
    save(state);
    syncToBackend(state);
    return NextResponse.json({ ok: true, updatedAt: state.updatedAt });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
