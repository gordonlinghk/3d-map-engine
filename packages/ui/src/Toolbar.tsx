import { useAtlas } from './context';
import { useAtlasStore } from './store';
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
      </div>
    </div>
  );
}
