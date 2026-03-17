import { FleetSlot } from '@/types';
import { SUGGESTIONS } from './suggestions';

/** Descriptive sub-labels derived from suggestion context */
const SLOT_DESCRIPTORS: { label: string; entityId: string; suggestion: typeof SUGGESTIONS[number] }[] = [
  { label: 'Operator', entityId: 'visual_secondary', suggestion: SUGGESTIONS[0] },       // Second Screen / TD
  { label: 'Scope', entityId: 'scope_render', suggestion: SUGGESTIONS[1] },               // Scope Node
  { label: 'Audio Reactive', entityId: 'audio_reactive', suggestion: SUGGESTIONS[2] },    // Max/MSP
  { label: 'Monitor', entityId: 'monitor_station', suggestion: SUGGESTIONS[3] },           // Browser
  { label: 'Standby', entityId: 'standby_node', suggestion: SUGGESTIONS[4] },              // Warm standby
];

export function createInitialSlots(): FleetSlot[] {
  return [
    {
      id: 'krista1',
      label: 'Visual Engine',
      entity_id: 'krista1_visual',
      endpoint: null,
      active: false,
      fps: null,
      frameUrl: null,
      cloudNode: false,
      connection_status: 'disconnected',
      last_heartbeat: null,
      active_stream: null,
      state_summary: {},
      suggestion: { title: 'StreamDiffusion', desc: 'Real-time AI visual generation from your TD pipeline.', tag: 'td' as const, tagLabel: 'TouchDesigner' },
      _frameTimes: [],
      _fpsSmooth: null,
    },
    ...SLOT_DESCRIPTORS.map((desc, i) => ({
      id: `slot${i + 2}`,
      label: desc.label,
      entity_id: null as string | null,
      endpoint: null,
      active: false,
      fps: null,
      frameUrl: null,
      cloudNode: false,
      connection_status: 'disconnected' as const,
      last_heartbeat: null,
      active_stream: null,
      state_summary: {},
      suggestion: desc.suggestion,
      _frameTimes: [] as number[],
      _fpsSmooth: null,
    })),
  ];
}
