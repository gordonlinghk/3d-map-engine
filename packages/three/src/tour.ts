import type { MapWorld } from '@map-engine/core';
import type { ThreeMapRenderer } from './renderer';

const DWELL_MS = 3200;

export type Tour = {
  start(): void;
  stop(): void;
  isActive(): boolean;
};

/** Auto-fly between landmarks and the most prominent company towers. */
export function createTour(renderer: ThreeMapRenderer, world: MapWorld): Tour {
  const towerIds = Object.values(world.objects)
    .filter((o) => o.objectType === 'building' && o.building.metadata?.company !== undefined)
    .sort((a, b) =>
      a.objectType === 'building' && b.objectType === 'building'
        ? b.building.height - a.building.height
        : 0,
    )
    .slice(0, 6)
    .map((o) => o.id);
  const stops = [...world.landmarks.map((lm) => lm.id), ...towerIds];

  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let index = 0;

  const step = async (): Promise<void> => {
    if (!active || stops.length === 0) return;
    const id = stops[index % stops.length]!;
    index += 1;
    renderer.setSelected(id);
    await renderer.focusObject(id);
    if (!active) return;
    timer = setTimeout(() => void step(), DWELL_MS);
  };

  return {
    start(): void {
      if (active) return;
      active = true;
      void step();
    },
    stop(): void {
      active = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    isActive: () => active,
  };
}
