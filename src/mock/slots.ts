import { FleetSlot } from '@/types';

/**
 * Three fixed cards. These are permanent and never created, removed, or replaced.
 * Entity data from the gallery API populates their state/schema but never changes
 * their entity_id or label.
 */
export function createInitialSlots(): FleetSlot[] {
  return [
    // Card 1: KFaist_CineTech
    {
      id: 'slot1',
      label: 'KFaist CineTech',
      entity_id: 'KFaist_CineTech',
      endpoint: null,
      active: false,
      fps: null,
      frameUrl: null,
      cloudNode: false,
      connection_status: 'disconnected',
      last_heartbeat: null,
      active_stream: null,
      state_summary: {},
      signalType: 'touchdesigner',
      nodeRole: 'send',
      stateSchema: {},
      suggestion: { title: 'KFaist CineTech', desc: 'CineTech visual pipeline.', tag: 'td' as const, tagLabel: 'TouchDesigner' },
      _frameTimes: [],
      _fpsSmooth: null,
    },
    // Card 2: KFaist_Ambient_Intelligence
    {
      id: 'slot2',
      label: 'KFaist Ambient Intelligence',
      entity_id: 'KFaist_Ambient_Intelligence',
      endpoint: '/video/frame/KFaist_Ambient_Intelligence',
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
      stateSchema: {
        prompt_text: { type: 'string', direction: 'output', description: 'Active SD prompt' },
        audio_amplitude: { type: 'float', direction: 'output', description: 'Audio RMS 0-1' },
        visitor_present: { type: 'boolean', direction: 'output', description: 'Camera detects presence' },
        fps: { type: 'number', direction: 'output', description: 'Frame rate' },
        device: { type: 'string', direction: 'output', description: 'Device hostname' },
      },
      suggestion: { title: 'KFaist Ambient Intelligence', desc: 'Live SD output from TouchDesigner via HTTP frame posting.', tag: 'td' as const, tagLabel: 'TouchDesigner' },
      _frameTimes: [],
      _fpsSmooth: null,
    },
    // Card 3: KFaist_Shapeshifters
    {
      id: 'slot3',
      label: 'KFaist Shapeshifters',
      entity_id: 'KFaist_Shapeshifters',
      endpoint: null,
      active: false,
      fps: null,
      frameUrl: null,
      cloudNode: false,
      connection_status: 'disconnected',
      last_heartbeat: null,
      active_stream: null,
      state_summary: {},
      signalType: 'touchdesigner',
      nodeRole: 'two_way',
      stateSchema: {},
      suggestion: { title: 'KFaist Shapeshifters', desc: 'Shapeshifters installation pipeline.', tag: 'td' as const, tagLabel: 'TouchDesigner' },
      _frameTimes: [],
      _fpsSmooth: null,
    },
  ];
}
