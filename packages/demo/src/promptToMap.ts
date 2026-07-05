import Anthropic from '@anthropic-ai/sdk';
import { MAP_DIRECTIVES_JSON_SCHEMA, parsePromptLocally } from '@map-engine/core';
import type { MapDirectives } from '@map-engine/core';

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You translate a natural-language description of a city into map-generation directives for a procedural 3D city engine.

Rules:
- Only set fields the description actually implies; omit everything else.
- Prefer one of the three presets as the base layout.
- Derive a short, thematic seed string (lowercase, hyphenated) from the prompt.
- The description may be in any language (often English or Chinese).`;

export const API_KEY_STORAGE_KEY = 'map-engine.anthropic-key';

export function getStoredApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode) — key just won't persist.
  }
}

/**
 * Turn a prompt into MapDirectives.
 * With an API key: Claude with a structured-output JSON schema.
 * Without: local keyword parsing (English + Chinese), so the demo always works.
 */
export async function promptToDirectives(
  prompt: string,
  apiKey: string,
): Promise<{ directives: MapDirectives; source: 'claude' | 'local' }> {
  if (!apiKey) {
    return { directives: parsePromptLocally(prompt), source: 'local' };
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: MAP_DIRECTIVES_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined this prompt — try rephrasing it.');
  }
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no directives.');
  return { directives: JSON.parse(text) as MapDirectives, source: 'claude' };
}
