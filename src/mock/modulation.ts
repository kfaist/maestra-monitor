import { ModulationParam } from '@/types';

export const INITIAL_MODULATION_PARAMS: ModulationParam[] = [
  { name: 'Shimmer',            category: 'material', source: 'rms',  amount: 18 },
  { name: 'Temporal Intensity', category: 'motion',   source: 'none', amount: 0  },
  { name: 'Speed',              category: 'motion',   source: 'rms',  amount: 25 },
  { name: 'Opacity',            category: 'material', source: 'none', amount: 0  },
  { name: 'Bump',               category: 'material', source: 'high', amount: 35 },
  { name: 'Photorealism',       category: 'optical',  source: 'none', amount: 0  },
];
