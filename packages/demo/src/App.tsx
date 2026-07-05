import { useEffect, useRef, useState } from 'react';
import { applyDirectives, generateWorld } from '@map-engine/core';
import type { EnvironmentDirective, MapDirectives, MapPresetId, MapWorld } from '@map-engine/core';
import { createThreeMapRenderer, createTour } from '@map-engine/three';
import type { ThreeMapRenderer, Tour } from '@map-engine/three';
import { AtlasUI, useAtlasStore } from '@map-engine/ui';
import { getStoredApiKey, promptToDirectives, storeApiKey } from './promptToMap';

const DEFAULT_SEED = 'sf-atlas-001';
const DEFAULT_PRESET: MapPresetId = 'coastal-tech-city';
const PRESETS: MapPresetId[] = ['coastal-tech-city', 'island-city', 'downtown-night-grid'];
const ENVIRONMENTS: EnvironmentDirective[] = ['day', 'golden-hour', 'night'];

function decodeCfg(raw: string | null): MapDirectives {
  if (!raw) return {};
  try {
    return JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))) as MapDirectives;
  } catch {
    return {};
  }
}

function encodeCfg(directives: MapDirectives): string {
  return btoa(JSON.stringify(directives)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readUrlParams(): {
  seed: string;
  preset: MapPresetId;
  directives: MapDirectives;
  environment: EnvironmentDirective;
} {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset') as MapPresetId | null;
  const env = params.get('env') as EnvironmentDirective | null;
  const directives = decodeCfg(params.get('cfg'));
  return {
    seed: params.get('seed') ?? DEFAULT_SEED,
    preset: preset && PRESETS.includes(preset) ? preset : (directives.preset ?? DEFAULT_PRESET),
    directives,
    environment: env && ENVIRONMENTS.includes(env) ? env : (directives.environment ?? 'day'),
  };
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tourRef = useRef<Tour | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [engine, setEngine] = useState<{ renderer: ThreeMapRenderer; world: MapWorld } | null>(
    null,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = createThreeMapRenderer({ container });
    renderer.on('world:loaded', () => {
      // Let a couple of frames render behind the overlay before revealing.
      setTimeout(() => setReady(true), 250);
    });
    const { seed, preset, directives, environment } = readUrlParams();
    const { config } = applyDirectives({ ...directives, preset });
    const world = generateWorld(seed, config);
    void renderer.loadWorld(world);
    renderer.setEnvironment(environment);
    useAtlasStore.getState().setEnvironment(environment);
    const tour = createTour(renderer, world);
    tourRef.current = tour;
    (window as unknown as Record<string, unknown>).__mapEngine = { renderer, world, tour };
    setEngine({ renderer, world });

    return () => {
      tour.stop();
      renderer.dispose();
      setEngine(null);
    };
  }, []);

  const toggleTour = (): void => {
    const tour = tourRef.current;
    if (!tour) return;
    if (tour.isActive()) tour.stop();
    else tour.start();
    setTourActive(tour.isActive());
  };

  const generate = (seed: string, preset: string): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', seed);
    url.searchParams.set('preset', preset);
    // Manual preset/seed selection drops prompt-derived overrides.
    url.searchParams.delete('cfg');
    url.searchParams.delete('env');
    window.location.href = url.toString();
  };

  const generateFromPrompt = async (prompt: string, apiKey: string): Promise<void> => {
    storeApiKey(apiKey);
    const { directives } = await promptToDirectives(prompt, apiKey);
    const { preset: currentPreset } = readUrlParams();
    const url = new URL(window.location.href);
    url.searchParams.set('preset', directives.preset ?? currentPreset);
    url.searchParams.set(
      'seed',
      directives.seed ?? `seed-${Math.random().toString(36).slice(2, 8)}`,
    );
    if (directives.environment) url.searchParams.set('env', directives.environment);
    else url.searchParams.delete('env');
    const numeric: MapDirectives = { ...directives };
    delete numeric.preset;
    delete numeric.seed;
    delete numeric.environment;
    if (Object.keys(numeric).length > 0) url.searchParams.set('cfg', encodeCfg(numeric));
    else url.searchParams.delete('cfg');
    window.location.href = url.toString();
  };

  const reset = (): void => {
    const { preset } = readUrlParams();
    generate(`seed-${Math.random().toString(36).slice(2, 8)}`, preset);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {engine && (
        <AtlasUI
          renderer={engine.renderer}
          world={engine.world}
          onReset={reset}
          onGenerate={generate}
          onPromptGenerate={generateFromPrompt}
          initialApiKey={getStoredApiKey()}
          onTourToggle={toggleTour}
          tourActive={tourActive}
        />
      )}
      {!ready && (
        <div
          data-testid="loading-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            background: '#0b0e14',
            color: '#e8edf5',
            zIndex: 100,
            transition: 'opacity 0.4s',
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 800 }}>3D Map Engine</div>
          <div style={{ opacity: 0.65, fontSize: 14 }}>Generating a procedural city…</div>
          <div
            style={{
              width: 160,
              height: 4,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '40%',
                height: '100%',
                borderRadius: 2,
                background: '#f28c38',
                animation: 'loading-slide 1s ease-in-out infinite alternate',
              }}
            />
          </div>
          <style>{`@keyframes loading-slide { from { margin-left: 0; } to { margin-left: 60%; } }`}</style>
        </div>
      )}
    </div>
  );
}
