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
      id: 'KFaist_CineTech',
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
      nodeRole: 'two_way',
      stateSchema: {
        scene_id: { type: 'string', direction: 'output', description: 'Active scene identifier' },
        playback_state: { type: 'string', direction: 'output', description: 'Transport state: playing, paused, stopped' },
        timecode: { type: 'string', direction: 'output', description: 'Current timecode position HH:MM:SS:FF' },
        media_path: { type: 'string', direction: 'input', description: 'Path to active media file or stream source' },
        opacity: { type: 'float', direction: 'input', description: 'Master layer opacity 0.0-1.0' },
      },
      suggestion: { title: 'KFaist CineTech', desc: 'CineTech cinema-grade visual pipeline.', tag: 'td' as const, tagLabel: 'TouchDesigner' },
      _frameTimes: [],
      _fpsSmooth: null,
    },
    // Card 2: KFaist_Ambient_Intelligence
    {
      id: 'KFaist_Ambient_Intelligence',
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
      nodeRole: 'two_way',
      stateSchema: {
        prompt_text: { type: 'string', direction: 'output', default: null, description: 'Current active prompt being sent to StreamDiffusion' },
        audio_amplitude: { type: 'float', direction: 'output', default: 0.0, description: 'Normalized audio amplitude 0.0–1.0 from audio analysis' },
        visitor_present: { type: 'boolean', direction: 'output', default: false, description: 'True when webcam detects an active visitor' },
        fps: { type: 'number', direction: 'output', default: 0, description: 'Current rendering / stream frame rate' },
      },
      suggestion: { title: 'KFaist Ambient Intelligence', desc: 'Real-time AI ambient visual generation via StreamDiffusion.', tag: 'td' as const, tagLabel: 'TouchDesigner' },
      _frameTimes: [],
      _fpsSmooth: null,
    },
    // Card 3: KFaist_Shapeshifters — permanent, active with video
    {
      id: 'KFaist_Shapeshifters',
      label: 'KFaist Shapeshifters',
      entity_id: 'KFaist_Shapeshifters',
      endpoint: '/video/frame/KFaist_Shapeshifters',
      active: true,
      fps: null,
      frameUrl: null,
      cloudNode: false,
      connection_status: 'disconnected',
      last_heartbeat: null,
      active_stream: 'sd_output',
      state_summary: {},
      signalType: 'touchdesigner',
      nodeRole: 'two_way',
      stateSchema: {},
      suggestion: { title: 'KFaist Shapeshifters', desc: 'Shapeshifters visual pipeline.', tag: 'td' as const, tagLabel: 'TouchDesigner' },
      _frameTimes: [],
      _fpsSmooth: null,
    },
  ];
}