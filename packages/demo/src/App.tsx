import { useEffect, useRef, useState } from 'react';
import {
  applyDirectives,
  applyEditOverlay,
  createDraft,
  deserializeMap,
  generateWorld,
  overlayIsEmpty,
  parseDraft,
  sanitizeOverlayForWorld,
  serializeMap,
} from '@map-engine/core';
import type {
  DraftBase,
  EditOverlay,
  EnvironmentDirective,
  MapDirectives,
  MapPresetId,
  MapWorld,
} from '@map-engine/core';
import { createBuildingEditor, createThreeMapRenderer, createTour } from '@map-engine/three';
import type { BuildingEditor, ThreeMapRenderer, Tour } from '@map-engine/three';
import { AtlasUI, useAtlasStore } from '@map-engine/ui';
import {
  CITY_PRESETS,
  candidateToCityArea,
  createMockGeocodingProvider,
  createPhotonProvider,
  fetchOsmArea,
  osmToWorld,
  parseBBoxSlug,
} from '@map-engine/osm';
import type { BBox, GeocodingProvider } from '@map-engine/osm';
import { getStoredApiKey, promptToDirectives, storeApiKey } from './promptToMap';
import { saveDraftFile, stashPendingDraft, takePendingDraft } from './drafts';

const DEFAULT_SEED = 'sf-atlas-001';
const DEFAULT_PRESET: MapPresetId = 'coastal-tech-city';
const PRESETS: MapPresetId[] = ['coastal-tech-city', 'island-city', 'downtown-night-grid'];
const ENVIRONMENTS: EnvironmentDirective[] = ['day', 'golden-hour', 'night'];

function editsKey(worldId: string): string {
  const cfg = new URLSearchParams(window.location.search).get('cfg') ?? '';
  return `map-engine.edits.${worldId}|${cfg}`;
}

function loadOverlay(worldId: string): EditOverlay | undefined {
  try {
    const raw = localStorage.getItem(editsKey(worldId));
    return raw ? (JSON.parse(raw) as EditOverlay) : undefined;
  } catch {
    return undefined;
  }
}

function saveOverlay(worldId: string, overlay: EditOverlay): void {
  try {
    if (overlayIsEmpty(overlay)) localStorage.removeItem(editsKey(worldId));
    else localStorage.setItem(editsKey(worldId), JSON.stringify(overlay));
  } catch {
    // Storage full/unavailable — edits stay in-memory for this session.
  }
}

/**
 * Which real-city area (if any) the current URL points at: a curated preset
 * (`?city=slug`) or a geocoded search result (`?bbox=s,w,n,e&cityName=…`).
 */
