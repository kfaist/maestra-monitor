'use client';

import { SLOT_COLORS } from './SignalPanel';
import { useState, useEffect, useCallback, useRef } from 'react';
import { FleetSlot, slotStatusLabel, slotStatusClass, formatAge, EventEntry } from '@/types';

type InlineStage = 'idle' | 'connect' | 'setup' | 'slug' | 'addState';
type NodeRole = 'receive' | 'send' | 'two_way';
type SignalSource = 'touchdesigner' | 'json_stream' | 'osc' | 'audio_reactive' | 'text' | 'test_signal';

interface SlotSetup {
  stage: InlineStage;
  slug: string;
  refFile: string | null;
  direction: NodeRole | null;
  selectedTop: string;
  stateKey: string;
  stateType: string;
  stateDesc: string;
  outputSignals: Array<{ key: string; type: string; desc: string; top: string; streamType?: string; signalDir?: 'output' | 'input' }>;
  streamType: string;
  selectedNode: string;
  nodeSearch: string;
  opSearch: string;
}

interface InjectState {
  field: string;
  value: string;
}

interface SourceState {
  path: string;
  fileName: string | null;
}

/** Per-entity state map: entity_id → { key: value } */
export type EntityStateMap = Record<string, Record<string, string>>;

/** Wire route — mirrors WireRoute from /api/routes */
interface WireRoute {
  id: string;
  sourceSlug: string;
  sourceKey: string;
  targetSlug: string;
  targetKey: string;
  active: boolean;
  amount: number;
  createdAt: number;
}

/** Per-wire gain/amount overrides (optimistic UI during slider drag) */
type WireAmounts = Record<string, number>; // wireId → 0.0–1.0

interface SlotGridProps {
  slots: FleetSlot[];
  selectedId: string | null;
  onSelectSlot: (id: string) => void;
  onAddSlot: () => void;
  onJoinNode: () => void;
  onSlotSetupComplete?: (slotId: string, role: NodeRole, signal: SignalSource) => void;
  onInjectSignal?: (slotId: string, field: string, value: string) => void;
  onSourceUpdate?: (slotId: string, path: string, fileName: string | null) => void;
  eventEntries?: EventEntry[];
  /** Live entity state for each entity */
  entityStates?: EntityStateMap;
}

const ROLES: { value: NodeRole; label: string; icon: string; color: string }[] = [
  { value: 'send', label: 'Send', icon: '↑', color: '#22c55e' },
  { value: 'receive', label: 'Receive', icon: '↓', color: '#5cc8ff' },
  { value: 'two_way', label: 'Both', icon: '↕', color: '#fbbf24' },
];

const SIGNALS: { value: SignalSource; label: string; icon: string; color: string; refHint: string }[] = [
  { value: 'touchdesigner', label: 'Visual', icon: '◆', color: '#d946ef', refHint: 'Select the TOP that will be streamed' },
  { value: 'audio_reactive', label: 'Audio', icon: '♫', color: '#f59e0b', refHint: 'Select the CHOP that publishes analysis' },
  { value: 'json_stream', label: 'JSON', icon: '{}', color: '#38bdf8', refHint: 'Point to the DAT or script that emits JSON' },
  { value: 'text', label: 'Text', icon: 'A', color: '#22c55e', refHint: 'Enter the text source DAT path' },
  { value: 'osc', label: 'OSC', icon: '~', color: '#14b8a6', refHint: 'Configure the OSC In CHOP path' },
  { value: 'test_signal', label: 'Test', icon: '▶', color: '#6b7280', refHint: 'No operator needed — test pattern generated' },
];

/** Internal keys to hide from signal chips */
const INTERNAL_STATE_KEYS = new Set(['_sidecar', 'toe_name', 'tops', 'server', 'active', 'metadata', 'stateSchema', 'publishing', 'listening', 'streamType']);

/** Derive publishing signals from REAL entity state when available, else fall back to defaults */
function getPublishingSignals(slot: FleetSlot, entityState?: Record<string, unknown>): string[] {
  const role = slot.nodeRole;
  if (role === 'receive') return [];
  // Prefer real state keys from sidecar/server data
  if (entityState && Object.keys(entityState).length > 0) {
    return Object.keys(entityState).filter(k => !INTERNAL_STATE_KEYS.has(k));
  }
  // Fallback to hardcoded defaults
  const sig = slot.signalType;
  if (sig === 'audio_reactive') return ['sub', 'bass', 'mid', 'high', 'rms', 'bpm'];
  if (sig === 'touchdesigner') return ['prompt_text', 'visitor_present', 'fps', 'device', 'audio_amplitude'];
  if (sig === 'json_stream') return ['data.payload'];
  if (sig === 'osc') return ['osc.msg'];
  if (sig === 'text') return ['text.content'];
  if (sig === 'test_signal') return ['test.ping'];
  return ['frame'];
}

/** Derive listening signals from signal type */
function getListeningSignals(slot: FleetSlot): string[] {
  const role = slot.nodeRole;
  if (role === 'send') return [];
  const sig = slot.signalType;
  if (sig === 'audio_reactive') return ['lighting.scene', 'visual.palette'];
  if (sig === 'touchdesigner') return ['prompt_text', 'visual.palette', 'lighting.scene'];
  if (sig === 'json_stream') return ['data.config'];
  if (sig === 'osc') return ['osc.control'];
  if (sig === 'text') return ['prompt_text'];
  if (sig === 'test_signal') return ['test.pong'];
  return ['prompt_text', 'lighting.scene'];
}


