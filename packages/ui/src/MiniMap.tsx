import { useEffect, useRef } from 'react';
import { chunkKey } from '@map-engine/core';
import { useAtlas } from './context';
import { useAtlasStore } from './store';

const SIZE = 168;

export function MiniMap() {
  const { renderer, world } = useAtlas();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  // Render the static base map once per world.
  useEffect(() => {
    const base = document.createElement('canvas');
    base.width = SIZE;
    base.height = SIZE;
    const ctx = base.getContext('2d')!;
    const { config } = world;
    const half = (config.chunksX * config.chunkSize) / 2;

    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Land from chunk height grids.
    const res = 4; // sample every 4th height cell
    for (let cz = 0; cz < config.chunksZ; cz++) {
      for (let cx = 0; cx < config.chunksX; cx++) {
        const chunk = world.chunks[chunkKey({ cx, cz })];
        if (!chunk) continue;
        const n = chunk.resolution;
        for (let j = 0; j < n; j += res) {
          for (let i = 0; i < n; i += res) {
            const h = chunk.heights[j * (n + 1) + i]!;
            if (h <= config.waterLevel) continue;
            const wx = cx * config.chunkSize + (i / n) * config.chunkSize - half;
            const wz = cz * config.chunkSize + (j / n) * config.chunkSize - half;
            const px = ((wx + half) / (2 * half)) * SIZE;
            const py = ((wz + half) / (2 * half)) * SIZE;
            const t = h - config.waterLevel;
            ctx.fillStyle = t > 24 ? '#3c5b3f' : t > 14 ? '#51705a' : '#9aa3ad';
            const cell = (SIZE / (2 * half)) * config.chunkSize * (res / n) + 1;
            ctx.fillRect(px, py, cell, cell);
          }
        }
      }
    }

    // Major roads.
    const nodeById = new Map(world.roadGraph.nodes.map((nd) => [nd.id, nd]));
    ctx.strokeStyle = 'rgba(215, 222, 233, 0.55)';
    ctx.lineWidth = 1;
    for (const e of world.roadGraph.edges) {
      if (e.kind === 'street') continue;
      const a = nodeById.get(e.from);
      const b = nodeById.get(e.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(((a.position.x + half) / (2 * half)) * SIZE, ((a.position.z + half) / (2 * half)) * SIZE);
      ctx.lineTo(((b.position.x + half) / (2 * half)) * SIZE, ((b.position.z + half) / (2 * half)) * SIZE);
      ctx.stroke();
    }

    baseRef.current = base;
  }, [world]);

  // Live overlay: camera position/heading + selected object.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const half = (world.config.chunksX * world.config.chunkSize) / 2;
    const toPx = (x: number) => ((x + half) / (2 * half)) * SIZE;

    let last = 0;
    const off = renderer.onFrame(() => {
      const now = performance.now();
      if (now - last < 120) return;
      last = now;
      const base = baseRef.current;
      if (!base) return;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(base, 0, 0);

      // Selected object.
      const sel = selectedRef.current;
      if (sel) {
        const obj = world.objects[sel];
        const pos =
          obj?.objectType === 'building'
            ? obj.building.position
            : obj?.objectType === 'landmark'
              ? obj.landmark.position
              : null;
        if (pos) {
          ctx.fillStyle = '#ffab52';
          ctx.beginPath();
          ctx.arc(toPx(pos.x), toPx(pos.z), 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Camera dot + heading.
      const cam = renderer.camera;
      const px = toPx(cam.position.x);
      const py = toPx(cam.position.z);
      const { x, y, z, w } = cam.quaternion;
      // Forward vector from quaternion (0,0,-1 rotated).
      const fx = -(2 * (x * z + w * y));
      const fz = -(1 - 2 * (x * x + y * y));
      // The view wedge is drawn pointing +x, so rotate to the forward vector.
      const angle = Math.atan2(fz, fx);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(126, 197, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 16, -0.5, 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#7ec5ff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(px, py, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    return off;
  }, [renderer, world]);

  return (
    <div className="atlas-minimap" data-testid="minimap">
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block' }} />
    </div>
  );
}
