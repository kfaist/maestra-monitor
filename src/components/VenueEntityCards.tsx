'use client';

import { useState, useEffect, useCallback } from 'react';

/** Venue entity from the gallery Maestra server */
interface VenueEntity {
  slug: string;
  label: string;
  type: string;
  heartbeat_status: string;
  stream_status: string;
  state_keys: Record<string, { value: unknown; type: string; last_seen: number }>;
  last_seen: number;
}

interface VenueEntityCardsProps {
  onDragStart: (slug: string, key: string, dir: 'output') => void;
  onDragEnd: () => void;
  /** Current drag source from SlotGrid — show drop targets when dragging TO a venue entity */
  activeDrag?: { slug: string; key: string; dir: 'output' | 'input' } | null;
}

const TYPE_ICONS: Record<string, string> = {
  sensor: '📡', installation: '✨', sculpture: '🦋', media: '🎬',
  dmx_controller: '⚡', space: '🏛', room: '🚪', zone: '📍',
};

export default function VenueEntityCards({ onDragStart, onDragEnd, activeDrag }: VenueEntityCardsProps) {
  const [entities, setEntities] = useState<VenueEntity[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Fetch from discovery store
  const fetchVenue = useCallback(async () => {
    try {
      const res = await fetch('/api/discovery', { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return;
      const data = await res.json() as { entities: Record<string, VenueEntity> };
      if (data.entities) {
        const list = Object.values(data.entities)
          .filter(e => !e.slug.startsWith('KFaist') && !e.slug.startsWith('_') && e.slug !== 'Connect .toe')
          .sort((a, b) => a.label.localeCompare(b.label));
        setEntities(list);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchVenue();
    const interval = setInterval(fetchVenue, 15000);
    return () => clearInterval(interval);
  }, [fetchVenue]);

  if (entities.length === 0) return null;

  const toggleExpand = (slug: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)',
        textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
        marginBottom: 8, paddingLeft: 2,
      }}>
        Venue Entities <span style={{ color: 'rgba(255,255,255,0.15)' }}>{entities.length}</span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 6,
      }}>
        {entities.map(entity => {
          const keys = Object.entries(entity.state_keys || {});
          const isExpanded = expanded.has(entity.slug);
          const icon = TYPE_ICONS[entity.type] || '📦';
          const isAlive = entity.heartbeat_status === 'active' || entity.heartbeat_status === 'live';
          
          return (
            <div
              key={entity.slug}
              onClick={() => keys.length > 0 && toggleExpand(entity.slug)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                padding: '6px 8px',
                cursor: keys.length > 0 ? 'pointer' : 'default',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 11 }}>{icon}</span>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  color: 'rgba(255,255,255,0.75)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>{entity.label}</span>
                {isAlive && (
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#34d399', flexShrink: 0,
                  }} />
                )}
              </div>

              {/* Type + key count */}
              <div style={{
                fontSize: 9, color: 'rgba(255,255,255,0.3)',
                fontFamily: 'var(--font-mono)',
              }}>
                {entity.type} {keys.length > 0 && `· ${keys.length} keys`}
                {keys.length > 0 && (
                  <span style={{ float: 'right', fontSize: 8 }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                )}
              </div>

              {/* Expanded: draggable state key chips */}
              {isExpanded && keys.length > 0 && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 3,
                  marginTop: 5, paddingTop: 5,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {keys.map(([key, meta]) => {
                    const val = meta.value;
                    const display = val === null ? 'null'
                      : typeof val === 'number' ? (Number.isInteger(val) ? String(val) : val.toFixed(2))
                      : typeof val === 'boolean' ? String(val)
                      : typeof val === 'string' ? (val.length > 12 ? val.slice(0, 12) + '...' : val)
                      : typeof val === 'object' ? (Array.isArray(val) ? `[${(val as unknown[]).length}]` : '{...}')
                      : '?';

                    return (
                      <div
                        key={key}
                        draggable
                        onDragStart={e => {
                          onDragStart(entity.slug, key, 'output');
                          const ghost = document.createElement('div');
                          ghost.textContent = `+ ${entity.slug}/${key}`;
                          ghost.style.cssText = 'position:fixed;top:-100px;padding:4px 10px;background:rgba(255,255,255,0.9);color:#000;font:700 11px monospace;border-radius:3px;z-index:9999;';
                          document.body.appendChild(ghost);
                          e.dataTransfer.setDragImage(ghost, 0, 0);
                          setTimeout(() => document.body.removeChild(ghost), 0);
                        }}
                        onDragEnd={onDragEnd}
                        style={{
                          fontSize: 9, fontFamily: 'var(--font-mono)',
                          padding: '2px 5px', borderRadius: 2,
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.6)',
                          cursor: 'grab', userSelect: 'none',
                          display: 'flex', gap: 3, alignItems: 'center',
                          maxWidth: '100%',
                        }}
                        title={`${entity.slug}.${key} = ${JSON.stringify(val)}`}
                      >
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>+</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {key}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8 }}>{display}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
