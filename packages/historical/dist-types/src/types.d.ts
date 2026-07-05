/**
 * Historical map data schema — hand-curated, provenance-first.
 *
 * Design stance (see map-data-sources-research.md §3): "historically
 * grounded, not historically exact". City positions and terrain are real;
 * borders and routes are period-plausible approximations. Every entry
 * carries a confidence level and sources so speculation is never silently
 * presented as fact.
 */
export type Confidence = 
/** Directly attested in primary sources (正史). */
'attested'
/** Reasonable inference (e.g. located at the modern successor city). */
 | 'inferred'
/** Deliberate gameplay/visual approximation. */
 | 'stylized';
export type LatLon = {
    lat: number;
    lon: number;
};
export type HistoricalCityKind = 'capital' | 'major' | 'town' | 'pass' | 'site';
export type HistoricalCity = {
    id: string;
    /** Period name, e.g. "洛陽". */
    name: string;
    /** Modern name, shown for orientation, e.g. "洛陽市". */
    modernName?: string;
    kind: HistoricalCityKind;
    factionId: string;
    position: LatLon;
    /** Years CE the entry is valid for (defaults to the map's period). */
    period?: {
        from: number;
        to: number;
    };
    confidence: Confidence;
    sources: string[];
    notes?: string;
};
export type HistoricalFaction = {
    id: string;
    name: string;
    color: string;
    /** Very coarse territory outline (stylized by definition). */
    boundary: LatLon[];
    notes?: string;
};
export type HistoricalRiver = {
    id: string;
    name: string;
    /** Downstream polyline. */
    path: LatLon[];
    /** Ribbon width in km. */
    widthKm: number;
    confidence: Confidence;
    notes?: string;
};
export type HistoricalRoute = {
    id: string;
    name: string;
    /** City ids the route threads through, in order. */
    cities: string[];
    confidence: Confidence;
    notes?: string;
};
export type HistoricalMapData = {
    id: string;
    name: string;
    /** Representative year(s) CE the snapshot depicts. */
    period: {
        from: number;
        to: number;
    };
    /** Geographic coverage [south, west, north, east] in degrees. */
    bbox: [number, number, number, number];
    cities: HistoricalCity[];
    factions: HistoricalFaction[];
    rivers: HistoricalRiver[];
    routes: HistoricalRoute[];
    /** Licence/credit lines for the UI. */
    attribution: string[];
    disclaimer: string;
};
