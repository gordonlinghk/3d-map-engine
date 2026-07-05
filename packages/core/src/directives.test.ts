import { describe, expect, it } from 'vitest';
import { applyDirectives, parsePromptLocally, MAP_DIRECTIVES_JSON_SCHEMA } from './directives';
import { getPresetConfig } from './presets';

describe('applyDirectives', () => {
  it('returns the untouched preset config when no directives are given', () => {
    const { config, environment } = applyDirectives({});
    expect(config).toEqual(getPresetConfig('coastal-tech-city'));
    expect(environment).toBe('day');
  });

  it('applies overrides on top of the chosen preset', () => {
    const { config, environment, seed } = applyDirectives({
      preset: 'island-city',
      environment: 'night',
      seed: 'volcano',
      hilliness: 0.9,
      maxHeight: 100,
      buildingDensity: 0.8,
      maxFloors: 50,
    });
    expect(config.preset).toBe('island-city');
    expect(config.terrain.hilliness).toBe(0.9);
    expect(config.terrain.maxHeight).toBe(100);
    expect(config.city.buildingDensity).toBe(0.8);
    expect(config.city.maxFloors).toBe(50);
    expect(environment).toBe('night');
    expect(seed).toBe('volcano');
  });

  it('clamps out-of-range values to safe bounds', () => {
    const { config } = applyDirectives({
      hilliness: 4,
      maxHeight: 9999,
      islandFactor: -1,
      buildingDensity: 2,
      maxFloors: 500,
    });
    expect(config.terrain.hilliness).toBe(1);
    expect(config.terrain.maxHeight).toBe(120);
    expect(config.terrain.islandFactor).toBe(0.1);
    expect(config.city.buildingDensity).toBe(0.95);
    expect(config.city.maxFloors).toBe(70);
  });
});

describe('parsePromptLocally', () => {
  it('detects preset, environment and terrain from English prompts', () => {
    const d = parsePromptLocally('A mountainous island city at night with dense skyscrapers');
    expect(d.preset).toBe('island-city');
    expect(d.environment).toBe('night');
    expect(d.hilliness).toBeGreaterThan(0.5);
    expect(d.buildingDensity).toBeGreaterThan(0.8);
    expect(d.maxFloors).toBeGreaterThan(50);
  });

  it('detects keywords in Chinese prompts', () => {
    const d = parsePromptLocally('黃昏的海灣城市,有大橋和密集高樓');
    expect(d.preset).toBe('coastal-tech-city');
    expect(d.environment).toBe('golden-hour');
    expect(d.buildingDensity).toBeGreaterThan(0.8);
    expect(d.maxFloors).toBeGreaterThan(50);
  });

  it('detects flat quiet towns', () => {
    const d = parsePromptLocally('a flat quiet low-rise town in the day');
    expect(d.hilliness).toBeLessThan(0.3);
    expect(d.buildingDensity).toBeLessThan(0.5);
    expect(d.maxFloors).toBeLessThan(12);
    expect(d.environment).toBe('day');
  });

  it('returns empty directives for unrelated text', () => {
    expect(parsePromptLocally('hello world')).toEqual({});
  });
});

describe('MAP_DIRECTIVES_JSON_SCHEMA', () => {
  it('covers every MapDirectives field and forbids extras', () => {
    const keys = Object.keys(MAP_DIRECTIVES_JSON_SCHEMA.properties);
    expect(keys.sort()).toEqual(
      ['buildingDensity', 'environment', 'hilliness', 'islandFactor', 'maxFloors', 'maxHeight', 'preset', 'seed'].sort(),
    );
    expect(MAP_DIRECTIVES_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});
