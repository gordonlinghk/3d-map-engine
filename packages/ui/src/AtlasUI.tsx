import './ui.css';
import { useEffect } from 'react';
import { AtlasProvider } from './context';
import { SearchBar } from './SearchBar';
import { SidePanel } from './SidePanel';
import { InfoPanel } from './InfoPanel';
import { Toolbar, type ToolbarProps } from './Toolbar';
import { MiniMap } from './MiniMap';
import { Hud } from './Hud';
import { SelectedLabel } from './SelectedLabel';
import { useAtlasStore } from './store';
import type { EngineContextValue } from './types';

function Hints() {
  const selectedId = useAtlasStore((s) => s.selectedId);
  if (selectedId) return null;
  return (
    <div className="atlas-hints">
      <b>Drag</b> rotate · <b>Scroll</b> zoom · <b>WASD</b> move · <b>Dbl-click</b> fly to ·{' '}
      <b>⌘K</b> search · <b>Esc</b> clear
    </div>
  );
}

export type AtlasUIProps = EngineContextValue & ToolbarProps;

export function AtlasUI({ renderer, world, ...toolbar }: AtlasUIProps) {
  // On narrow screens start with the list collapsed so the map stays visible.
  useEffect(() => {
    if (window.innerWidth < 900) useAtlasStore.getState().setPanelOpen(false);
  }, []);

  return (
    <AtlasProvider renderer={renderer} world={world}>
      <div className="atlas-ui">
        <SelectedLabel />
        <SidePanel />
        <SearchBar />
        <Toolbar {...toolbar} />
        <InfoPanel />
        <MiniMap />
        <Hud />
        <Hints />
      </div>
    </AtlasProvider>
  );
}