function resolveCityFromUrl(
  params: URLSearchParams,
): { slug: string; name: string; bbox: BBox } | undefined {
  const slug = params.get('city');
  if (slug && CITY_PRESETS[slug]) return CITY_PRESETS[slug];
  const bboxRaw = params.get('bbox');
  if (bboxRaw) {
    const bbox = parseBBoxSlug(bboxRaw);
    if (bbox) {
      return { slug: `bbox:${bbox.join(',')}`, name: params.get('cityName') ?? 'Custom area', bbox };
    }
    console.warn('Ignoring invalid ?bbox=', bboxRaw);
  }
  return undefined;
}

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
  const editorRef = useRef<BuildingEditor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // How to rebuild the current base world + identity of the draft being edited.
  const draftRef = useRef<{
    base: DraftBase;
    name?: string;
    createdAt?: string;
    handle: FileSystemFileHandle | null;
  } | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingText, setLoadingText] = useState('Generating a procedural city…');
  const [engine, setEngine] = useState<{ renderer: ThreeMapRenderer; world: MapWorld } | null>(
    null,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Headless automation (CI, screenshots) defaults to the cheap path so the
    // main thread stays responsive; override with ?q=high|low.
    const qParam = new URLSearchParams(window.location.search).get('q');
    const quality =
      qParam === 'high' || qParam === 'low'
        ? qParam
        : navigator.webdriver
          ? 'low'
          : 'high';
    const renderer = createThreeMapRenderer({ container, quality });
    renderer.on('world:loaded', () => {
      // Let a couple of frames render behind the overlay before revealing.
      setTimeout(() => setReady(true), 250);
    });

    let disposed = false;
    const boot = async (): Promise<void> => {
      const { seed, preset, directives, environment } = readUrlParams();
      const city = resolveCityFromUrl(new URLSearchParams(window.location.search));
      const pendingDraft = takePendingDraft(window.location.search);

      let world: MapWorld;
      let base: DraftBase;
      let env = environment;
      if (pendingDraft?.base.kind === 'imported') {
        // Draft embeds the base world — no network fetch, immune to OSM drift.
        setLoadingText(`Restoring ${pendingDraft.base.sourceName} from draft…`);
        world = deserializeMap(pendingDraft.base.snapshot);
        base = pendingDraft.base;
      } else if (pendingDraft?.base.kind === 'procedural') {
        const d = pendingDraft.base.directives;
        world = generateWorld(pendingDraft.base.seed, applyDirectives(d).config);
        base = pendingDraft.base;
        if (d.environment) env = d.environment;
      } else if (city) {
        setLoadingText(`Fetching ${city.name} from OpenStreetMap…`);
        try {
          const osm = await fetchOsmArea(city.bbox);
          if (disposed) return;
          setLoadingText(`Building ${city.name}…`);
          world = osmToWorld(osm, { name: city.name, bbox: city.bbox });
          // Snapshot the pristine base (before edits) so drafts of imported
          // worlds are self-contained.
          base = {
            kind: 'imported',
            sourceSlug: city.slug,
            sourceName: city.name,
            snapshot: serializeMap(world),
          };
        } catch (err) {
          console.error('OSM load failed, falling back to procedural city', err);
          setLoadingText('OpenStreetMap unavailable — generating a procedural city…');
          world = generateWorld(seed, applyDirectives({ ...directives, preset }).config);
          base = { kind: 'procedural', seed, directives: { ...directives, preset } };
        }
      } else {
        world = generateWorld(seed, applyDirectives({ ...directives, preset }).config);
        base = { kind: 'procedural', seed, directives: { ...directives, preset } };
      }
      if (disposed) return;
      draftRef.current = {
        base,
        name: pendingDraft?.name,
        createdAt: pendingDraft?.createdAt,
        handle: null,
      };

      // Re-apply user edits (from the opened draft, or autosaved) before first render.
      let savedOverlay: EditOverlay | undefined;
      if (pendingDraft) {
        const { overlay, droppedIds } = sanitizeOverlayForWorld(world, pendingDraft.overlay);
        if (droppedIds.length > 0) {
          console.warn(
            `Draft references ${droppedIds.length} building(s) no longer in the base world — skipped:`,
            droppedIds,
          );
        }
        savedOverlay = overlay;
        saveOverlay(world.id, overlay); // seed the autosave with the draft's edits
      } else {
        savedOverlay = loadOverlay(world.id);
      }
      if (savedOverlay) applyEditOverlay(world, savedOverlay);

      void renderer.loadWorld(world);
      renderer.setEnvironment(env);
      useAtlasStore.getState().setEnvironment(env);
      const tour = createTour(renderer, world);
      tourRef.current = tour;
      const editor = createBuildingEditor(renderer, world, {
        initialOverlay: savedOverlay,
        onOverlayChange: (overlay) => saveOverlay(world.id, overlay),
      });
      editorRef.current = editor;
      if (pendingDraft) {
        // Resume editing right away — that's what opening a draft is for.
        useAtlasStore.getState().setEditMode(true);
        editor.setEnabled(true);
      }
      (window as unknown as Record<string, unknown>).__mapEngine = {
        renderer,
        world,
        tour,
        editor,
      };
      setEngine({ renderer, world });
    };
    void boot();

    return () => {
      disposed = true;
      tourRef.current?.stop();
      editorRef.current?.dispose();
      renderer.dispose();
      setEngine(null);
    };
  }, []);

  const exportWorld = (): void => {
    const world = engine?.world;
    if (!world) return;
    const blob = new Blob([JSON.stringify(serializeMap(world))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${world.id.replace(/[^a-z0-9-]+/gi, '-')}.map.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveDraft = async (): Promise<void> => {
    const editor = editorRef.current;
    const world = engine?.world;
    const info = draftRef.current;
    if (!editor || !world || !info) return;
    const draft = createDraft({
      name: info.name ?? world.id.replace(/[^a-z0-9-]+/gi, '-'),
      base: info.base,
      overlay: editor.getOverlay(),
      now: new Date().toISOString(),
      createdAt: info.createdAt,
    });
    try {
      info.handle = await saveDraftFile(draft, info.handle);
      info.name = draft.name;
      info.createdAt = draft.createdAt;
    } catch (err) {
      alert(`Could not save draft: ${(err as Error).message}`);
    }
  };

  const openDraftFile = async (file: File): Promise<void> => {
    try {
      const draft = parseDraft(await file.text());
      // Navigate to a URL matching the draft's base so the regular boot path
      // (and the localStorage autosave key, which includes cfg) line up.
      const url = new URL(window.location.origin + window.location.pathname);
      if (draft.base.kind === 'imported') {
        if (draft.base.sourceSlug.startsWith('bbox:')) {
          // Geocoded (searched) city — the URL carries the box itself.
          url.searchParams.set('bbox', draft.base.sourceSlug.slice(5));
          url.searchParams.set('cityName', draft.base.sourceName);
        } else {
          url.searchParams.set('city', draft.base.sourceSlug);
        }
      } else {
        const d = draft.base.directives;
        url.searchParams.set('seed', draft.base.seed);
        if (d.preset) url.searchParams.set('preset', d.preset);
        if (d.environment) url.searchParams.set('env', d.environment);
        const numeric: MapDirectives = { ...d };
        delete numeric.preset;
        delete numeric.seed;
        delete numeric.environment;
        if (Object.keys(numeric).length > 0) url.searchParams.set('cfg', encodeCfg(numeric));
      }
      stashPendingDraft(draft, url.search);
      window.location.href = url.toString();
    } catch (err) {
      alert(`Could not open draft: ${(err as Error).message}`);
    }
  };

  const openDraft = (): void => {
    fileInputRef.current?.click();
  };

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
    // Manual preset/seed selection drops prompt/city-derived overrides.
    url.searchParams.delete('cfg');
    url.searchParams.delete('env');
    url.searchParams.delete('city');
    window.location.href = url.toString();
  };

  const loadCity = (slug: string): void => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('city', slug);
    window.location.href = url.toString();
  };

  // Geocoding provider — swappable; ?geo=mock forces the offline dataset.
  const geoProviderRef = useRef<GeocodingProvider | null>(null);
  const searchCities = (
    query: string,
    signal: AbortSignal,
  ): ReturnType<GeocodingProvider['searchCities']> => {
    geoProviderRef.current ??=
      new URLSearchParams(window.location.search).get('geo') === 'mock'
        ? createMockGeocodingProvider()
        : createPhotonProvider();
    return geoProviderRef.current.searchCities(query, { signal, limit: 8 });
  };

  const selectCity = (candidate: {
    lat: number;
    lon: number;
    bbox?: BBox;
    label: string;
  }): void => {
    const area = candidateToCityArea(candidate);
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('bbox', area.bbox.join(','));
    url.searchParams.set('cityName', area.name);
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
      <input
        ref={fileInputRef}
        data-testid="draft-file-input"
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openDraftFile(file);
        }}
      />
      {engine && (
        <AtlasUI
          renderer={engine.renderer}
          world={engine.world}
          onReset={reset}
          onGenerate={generate}
          editor={editorRef.current ?? undefined}
          onExportWorld={exportWorld}
          onSaveDraft={() => void saveDraft()}
          onOpenDraft={openDraft}
          onLoadCity={loadCity}
          cityOptions={Object.values(CITY_PRESETS).map((c) => ({ slug: c.slug, name: c.name }))}
          onSearchCities={searchCities}
          onSelectCity={selectCity}
          currentCityName={
            engine.world.id.startsWith('osm:') ? engine.world.id.slice(4) : undefined
          }
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
          <div data-testid="loading-text" style={{ opacity: 0.65, fontSize: 14 }}>
            {loadingText}
          </div>
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
