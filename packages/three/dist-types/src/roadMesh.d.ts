import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
/**
 * Roads are quad strips that follow the terrain, slightly lifted to avoid
 * z-fighting. Bridge edges keep a flat deck above the water and blend back
 * into the terrain height at both ends. All edges merge into one geometry.
 */
export declare function buildRoadsMesh(world: MapWorld): THREE.Mesh;
