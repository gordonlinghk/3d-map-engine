import { useEffect, useRef, useState } from 'react';
import { generateWorld, getPresetConfig } from '@map-engine/core';
import type { MapPresetId, MapWorld } from '@map-engine/core';
import { createThreeMapRenderer } from '@map-engine/three';
import type { ThreeMapRenderer } from '@map-engine/three';
import { AtlasUI } from '@map-engine/ui';

const DEFAULT_SEED = 'sf-atlas-001';
const DEFAULT_PRESET: MapPresetId = 'coastal-tech-city';
const PRESETS: MapPresetId[] = ['coastal-tech-city', 'island-city', 'downtown-night-grid'];

function readUrlParams(): { seed: string; preset: MapPresetId } {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset') as MapPresetId | null;
  return {
    seed: params.get('seed') ?? DEFAULT_SEED,
    preset: preset && PRESETS.includes(preset) ? preset : DEFAULT_PRESET,
  };
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<{ renderer: ThreeMapRenderer; world: MapWorld } | null>(
    null,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = createThreeMapRenderer({ container });
    const { seed, preset } = readUrlParams();
    const world = generateWorld(seed, getPresetConfig(preset));
    void renderer.loadWorld(world);
    (window as unknown as Record<string, unknown>).__mapEngine = { renderer, world };
    setEngine({ renderer, world });

    return () => {
      renderer.dispose();
      setEngine(null);
    };
  }, []);

  const reset = (): void => {
    const { preset } = readUrlParams();
    const newSeed = `seed-${Math.random().toString(36).slice(2, 8)}`;
    const url = new URL(window.location.href);
    url.searchParams.set('seed', newSeed);
    url.searchParams.set('preset', preset);
    window.location.href = url.toString();
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {engine && <AtlasUI renderer={engine.renderer} world={engine.world} onReset={reset} />}
    </div>
  );
}
