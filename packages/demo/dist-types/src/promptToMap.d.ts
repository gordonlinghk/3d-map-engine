import type { MapDirectives } from '@map-engine/core';
export declare const API_KEY_STORAGE_KEY = "map-engine.anthropic-key";
export declare function getStoredApiKey(): string;
export declare function storeApiKey(key: string): void;
/**
 * Turn a prompt into MapDirectives.
 * With an API key: Claude with a structured-output JSON schema.
 * Without: local keyword parsing (English + Chinese), so the demo always works.
 */
export declare function promptToDirectives(prompt: string, apiKey: string): Promise<{
    directives: MapDirectives;
    source: 'claude' | 'local';
}>;
