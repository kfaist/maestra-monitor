'use client';

import { useState, useCallback } from 'react';
import { FleetSlot } from '@/types';
import { MAESTRA_API_URL } from '@/lib/maestra-connection';

interface TDConnectGuideProps {
  slot: FleetSlot;
}

/** Generate a clean, slot-based entity name artists can understand */
function slotEntityName(slot: FleetSlot): string {
  // If the slot already has an entity ID from a live connection, use that
  if (slot.entity_id) return slot.entity_id;

  // Otherwise generate a readable name from the slot label
  // "Krista 1" → "krista1", "Operator" → "operator", "Slot 3" → "slot3"
  const clean = slot.label.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^_|_$/g, '');
  return clean || slot.id.replace('slot_', '');
}

export default function TDConnectGuide({ slot }: TDConnectGuideProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const entityId = slotEntityName(slot);
  const serverUrl = MAESTRA_API_URL;

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }, []);

  const isMixed = slot.maestraStatus?.mixedContent || slot.maestraStatus?.optimistic;
  const isLive = slot.maestraStatus?.heartbeat === 'live';

  return (
    <div className="td-connect-guide">
      <div className="td-guide-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isLive ? 'var(--active)' : 'var(--accent)'} strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span className="td-guide-title" style={isLive ? { color: 'var(--active)' } : undefined}>
          {isLive ? 'Connected' : 'Connect Your TouchDesigner'}
        </span>
      </div>

      {/* Mixed content — friendly explanation */}
      {isMixed && (
        <div className="td-guide-notice">
          <div className="td-guide-notice-title">Browser connection limited</div>
          <div className="td-guide-notice-body">
            This dashboard runs over HTTPS and can&apos;t reach the gallery&apos;s local server directly. <strong>TouchDesigner connects normally</strong> — just follow the steps below.
          </div>
        </div>
      )}

      {/* Already live — just confirm */}
      {isLive ? (
        <div className="td-guide-live-msg">
          This node is live on the fleet. Your TouchDesigner is connected and sending heartbeats.
        </div>
      ) : (
        <>
          {/* Steps — candy path */}
          <div className="td-guide-steps">
            <div className="td-guide-step">
              <div className="td-guide-step-num">1</div>
              <div className="td-guide-step-content">
                <div className="td-guide-step-label">Download the TouchDesigner connector</div>
                <div className="td-guide-step-hint">A single TOX file. Drop it anywhere in your project.</div>
              </div>
            </div>

            <div className="td-guide-step">
              <div className="td-guide-step-num">2</div>
              <div className="td-guide-step-content">
                <div className="td-guide-step-label">Drop it into your TD network</div>
                <div className="td-guide-step-hint">It appears as a COMP — nothing else in your .toe changes.</div>
              </div>
            </div>

            <div className="td-guide-step">
              <div className="td-guide-step-num">3</div>
              <div className="td-guide-step-content">
                <div className="td-guide-step-label">Paste this connection info</div>
                <div className="td-guide-copyable">
                  <span className="td-guide-copyable-label">Server</span>
                  <code>{serverUrl}</code>
                  <button
                    className="td-guide-copy-btn"
                    onClick={() => copyToClipboard(serverUrl, 'server')}
                  >
                    {copiedField === 'server' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="td-guide-copyable">
                  <span className="td-guide-copyable-label">Entity</span>
                  <code>{entityId}</code>
                  <button
                    className="td-guide-copy-btn"
                    onClick={() => copyToClipboard(entityId, 'entity')}
                  >
                    {copiedField === 'entity' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div className="td-guide-step">
              <div className="td-guide-step-num">4</div>
              <div className="td-guide-step-content">
                <div className="td-guide-step-label">Click <strong>Connect</strong> in TouchDesigner</div>
                <div className="td-guide-step-hint">Your node will appear here instantly.</div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="td-guide-actions">
            <a
              href="https://github.com/kfaist/maestra-fleet-tox/raw/main/touchdesigner/maestra_fleet.tox"
              download
              target="_blank"
              rel="noopener noreferrer"
              className="btn primary td-guide-download"
            >
              Download TOX
            </a>
            <button
              className="btn primary"
              onClick={() => copyToClipboard(`Server: ${serverUrl}\nEntity: ${entityId}`, 'all')}
            >
              {copiedField === 'all' ? 'Copied!' : 'Copy All'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
