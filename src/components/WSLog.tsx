'use client';

import { LogEntry } from '@/types';

interface WSLogProps {
  entries: LogEntry[];
}

export default function WSLog({ entries }: WSLogProps) {
  return (
    <div className="ws-log">
      <div className="ws-log-title">// WebSocket Log</div>
      <div className="log-lines-inner">
        {entries.map((entry, i) => (
          <div key={i} className="log-line">
            <span className="log-time">[{entry.timestamp}]</span>
            <span className={`log-msg ${entry.type}`}>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
