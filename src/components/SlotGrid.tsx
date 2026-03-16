'use client';

import { useState, useEffect } from 'react';
import { FleetSlot, slotStatusLabel, slotStatusClass, formatAge } from '@/types';

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

  // Tick every 500ms for age display (slower = less jitter)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

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
        {slots.map(slot => {
          // Derive truthful status label from 5-layer model
          const mStatus = slot.maestraStatus;
          const statusText = mStatus ? slotStatusLabel(mStatus) : (
            slot.active ? (slot.connection_status === 'connected' ? 'Active' : 'Connecting') : ''
          );
          const statusCls = mStatus ? slotStatusClass(mStatus) : '';

          // "Last event" — pick the most recent timestamp across all layers
          let lastEventStr = '';
          if (mStatus && slot.active) {
            const timestamps = [mStatus.lastHeartbeatAt, mStatus.lastStateUpdateAt, mStatus.lastStreamFrameAt].filter(Boolean) as number[];
            if (timestamps.length > 0) {
              const mostRecent = Math.max(...timestamps);
              const age = Math.max(0, now - mostRecent);
              lastEventStr = `last: ${formatAge(age)}`;
            }
          }

          // Waiting timer for video area
          let waitingStr = '';
          if (mStatus && mStatus.heartbeat === 'waiting' && mStatus.entity === 'registered' && mStatus.registeredAt) {
            waitingStr = `${formatAge(Math.max(0, now - mStatus.registeredAt))} since registration`;
          }

          return (
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
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: mStatus ? 'var(--accent)' : 'var(--text-dim)' }}>
                        {statusText}
                      </span>
                      {waitingStr ? (
                        <span style={{ fontSize: '8px', letterSpacing: '.08em', color: 'var(--text-dim)', opacity: 0.6 }}>
                          {waitingStr}
                        </span>
                      ) : mStatus && mStatus.heartbeat === 'waiting' && mStatus.entity === 'registered' ? (
                        <span style={{ fontSize: '8px', letterSpacing: '.08em', color: 'var(--text-dim)', opacity: 0.5 }}>
                          Awaiting first heartbeat
                        </span>
                      ) : null}
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
                  <span className="slot-fps">
                    {slot.fps != null ? `${slot.fps}fps` : ''}
                    {slot.fps != null && lastEventStr ? ' · ' : ''}
                    {lastEventStr}
                  </span>
                  {slot.cloudNode && <span className="cloud-badge">&#x2601; Cloud</span>}
                  {slot.active ? (
                    <span className={`slot-tag active-tag ${statusCls}`}>
                      {statusText}
                    </span>
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
