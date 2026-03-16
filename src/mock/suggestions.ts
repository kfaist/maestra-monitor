import { SlotSuggestion } from '@/types';

export const SUGGESTIONS: SlotSuggestion[] = [
  { title: 'Second Screen', desc: 'Drop the Maestra TOX into another TD project, point it at this server.', tag: 'td', tagLabel: 'TouchDesigner' },
  { title: 'Scope Node', desc: 'Run Scope on any GPU machine, pipe output into TD via NDI In TOP.', tag: 'scope', tagLabel: 'Scope + TD' },
  { title: 'Audio Reactive', desc: 'Connect Max/MSP or Ableton, send OSC state changes to the Maestra server.', tag: 'max', tagLabel: 'Max/MSP' },
  { title: 'Monitor Station', desc: 'Open this dashboard in another browser tab, it auto-registers.', tag: 'browser', tagLabel: 'Browser' },
  { title: 'Standby Node', desc: 'Warm TD instance ready to take over if the primary machine drops.', tag: 'td', tagLabel: 'TouchDesigner' },
];
