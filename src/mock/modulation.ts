import { ModulationParam } from '@/types';

export const INITIAL_MODULATION_PARAMS: ModulationParam[] = [
  { name: 'Temporal Intensity', category: 'motion', source: 'none', amount: 0 },
  { name: 'Speed', category: 'motion', source: 'rms', amount: 25 },
  { name: 'Velocity', category: 'motion', source: 'none', amount: 0 },
  { name: 'Gloss', category: 'material', source: 'high', amount: 12 },
  { name: 'Emboss', category: 'material', source: 'none', amount: 0 },
  { name: 'Halo', category: 'material', source: 'none', amount: 0 },
  { name: 'Shimmer', category: 'material', source: 'none', amount: 0 },
  { name: 'Depth of Field', category: 'optical', source: 'mid', amount: 20 },
  { name: 'Opacity', category: 'optical', source: 'none', amount: 0 },
  { name: 'Bump', category: 'geometry', source: 'high', amount: 35 },
  { name: 'Photorealism', category: 'geometry', source: 'none', amount: 0 },
];
