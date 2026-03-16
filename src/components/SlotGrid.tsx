'use client';

import { FleetSlot } from '@/types';

interface SlotGridProps {
  slots: FleetSlot[];
  selectedId: string | null;
  onSelectSlot: (id: string) => void;
  onAddSlot: () => void;
  onJoinNode: () => void;
}

export default function SlotGrid({ slots, selectedId, onSelectSlot, onAddSlot, onJoinNode }: SlotGridProps) {
  const activeCount = slots.filter(s => s.active).length;
  const hasActiveNodes = activeCount > 0;

  return (
    <>
      <div className="panel-header">
        <div className="panel-title-sm">// Fleet Slots</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="entity-count">{activeCount} active / {slots.length} slots</div>
          <button className="btn-add" onClick={onAddSlot}>+ Add Slot</button>
        </div>
      </div>
      <div className="slot-grid">
        {slots.map(slot => (
          <div
            key={slot.id}
            className={[
              'slot',
              slot.active ? 'active-slot' : '',
              slot.id === selectedId ? 'selected' : '',
              slot.cloudNode ? 'cloud-node' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onSelectSlot(slot.id)}
          >
            <div className="slot-video-area">
              {slot.active ? (
                slot.frameUrl ? (
                  <img src={slot.frameUrl} alt="stream" />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                      Connecting
                    </span>
                  </div>
                )
              ) : slot.suggestion ? (
                <div className="slot-suggestion">
                  <div className="suggestion-eyebrow">// connect a node</div>
                  <div className="suggestion-title">{slot.suggestion.title}</div>
                  <div className="suggestion-desc">{slot.suggestion.desc}</div>
                  <span className={`suggestion-tag ${slot.suggestion.tag}`}>{slot.suggestion.tagLabel}</span>
                </div>
              ) : null}
            </div>
            <div className="slot-footer">
              <div className="slot-label">{slot.label}</div>
              <div className="slot-meta">
                <span className="slot-fps">{slot.fps != null ? `${slot.fps}fps` : ''}</span>
                {slot.cloudNode && <span className="cloud-badge">&#x2601; Cloud</span>}
                {slot.active ? (
                  <span className="slot-tag active-tag">Active</span>
                ) : (
                  <span className="slot-tag available-tag">Available</span>
                )}
              </div>
            </div>
            <div className="selected-badge">
              <svg viewBox="0 0 10 10" fill="none" stroke="#000" strokeWidth="2">
                <polyline points="1.5,5 4,7.5 8.5,2.5" />
              </svg>
            </div>
          </div>
        ))}

        {/* Empty State CTA — shown when no active nodes */}
        {!hasActiveNodes && (
          <div className="empty-state-cta" onClick={onJoinNode}>
            <svg className="cta-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <div className="cta-title">No Nodes Connected</div>
            <div className="cta-desc">
              Click &ldquo;+ Join Node&rdquo; in the header to connect your first TouchDesigner, browser, or Max/MSP node to the fleet.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
