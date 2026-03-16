import { FleetSlot } from '@/types';
import { SUGGESTIONS } from './suggestions';

export function createInitialSlots(): FleetSlot[] {
  return [
    {
      id: 'krista1',
      label: 'Krista1',
      entity_id: 'krista1_visual',
      endpoint: '/video/frame/td',
      active: true,
      fps: null,
      frameUrl: null,
      cloudNode: false,
      connection_status: 'connecting',
      last_heartbeat: null,
      active_stream: 'StreamDiffusion',
      state_summary: {},
      _frameTimes: [],
      _fpsSmooth: null,
    },
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `slot${i + 2}`,
      label: `Slot ${i + 2}`,
      entity_id: null,
      endpoint: null,
      active: false,
      fps: null,
      frameUrl: null,
      cloudNode: false,
      connection_status: 'disconnected' as const,
      last_heartbeat: null,
      active_stream: null,
      state_summary: {},
      suggestion: SUGGESTIONS[i % SUGGESTIONS.length],
      _frameTimes: [],
      _fpsSmooth: null,
    })),
  ];
}
