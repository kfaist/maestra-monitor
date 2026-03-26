import { SlotSuggestion } from '@/types';

export const SUGGESTIONS: SlotSuggestion[] = [
  { title: 'Second Screen', desc: 'Drop the Maestra TOX into any TD project. Set entity slug + server URL, click Connect.', tag: 'td', tagLabel: 'TouchDesigner' },
  { title: 'Audio Node', desc: 'Wire your Audio Analysis CHOP into state_in. Channel names become published signals.', tag: 'td', tagLabel: 'TouchDesigner' },
  { title: 'AI / Scope', desc: 'StreamDiffusion or Scope output node. Advertise an NDI or Spout stream.', tag: 'td', tagLabel: 'TouchDesigner' },
  { title: 'Render Node', desc: 'Dedicated render machine. Receives prompt_text + scene state, outputs video.', tag: 'td', tagLabel: 'TouchDesigner' },
  { title: 'Standby', desc: 'Warm TD instance on standby. Takes over automatically if primary drops.', tag: 'td', tagLabel: 'TouchDesigner' },
];
