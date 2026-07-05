import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { buildAtlasEntries } from './entries';
import type { AtlasEntry } from './entries';
import { useAtlasStore } from './store';
import type { EngineContextValue } from './types';

type AtlasContextValue = EngineContextValue & { entries: AtlasEntry[] };

const AtlasContext = createContext<AtlasContextValue | null>(null);

export function AtlasProvider({
  renderer,
  world,
  children,
}: EngineContextValue & { children: ReactNode }) {
  const entries = useMemo(() => buildAtlasEntries(world), [world]);
  const value = useMemo(() => ({ renderer, world, entries }), [renderer, world, entries]);

  // Keep the store in sync with engine events.
  useEffect(() => {
    const offs = [
      renderer.on('object:selected', (p: { objectId: string }) => {
        useAtlasStore.getState().setSelectedId(p.objectId);
      }),
      renderer.on('object:cleared', () => {
        useAtlasStore.getState().setSelectedId(null);
      }),
      renderer.on('object:hover', (p: { objectId: string | null }) => {
        useAtlasStore.getState().setHoveredId(p.objectId);
      }),
      renderer.on('camera:changed', (p: { mode: 'orbit' | 'fly' | 'walk' }) => {
        if (useAtlasStore.getState().cameraMode !== p.mode) {
          useAtlasStore.getState().setCameraMode(p.mode);
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [renderer]);

  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

export function useAtlas(): AtlasContextValue {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error('useAtlas must be used inside <AtlasProvider>');
  return ctx;
}
