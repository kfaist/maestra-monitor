import { API_BASE } from './constants';

export interface FrameFetchResult {
  url: string;
  latency: number;
}

export async function fetchFrame(
  endpoint: string,
  overrideUrl?: string
): Promise<FrameFetchResult | null> {
  const url = overrideUrl || `${API_BASE}${endpoint}`;
  try {
    const t0 = performance.now();
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const latency = Math.round(performance.now() - t0);
    const blobUrl = URL.createObjectURL(blob);
    return { url: blobUrl, latency };
  } catch {
    return null;
  }
}

export function calculateFps(frameTimes: number[]): number | null {
  if (frameTimes.length < 2) return null;
  const span = (frameTimes[frameTimes.length - 1] - frameTimes[0]) / 1000;
  if (span <= 0) return null;
  return Math.round((frameTimes.length - 1) / span);
}

export function smoothFps(current: number | null, raw: number): number {
  if (current == null) return raw;
  return current * 0.6 + raw * 0.4;
}