export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://maestra-backend-v2-production.up.railway.app';
export const WS_URL = API_BASE.replace('https', 'wss') + '/ws';
export const FRAME_FETCH_INTERVAL = 80; // ms (~12fps — fast enough for continuous relay to Maestra)
export const HEARTBEAT_INTERVAL = 5000; // ms
export const WS_RECONNECT_DELAY = 3000; // ms
export const FREQ_LOG_MAX = 12;
export const MAX_LOG_ENTRIES = 30;
export const MAX_NOUNS = 10;
export const DEFAULT_DEBOUNCE_MS = 800;

export const STOP_WORDS = new Set([
  'i','me','my','we','you','he','she','it','they','this','that','a','an','the',
  'is','was','are','were','be','been','have','has','had','do','did','will','would',
  'could','should','may','might','can','to','of','in','on','at','by','for','with',
  'about','as','into','from','and','or','but','if','so','then','when','where',
  'what','which','who','how','not','no','very','just','also','up','out','get',
  'got','go','went','come','came','see','say','said','know','think','make',
  'take','use','find','give','tell'
]);

export const PALETTE_COLORS = [
  { hue: 280, name: 'Purple' },
  { hue: 320, name: 'Pink' },
  { hue: 15, name: 'Coral' },
  { hue: 45, name: 'Gold' },
  { hue: 120, name: 'Green' },
  { hue: 180, name: 'Cyan' },
  { hue: 220, name: 'Blue' },
  { hue: 0, name: 'Red' },
];

export const AUDIO_SOURCE_COLORS: Record<string, string> = {
  none: '#6B7280',
  rms: '#E5F9FF',
  bpm: '#FFD84D',
  sub: '#7C3AED',
  bass: '#FF2FA3',
  mid: '#FF8A3D',
  high: '#3DD6FF',
};// build: Thu Mar 26 09:06:21 UTC 2026
