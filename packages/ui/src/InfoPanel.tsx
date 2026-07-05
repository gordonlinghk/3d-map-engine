import { useMemo } from 'react';
import { useAtlas } from './context';
import { useAtlasStore } from './store';
import { avatarColor, avatarLetter } from './avatar';

type Cell = { label: string; value: string; wide?: boolean };

export function InfoPanel() {
  const { renderer, world } = useAtlas();
  const selectedId = useAtlasStore((s) => s.selectedId);

  const data = useMemo(() => {
    if (!selectedId) return null;
    const obj = world.objects[selectedId];
    if (!obj) return null;

    if (obj.objectType === 'building') {
      const b = obj.building;
      const m = b.metadata ?? {};
      const cells: Cell[] = [];
      if (m.founders) cells.push({ label: 'Founders', value: String(m.founders), wide: true });
      if (m.founded) cells.push({ label: 'Founded', value: String(m.founded) });
      if (b.category) cells.push({ label: 'Category', value: b.category });
      if (m.funding) cells.push({ label: 'Funding', value: String(m.funding) });
      if (m.valuation) cells.push({ label: 'Valuation', value: String(m.valuation) });
      if (m.headquarters)
        cells.push({ label: 'Headquarters', value: String(m.headquarters), wide: true });
      if (m.products) cells.push({ label: 'Products', value: String(m.products), wide: true });
      cells.push({ label: 'Floors', value: `${b.floors} · ${Math.round(b.height)} m` });
      const district = world.districts.find((d) => d.id === b.districtId);
      if (district) cells.push({ label: 'District', value: district.name });
      return {
        name: b.name,
        tag: b.category ?? b.type,
        description: b.description,
        cells,
      };
    }
    if (obj.objectType === 'landmark') {
      const lm = obj.landmark;
      return {
        name: lm.name,
        tag: lm.kind,
        description: lm.description,
        cells: [
          { label: 'Type', value: lm.kind },
          { label: 'Tags', value: lm.tags.join(' · ') },
        ] as Cell[],
      };
    }
    return null;
  }, [selectedId, world]);

  if (!data || !selectedId) return null;

  return (
    <div className="atlas-info" data-testid="info-panel">
      <div className="atlas-info-header">
        <div className="avatar" style={{ background: avatarColor(data.tag) }}>
          {avatarLetter(data.name)}
        </div>
        <div>
          <h2>{data.name}</h2>
          <span className="tag">{data.tag}</span>
        </div>
        <button
          className="close"
          data-testid="info-close"
          onClick={() => renderer.setSelected(null)}
        >
          ✕
        </button>
      </div>
      <div className="atlas-info-body">
        <p className="desc">{data.description}</p>
        <div className="atlas-info-grid">
          {data.cells.map((c) => (
            <div key={c.label} className={`cell${c.wide ? ' wide' : ''}`}>
              <div className="label">{c.label}</div>
              <div className="value">{c.value}</div>
            </div>
          ))}
        </div>
        <div className="atlas-info-actions">
          <button
            className="fly"
            data-testid="fly-there"
            onClick={() => void renderer.focusObject(selectedId)}
          >
            ✈ Fly there
          </button>
        </div>
      </div>
    </div>
  );
}
