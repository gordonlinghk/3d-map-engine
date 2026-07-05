import { useEffect, useRef, useState } from 'react';
import { generateWorld, getPresetConfig } from '@map-engine/core';
import type { MapObject, MapPresetId, MapWorld } from '@map-engine/core';
import { createThreeMapRenderer } from '@map-engine/three';
import type { CameraMode, ThreeMapRenderer } from '@map-engine/three';

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

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  padding: '6px 10px',
  borderRadius: 10,
  background: 'rgba(15, 20, 32, 0.72)',
  color: '#e8edf5',
  fontSize: 13,
  backdropFilter: 'blur(6px)',
};

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeMapRenderer | null>(null);
  const worldRef = useRef<MapWorld | null>(null);
  const [fps, setFps] = useState(0);
  const [mode, setMode] = useState<CameraMode>('orbit');
  const [selected, setSelected] = useState<MapObject | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = createThreeMapRenderer({ container });
    rendererRef.current = renderer;
    const { seed, preset } = readUrlParams();
    const world = generateWorld(seed, getPresetConfig(preset));
    worldRef.current = world;
    void renderer.loadWorld(world);
    (window as unknown as Record<string, unknown>).__mapEngine = { renderer, world };

    const offSelect = renderer.on('object:selected', ({ objectId }) => {
      setSelected(world.objects[objectId] ?? null);
    });
    const offClear = renderer.on('object:cleared', () => setSelected(null));
    const offCamera = renderer.on('camera:changed', ({ mode: m }) => setMode(m));

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
      offSelect();
      offClear();
      offCamera();
      offFrame();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  const switchMode = (m: CameraMode): void => {
    rendererRef.current?.setCameraMode(m);
    setMode(m);
  };

  const selectedInfo = (() => {
    if (!selected) return null;
    if (selected.objectType === 'building') {
      const b = selected.building;
      return {
        name: b.name,
        subtitle: `${b.type}${b.category ? ` · ${b.category}` : ''} · ${b.floors} floors`,
        description: b.description,
        extra: b.metadata,
      };
    }
    if (selected.objectType === 'landmark') {
      const lm = selected.landmark;
      return { name: lm.name, subtitle: lm.kind, description: lm.description, extra: undefined };
    }
    return null;
  })();

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <div style={{ ...overlayStyle, top: 12, right: 12, display: 'flex', gap: 6 }}>
        {(['orbit', 'fly', 'walk'] as const).map((m) => (
          <button
            key={m}
            data-testid={`mode-${m}`}
            onClick={() => switchMode(m)}
            style={{
              padding: '4px 12px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              textTransform: 'capitalize',
              background: mode === m ? '#f28c38' : 'rgba(255,255,255,0.12)',
              color: mode === m ? '#161a22' : '#e8edf5',
              fontWeight: mode === m ? 700 : 400,
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {selectedInfo && (
        <div
          data-testid="info-panel"
          style={{ ...overlayStyle, top: 60, right: 12, width: 260, padding: 14 }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedInfo.name}</div>
          <div style={{ opacity: 0.7, marginTop: 2, textTransform: 'capitalize' }}>
            {selectedInfo.subtitle}
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.45 }}>{selectedInfo.description}</div>
          {selectedInfo.extra && (
            <div style={{ marginTop: 8, display: 'grid', gap: 3, opacity: 0.85 }}>
              {Object.entries(selectedInfo.extra)
                .filter(([k]) => k !== 'company')
                .map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12 }}>
                    <span style={{ opacity: 0.6, textTransform: 'capitalize' }}>{k}: </span>
                    {String(v)}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          ...overlayStyle,
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 12,
          opacity: 0.85,
          whiteSpace: 'nowrap',
        }}
      >
        Drag rotate · Scroll zoom · WASD move · Q/E up/down · Shift boost · Dbl-click fly to ·
        Esc clear
      </div>

      <div data-testid="fps" style={{ ...overlayStyle, right: 12, bottom: 12, color: '#7fd77f' }}>
        {fps} FPS
      </div>
    </div>
  );
}
