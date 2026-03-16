import { STOP_WORDS } from './constants';

export function extractNouns(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  return [...new Set(words.filter(w => w.length > 3 && !STOP_WORDS.has(w)))].slice(0, 8);
}

export function buildPrompt(base: string, nouns: string[]): string {
  if (!base.trim() && !nouns.length) return '';
  if (!nouns.length) return base.trim();
  if (!base.trim()) return nouns.join(', ');
  return base.trim() + ', ' + nouns.join(', ');
}

export function formatTimestamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}