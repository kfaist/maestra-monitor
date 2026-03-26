// src/app/api/locks/route.ts
// Server-side lock persistence — survives browser refresh, new devices, incognito
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';

const FILE = '/tmp/maestra-locks.json';

interface LockStore {
  lockedSlots: string[];   // array of slot entity_ids that are locked
  pinnedSlot: string | null; // the one slot pinned as "always slot 1"
}

function load(): LockStore {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { lockedSlots: [], pinnedSlot: null }; }
}
function save(d: LockStore) {
  try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch {}
}

export async function GET() {
  return NextResponse.json(load());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { action: 'lock' | 'unlock' | 'pin' | 'unpin'; entityId: string };
    if (!body.entityId || !body.action) {
      return NextResponse.json({ error: 'entityId and action required' }, { status: 400 });
    }
    const store = load();
    if (body.action === 'lock') {
      if (!store.lockedSlots.includes(body.entityId)) {
        store.lockedSlots = [...store.lockedSlots, body.entityId];
      }
    } else if (body.action === 'unlock') {
      store.lockedSlots = store.lockedSlots.filter(id => id !== body.entityId);
    } else if (body.action === 'pin') {
      store.pinnedSlot = body.entityId;
    } else if (body.action === 'unpin') {
      if (store.pinnedSlot === body.entityId) store.pinnedSlot = null;
    }
    save(store);
    return NextResponse.json({ ok: true, store });
  } catch(e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
