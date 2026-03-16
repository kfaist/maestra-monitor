import { GpuNode } from '@/types';

export const API_BASE = 'https://maestra-backend-v2-production.up.railway.app';

export function createInitialGpuNodes(): GpuNode[] {
  return [
    { id: 'gpu1', label: 'Maestra → TD/StreamDiffusion', url: API_BASE + '/video/frame/td', previewing: false, active: false, fps: null, lat: null, frameUrl: null, _interval: null, _frameTimes: [] },
    { id: 'gpu2', label: 'Ample → room1 (old server)', url: 'https://ample-motivation-production-e74d.up.railway.app/api/frame/room1', previewing: false, active: false, fps: null, lat: null, frameUrl: null, _interval: null, _frameTimes: [] },
    { id: 'gpu3', label: 'Ample → room2', url: 'https://ample-motivation-production-e74d.up.railway.app/api/frame/room2', previewing: false, active: false, fps: null, lat: null, frameUrl: null, _interval: null, _frameTimes: [] },
    { id: 'gpu4', label: 'Node 4', url: '', previewing: false, active: false, fps: null, lat: null, frameUrl: null, _interval: null, _frameTimes: [] },
    { id: 'gpu5', label: 'Node 5', url: '', previewing: false, active: false, fps: null, lat: null, frameUrl: null, _interval: null, _frameTimes: [] },
    { id: 'gpu6', label: 'Node 6', url: '', previewing: false, active: false, fps: null, lat: null, frameUrl: null, _interval: null, _frameTimes: [] },
  ];
}
