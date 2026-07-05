import { useState } from 'react';
import { useAtlas } from './context';
import { TOGGLABLE_LAYERS, useAtlasStore } from './store';
import type { CameraMode, EnvironmentMode } from './types';

const ENV_ORDER: EnvironmentMode[] = ['day', 'golden-hour', 'night'];
const ENV_ICONS: Record<EnvironmentMode, string> = {
  day: '☀️',
  'golden-hour': '🌇',
  night: '🌙',
};

export type ToolbarProps = {
  onTourToggle?: () => void;
  tourActive?: boolean;
  onReset?: () => void;
};

export function Toolbar({ onTourToggle, tourActive, onReset }: ToolbarProps) {
  const { renderer } = useAtlas();
  const cameraMode = useAtlasStore((s) => s.cameraMode);
  const setCameraMode = useAtlasStore((s) => s.setCameraMode);
  const environment = useAtlasStore((s) => s.environment);
  const setEnvironment = useAtlasStore((s) => s.setEnvironment);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const layers = useAtlasStore((s) => s.layers);
  const setLayer = useAtlasStore((s) => s.setLayer);
  const labelsVisible = useAtlasStore((s) => s.labelsVisible);
  const setLabelsVisible = useAtlasStore((s) => s.setLabelsVisible);
  const [layersOpen, setLayersOpen] = useState(false);

  const switchMode = (m: CameraMode): void => {
    renderer.setCameraMode(m);
    setCameraMode(m);
  };

  const cycleEnvironment = (): void => {
    const next = ENV_ORDER[(ENV_ORDER.indexOf(environment) + 1) % ENV_ORDER.length]!;
    renderer.setEnvironment(next);
    setEnvironment(next);
  };

  const screenshot = (): void => {
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map-engine.png';
    a.click();
  };

  const fullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  return (
    <div className={`atlas-toolbar${selectedId ? ' shifted' : ''}`} data-testid="toolbar">
      <div className="atlas-modes" data-testid="camera-modes">
        {(['orbit', 'fly', 'walk'] as const).map((m) => (
          <button
            key={m}
            className={cameraMode === m ? 'active' : ''}
            data-testid={`mode-${m}`}
            onClick={() => switchMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="atlas-tools">
        <button
          title={`Environment: ${environment}`}
          data-testid="env-toggle"
          onClick={cycleEnvironment}
        >
          {ENV_ICONS[environment]}
        </button>
        <button
          title="Tour"
          data-testid="tour-toggle"
          className={tourActive ? 'active' : ''}
          onClick={onTourToggle}
        >
          {tourActive ? '⏸' : '▶'}
        </button>
        <button title="Regenerate (new seed)" data-testid="reset" onClick={onReset}>
          ↻
        </button>
        <button title="Screenshot" data-testid="screenshot" onClick={screenshot}>
          📷
        </button>
        <button title="Fullscreen" data-testid="fullscreen" onClick={fullscreen}>
          ⛶
        </button>
        <button title="Home view" data-testid="home" onClick={() => renderer.goHome()}>
          ⌂
        </button>
        <button
          title="Layers"
          data-testid="layers-toggle"
          className={layersOpen ? 'active' : ''}
          onClick={() => setLayersOpen((v) => !v)}
        >
          ▤
        </button>
      </div>
      {layersOpen && (
        <div
          data-testid="layers-panel"
          style={{
            background: 'var(--panel-bg)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            padding: '10px 14px',
            display: 'grid',
            gap: 6,
            fontSize: 13,
          }}
        >
          {TOGGLABLE_LAYERS.map((layer) => (
            <label key={layer} style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                data-testid={`layer-${layer}`}
                checked={layers[layer]}
                onChange={(e) => {
                  setLayer(layer, e.target.checked);
                  renderer.setLayerVisibility(layer, e.target.checked);
                }}
              />
              <span style={{ textTransform: 'capitalize' }}>{layer}</span>
            </label>
          ))}
          <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-testid="layer-labels"
              checked={labelsVisible}
              onChange={(e) => setLabelsVisible(e.target.checked)}
            />
            <span>Labels</span>
          </label>
        </div>
      )}
    </div>
  );
}
