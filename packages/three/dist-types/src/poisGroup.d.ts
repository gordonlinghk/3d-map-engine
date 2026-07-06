import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
/**
 * Map-pin markers for user/imported POIs: a thin pole rising from the ground
 * sample stored on the POI, topped by a colored sphere. One pin per POI
 * (not instanced — POI counts are expected to stay small; see B15 contract).
 */
export declare function buildPoisGroup(world: MapWorld): THREE.Group;
