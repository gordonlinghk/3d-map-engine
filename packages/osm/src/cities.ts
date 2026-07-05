import type { CityPreset } from './types';

/** Curated ~1km² city extracts that convert well (building + road coverage). */
export const CITY_PRESETS: Record<string, CityPreset> = {
  'hong-kong-central': {
    slug: 'hong-kong-central',
    name: 'Hong Kong Central',
    bbox: [22.276, 114.148, 22.287, 114.166],
  },
  'tokyo-shibuya': {
    slug: 'tokyo-shibuya',
    name: 'Tokyo Shibuya',
    bbox: [35.654, 139.694, 35.664, 139.708],
  },
  'manhattan-midtown': {
    slug: 'manhattan-midtown',
    name: 'Manhattan Midtown',
    bbox: [40.748, -73.993, 40.76, -73.975],
  },
  'london-city': {
    slug: 'london-city',
    name: 'City of London',
    bbox: [51.508, -0.099, 51.52, -0.078],
  },
};
