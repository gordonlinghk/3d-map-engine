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
  /** Regenerate the world with an explicit seed + preset. */
  onGenerate?: (seed: string, preset: string) => void;
  /** Prompt-to-map: describe a city in natural language. */
  onPromptGenerate?: (prompt: string, apiKey: string) => Promise<void>;
  initialApiKey?: string;
  /** Real-world cities (OSM imports). */
  cityOptions?: Array<{ slug: string; name: string }>;
  onLoadCity?: (slug: string) => void;
};

const PRESET_OPTIONS = [
  { id: 'coastal-tech-city', label: 'Coastal Tech City' },
  { id: 'island-city', label: 'Island City' },
  { id: 'downtown-night-grid', label: 'Downtown Night Grid' },
];

export function Toolbar({
  onTourToggle,
  tourActive,
  onReset,
  onGenerate,
  onPromptGenerate,
  initialApiKey,
  cityOptions,
  onLoadCity,
}: ToolbarProps) {
  const { renderer, world } = useAtlas();
  const [worldOpen, setWorldOpen] = useState(false);
  const [seedDraft, setSeedDraft] = useState(world.seed);
  const [presetDraft, setPresetDraft] = useState<string>(world.config.preset);
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState(initialApiKey ?? '');
  const [keyOpen, setKeyOpen] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const runPrompt = async (): Promise<void> => {
    if (!prompt.trim() || !onPromptGenerate || promptBusy) return;
    setPromptBusy(true);
    setPromptError(null);
    try {
      await onPromptGenerate(prompt.trim(), apiKey.trim());
    } catch (err) {
      setPromptError(err instanceof Error ? err.message : String(err));
      setPromptBusy(false);
    }
  };
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
        <button
          title="World (preset & seed)"
          data-testid="world-toggle"
          className={worldOpen ? 'active' : ''}
          onClick={() => setWorldOpen((v) => !v)}
        >
          🌍
        </button>
      </div>
      {worldOpen && (
        <div
          data-testid="world-panel"
          style={{
            background: 'var(--panel-bg)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            padding: '12px 14px',
            display: 'grid',
            gap: 8,
            fontSize: 13,
            width: 220,
          }}
        >
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>PRESET</span>
            <select
              data-testid="world-preset"
              value={presetDraft}
              onChange={(e) => setPresetDraft(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)' }}
            >
              {PRESET_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>SEED</span>
            <input
              data-testid="world-seed"
              value={seedDraft}
              onChange={(e) => setSeedDraft(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)' }}
            />
          </label>
          <button
            data-testid="world-generate"
            onClick={() => onGenerate?.(seedDraft.trim() || world.seed, presetDraft)}
            style={{
              padding: '8px',
              border: 'none',
              borderRadius: 9,
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Generate world
          </button>

          {onLoadCity && cityOptions && cityOptions.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', margin: '4px -14px 0' }} />
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>
                  🗺 REAL CITY (OpenStreetMap)
                </span>
                <select
                  data-testid="city-select"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) onLoadCity(e.target.value);
                  }}
                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)' }}
                >
                  <option value="" disabled>
                    Load a real city…
                  </option>
                  {cityOptions.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {onPromptGenerate && (
            <>
              <div
                style={{
                  borderTop: '1px solid rgba(0,0,0,0.08)',
                  margin: '4px -14px 0',
                }}
              />
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>
                  ✨ DESCRIBE A CITY
                </span>
                <textarea
                  data-testid="prompt-input"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. a mountainous island city at night with dense skyscrapers…"
                  rows={3}
                  style={{
                    padding: '7px 9px',
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.12)',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    fontSize: 12.5,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void runPrompt();
                  }}
                />
              </label>
              <button
                onClick={() => setKeyOpen((v) => !v)}
                style={{
                  border: 'none',
                  background: 'none',
                  textAlign: 'left',
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {keyOpen ? '▾' : '▸'} Claude API key {apiKey ? '· set' : '· optional'}
              </button>
              {keyOpen && (
                <label style={{ display: 'grid', gap: 4 }}>
                  <input
                    data-testid="prompt-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-… (stored locally in your browser)"
                    style={{
                      padding: '6px 8px',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.12)',
                      fontSize: 12,
                    }}
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    With a key, Claude interprets your prompt. Without one, a simple keyword
                    parser is used. The key never leaves your browser.
                  </span>
                </label>
              )}
              <button
                data-testid="prompt-generate"
                disabled={promptBusy || !prompt.trim()}
                onClick={() => void runPrompt()}
                style={{
                  padding: '8px',
                  border: 'none',
                  borderRadius: 9,
                  background: promptBusy ? 'rgba(0,0,0,0.2)' : '#5b4bd6',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: promptBusy ? 'wait' : 'pointer',
                }}
              >
                {promptBusy ? 'Dreaming up your city…' : '✨ Generate from prompt'}
              </button>
              {promptError && (
                <div
                  data-testid="prompt-error"
                  style={{ fontSize: 11.5, color: '#b3382c', lineHeight: 1.4 }}
                >
                  {promptError}
                </div>
              )}
            </>
          )}
        </div>
      )}
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
