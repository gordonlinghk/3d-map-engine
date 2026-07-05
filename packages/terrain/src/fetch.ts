import {
  TERRARIUM_ENDPOINT,
  createElevationGrid,
  tileRangeForBBox,
  zoomForBBox,
} from './terrarium';
import type { DecodedPng, ElevationGrid } from './terrarium';
import type { BBox } from './types';

export type FetchElevationOptions = {
  zoom?: number;
  maxTiles?: number;
  endpoint?: string;
  signal?: AbortSignal;
  /** Injectable for tests / Node. Browser default decodes via canvas. */
  fetchFn?: typeof fetch;
  decodePng?: (bytes: ArrayBuffer) => Promise<DecodedPng>;
};

/** Browser PNG decode via ImageBitmap + (Offscreen)Canvas. */
async function decodePngBrowser(bytes: ArrayBuffer): Promise<DecodedPng> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement('canvas'), {
          width: bitmap.width,
          height: bitmap.height,
        });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { width: image.width, height: image.height, data: image.data };
}

/**
 * Fetch terrarium tiles covering a bbox and return a mosaic elevation grid.
 * Tiles are fetched concurrently — the AWS Open Data bucket is a plain CDN,
 * not a rate-limited community API.
 */
export async function fetchElevationGrid(
  bbox: BBox,
  options: FetchElevationOptions = {},
): Promise<ElevationGrid> {
  const {
    maxTiles = 16,
    endpoint = TERRARIUM_ENDPOINT,
    signal,
    fetchFn = fetch,
    decodePng = decodePngBrowser,
  } = options;
  const zoom = options.zoom ?? zoomForBBox(bbox, maxTiles);
  const range = tileRangeForBBox(bbox, zoom);

  const jobs: Promise<{ x: number; y: number; png: DecodedPng }>[] = [];
  for (let y = range.y0; y <= range.y1; y++) {
    for (let x = range.x0; x <= range.x1; x++) {
      jobs.push(
        (async () => {
          const url = `${endpoint}/${zoom}/${x}/${y}.png`;
          const response = await fetchFn(url, { signal });
          if (!response.ok) throw new Error(`Terrain tile ${zoom}/${x}/${y} → HTTP ${response.status}`);
          return { x, y, png: await decodePng(await response.arrayBuffer()) };
        })(),
      );
    }
  }
  const tiles = await Promise.all(jobs);
  return createElevationGrid(tiles, range, zoom);
}
