import type { MapConfig, MapPresetId } from './types';
/**
 * Prompt-to-map: a natural-language description is translated (by an LLM or
 * the local keyword parser below) into a small set of MapDirectives, which
 * deterministically map onto a MapConfig. The directive layer keeps the LLM
 * away from raw config internals and lets us clamp everything to safe ranges.
 */
export type EnvironmentDirective = 'day' | 'golden-hour' | 'night';
export type MapDirectives = {
    preset?: MapPresetId;
    environment?: EnvironmentDirective;
    seed?: string;
    /** 0..1 — how hilly the terrain is. */
    hilliness?: number;
    /** World units, ~10..120 — max terrain height. */
    maxHeight?: number;
    /** 0..1 — how much of the map is ocean. */
    islandFactor?: number;
    /** 0.1..0.95 — building fill density. */
    buildingDensity?: number;
    /** 4..70 — tallest buildings in floors. */
    maxFloors?: number;
};
/** Apply directives onto a preset base config, clamping every value. */
export declare function applyDirectives(directives: MapDirectives): {
    config: MapConfig;
    environment: EnvironmentDirective;
    seed?: string;
};
/** JSON schema handed to the LLM as the structured-output format. */
export declare const MAP_DIRECTIVES_JSON_SCHEMA: {
    readonly type: "object";
    readonly description: "Directives for generating a procedural 3D city map.";
    readonly properties: {
        readonly preset: {
            readonly type: "string";
            readonly enum: readonly ["coastal-tech-city", "island-city", "downtown-night-grid"];
            readonly description: "Base map layout. coastal-tech-city: mainland with a bay, bridge and islands (SF-like). island-city: one main island with satellites. downtown-night-grid: flat dense street grid.";
        };
        readonly environment: {
            readonly type: "string";
            readonly enum: readonly ["day", "golden-hour", "night"];
            readonly description: "Lighting mood.";
        };
        readonly seed: {
            readonly type: "string";
            readonly description: "Optional short seed string; derive from the theme of the prompt.";
        };
        readonly hilliness: {
            readonly type: "number";
            readonly description: "How hilly the terrain is, 0 (flat) to 1 (mountainous).";
        };
        readonly maxHeight: {
            readonly type: "number";
            readonly description: "Max terrain height in meters, 10 (flat plains) to 120 (steep mountains).";
        };
        readonly islandFactor: {
            readonly type: "number";
            readonly description: "How much of the map is ocean, 0.1 (mostly land) to 0.95 (mostly water).";
        };
        readonly buildingDensity: {
            readonly type: "number";
            readonly description: "Building fill density per block, 0.1 (sparse) to 0.95 (packed).";
        };
        readonly maxFloors: {
            readonly type: "number";
            readonly description: "Tallest buildings in floors, 4 (low-rise town) to 70 (mega skyline).";
        };
    };
    readonly additionalProperties: false;
};
/**
 * Offline fallback: keyword-based prompt parsing (English + Chinese) so the
 * feature works without an API key.
 */
export declare function parsePromptLocally(prompt: string): MapDirectives;
