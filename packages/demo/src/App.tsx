import { useEffect, useRef, useState } from 'react';
import { generateWorld, getPresetConfig } from '@map-engine/core';
import type { MapPresetId } from '@map-engine/core';
import { createThreeMapRenderer } from '@map-engine/three';

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
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = createThreeMapRenderer({ container });
    const { seed, preset } = readUrlParams();
    const world = generateWorld(seed, getPresetConfig(preset));
    void renderer.loadWorld(world);
    // Debug/testing handle (used by Playwright specs and dev tooling).
    (window as unknown as Record<string, unknown>).__mapEngine = { renderer, world };

    let frames = 0;
    let lastFpsAt = performance.now();
    const offFrame = renderer.onFrame(() => {
      frames += 1;
      const now = performance.now();
      if (now - lastFpsAt >= 500) {
        setFps(Math.round((frames * 1000) / (now - lastFpsAt)));
        frames = 0;
        lastFpsAt = now;
      }
    });

    return () => {
      offFrame();
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div
        data-testid="fps"
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          padding: '4px 10px',
          borderRadius: 8,
          background: 'rgba(15, 20, 32, 0.7)',
          color: '#7fd77f',
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fps} FPS
      </div>
    </div>
  );
}
