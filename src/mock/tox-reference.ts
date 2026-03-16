import { ToxParam } from '@/types';

export const TOX_CUSTOM_PARAMS: ToxParam[] = [
  {
    title: 'Connection',
    items: ['Entity ID', 'Server URL', 'API Key', 'Auto Connect', 'Connect / Disconnect', 'Status (read-only)', 'Heartbeat Interval'],
  },
  {
    title: 'State',
    items: ['Brightness (0–100)', 'Opacity (0–1)', 'Color (RGB)', 'Speed (0–10)', 'Scene (int)', 'Custom State JSON', 'Push / Pull State'],
  },
  {
    title: 'Streams',
    items: ['Stream Name', 'Stream Type', 'NDI / Syphon / Spout / RTMP / SRT / WebRTC', 'Protocol', 'Address / Port', 'Advertise / List Streams', 'Active Stream ID'],
  },
  {
    title: 'Gateways',
    items: ['OSC In / Out Port', 'OSC Prefix', 'WebSocket Enable / Port', 'MQTT Enable / Broker / Port'],
  },
];

export const TOX_INTERNAL_OPERATORS: ToxParam[] = [
  {
    title: 'MaestraExt',
    items: ['Python extension with Connect(), Disconnect(), UpdateState(), PushCurrentState(), PullState(), AdvertiseStream(), ListStreams(), StreamHeartbeat(). Auto-connects on start if enabled. State params auto-push on value change with debounce.'],
  },
  {
    title: 'Infrastructure',
    items: ['heartbeat_timer — Timer CHOP, auto-heartbeat every N seconds', 'par_exec — Parameter Execute DAT', 'log — Table DAT, rolling activity log', 'streams_table — Table DAT, discovered streams', 'info — Info CHOP, component monitoring'],
  },
];
