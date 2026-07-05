import type { HeightSampler } from './terrain';
import type { BuildingInfo, CityBlock, District, DistrictKind, LandmarkInfo, MapConfig, Vec3 } from './types';
export type TreeObject = {
    id: string;
    name: string;
    position: Vec3;
    tags: string[];
};
export type CityData = {
    districts: District[];
    blocks: CityBlock[];
    buildings: BuildingInfo[];
    landmarks: LandmarkInfo[];
    trees: TreeObject[];
};
export declare function generateCity(seed: string, config: MapConfig, sample: HeightSampler): CityData;
export type { DistrictKind };
