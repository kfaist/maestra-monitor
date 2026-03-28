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
    // Slot 1: krista1_visual — native WebSocket connection via maestra.tox
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
    // Slot 2: scope — HTTP-only frame polling from TD's post_frames_slot.py
    // Pre-configured so it auto-polls /video/frame/scope without needing WebSocket
    {
      id: 'scope1',
      label: 'KFaist_Ambient_Intelligence',
      entity_id: 'scope',
      endpoint: '/video/frame/scope',
      active: true,
      fps: null,
      frameUrl: null,
      cloudNode: false,
      connection_status: 'disconnected',
      last_heartbeat: null,
      active_stream: 'sd_output',
      state_summary: {},
      signalType: 'touchdesigner',
      nodeRole: 'send',
      suggestion: { title: 'KFaist Ambient Intelligence', desc: 'Live SD output from TouchDesigner via HTTP frame posting.', tag: 'scope' as const, tagLabel: 'Scope' },
      _frameTimes: [],
      _fpsSmooth: null,
    },
    // Remaining slots from descriptors (skip Scope since we pre-configured it above)
    ...SLOT_DESCRIPTORS.filter(d => d.label !== 'Scope').map((desc, i) => ({
      id: `slot${i + 3}`,
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
