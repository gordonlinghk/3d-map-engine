import type { HeightSampler } from './terrain';
import type { BuildingInfo, District, DistrictKind, LandmarkInfo, MapConfig, Vec3 } from './types';
export type TreeObject = {
    id: string;
    name: string;
    position: Vec3;
    tags: string[];
};
export type CityData = {
    districts: District[];
    buildings: BuildingInfo[];
    landmarks: LandmarkInfo[];
    trees: TreeObject[];
};
export declare function generateCity(seed: string, config: MapConfig, sample: HeightSampler): CityData;
export type { DistrictKind };
