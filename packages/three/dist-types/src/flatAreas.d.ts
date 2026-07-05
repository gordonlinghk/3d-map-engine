import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
/**
 * Flat water/green polygons for imported (OSM) worlds, drawn slightly above
 * the ground so they read as harbours, rivers and parks.
 */
export declare function buildFlatAreas(world: MapWorld): THREE.Group;