// ── EntityPicker: shows connected entities + lets you type a slug ─────────
function EntityPicker({ slotColor, current, onSelect }: {
  slotColor: string;
  current: string;
  onSelect: (slug: string) => void;
}) {
  const [entities, setEntities] = useState<{slug:string; name:string; status:string}[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://maestra-backend-v2-production.up.railway.app/entities')
      .then(r => r.json())
      .then((data: unknown[]) => {
        // Deduplicate by slug, filter to online/recent ones first
        const seen = new Set<string>();
        const list = data
          .filter((e: unknown) => {
            const en = e as Record<string,unknown>;
            if (!en.slug || seen.has(String(en.slug))) return false;
            seen.add(String(en.slug));
            return true;
          })
          .map((e: unknown) => {
            const en = e as Record<string,unknown>;
            return { slug: String(en.slug), name: String(en.name||en.slug), status: String(en.status||'offline') };
          })
          .sort((a,b) => {
            // Online first, then alphabetical
            if (a.status === 'online' && b.status !== 'online') return -1;
            if (b.status === 'online' && a.status !== 'online') return 1;
            return a.slug.localeCompare(b.slug);
          })
          .slice(0, 200);
        setEntities(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = search
    ? entities.filter(e => e.slug.toLowerCase().includes(search.toLowerCase()) || e.name.toLowerCase().includes(search.toLowerCase()))
    : entities;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        type="text"
        value={search || current}
        placeholder="search or type slug…"
        autoFocus
        onClick={e => e.stopPropagation()}
        onChange={e => {
          e.stopPropagation();
          setSearch(e.target.value);
          onSelect(e.target.value);
        }}
        style={{ width: '100%', padding: '6px 10px', fontSize: 12,
          fontFamily: 'var(--font-mono)', color: slotColor, fontWeight: 700,
          background: 'rgba(0,0,0,0.5)', border: `1px solid ${slotColor}50`,
          outline: 'none', boxSizing: 'border-box' }}
      />
      {loading && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>loading nodes…</div>}
      {!loading && filtered.length > 0 && (
        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.6)' }}>
          {filtered.map(e => (
            <div key={e.slug}
              onClick={ev => { ev.stopPropagation(); onSelect(e.slug); setSearch(''); }}
              style={{ padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                background: current === e.slug ? `${slotColor}18` : 'transparent',
                borderLeft: current === e.slug ? `2px solid ${slotColor}` : '2px solid transparent' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: e.status === 'online' ? '#4ade80' : 'rgba(255,255,255,0.2)' }} />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: current === e.slug ? slotColor : 'rgba(255,255,255,0.7)', fontWeight: current === e.slug ? 700 : 400 }}>
                {e.slug}
              </span>
              {e.name !== e.slug && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>{e.name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SlotGrid({ slots, selectedId, onSelectSlot, onAddSlot, onJoinNode, onSlotSetupComplete, onInjectSignal, onSourceUpdate, eventEntries = [], entityStates = {} }: SlotGridProps) {
  const activeCount = slots.filter(s => s.active).length;
  const hasActiveNodes = activeCount > 0;
  const hasFrames = slots.some(s => s.active && s.frameUrl);
  const [showBootstrap, setShowBootstrap] = useState(false);
  // Auto-show bootstrap when system is inactive
  const bootstrapVisible = showBootstrap || (!hasActiveNodes && !hasFrames);

  const [setupState, setSetupState] = useState<Record<string, SlotSetup>>({});
  const [injectState, setInjectState] = useState<Record<string, InjectState>>({});
  const [sourceState, setSourceState] = useState<Record<string, SourceState>>({});
  // ═══ Drag-and-drop wiring state ═══
  const [dragSource, setDragSource] = useState<{ slug: string; key: string; dir: 'output' | 'input' } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ slug: string; key: string; dir: 'output' | 'input' } | null>(null);

  // Lock state — derived from Maestra backend entity metadata
  const [lockedSlots, setLockedSlots] = useState<Set<string>>(new Set());
  const [pinnedSlots, setPinnedSlots] = useState<Set<string>>(new Set());
  const togglePin = (slotId: string) =>
    setPinnedSlots(prev => { const n = new Set(prev); n.has(slotId) ? n.delete(slotId) : n.add(slotId); return n; });
  // Per-slot server mode: which Maestra server this slot is targeting
  const [slotServerModes, setSlotServerModes] = useState<Record<string, 'auto' | 'gallery' | 'railway' | 'custom'>>({});

  // Hydrate lock state from entityStates (backend is source of truth)
  const lockedSlotsRef = useRef(lockedSlots);
  lockedSlotsRef.current = lockedSlots;
  useEffect(() => {
    const nextLocked = new Set<string>();
    slots.forEach(slot => {
      const eid = slot.entity_id || slot.id;
      const es = entityStates[eid] as Record<string, unknown> | undefined;
      if (es?.locked === true || es?.locked === 'true') nextLocked.add(slot.id);
    });
    // Only update if different to avoid render loops
    const prev = lockedSlotsRef.current;
    if (nextLocked.size !== prev.size || [...nextLocked].some(id => !prev.has(id))) {
      setLockedSlots(nextLocked);
    }
  }, [entityStates, slots]);

  const isLocked = (slotId: string) => lockedSlots.has(slotId);

  const MAESTRA_API = 'https://maestra-backend-v2-production.up.railway.app';

  // PATCH entity metadata — always merges, never overwrites
  const patchEntityMeta = async (entityId: string, patch: Record<string, unknown>) => {
    console.log('PATCH META →', entityId, patch);
    try {
      // Read existing metadata first to merge
      const getRes = await fetch(`${MAESTRA_API}/entities/${entityId}`);
      if (!getRes.ok) {
        console.error('PATCH META: GET failed', getRes.status, entityId);
        return;
      }
      const entity = await getRes.json();
      const existingMeta = (entity?.metadata as Record<string, unknown>) || {};
      const merged = { ...existingMeta, ...patch };
      console.log('PATCH META: merging', existingMeta, '+', patch, '=', merged);
      const patchRes = await fetch(`${MAESTRA_API}/entities/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: merged }),
      });
      if (!patchRes.ok) {
        console.error('PATCH META: PATCH failed', patchRes.status, await patchRes.text());
      } else {
        console.log('PATCH META: ✓ saved', entityId, merged);
      }
    } catch (err) {
      console.error('PATCH META: exception', err);
    }
  };

  const toggleLockBackend = (slotId: string, slot: FleetSlot) => {
    const entityId = slot.entity_id || slotId;
    const newLocked = !lockedSlots.has(slotId);
    console.log('PATCH LOCK', entityId, newLocked);
    // Optimistic UI update
    setLockedSlots(prev => {
      const n = new Set(prev);
      newLocked ? n.add(slotId) : n.delete(slotId);
      return n;
    });
    // Persist to backend
    patchEntityMeta(entityId, { locked: newLocked });
  };

  const [cachedTops, setCachedTops] = useState<string[]>(() => { try { const v = localStorage.getItem('maestra_cached_tops'); return v ? JSON.parse(v) : []; } catch { return []; } });
  const [cachedTree, setCachedTree] = useState<Record<string, string[]>>(() => { try { const v = localStorage.getItem('maestra_cached_tree'); return v ? JSON.parse(v) : {}; } catch { return {}; } });
  useEffect(() => {
    const LS_TOPS = 'maestra_cached_tops';
    const LS_TREE = 'maestra_cached_tree';
    // Restore from localStorage immediately (survives Railway restarts)
    try {
      const lt = localStorage.getItem(LS_TOPS);
      const ltr = localStorage.getItem(LS_TREE);
      if (lt) setCachedTops(JSON.parse(lt));
      if (ltr) setCachedTree(JSON.parse(ltr));
    } catch {}
    const load = () => fetch('/api/tops')
      .then(r => r.json())
      .then(d => {
        if (d.tops?.length) {
          setCachedTops(d.tops);
          try { localStorage.setItem(LS_TOPS, JSON.stringify(d.tops)); } catch {}
        }
        if (d.tree && Object.keys(d.tree).length) {
          setCachedTree(d.tree);
          try { localStorage.setItem(LS_TREE, JSON.stringify(d.tree)); } catch {}
        }
      })
      .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  // Restore saved outputSignals from localStorage on mount
  useEffect(() => {
    slots.forEach(slot => {
      const slug = slot.entity_id || slot.id;
      try {
        const saved = localStorage.getItem('maestra_slot_' + slug);
        if (saved) {
          const sigs = JSON.parse(saved);
          if (Array.isArray(sigs) && sigs.length > 0) {
            setSetupState(prev => ({
              ...prev,
              [slot.id]: { ...prev[slot.id], outputSignals: sigs }
            }));
          }
        }
      } catch {}
    });
  }, [slots.length]);
  const setSlotServer = (slotId: string, mode: 'auto' | 'gallery' | 'railway' | 'custom') =>
    setSlotServerModes(prev => ({ ...prev, [slotId]: mode }));
  const [lockedLabels, setLockedLabels] = useState<Record<string, string>>({});

  const toggleLock = (slotId: string, slot: FleetSlot, entityState: Record<string, unknown>) => {
    const isCurrentlyLocked = lockedSlots.has(slotId);
    const entityId = slot.entity_id || slotId;

    if (!isCurrentlyLocked) {
      // Locking: prompt for a PIN
      const pin = prompt('Set a PIN to lock this slot (4+ characters):');
      if (!pin || pin.length < 4) { alert('PIN must be at least 4 characters.'); return; }
      // Derive label on lock
      const toeName = entityState?.toe_name as string | undefined;
      const toolTag = slot.signalType === 'audio_reactive' ? 'Max/MSP'
        : slot.signalType === 'osc' ? 'Max/MSP'
        : slot.cloudNode ? 'Cloud'
        : 'TouchDesigner';
      const shortName = toeName || entityId.replace(/_/g, ' ').replace(/\w/g, l => l.toUpperCase());
      setLockedLabels(p => ({ ...p, [slotId]: `${toolTag} · ${shortName}` }));
      // Save lock + PIN to backend
      setLockedSlots(prev => { const n = new Set(prev); n.add(slotId); return n; });
      patchEntityMeta(entityId, { locked: true, lockPin: pin });
    } else {
      // Unlocking: require the PIN
      const storedPin = (entityStates[entityId] as Record<string, unknown>)?.lockPin as string | undefined;
      if (storedPin) {
        const entered = prompt('Enter PIN to unlock this slot:');
        if (entered !== storedPin) { alert('Incorrect PIN.'); return; }
      }
      setLockedSlots(prev => { const n = new Set(prev); n.delete(slotId); return n; });
      patchEntityMeta(entityId, { locked: false });
    }
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // ═══ Wire routes state — fetched from /api/routes ═══
  const [wireRoutes, setWireRoutes] = useState<WireRoute[]>([]);
  // Wire amounts are now stored on the route itself (route.amount), not in localStorage.
  // This local state is only for optimistic UI updates during slider drags.
  const [wireAmountOverrides, setWireAmountOverrides] = useState<WireAmounts>({});

  // Fetch routes periodically
  useEffect(() => {
    const loadRoutes = () => fetch('/api/routes')
      .then(r => r.json())
      .then(d => { if (d.routes) setWireRoutes(d.routes); })
      .catch(() => {});
    loadRoutes();
    const t = setInterval(loadRoutes, 5000);
    return () => clearInterval(t);
  }, []);

  // Helper: get wire amount (prefer local override for responsive sliders, else route.amount)
  const getWireAmount = (wire: WireRoute) => wireAmountOverrides[wire.id] ?? wire.amount ?? 1.0;

  // Persist amount to backend (debounced per wire)
  const amountPatchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const patchWireAmount = useCallback((wireId: string, amount: number) => {
    setWireAmountOverrides(prev => ({ ...prev, [wireId]: amount }));
    // Debounce backend write
    if (amountPatchTimers.current[wireId]) clearTimeout(amountPatchTimers.current[wireId]);
    amountPatchTimers.current[wireId] = setTimeout(() => {
      fetch('/api/routes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wireId, amount }),
      }).then(() => {
        // Clear override after backend confirms
        setWireAmountOverrides(prev => { const n = { ...prev }; delete n[wireId]; return n; });
      }).catch(() => {});
    }, 300);
  }, []);

  /** Create a wire route */
  const createWire = useCallback(async (sourceSlug: string, sourceKey: string, targetSlug: string, targetKey: string) => {
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceSlug, sourceKey, targetSlug, targetKey }),
      });
      const data = await res.json();
      if (data.route) {
        setWireRoutes(prev => {
          if (prev.find(r => r.id === data.route.id)) return prev;
          return [...prev, data.route];
        });
        // Default amount = 1.0
        setWireAmountOverrides(prev => ({ ...prev, [data.route.id]: 1.0 }));
      }
    } catch {}
  }, []);

  /** Delete a wire route */
  const deleteWire = useCallback(async (wireId: string) => {
    try {
      await fetch('/api/routes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wireId }),
      });
      setWireRoutes(prev => prev.filter(r => r.id !== wireId));
      setWireAmountOverrides(prev => { const n = { ...prev }; delete n[wireId]; return n; });
    } catch {}
  }, []);

  /** Toggle a wire's active state */
  const toggleWireActive = useCallback(async (wireId: string) => {
    try {
      const res = await fetch('/api/routes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wireId }),
      });
      const data = await res.json();
      if (data.route) {
        setWireRoutes(prev => prev.map(r => r.id === wireId ? { ...r, active: data.route.active } : r));
      }
    } catch {}
  }, []);

  /** Drag-and-drop handlers for signal chip wiring */
  const handleChipDragStart = useCallback((slug: string, key: string, dir: 'output' | 'input') => {
    setDragSource({ slug, key, dir });
  }, []);

  const handleChipDragOver = useCallback((e: React.DragEvent, slug: string, key: string, dir: 'output' | 'input') => {
    // Only allow drop if opposite direction
    if (dragSource && dragSource.dir !== dir) {
      e.preventDefault();
      setDropTarget({ slug, key, dir });
    }
  }, [dragSource]);

  const handleChipDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleChipDrop = useCallback((e: React.DragEvent, slug: string, key: string, dir: 'output' | 'input') => {
    e.preventDefault();
    if (!dragSource || dragSource.dir === dir) return;
    // Wire: + output → − input
    if (dragSource.dir === 'output') {
      createWire(dragSource.slug, dragSource.key, slug, key);
    } else {      // Dragged an input onto an output — reverse
      createWire(slug, key, dragSource.slug, dragSource.key);
    }
    setDragSource(null);
    setDropTarget(null);
  }, [dragSource, createWire]);

  const handleChipDragEnd = useCallback(() => {
    setDragSource(null);
    setDropTarget(null);
  }, []);

  // When a slot becomes active, clear its setup state
  useEffect(() => {
    setSetupState(prev => {
      const next = { ...prev };
      let changed = false;
      slots.forEach(s => {
        if (s.active && next[s.id]) {
          delete next[s.id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [slots]);

  // Auto-advance: setup stage auto-advances to slug when entity_id appears
  useEffect(() => {
    slots.forEach(slot => {
      const setup = setupState[slot.id];
      if (setup && setup.stage === 'setup' && slot.entity_id) {
        setSetupState(prev => {
          const cur = prev[slot.id];
          if (!cur || cur.stage !== 'setup') return prev;
          return { ...prev, [slot.id]: { ...cur, slug: slot.entity_id || cur.slug, stage: 'slug' } };
        });
      }
    });
  }, [slots, setupState]);


  const handleSlotClick = useCallback((slot: FleetSlot) => {
    if (slot.active) {
      onSelectSlot(slot.id);
      return;
    }
    onSelectSlot(slot.id);
    setSetupState(prev => {
      const current = prev[slot.id];
      if (current && current.stage !== 'idle') return prev; // DON'T RESET
      const existingSlug = slot.entity_id || slot.slug || '';
      const startStage: InlineStage = existingSlug ? 'addState' : (slot.entity_id ? 'setup' : 'connect');
      return { ...prev, [slot.id]: { stage: startStage, slug: existingSlug, refFile: null, direction: 'send' as NodeRole, selectedTop: '', stateKey: '', stateType: 'string', stateDesc: '', outputSignals: [], streamType: '', selectedNode: '' , nodeSearch: '', opSearch: '' } };
    });
  }, [onSelectSlot]); // NO setupState in deps

  const handleConnect = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], stage: 'slug' },
    }));
  }, []);

  const handleRoleSelect = useCallback((slotId: string, role: NodeRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], role, stage: 'addState' },
    }));
  }, []);

  const handleSignalSelect = useCallback((slotId: string, signal: SignalSource, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], signal, stage: 'addState' },
    }));
  }, []);

  const handleRefPathChange = useCallback((slotId: string, path: string) => {
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], refPath: path },
    }));
  }, []);

  const handleFileUpload = useCallback((slotId: string, file: File) => {
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], refFile: file.name },
    }));
  }, []);

  const handleReferenceComplete = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const setup = setupState[slotId];
    if (!setup) return;
    setSetupState(prev => ({
      ...prev,
      [slotId]: { ...prev[slotId], stage: 'idle' },
    }));
    onSlotSetupComplete?.(slotId, 'send' as NodeRole, 'touchdesigner' as SignalSource);
  }, [setupState, onSlotSetupComplete]);

  const handleBack = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSetupState(prev => {
      const s = prev[slotId]?.stage;
      if (s === 'addState')  return { ...prev, [slotId]: { ...prev[slotId], stage: 'slug' } };
      if (s === 'slug') return { ...prev, [slotId]: { ...prev[slotId], stage: 'setup' } };
      if (s === 'setup') return { ...prev, [slotId]: { ...prev[slotId], stage: 'connect' } };
      return prev;
    });
  }, []);

  // ═══ Signal Injection handlers ═══
  const handleInjectFieldChange = useCallback((slotId: string, field: string) => {
    setInjectState(prev => ({ ...prev, [slotId]: { ...prev[slotId] || { field: '', value: '' }, field } }));
  }, []);

  const handleInjectValueChange = useCallback((slotId: string, value: string) => {
    setInjectState(prev => ({ ...prev, [slotId]: { ...prev[slotId] || { field: '', value: '' }, value } }));
  }, []);

  const handleInjectSend = useCallback((slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const state = injectState[slotId];
    if (!state?.field || !state?.value) return;
    onInjectSignal?.(slotId, state.field, state.value);
    // Clear value after send
    setInjectState(prev => ({ ...prev, [slotId]: { ...prev[slotId], value: '' } }));
  }, [injectState, onInjectSignal]);

  // ═══ Source/Reference handlers ═══
  const handleSourcePathChange = useCallback((slotId: string, path: string) => {
    setSourceState(prev => ({ ...prev, [slotId]: { ...prev[slotId] || { path: '', fileName: null }, path } }));
    onSourceUpdate?.(slotId, path, sourceState[slotId]?.fileName || null);
  }, [sourceState, onSourceUpdate]);

  const handleSourceFileUpload = useCallback((slotId: string, file: File) => {
    setSourceState(prev => ({ ...prev, [slotId]: { path: prev[slotId]?.path || '', fileName: file.name } }));
    onSourceUpdate?.(slotId, sourceState[slotId]?.path || '', file.name);
  }, [sourceState, onSourceUpdate]);

  // ═══ Origin-based color grouping: slots sharing the same .toe / source path get same color ═══
  const originColorMap: Record<string, string> = (() => {
    const seen: Record<string, string> = {};
    let colorIdx = 0;
    slots.forEach(slot => {
      const src = (sourceState[slot.id]?.path || setupState[slot.id]?.refFile || '').trim().toLowerCase();
      if (src && !(src in seen)) {
        seen[src] = SLOT_COLORS[colorIdx % SLOT_COLORS.length];
        colorIdx++;
      }
    });
    return seen;
  })();

  /** Get origin color for a slot — falls back to index-based color */
  const getSlotColor = (slot: FleetSlot, idx: number): string => {
    const src = (sourceState[slot.id]?.path || setupState[slot.id]?.refFile || '').trim().toLowerCase();
    if (src && originColorMap[src]) return originColorMap[src];
    return SLOT_COLORS[idx % SLOT_COLORS.length];
  };

  /** Get origin key for a slot */
  const getOriginKey = (slot: FleetSlot): string => {
    return (sourceState[slot.id]?.path || setupState[slot.id]?.refFile || '').trim().toLowerCase();
  };

  /** Collect all available + outputs across the fleet for wiring dropdowns */
  const allPlusOutputs = (() => {
    const results: Array<{ slug: string; key: string; type: string; slotLabel: string; color: string }> = [];
    slots.forEach((s, i) => {
      const setup = setupState[s.id];
      const dir = setup?.direction || (s.nodeRole === 'receive' ? 'receive' : s.nodeRole === 'send' ? 'send' : null);
      if (dir === 'receive') return; // skip pure receivers
      const slug = setup?.slug || s.entity_id || s.id;
      const color = getSlotColor(s, i);
      // From setup outputSignals
      (setup?.outputSignals || []).forEach(sig => {
        if (sig.signalDir === 'input') return;
        results.push({ slug, key: sig.key, type: sig.type, slotLabel: slug, color });
      });
      // From live publishing signals
      if (s.active) {
        const eId = s.entity_id || s.id;
        getPublishingSignals(s, entityStates[eId] as Record<string, unknown> | undefined).forEach(key => {
          if (!results.find(r => r.slug === slug && r.key === key)) {
            results.push({ slug, key, type: 'string', slotLabel: slug, color });
          }
        });
      }
    });
    return results;
  })();

  return (
    <>
      <div className="panel-header">
        <div className="panel-title-sm">// Fleet Slots</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="entity-count">{activeCount} active / {slots.length} slots</div>
          <button
            onClick={() => setShowBootstrap(prev => !prev)}
            style={{
              background: showBootstrap ? 'rgba(0,212,255,0.15)' : 'transparent',
              border: '1px solid rgba(0,212,255,0.3)', color: 'var(--accent)',
              padding: '3px 8px', fontSize: 10, fontFamily: 'var(--font-display)',
              letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 2,
            }}>
            {showBootstrap ? '✕ CLOSE' : '? HELP'}
          </button>
          <button className="btn-add" onClick={onAddSlot}>+ Add Slot</button>
        </div>
      </div>

      {/* Bootstrap / Help panel — auto-shows when inactive, toggleable always */}
      {bootstrapVisible && (
        <div style={{
          background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.18)',
          padding: '14px 16px', marginBottom: 16, borderRadius: 4,
        }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: 10, textTransform: 'uppercase' }}>
            Quick Start — Connect TouchDesigner
          </div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.8, marginBottom: 10 }}>
            Drop <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>build_maestra_tox.py</code> into
            your project and run it once. It creates <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>/project1/maestra</code>,
            registers your entity, and pushes your <strong style={{ color: 'var(--accent)' }}>TOE name + available TOPs</strong> to the Monitor.
          </div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 10 }}>
            <span style={{ opacity: 0.5 }}># In TouchDesigner Textport (Alt+P / Opt+P):</span><br/>
            <span style={{ color: 'var(--accent)' }}>exec</span>(<span style={{ color: 'var(--active)' }}>open</span>(<span style={{ color: '#fbbf24' }}>&apos;/path/to/build_maestra_tox.py&apos;</span>).<span style={{ color: 'var(--active)' }}>read</span>())<br/><br/>
            <span style={{ opacity: 0.5 }}># Or create a Text DAT, paste the script, right-click → Run Script</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="/build_maestra_tox.py" download="build_maestra_tox.py"
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.4)', padding: '6px 12px', borderRadius: 3 }}>
              ↓ Download build_maestra_tox.py
            </a>
            <a href="/maestra.tox" download="maestra.tox"
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 11, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.4)', padding: '6px 12px', borderRadius: 3 }}>
              ↓ Download maestra.tox
            </a>
            {hasActiveNodes && (
              <button onClick={() => setShowBootstrap(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 12px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>
                Dismiss
              </button>
            )}
          </div>
          {!hasActiveNodes && (
            <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              No active streams detected. This panel will auto-hide once an entity connects.
            </div>
          )}
        </div>
      )}

      {/* Drag wiring indicator */}
      {dragSource && (
        <div style={{
          padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
          background: dragSource.dir === 'output' ? 'rgba(34,197,94,0.1)' : 'rgba(92,200,255,0.1)',
          border: `1px solid ${dragSource.dir === 'output' ? '#22c55e40' : '#5cc8ff40'}`,
          color: dragSource.dir === 'output' ? '#22c55e' : '#5cc8ff',
          textAlign: 'center', letterSpacing: '0.06em',
        }}>
          {dragSource.dir === 'output' ? '+ ' : '− '}
          Dragging <strong>{dragSource.slug}/{dragSource.key}</strong> — drop on a {dragSource.dir === 'output' ? '− input' : '+ output'} chip to wire
        </div>
      )}
      <div className="slot-grid">
        {slots.map((slot, slotIdx) => {
          const mStatus = slot.maestraStatus;
          const statusText = mStatus ? slotStatusLabel(mStatus) : (
            slot.active ? (slot.connection_status === 'connected' ? 'Active' : 'Connecting') : ''
          );
          const statusCls = mStatus ? slotStatusClass(mStatus) : '';

          let lastEventStr = '';
          if (mStatus && slot.active) {
            const timestamps = [mStatus.lastHeartbeatAt, mStatus.lastStateUpdateAt, mStatus.lastStreamFrameAt].filter(Boolean) as number[];
            if (timestamps.length > 0) {
              const mostRecent = Math.max(...timestamps);
              const age = Math.max(0, now - mostRecent);
              lastEventStr = `last: ${formatAge(age)}`;
            }
          }

          let waitingStr = '';
          if (mStatus && mStatus.heartbeat === 'waiting' && mStatus.entity === 'registered' && mStatus.registeredAt) {
            waitingStr = `${formatAge(Math.max(0, now - mStatus.registeredAt))} since registration`;
          }

          const setup = setupState[slot.id];
          const inSetup = setup && setup.stage !== 'idle';

          // Heartbeat latency display
          let heartbeatMs = '';
          if (mStatus && mStatus.lastHeartbeatAt) {
            const age = Math.max(0, now - mStatus.lastHeartbeatAt);
            heartbeatMs = age < 1000 ? `${Math.round(age)} ms` : formatAge(age);
          }

          // Recent events for this slot
          const slotEvents = slot.entity_id
            ? eventEntries.filter(e => e.entityId === slot.entity_id || e.entityId === slot.id).slice(-4)
            : eventEntries.filter(e => e.entityId === slot.id).slice(-4);

          // Inject state for this slot
          const inject = injectState[slot.id] || { field: 'audio.bpm', value: '' };
          const source = sourceState[slot.id] || { path: 'project1/', fileName: null };

          // Publishing / listening signals
          const entityId = slot.entity_id || slot.id;
          const publishing = slot.active ? getPublishingSignals(slot, entityStates[entityId] as Record<string, unknown> | undefined) : [];
          const listening = slot.active ? getListeningSignals(slot) : [];
          const slotStreamType = (entityStates[entityId] as Record<string, unknown>)?.streamType as string | undefined;
          const streamTypeLabel = slotStreamType ? slotStreamType.toUpperCase() : '';

          // Derive state badge — with stream type prefix when available
          const stateBadge = (() => {
            if (!slot.active) return { text: '', cls: '' };
            if (mStatus?.stream === 'live') return { text: streamTypeLabel ? `${streamTypeLabel} LIVE` : 'STREAMING', cls: 'badge-streaming' };
            if (mStatus?.stream === 'advertised') return { text: streamTypeLabel ? `${streamTypeLabel} ADVERTISED` : 'ADVERTISED', cls: 'badge-active' };
            if (mStatus?.heartbeat === 'live' || mStatus?.stateSync === 'active') return { text: streamTypeLabel ? `${streamTypeLabel} ACTIVE` : 'ACTIVE', cls: 'badge-active' };
            if (mStatus?.heartbeat === 'stale' || mStatus?.heartbeat === 'lost') return { text: 'PAUSED', cls: 'badge-paused' };
            if (slot.nodeRole === 'receive') return { text: 'MONITOR', cls: 'badge-monitor' };
            return { text: streamTypeLabel ? `${streamTypeLabel} ACTIVE` : 'ACTIVE', cls: 'badge-active' };
          })();

          const slotColor = getSlotColor(slot, slotIdx);
          const originKey = getOriginKey(slot);
          const directionForSlot = setupState[slot.id]?.direction || (slot.nodeRole === 'receive' ? 'receive' : slot.nodeRole === 'send' ? 'send' : null);
          const polarityIcon = directionForSlot === 'send' ? '+' : directionForSlot === 'receive' ? '−' : null;
          const polarityColor = directionForSlot === 'send' ? '#22c55e' : directionForSlot === 'receive' ? '#5cc8ff' : slotColor;
          return (
            <div
              key={slot.id}
              style={{ '--slot-color': slotColor } as React.CSSProperties}
              className={[
                'slot',
                slot.active ? 'active-slot' : '',
                slot.id === selectedId ? 'selected' : '',
                slot.cloudNode ? 'cloud-node' : '',
                inSetup ? 'setup-mode' : '',
                slot.active ? 'live-mode' : '',
                (slot.active && lockedSlots.has(slot.id)) ? 'locked-slot' : '',
              ].filter(Boolean).join(' ')}
              data-signal={slot.signalType || undefined}
              onClick={() => handleSlotClick(slot)}
            >
              {/* ── Per-slot server toggle ── */}
              {(() => {
                const slotMode = slotServerModes[slot.id] || 'auto';
                const slotServerStr = (entityStates[slot.entity_id || slot.id] as Record<string,unknown>|undefined)?.server as string | undefined;
                const modes: { key: 'auto' | 'gallery' | 'railway' | 'custom'; label: string; color: string }[] = [
                  { key: 'auto',    label: 'Auto',   color: '#fbbf24' },
                  { key: 'gallery', label: '⚡ Local', color: '#00ff88' },
                  { key: 'railway', label: '☁ Railway', color: '#00d4ff' },
                  { key: 'custom',  label: '⚙ Adv', color: '#a78bfa' },
                ];
                const activeMode = modes.find(m => m.key === slotMode)!;
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '4px 8px',
                    background: 'rgba(0,0,0,0.3)',
                    borderBottom: `1px solid ${slotColor}18`,
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: 11, fontFamily: 'var(--font-display)', letterSpacing: '0.1em',
                      color: '#ffffff', marginRight: 3, whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                    }}>Server Mode: //</span>
                    {modes.map(({ key, label, color }) => {
                      const active = slotMode === key;
                      return (
                        <button key={key}
                          onClick={e => { e.stopPropagation(); setSlotServer(slot.id, key); }}
                          style={{
                            fontSize: 10, fontFamily: 'var(--font-display)', fontWeight: 700,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            padding: '1px 5px', cursor: 'pointer',
                            background: active ? `${color}15` : 'transparent',
                            border: `1px solid ${active ? color + '60' : 'rgba(255,255,255,0.04)'}`,
                            color: active ? color : 'rgba(255,255,255,0.15)',
                            transition: 'all 0.12s',
                          }}
                        >{label}</button>
                      );
                    })}
                    {/* Active server URL — shows what TD actually reported */}
                    {slotServerStr && (
                      <span style={{
                        fontSize: 10, fontFamily: 'var(--font-mono)',
                        color: `${activeMode.color}80`,
                        marginLeft: 'auto',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: 120,
                      }}>
                        {slotServerStr.replace('https://','').replace('http://','').slice(0, 22)}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* ═══════ ACTIVE SLOT: LIVE NODE PANEL ═══════ */}
              {slot.active ? (
                <div className="live-node-panel">
                  {/* Thumbnail frame at top — single stable source, no key remounts */}
                  <div className="live-node-thumb">
                    {(() => {
                      // Use frameUrl (blob from polling) as sole source.
                      // Fallback only shown as placeholder when no frames have arrived yet.
                      const hasFrame = !!slot.frameUrl;

                      return hasFrame ? (
                        <img
                          src={slot.frameUrl!}
                          alt="stream"
                          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                        />
                      ) : (
                        <div className="live-node-thumb-placeholder">
                          <span className="live-node-thumb-icon" style={{ fontSize: 24, opacity: 0.6 }}>
                            {slot.signalType === 'audio_reactive' ? '♫'
                              : slot.signalType === 'json_stream' ? '{}'
                              : slot.signalType === 'osc' ? '~'
                              : slot.signalType === 'touchdesigner' ? '◆'
                              : slot.signalType === 'text' ? 'A'
                              : '●'}
                          </span>
                          <span className="live-node-thumb-status" style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                            {mStatus?.stream === 'live' ? 'LIVE — WAITING FOR FRAME'
                              : mStatus?.stream === 'advertised' ? 'NO FRAME'
                              : statusText}
                          </span>
                        </div>
                      );
                    })()}
                    <div className={`live-node-badge ${statusCls}`}>
                      {slot.frameUrl ? 'LIVE' : mStatus?.stream === 'advertised' ? 'ADVERTISED' : 'LIVE'}
                    </div>
                  </div>

                  {/* -- Preview Info: entity slug + status + instruction -- */}
                  <div style={{ padding: '6px 10px 4px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>entity slug:</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: slotColor, fontWeight: 700 }}>
                        {(entityStates[slot.entity_id || slot.id] as Record<string,unknown>|undefined)?.toe_name as string || slot.entity_id || slot.id}
                      </span>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: mStatus?.server === 'connected' ? '#4ade80' : mStatus?.server ? '#fbbf24' : 'rgba(255,255,255,0.2)' }} />
                      {mStatus?.lastHeartbeatAt && (
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                          {mStatus.heartbeat === 'live' ? 'now' : `${formatAge(now - mStatus.lastHeartbeatAt)} ago`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, fontStyle: 'italic', fontWeight: 600, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>
                      drag <span style={{ color: '#22c55e' }}>+</span> and <span style={{ color: '#5cc8ff' }}>{'\u2212'}</span> chips below to broadcast to or listen to other slugs
                    </div>
                  </div>

                  {/* ── Sidecar state chips: prompt_text, visitor_present, per-machine fps ── */}
                  {(() => {
                    const eid = slot.entity_id || slot.id;
                    const eState = entityStates[eid] as Record<string, unknown> | undefined;
                    if (!eState || eState._sidecar !== 'true') return null;
                    const prompt = eState.prompt_text as string | null;
                    const visitor = eState.visitor_present;
                    const tdFps = eState.fps as number | string | null;
                    const device = eState.device as string | null;
                    const hasAny = prompt || visitor !== undefined || tdFps;
                    if (!hasAny) return null;
                    return (
                      <div className="live-section" style={{ paddingBottom: 4 }}>
                        <div className="live-section-head">TD State</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {tdFps != null && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              background: 'rgba(49,130,206,0.15)', border: '1px solid rgba(49,130,206,0.4)',
                              color: '#63b3ed', padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                            }}>{tdFps} fps</span>
                          )}
                          {visitor !== undefined && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              background: visitor ? 'rgba(56,161,105,0.15)' : 'rgba(113,128,150,0.1)',
                              border: `1px solid ${visitor ? 'rgba(56,161,105,0.4)' : 'rgba(113,128,150,0.2)'}`,
                              color: visitor ? '#68d391' : '#718096',
                              padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                            }}>{visitor ? '● VISITOR' : '○ no visitor'}</span>
                          )}
                          {device && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center',
                              background: 'rgba(213,163,25,0.1)', border: '1px solid rgba(213,163,25,0.3)',
                              color: '#d5a319', padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                            }}>{device}</span>
                          )}
                          {prompt && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center',
                              background: 'rgba(128,90,213,0.12)', border: '1px solid rgba(128,90,213,0.35)',
                              color: '#b794f4', padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 500,
                              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }} title={prompt}>{prompt.length > 50 ? prompt.slice(0, 50) + '…' : prompt}</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}


{/* ── State Schema: ↑output + ↓input chips with live values ── */}
                  {(() => {
                    const eid = slot.entity_id || slot.id;
                    const eState = entityStates[eid] as Record<string,unknown> | undefined;
                    const schema = eState?.stateSchema as Record<string, {type:string; direction:string}> | undefined;
                    const entries = schema
                      ? Object.entries(schema)
                      : Object.entries(eState || {})
                          .filter(([k]) => !['toe_name','tops','server','active','metadata','stateSchema','publishing','listening'].includes(k))
                          .map(([k]) => [k, { type: 'string', direction: 'output' }] as [string, {type:string;direction:string}]);
                    if (!entries.length) return null;
                    const outs = entries.filter(([,v]) => v.direction !== 'input');
                    const ins  = entries.filter(([,v]) => v.direction === 'input');
                    return (
                      <div className="live-section">
                        <div className="live-section-head">State</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {outs.map(([key, varDef]) => {
                            const lv = eState?.[key] != null ? String(eState[key]).slice(0, 16) : null;
                            return (
                              <div key={key} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                background: `${slotColor}12`, border: `1px solid ${slotColor}40`,
                                padding: '2px 5px', fontSize: 10,
                              }}>
                                <span style={{ color: slotColor, fontSize: 10, fontWeight: 700 }}>=</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: slotColor }}>{key}</span>
                                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>{varDef.type}</span>
                                {lv && <span style={{ color: 'var(--text-dim)', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 3 }}>{lv}</span>}
                              </div>
                            );
                          })}
                          {ins.map(([key, varDef]) => (
                            <div key={key} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              background: 'rgba(255,255,255,0.03)', border: `1px solid ${slotColor}20`,
                              padding: '2px 5px', fontSize: 10,
                            }}>
                              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: 700 }}>−</span>
                              <span style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.4)' }}>{key}</span>
                              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>{varDef.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Section 2: Signals ── */}
                  <div className="live-section">
                    <div className="live-section-head">Signals</div>
                    {publishing.length > 0 && (
                      <div className="live-signal-group">
                        <span className="live-signal-dir" style={{ color: '#22c55e' }}>+ Publishing</span>
                        <div className="live-signal-list">
                          {publishing.map(s => {
                            const eid = slot.entity_id || slot.id;
                            const liveVal = (entityStates[eid] as Record<string,unknown>|undefined)?.[s];
                            const setup = setupState[slot.id];
                            const sigDef = (setup?.outputSignals||[]).find(o => o.key === s);
                            const isNum = sigDef?.type === 'number' || typeof liveVal === 'number';
                            const isBool = sigDef?.type === 'boolean' || typeof liveVal === 'boolean';
                            return (
                              <span key={s} className="live-signal-tag pub"
                                draggable
                                onDragStart={() => handleChipDragStart(slot.entity_id || slot.id, s, 'output')}
                                onDragEnd={handleChipDragEnd}
                                onDragOver={e => handleChipDragOver(e, slot.entity_id || slot.id, s, 'output')}
                                onDragLeave={handleChipDragLeave}
                                onDrop={e => handleChipDrop(e, slot.entity_id || slot.id, s, 'output')}
                                style={{
                                  display:'inline-flex', alignItems:'center', gap:5,
                                  cursor: dragSource?.dir === 'input' ? 'copy' : 'grab',
                                  opacity: dragSource?.slug === (slot.entity_id || slot.id) && dragSource?.key === s ? 0.5 : 1,
                                  outline: dragSource?.slug === (slot.entity_id || slot.id) && dragSource?.key === s ? '2px solid #22c55e'
                                    : dropTarget?.slug === (slot.entity_id || slot.id) && dropTarget?.key === s ? '2px dashed #22c55e' : 'none',
                                  background: dropTarget?.slug === (slot.entity_id || slot.id) && dropTarget?.key === s
                                    ? 'rgba(34,197,94,0.2)' : undefined,
                                  transition: 'all 0.15s',
                                }}>
                                <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 11 }}>+</span>{s}
                                {liveVal !== undefined && liveVal !== null && (
                                  <span style={{
                                    fontSize: 10, fontFamily: 'var(--font-mono)',
                                    color: isBool
                                      ? (liveVal ? '#4ade80' : 'rgba(255,255,255,0.3)')
                                      : 'rgba(255,255,255,0.6)',
                                    fontWeight: 700,
                                    background: isBool && liveVal ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)',
                                    padding: '0 4px', borderRadius: 2,
                                  }}>
                                    {isBool
                                      ? (liveVal ? '● ON' : '○ off')
                                      : isNum
                                        ? Number(liveVal).toFixed(3)
                                        : String(liveVal).slice(0,24)}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {listening.length > 0 && (
                      <div className="live-signal-group">
                        <span className="live-signal-dir" style={{ color: '#5cc8ff' }}>− Listening</span>
                        <div className="live-signal-list">
                          {listening.map(s => {
                            const eid = slot.entity_id || slot.id;
                            const liveVal = (entityStates[eid] as Record<string,unknown>|undefined)?.[s];
                            return (
                              <span key={s} className="live-signal-tag sub"
                                draggable
                                onDragStart={() => handleChipDragStart(slot.entity_id || slot.id, s, 'input')}
                                onDragEnd={handleChipDragEnd}
                                onDragOver={e => handleChipDragOver(e, slot.entity_id || slot.id, s, 'input')}
                                onDragLeave={handleChipDragLeave}
                                onDrop={e => handleChipDrop(e, slot.entity_id || slot.id, s, 'input')}
                                style={{
                                  display:'inline-flex', alignItems:'center', gap:5,
                                  cursor: dragSource?.dir === 'output' ? 'copy' : 'grab',
                                  background: dropTarget?.slug === (slot.entity_id || slot.id) && dropTarget?.key === s
                                    ? 'rgba(92,200,255,0.2)' : undefined,
                                  outline: dropTarget?.slug === (slot.entity_id || slot.id) && dropTarget?.key === s
                                    ? '2px dashed #5cc8ff' : 'none',
                                  transition: 'all 0.15s',
                                }}>
                                <span style={{ color: '#5cc8ff', fontWeight: 700, fontSize: 11 }}>−</span>{s}
                                {liveVal !== undefined && liveVal !== null && (
                                  <span style={{ fontSize: 10, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.5)', fontWeight:700 }}>
                                    {typeof liveVal === 'boolean' ? (liveVal ? '● ON' : '○ off') : String(liveVal).slice(0,24)}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {publishing.length === 0 && listening.length === 0 && (
                      <span className="live-empty" style={{ fontSize: 10 }}>No signals configured</span>
                    )}
                    {/* Add output / input buttons when unlocked */}
                    {!isLocked(slot.id) && (
                      <div style={{ display: 'flex', gap: 5, marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <button
                          onClick={e => { e.stopPropagation();
                            setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], direction: 'send' as NodeRole, stage: 'addState' } }));
                          }}
                          style={{ fontSize: 10, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                            background: `${slotColor}12`, border: `1px solid ${slotColor}40`, color: slotColor,
                            letterSpacing: '0.05em' }}>
                          + output
                        </button>
                        <button
                          onClick={e => { e.stopPropagation();
                            const key = prompt('State key to listen to (e.g. prompt_text):');
                            if (key?.trim()) onInjectSignal?.(slot.id, '__subscribe__', key.trim());
                          }}
                          style={{ fontSize: 10, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                            color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                          + input
                        </button>
                      </div>
                    )}
                  </div>

{/* sections 4-10 removed — streamlined layout */}
                  


</div>
              ) : (
                /* ═══════ INACTIVE SLOT ═══════ */
                <div className="slot-video-area">
                  {inSetup ? (
                    /* ════ INLINE SETUP WIZARD: connect → slug → addState ════ */
                    <div className="slot-inline-wizard">
                      {/* Step dots: 4 stages */}
                      <div className="slot-wizard-steps">
                        {(['connect','setup','slug','addState'] as InlineStage[]).map((s, i, arr) => (
                          <span key={s} style={{ display: 'flex', alignItems: 'center' }}>
                            <span className={`slot-wizard-dot ${
                              setup.stage === s ? 'active' :
                              arr.indexOf(setup.stage) > i ? 'done' : ''
                            }`} />
                            {i < arr.length - 1 && <span className="slot-wizard-line" />}
                          </span>
                        ))}
                      </div>

                      {/* ══ STAGE: connect ══ */}
                      {setup.stage === 'connect' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title" style={{ color: slotColor, letterSpacing: '0.15em' }}>
                            CONNECT YOUR NODE
                          </div>
                          <a href="/maestra.tox" download="maestra.tox"
                            onClick={e => e.stopPropagation()}
                            style={{ display: 'block', width: '100%', boxSizing: 'border-box',
                              padding: '10px 12px', textDecoration: 'none',
                              border: `1px solid ${slotColor}40`, background: `${slotColor}08` }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: slotColor,
                              fontFamily: 'var(--font-display)', letterSpacing: '0.05em', marginBottom: 4 }}>
                              ↓ Download maestra.tox
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                              Drag into your .toe → auto-registers when project opens
                            </div>
                          </a>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>OR</span>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                          </div>
                          <label style={{ display: 'block', width: '100%', boxSizing: 'border-box',
                            padding: '10px 12px', cursor: 'pointer', position: 'relative',
                            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4, pointerEvents: 'none' }}>
                              {setup.refFile ? `📁 ${setup.refFile}` : 'Browse to your .toe file'}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.7, pointerEvents: 'none' }}>
                              The TOX auto-registers when your project opens.<br/>
                              Once connected, this slot updates automatically.
                            </div>
                            <input type="file" accept=".toe,.tox"
                              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  const derived = f.name.replace(/\.(toe|tox)$/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
                                  setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], refFile: f.name, slug: derived, stage: 'setup' } }));
                                }
                              }} />
                          </label>
                        </div>
                      )}

                      {/* ══ STAGE: slug ══ */}
                       {setup.stage === 'setup' && (
                  <div className="slot-wizard-content">
                    <div className="slot-wizard-title" style={{ color: slotColor, letterSpacing: '0.15em' }}>
                      {slot.entity_id ? 'TOX DETECTED' : 'WAITING FOR TOX'}
                    </div>
                    <div style={{ color: '#8892b0', fontSize: 11, textAlign: 'center', padding: '8px 0', lineHeight: 1.5 }}>
                      {slot.entity_id ? (
                        <>Entity <span style={{ color: slotColor, fontWeight: 600 }}>{slot.entity_id}</span> registered.<br/>Confirm slug to continue.</>
                      ) : (
                        <>Open your <span style={{ color: slotColor }}>.toe</span> project with the maestra.tox installed.<br/>The TOX auto-registers when the project opens.</>
                      )}
                    </div>
                    {!slot.entity_id && (
                      <a href="/maestra.tox" download="maestra.tox" onClick={e => e.stopPropagation()} style={{ display: 'block', textAlign: 'center', color: slotColor, fontSize: 10, textDecoration: 'underline', marginBottom: 4, cursor: 'pointer' }}>
                        \u2193 Download maestra.tox
                      </a>
                    )}
                    <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 4 }}>
                      <button className="slot-wizard-btn" onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'connect' } })); }} style={{ flex: '0 0 auto', fontSize: 10, padding: '4px 8px', background: 'transparent', border: '1px solid #334155', color: '#8892b0', cursor: 'pointer' }}>
                        \u2190 Back
                      </button>
                      <button className="slot-wizard-btn slot-wizard-btn-primary" style={{ flex: 1, fontSize: 10, padding: '4px 8px', background: slot.entity_id ? slotColor + '20' : '#1e293b', border: '1px solid ' + (slot.entity_id ? slotColor : '#334155'), color: slot.entity_id ? slotColor : '#8892b0', cursor: 'pointer' }}
                        onClick={e => {
                          e.stopPropagation();
                          const toxSlug = slot.entity_id || setup.slug || '';
                          setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], slug: toxSlug || prev[slot.id].slug, stage: 'slug' } }));
                        }}>
                        {slot.entity_id ? `Continue with "\${slot.entity_id}" \u2192` : 'Skip \u2014 enter slug manually \u2192'}
                      </button>
                    </div>
                  </div>
                )}
                {setup.stage === 'slug' && (
                        <div className="slot-wizard-content">
                          <div className="slot-wizard-title" style={{ color: slotColor }}>Name Your Slot</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textAlign: 'center' }}>
                            {setup.slug ? 'Confirm or edit the slug for this slot' : 'Pick an existing entity or type a new slug'}
                          </div>
                          <EntityPicker
                            slotColor={slotColor}
                            current={setup.slug}
                            onSelect={slug => setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], slug } }))}
                          />
                          <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 4 }}>
                            <button className="slot-wizard-btn slot-wizard-btn-ghost"
                              onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'setup' } })); }}>
                              ← Back
                            </button>
                            <button className="slot-wizard-btn slot-wizard-btn-primary"
                              disabled={!setup.slug.trim()}
                              style={{ flex: 1, background: '#22c55e20', borderColor: '#22c55e', color: '#22c55e' }}
                              onClick={e => {
                                e.stopPropagation();
                                if (!setup.slug.trim()) return;
                                setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], direction: 'send' as NodeRole, stage: 'addState' } }));
                              }}>
                              + Send (output)
                            </button>
                            <button className="slot-wizard-btn slot-wizard-btn-primary"
                              disabled={!setup.slug.trim()}
                              style={{ flex: 1, background: '#5cc8ff20', borderColor: '#5cc8ff', color: '#5cc8ff' }}
                              onClick={e => {
                                e.stopPropagation();
                                if (!setup.slug.trim()) return;
                                setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], direction: 'receive' as NodeRole, stage: 'addState' } }));
                              }}>
                              − Receive (input)
                            </button>
                          </div>
                        </div>
                      )}


                      {/* ══ STAGE: addState ══ */}
                      {setup.stage === 'addState' && (
                        <div className="slot-wizard-content">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="slot-wizard-title" style={{ color: slotColor }}>Add State</div>
                            {setup.direction && (
                              <span style={{
                                fontSize: 14, fontWeight: 700, lineHeight: 1,
                                color: setup.direction === 'send' ? '#22c55e' : '#5cc8ff',
                              }}>
                                {setup.direction === 'send' ? '+' : '−'}
                              </span>
                            )}
                          </div>

                          {/* Accumulated signal chips — grouped by direction with +/- prefix */}
                          {(setup.outputSignals || []).length > 0 && (() => {
                            const outputs = (setup.outputSignals || []).filter(s => (s.signalDir || 'output') === 'output');
                            const inputs = (setup.outputSignals || []).filter(s => s.signalDir === 'input');
                            return (
                              <div style={{ width: '100%', marginBottom: 6 }}>
                                {outputs.length > 0 && (
                                  <>
                                    <div style={{ fontSize: 10, letterSpacing: '0.12em', color: '#22c55e',
                                      textTransform: 'uppercase', marginBottom: 4 }}>+ Outputs</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: inputs.length > 0 ? 6 : 0 }}>
                                      {outputs.map((sig, i) => {
                                        const globalIdx = (setup.outputSignals || []).indexOf(sig);
                                        return (
                                          <div key={globalIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '2px 7px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                            background: '#22c55e12', border: '1px solid #22c55e50', color: '#22c55e' }}>
                                            <span style={{ fontWeight: 700, fontSize: 11 }}>+</span>
                                            {sig.key}
                                            <span style={{ opacity: 0.5, fontSize: 10 }}>· {sig.type}</span>
                                            <button onClick={e => { e.stopPropagation();
                                              setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id],
                                                outputSignals: prev[slot.id].outputSignals.filter((_,j) => j !== globalIdx) } })); }}
                                              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                                                cursor: 'pointer', padding: '0 0 0 2px', fontSize: 10, lineHeight: 1 }}>×</button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                                {inputs.length > 0 && (
                                  <>
                                    <div style={{ fontSize: 10, letterSpacing: '0.12em', color: '#5cc8ff',
                                      textTransform: 'uppercase', marginBottom: 4 }}>− Inputs</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                      {inputs.map((sig, i) => {
                                        const globalIdx = (setup.outputSignals || []).indexOf(sig);
                                        return (
                                          <div key={globalIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '2px 7px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                            background: '#5cc8ff12', border: '1px solid #5cc8ff50', color: '#5cc8ff' }}>
                                            <span style={{ fontWeight: 700, fontSize: 11 }}>−</span>
                                            {sig.key}
                                            <span style={{ opacity: 0.5, fontSize: 10 }}>· {sig.type}</span>
                                            <button onClick={e => { e.stopPropagation();
                                              setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id],
                                                outputSignals: prev[slot.id].outputSignals.filter((_,j) => j !== globalIdx) } })); }}
                                              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                                                cursor: 'pointer', padding: '0 0 0 2px', fontSize: 10, lineHeight: 1 }}>×</button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}

                                                                              {/* Step 1: Stream Type filter */}
                          {(() => {
                            // All tops from /api/tops cache + WS entityStates
                            const _all: string[] = [...cachedTops];
                            Object.values(entityStates).forEach((es: unknown) => {
                              const _t = (es as Record<string,unknown>)?.tops;
                              if (Array.isArray(_t)) (_t as string[]).forEach((t:string) => { if (!_all.includes(t)) _all.push(t); });
                            });

                            // Use cachedTree if available (from /api/tops — built by build_maestra_tox.py)
                            // cachedTree format: { nodeName: ["TYPE:name:path", ...] }
                            const nodeMap: Record<string,string[]> = Object.keys(cachedTree).length > 0
                              ? { ...cachedTree }
                              : (() => {
                                  // Fallback: group flat tops list by depth-2 component
                                  const m: Record<string,string[]> = {};
                                  _all.forEach(t => {
                                    const parts = t.split('/').filter(Boolean);
                                    if (parts.length < 2) return;
                                    const node = parts[1];
                                    if (!m[node]) m[node] = [];
                                    if (!m[node].includes(t)) m[node].push(t);
                                  });
                                  return m;
                                })();
                            const nodes = Object.keys(nodeMap).sort();

                            // Selected node comes from setup.selectedNode (explicit, not derived from path)
                            const selNode  = setup.selectedNode || '';
                            const selTop   = setup.selectedTop || '';
                            const nodeTops = selNode ? (nodeMap[selNode] || []) : [];

                            // Stream type filter
                            // Exact Maestra stream types — https://jordansnyder.github.io/maestra-core/concepts/entities/
                            const STREAM_TYPES: { key: string; label: string; desc: string }[] = [
                              { key: '',        label: 'All',     desc: 'Show all TOPs' },
                              { key: 'ndi',     label: 'NDI',     desc: 'NDI video/audio (NewTek)' },
                              { key: 'syphon',  label: 'Syphon',  desc: 'Syphon texture (macOS)' },
                              { key: 'spout',   label: 'Spout',   desc: 'Spout texture (Windows)' },
                              { key: 'srt',     label: 'SRT',     desc: 'SRT video streaming' },
                              { key: 'video',   label: 'Video',   desc: 'Generic video' },
                              { key: 'audio',   label: 'Audio',   desc: 'Audio feeds' },
                              { key: 'texture', label: 'Texture', desc: 'GPU textures' },
                              { key: 'midi',    label: 'MIDI',    desc: 'MIDI data' },
                              { key: 'osc',     label: 'OSC',     desc: 'OSC message streams' },
                              { key: 'sensor',  label: 'Sensor',  desc: 'Sensor data' },
                              { key: 'data',    label: 'Data',    desc: 'Generic data' },
                            ];
                            const streamFilter = setup.streamType || '';
                            // Map Maestra stream type → TD op type prefixes
                            const TYPE_MAP: Record<string,string[]> = {
                              ndi:     ['ndiinTOP','ndioutTOP','TOP'],
                              syphon:  ['syphonspoutinTOP','syphonspoutoutTOP','TOP'],
                              spout:   ['syphonspoutinTOP','syphonspoutoutTOP','TOP'],
                              srt:     ['TOP'],
                              video:   ['TOP','moviefileinTOP','videodevinTOP'],
                              audio:   ['audiofileinCHOP','audiodevinCHOP','CHOP'],
                              texture: ['TOP'],
                              midi:    ['midiinCHOP','midioutCHOP','CHOP'],
                              osc:     ['oscoutDAT','oscinDAT','DAT'],
                              sensor:  ['CHOP','DAT'],
                              data:    ['CHOP','DAT','scriptDAT','chopexecDAT'],
                            };

                            // Filter nodeTops by stream type hint in path
                            // Map stream type → op type prefixes in tree format
                            const STREAM_TO_TYPES: Record<string,string[]> = {
                              'ndi':     ['ndiinTOP','ndioutTOP','ndiin'],
                              'syphon':  ['syphonspoutinTOP','syphonspoutoutTOP','syphon'],
                              'spout':   ['syphonspoutinTOP','syphonspoutoutTOP','spout'],
                              'srt':     ['srtinTOP','srtoutTOP','srt'],
                              'video':   ['moviefileinTOP','videodeviceinTOP','compositeTOP','renderTOP','TOP'],
                              'audio':   ['audiofileinCHOP','audiodevinCHOP','audiospectrumCHOP','audio'],
                              'texture': ['TOP','nullTOP','outTOP','selectTOP'],
                              'midi':    ['midiinCHOP','midioutCHOP','midi'],
                              'osc':     ['oscinCHOP','oscoutCHOP','osc'],
                              'sensor':  ['lfoCHOP','noiseCHOP','slopeCHOP','triggerCHOP','thresholdCHOP','sensor'],
                              'data':    ['datexecuteDAT','tableDAT','textDAT','DAT','CHOP'],
                            };
                            const filteredTops = !streamFilter ? nodeTops : nodeTops.filter(t => {
                              // t format: "opTypeCOMP:name:/path" or "triggerCHOP:trigger1:/project1/trigger1"
                              const opType = t.split(':')[0] || '';
                              const prefixes = STREAM_TO_TYPES[streamFilter] || [streamFilter];
                              return prefixes.some(p => opType.toLowerCase().includes(p.toLowerCase()));
                            });

                            return (
                              <>
                                {/* Stream type chips */}
                                <div style={{ width: '100%' }}>
                                  <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 4 }}>
                                    Stream Type
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {STREAM_TYPES.map(({ key, label, desc }) => {
                                      const active = key === streamFilter || (key === '' && !streamFilter);
                                      return (
                                        <button key={key}
                                          title={desc}
                                          onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], streamType: key } })); }}
                                          style={{ fontSize: 10, padding: '2px 7px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                                            background: active ? `${slotColor}25` : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${active ? slotColor + '70' : 'rgba(255,255,255,0.08)'}`,
                                            color: active ? slotColor : 'rgba(255,255,255,0.3)',
                                            transition: 'all 0.1s' }}>
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Operator picker — shows ops ONLY within setup.selectedNode */}
                                {/* Node select dropdown */}
                                <div style={{ width: '100%' }}>
                                  <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 3 }}>
                                    Select Node {Object.keys(nodeMap).length > 0 && <span style={{ color: slotColor }}>· {Object.keys(nodeMap).length} found</span>}
                                  </div>
                                  {Object.keys(nodeMap).length > 0 ? (
                                    <>
                                    <input type="text" value={setup.nodeSearch||''} placeholder="search nodes…"
                                      onClick={e=>e.stopPropagation()}
                                      onChange={e=>{e.stopPropagation();setSetupState(prev=>({...prev,[slot.id]:{...prev[slot.id],nodeSearch:e.target.value}}));}}
                                      style={{width:'100%',padding:'3px 7px',fontSize: 11,fontFamily:'var(--font-mono)',background:'rgba(0,0,0,0.4)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.6)',outline:'none',boxSizing:'border-box',marginBottom:3}}/>
                                    <select value={setup.selectedNode||''} onClick={e=>e.stopPropagation()}
                                      onChange={e=>{e.stopPropagation();const n=e.target.value;setSetupState(prev=>({...prev,[slot.id]:{...prev[slot.id],selectedNode:n,selectedTop:'',stateKey:''}}));}}
                                      style={{width:'100%',padding:'5px 8px',fontSize:10,fontFamily:'var(--font-mono)',background:'rgba(0,0,0,0.6)',border:`1px solid ${slotColor}40`,color:slotColor,outline:'none'}}>
                                      <option value="">— select node —</option>
                                      {Object.keys(nodeMap).sort().filter(n=>!(setup.nodeSearch||'')||n.toLowerCase().includes((setup.nodeSearch||'').toLowerCase())).map(n=><option key={n} value={n} style={{background:'#0a0a14'}}>{n}</option>)}
                                    </select>
                                    </>
                                  ) : (
                                    <div style={{fontSize: 11,color:'rgba(255,255,255,0.2)',fontFamily:'var(--font-mono)',padding:'4px 0',lineHeight:1.6}}>
                                      No nodes detected. Run exec(open(r&apos;build_maestra_tox.py&apos;).read()) in TD once.
                                    </div>
                                  )}
                                </div>

                                {setup.selectedNode && (
                                  <div style={{ width: '100%' }}>
                                    <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 3 }}>
                                      Operators in {setup.selectedNode}
                                      {' '}<span style={{ color: slotColor }}>· {(nodeMap[setup.selectedNode]||[]).length}</span>
                                    </div>
                                    {(nodeMap[setup.selectedNode]||[]).length > 0 ? (
                                      <>
                                      <input type="text" value={setup.opSearch||''} placeholder="search operators…" onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();setSetupState(prev=>({...prev,[slot.id]:{...prev[slot.id],opSearch:e.target.value}}));}} style={{width:'100%',padding:'3px 7px',fontSize: 11,fontFamily:'var(--font-mono)',background:'rgba(0,0,0,0.4)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.6)',outline:'none',boxSizing:'border-box',marginBottom:3}}/>
                                      <select value={setup.selectedTop || ''} onClick={e => e.stopPropagation()}
                                        onChange={e => {
                                          e.stopPropagation();
                                          const entry = e.target.value;
                                          const pts = entry.split(':');
                                          const key = pts.length >= 2 ? pts[1] : entry.split('/').pop() || '';
                                          setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id],
                                            selectedTop: entry, stateKey: key } }));
                                        }}
                                        style={{ width: '100%', padding: '5px 8px', fontSize: 10, fontFamily: 'var(--font-mono)',
                                          background: 'rgba(0,0,0,0.6)', border: `1px solid ${slotColor}40`, color: slotColor, outline: 'none' }}>
                                        <option value="">— select operator —</option>
                                        {[...(nodeMap[setup.selectedNode]||[])].sort((a,b)=>(a.split(':')[1]||a).localeCompare(b.split(':')[1]||b)).filter(entry=>{if(!(setup.opSearch||'')) return true; const nm=(entry.split(':')[1]||entry).toLowerCase(); return nm.includes((setup.opSearch||'').toLowerCase());}).map(entry => {
                                          const pts = entry.split(':');
                                          if (pts.length < 3) return null;
                                          const raw  = pts[0];
                                          const name = pts[1];
                                          // PAR = custom parameter, show with label
                                          if (raw === 'PAR') return <option key={entry} value={entry} style={{ background: '#0a0a14' }}>⚙ {name}</option>;
                                          const kind = raw.endsWith('CHOP') ? 'CHOP' : raw.endsWith('TOP') ? 'TOP' : raw.endsWith('DAT') ? 'DAT' : raw.endsWith('COMP') ? 'COMP' : raw.endsWith('SOP') ? 'SOP' : raw.slice(0,5);
                                          const sf = setup.streamType || '';
                                          if (sf) {
                                            const STREAM_TO_KIND: Record<string,string[]> = {
                                              'video':['TOP'], 'texture':['TOP'], 'spout':['TOP'], 'ndi':['TOP'], 'syphon':['TOP'], 'srt':['TOP'],
                                              'audio':['CHOP'], 'midi':['CHOP'], 'osc':['CHOP'], 'sensor':['CHOP'],
                                              'data':['DAT','CHOP','PAR'],
                                            };
                                            const allowed = STREAM_TO_KIND[sf] || [];
                                            if (allowed.length && !allowed.includes(kind)) return null;
                                          }
                                          return <option key={entry} value={entry} style={{ background: '#0a0a14' }}>{name}</option>;
                                        })}
                                      </select>
                                      </>
                                    ) : (
                                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>
                                        No operators found in this node
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* State key — auto-filled, always editable */}
                                <div style={{ width: '100%' }}>
                                  <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 3 }}>
                                    State Key <span style={{ opacity: 0.4 }}>(rename if needed)</span>
                                  </div>
                                  <input type="text" value={setup.stateKey}
                                    placeholder="e.g. prompt_concept"
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateKey: e.target.value } })); }}
                                    style={{ width: '100%', padding: '5px 8px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                      color: slotColor, fontWeight: 700, background: 'rgba(0,0,0,0.4)',
                                      border: `1px solid ${slotColor}40`, outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                              </>
                            );
                          })()}

                          {/* Type chips */}
                          <div style={{ width: '100%' }}>
                            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)',
                              textTransform: 'uppercase', marginBottom: 4 }}>Type</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {(['string','number','boolean','color','vector2','vector3','range','enum','array','object'] as const).map(t => (
                                <button key={t} onClick={e => { e.stopPropagation();
                                  setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stateType: t } })); }}
                                  style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer',
                                    fontFamily: 'var(--font-mono)',
                                    background: setup.stateType === t ? `${slotColor}25` : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${setup.stateType === t ? slotColor+'70' : 'rgba(255,255,255,0.08)'}`,
                                    color: setup.stateType === t ? slotColor : 'rgba(255,255,255,0.3)',
                                    transition: 'all 0.1s' }}>{t}</button>
                              ))}
                            </div>
                          </div>

                          {/* Description — optional */}
                          <div style={{ width: '100%' }}>
                            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)',
                              textTransform: 'uppercase', marginBottom: 3 }}>
                              Description <span style={{ opacity: 0.5 }}>(optional)</span>
                            </div>
                            <input type="text" value={setup.stateDesc}
                              placeholder="e.g. Current prompt sent to StreamDiffusion"
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev,
                                [slot.id]: { ...prev[slot.id], stateDesc: e.target.value } })); }}
                              style={{ width: '100%', padding: '5px 8px', fontSize: 11,
                                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)',
                                color: 'rgba(255,255,255,0.5)', outline: 'none', boxSizing: 'border-box' }} />
                          </div>

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                            <button className="slot-wizard-btn slot-wizard-btn-ghost"
                              onClick={e => { e.stopPropagation(); setSetupState(prev => ({ ...prev,
                                [slot.id]: { ...prev[slot.id], stage: 'slug' } })); }}>
                              ← Back
                            </button>
                            <button
                              className="slot-wizard-btn slot-wizard-btn-primary"
                              style={{ flex: 1 }}
                              disabled={!setup.stateKey.trim()}
                              onClick={e => {
                                e.stopPropagation();
                                if (!setup.stateKey.trim()) return;
                                // Immutable update — this is why chips appear
                                setSetupState(prev => ({
                                  ...prev,
                                  [slot.id]: {
                                    ...prev[slot.id],
                                    outputSignals: [
                                      ...(prev[slot.id].outputSignals || []),
                                      { key: setup.stateKey.trim(), type: setup.stateType,
                                        desc: setup.stateDesc, top: setup.selectedTop, streamType: setup.streamType || '',
                                        signalDir: 'output' }
                                    ],
                                    stateKey: '', stateDesc: '', selectedTop: '',
                                  }
                                }));
                              }}>
                              + Add State
                            </button>
                            {(setup.outputSignals || []).length > 0 && (
                              <button
                                className="slot-wizard-btn slot-wizard-btn-primary"
                                style={{ background: `${slotColor}25`, borderColor: slotColor, color: slotColor }}
                                onClick={e => handleReferenceComplete(slot.id, e)}>
                                Connect ✓
                              </button>
                            )}
                            <button
                              className="slot-wizard-btn slot-wizard-btn-primary"
                              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)' }}
                              onClick={e => handleReferenceComplete(slot.id, e)}>
                              Skip → Go Live
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ════ AVAILABLE — click to connect ════ */
                    <div
                      style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 14,
                        cursor: 'pointer', padding: '24px 20px',
                      }}
                      onClick={(e) => { e.stopPropagation(); handleSlotClick(slot); }}
                    >
                      <div style={{
                        fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        color: slotColor, opacity: 0.65,
                      }}>AVAILABLE</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSlotClick(slot); }}
                        style={{
                          fontSize: 10, fontFamily: 'var(--font-display)', fontWeight: 700,
                          letterSpacing: '0.1em', padding: '8px 22px', cursor: 'pointer',
                          background: `${slotColor}15`,
                          border: `1px solid ${slotColor}60`,
                          color: slotColor, transition: 'all 0.15s',
                        }}
                      >+ CONNECT</button>
                      <a
                        href='/maestra.tox'
                        target='_blank' rel='noreferrer'
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontSize: 10, color: `${slotColor}50`,
                          textDecoration: 'none',
                          borderBottom: `1px solid ${slotColor}25`,
                          paddingBottom: 1,
                          fontFamily: 'var(--font-display)',
                          letterSpacing: '0.06em',
                        }}
                      >↓ download maestra.tox</a>
                    </div>
                  )}
                </div>
              )}

              <div className="slot-footer">
                <div className="slot-footer-left">
                  <div className="slot-label">
                    {slot.active ? (
                      /* Active: entity/toe name + slot index */
                      <>
                        <span className="slot-label-name" style={{ color: slotColor, fontWeight: 700 }}>
                          {(() => {
                            const eid = slot.entity_id || slot.id;
                            const toeName = (entityStates[eid] as Record<string,unknown>|undefined)?.toe_name;
                            return toeName ? String(toeName) : (slot.entity_id || slot.label);
                          })()}
                        </span>
                        <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', opacity: 0.3, marginLeft: 4, textTransform: 'uppercase' }}>
                          slot {slots.indexOf(slot) + 1}
                        </span>
                      </>
                    ) : (
                      /* Inactive: "Connect Your Tool" dropdown in slot color */
                      <select
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); if (e.target.value) handleSlotClick(slot); }}
                        defaultValue=""
                        style={{
                          fontSize: 11, letterSpacing: '0.06em',
                          color: slotColor,
                          border: `1px solid ${slotColor}70`,
                          fontWeight: 600,
                          background: `${slotColor}0a`,
                          padding: '3px 6px',
                          cursor: 'pointer',
                          outline: 'none',
                          appearance: 'none',
                          WebkitAppearance: 'none',
                          fontFamily: 'var(--font-display)',
                          paddingRight: 20,
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='7' height='5' viewBox='0 0 7 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L3.5 4L6 1' stroke='${encodeURIComponent(slotColor)}' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 5px center',
                        }}
                      >
                        <option value="" disabled style={{ background: '#0a0a14', color: '#666' }}>Connect Your Tool</option>
                        <option value="touchdesigner" style={{ background: '#0a0a14', color: '#fff' }}>TouchDesigner</option>
                        <option value="max_msp" style={{ background: '#0a0a14', color: '#fff' }}>Max/MSP</option>
                        <option value="unreal" style={{ background: '#0a0a14', color: '#fff' }}>Unreal Engine</option>
                        <option value="unity" style={{ background: '#0a0a14', color: '#fff' }}>Unity</option>
                        <option value="arduino" style={{ background: '#0a0a14', color: '#fff' }}>Arduino / ESP32</option>
                        <option value="web" style={{ background: '#0a0a14', color: '#fff' }}>Web / React / Mobile</option>
                        <option value="python" style={{ background: '#0a0a14', color: '#fff' }}>Python</option>
                        <option value="raspberry_pi" style={{ background: '#0a0a14', color: '#fff' }}>Raspberry Pi</option>
                      </select>
                    )}
                  {/* Edit Signals button — only when unlocked */}
                  {slot.active && !isLocked(slot.id) && (
                    <button
                      onClick={e => { e.stopPropagation();
                        setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'addState' } }));
                      }}
                      style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                        background: `${slotColor}10`, border: `1px solid ${slotColor}30`,
                        color: slotColor, opacity: 0.7, marginBottom: 3 }}>
                      + edit signals
                    </button>
                  )}
                  {/* Lock + controls — show on hover */}
                  {slot.active && (
                    <div className="slot-footer-controls" style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleLock(slot.id, slot, entityStates[slot.entity_id || slot.id] as Record<string, unknown> || {}); }}
                        title={lockedSlots.has(slot.id) ? '🔒 Locked — click to unlock and modify' : '🔓 Click to lock and protect this slot'}
                        style={{
                          background: 'none', border: 'none', padding: '0 2px',
                          color: lockedSlots.has(slot.id) ? slotColor : 'rgba(255,255,255,0.18)',
                          cursor: 'pointer', fontSize: 10, lineHeight: 1, transition: 'color 0.15s',
                        }}
                      >{lockedSlots.has(slot.id) ? (<svg width="11" height="13" viewBox="0 0 11 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="1" y="5.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M3 5.5V3.5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          <circle cx="5.5" cy="9" r="1" fill="currentColor"/>
                        </svg>) : (<svg width="11" height="13" viewBox="0 0 11 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="1" y="5.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M3 5.5V3.5a2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          <circle cx="5.5" cy="9" r="1" fill="currentColor"/>
                        </svg>)}</button>
                      <button
                        onClick={e => { e.stopPropagation(); onAddSlot?.(); }}
                        title="Add a new slot"
                        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)', borderRadius: 2, width: 14, height: 14, fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >+</button>
                      <button
                        onClick={e => { e.stopPropagation(); /* disconnect */ }}
                        title="Disconnect slot"
                        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)', borderRadius: 2, width: 14, height: 14, fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >−</button>
                    </div>
                  )}
                  </div>
                  {/* Entity ID tag */}
                  {(slot.entity_id || slot.active) && (
                    <div className="slot-entity-tag">
                      <span className="slot-entity-label">ENTITY</span>
                      <span className="slot-entity-id">{slot.entity_id || slot.id}</span>
                    </div>
                  )}
                </div>
                <div className="slot-meta">
                  <span className="slot-fps">
                    {(() => {
                      const eid = slot.entity_id || slot.id;
                      const sidecar = entityStates[eid] as Record<string, unknown> | undefined;
                      const tdFps = sidecar?._sidecar === 'true' && sidecar?.fps != null ? sidecar.fps : null;
                      const displayFps = tdFps != null ? tdFps : slot.fps;
                      return displayFps != null ? `${displayFps}fps` : '';
                    })()}
                    {slot.fps != null && lastEventStr ? ' · ' : ''}
                    {lastEventStr}
                  </span>
                  {slot.cloudNode && <span className="cloud-badge">&#x2601; Cloud</span>}
                  {/* State badge for active slots */}
                  {slot.active ? (
                    <span className={`slot-state-badge ${stateBadge.cls}`}>{stateBadge.text}</span>
                  ) : inSetup ? (
                    <span className="slot-tag setup-tag">
                      {setup.stage === 'connect' ? 'Setting up…' : setup.stage === 'setup' ? 'Bootstrap…' : setup.stage === 'slug' ? 'Naming…' : 'Add State'}
                    </span>
                  ) : (
                    <span className="slot-tag available-tag">
                      <span className="available-label">Available</span>
                      <span className="available-connect-btn">Click to Connect</span>
                    </span>
                  )}
                </div>
              </div>
              {/* Top-right: + / - polarity badge, lock/unlock, pin */}
              <div className="slot-top-controls" style={{
                position: 'absolute', top: 6, right: 6,
                display: 'flex', alignItems: 'center', gap: 3,
                zIndex: 10,
              }}>
                {/* +/− signal count badges — always visible for active slots */}
                {slot.active && (publishing.length > 0 || listening.length > 0) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {publishing.length > 0 && (
                      <span title={`${publishing.length} output${publishing.length > 1 ? 's' : ''}: ${publishing.join(', ')}`}
                        style={{ color: '#22c55e', padding: '1px 3px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', lineHeight: 1 }}>
                        +{publishing.length}
                      </span>
                    )}
                    {listening.length > 0 && (
                      <span title={`${listening.length} input${listening.length > 1 ? 's' : ''}: ${listening.join(', ')}`}
                        style={{ color: '#5cc8ff', padding: '1px 3px', background: 'rgba(92,200,255,0.1)', border: '1px solid rgba(92,200,255,0.3)', lineHeight: 1 }}>
                        −{listening.length}
                      </span>
                    )}
                  </span>
                )}
                {/* Polarity badge for inactive slots with known direction */}
                {!slot.active && polarityIcon && (
                  <span
                    title={directionForSlot === 'receive' ? 'Receiver (−)' : 'Sender (+)'}
                    style={{
                      fontSize: 16, fontWeight: 800, lineHeight: 1,
                      color: polarityColor,
                      opacity: 0.9, cursor: 'default', padding: '0 3px',
                      textShadow: `0 0 8px ${polarityColor}40`,
                    }}>
                    {polarityIcon}
                  </span>
                )}
                {/* Lock / Unlock */}
                <button
                  title={lockedSlots.has(slot.id) ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
                  onClick={e => { e.stopPropagation(); toggleLock(slot.id, slot, entityStates[slot.entity_id || slot.id] as Record<string, unknown> || {}); }}
                  style={{
                    background: 'none', border: 'none', padding: '1px 2px',
                    cursor: 'pointer', color: lockedSlots.has(slot.id) ? slotColor : 'rgba(255,255,255,0.35)',
                    display: 'flex', alignItems: 'center',
                  }}>
                  {lockedSlots.has(slot.id) ? (
                    <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
                      <rect x="1.5" y="5.5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M3.5 5.5V3.5a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" style={{opacity:0.5}}>
                      <rect x="1.5" y="5.5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M3.5 5.5V3.5a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
                {/* Edit button — re-open wizard to add/remove signals when unlocked */}
                {!isLocked(slot.id) && slot.active && (
                  <button
                    title="Edit outputs / inputs"
                    onClick={e => {
                      e.stopPropagation();
                      setSetupState(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], stage: 'addState' } }));
                    }}
                    style={{ background:'none', border:'none', padding:'1px 3px', cursor:'pointer', color:'rgba(255,255,255,0.3)', fontSize: 10, fontFamily:'var(--font-display)', letterSpacing:'0.06em' }}>
                    EDIT
                  </button>
                )}
                {/* Pin button */}
                <button
                  title={pinnedSlots.has(slot.id) ? 'Pinned — click to unpin' : 'Click to pin this slot'}
                  onClick={e => { e.stopPropagation(); togglePin(slot.id); }}
                  style={{
                    background: 'none', border: 'none', padding: '1px 2px',
                    cursor: 'pointer', color: pinnedSlots.has(slot.id) ? slotColor : 'rgba(255,255,255,0.35)',
                    display: 'flex', alignItems: 'center', fontSize: 11,
                  }}>
                  {pinnedSlots.has(slot.id) ? '📌' : '📍'}
                </button>
              </div>
              <style>{'.slot:hover .slot-top-controls { opacity: 1 !important; }'}</style>
            </div>
          );
        })}

        {/* Empty State CTA */}
        {!hasActiveNodes && (
          <div className="empty-state-cta" onClick={onJoinNode}>
            <svg className="cta-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <div className="cta-title">No Nodes Connected</div>
            <div className="cta-desc">
              Click &ldquo;Join Maestra&rdquo; in the header to connect your first TouchDesigner, browser, or Max/MSP node to the fleet.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

