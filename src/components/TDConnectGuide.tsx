'use client';

import { useState, useCallback } from 'react';
import { FleetSlot } from '@/types';
import { GALLERY_SERVER_URL, generateEntityId } from '@/lib/maestra-connection';

interface TDConnectGuideProps {
  slot: FleetSlot;
}

export default function TDConnectGuide({ slot }: TDConnectGuideProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const entityId = slot.entity_id || generateEntityId(slot.label, slot.suggestion?.tag);
  const serverUrl = GALLERY_SERVER_URL;

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }, []);

  const isMixed = slot.maestraStatus?.mixedContent || slot.maestraStatus?.optimistic;

  return (
    <div className="td-connect-guide">
      <div className="td-guide-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span className="td-guide-title">Connect This Node</span>
      </div>

      {/* Mixed content explanation */}
      {isMixed && (
        <div className="td-guide-notice">
          <div className="td-guide-notice-title">Browser connection limited</div>
          <div className="td-guide-notice-body">
            This dashboard is running over HTTPS, so your browser cannot directly connect to the gallery&apos;s HTTP Maestra server. <strong>TouchDesigner can still connect normally.</strong>
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="td-guide-steps">
        <div className="td-guide-step">
          <div className="td-guide-step-num">1</div>
          <div className="td-guide-step-content">
            <div className="td-guide-step-label">Drop the Maestra TOX into your TouchDesigner project.</div>
          </div>
        </div>

        <div className="td-guide-step">
          <div className="td-guide-step-num">2</div>
          <div className="td-guide-step-content">
            <div className="td-guide-step-label">Use this server URL:</div>
            <div className="td-guide-copyable">
              <code>{serverUrl}</code>
              <button
                className="td-guide-copy-btn"
                onClick={() => copyToClipboard(serverUrl, 'server')}
              >
                {copiedField === 'server' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className="td-guide-step">
          <div className="td-guide-step-num">3</div>
          <div className="td-guide-step-content">
            <div className="td-guide-step-label">Use this Entity ID:</div>
            <div className="td-guide-copyable">
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
            <div className="td-guide-step-label">Click <strong>Connect</strong> in TouchDesigner.</div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="td-guide-actions">
        <button
          className="btn primary"
          onClick={() => copyToClipboard(serverUrl, 'server')}
        >
          {copiedField === 'server' ? 'Copied!' : 'Copy Server URL'}
        </button>
        <button
          className="btn primary"
          onClick={() => copyToClipboard(entityId, 'entity')}
        >
          {copiedField === 'entity' ? 'Copied!' : 'Copy Entity ID'}
        </button>
        <a
          href="https://github.com/kfaist/maestra-fleet-tox/raw/main/touchdesigner/maestra_fleet.tox"
          download
          target="_blank"
          rel="noopener noreferrer"
          className="btn primary"
        >
          Download TOX
        </a>
      </div>
    </div>
  );
}
