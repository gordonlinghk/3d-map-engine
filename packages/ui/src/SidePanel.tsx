import { useMemo } from 'react';
import { useAtlas } from './context';
import { useAtlasStore } from './store';
import { CATEGORY_CHIPS, filterEntries } from './entries';
import { avatarColor, avatarLetter } from './avatar';

export function SidePanel() {
  const { renderer, world, entries } = useAtlas();
  const chip = useAtlasStore((s) => s.chip);
  const setChip = useAtlasStore((s) => s.setChip);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const panelOpen = useAtlasStore((s) => s.panelOpen);
  const setPanelOpen = useAtlasStore((s) => s.setPanelOpen);

  const companies = useMemo(() => entries.filter((e) => e.kind === 'company'), [entries]);
  const landmarks = useMemo(() => entries.filter((e) => e.kind === 'landmark'), [entries]);
  const list = useMemo(() => filterEntries(entries, chip), [entries, chip]);

  if (!panelOpen) {
    return (
      <button
        className="atlas-side-toggle"
        data-testid="side-open"
        title="Open list"
        onClick={() => setPanelOpen(true)}
      >
        ☰
      </button>
    );
  }

  const isImported = world.id.startsWith('osm:');
  const atlasName = isImported
    ? (world.districts[0]?.name ?? 'Imported City')
    : world.config.preset === 'coastal-tech-city'
      ? 'SF Tech Atlas'
      : world.config.preset === 'island-city'
        ? 'Island Atlas'
        : 'Downtown Atlas';

  return (
    <aside className="atlas-side" data-testid="side-panel">
      <div className="atlas-side-header">
        <div className="logo">
          {atlasName
            .split(' ')
            .slice(0, 2)
            .map((w) => w.charAt(0))
            .join('')}
        </div>
        <div>
          <div className="title">{atlasName}</div>
          <div className="subtitle">
            {isImported
              ? `${entries.filter((e) => e.kind === 'building').length} named buildings · OpenStreetMap`
              : `${companies.length} companies · ${landmarks.length} landmarks · 1 city`}
          </div>
        </div>
        <button
          className="close"
          data-testid="side-close"
          onClick={() => setPanelOpen(false)}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'rgba(0,0,0,0.06)',
            width: 26,
            height: 26,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          ‹
        </button>
      </div>

      <div className="atlas-chips" data-testid="category-chips">
        {CATEGORY_CHIPS.map((c) => (
          <button
            key={c}
            className={chip === c ? 'active' : ''}
            onClick={() => setChip(c)}
            data-testid={`chip-${c}`}
          >
            {c}
            {c === 'Unicorns' ? ' 🦄' : ''}
          </button>
        ))}
      </div>

      <div className="atlas-list" data-testid="atlas-list">
        {list.map((e) => (
          <button
            key={e.id}
            className={`row${selectedId === e.id ? ' selected' : ''}`}
            data-testid={`list-item-${e.id}`}
            onClick={() => {
              renderer.setSelected(e.id);
              void renderer.focusObject(e.id);
            }}
          >
            <span className="avatar" style={{ background: avatarColor(e.category) }}>
              {avatarLetter(e.name)}
            </span>
            <span>
              <div className="name">{e.name}</div>
              <div className="meta">{e.category}</div>
            </span>
            {e.badge && <span className="badge">{e.badge}</span>}
          </button>
        ))}
        {list.length === 0 && (
          <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-dim)' }}>
            No results in this category.
          </div>
        )}
      </div>

      <div className="atlas-side-footer">
        {isImported
          ? `${list.length} shown · data © OpenStreetMap contributors`
          : `${list.length} shown · Three.js · procedural seed “${world.seed}”`}
      </div>
    </aside>
  );
}
