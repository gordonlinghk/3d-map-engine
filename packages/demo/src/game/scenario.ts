export type ScenarioFaction = {
  /** Dataset faction id, e.g. 'liubei'. Also used as the game factionId. */
  id: string;
  /** Display name, e.g. '劉備'. */
  name: string;
  /** Marker/UI color. */
  color: string;
  /** Dataset city ids this faction owns at scenario start. */
  cities: string[];
  /** Units spawned at (the road node nearest) each owned city at start. */
  unitsPerCity: number;
  /** Starting resource stock. */
  resources: number;
  /** Base income per second, independent of cities. */
  income: number;
};

export type Scenario = {
  id: string;
  /** Display title, e.g. '荊州爭奪戰(建安二十四年)'. */
  name: string;
  /** 2–3 sentence opening blurb shown in the lobby, Traditional Chinese. */
  blurb: string;
  mapId: 'three-kingdoms';
  /** Era whose map tint best matches the scenario; the URL should carry it. */
  recommendedEra: string;
  factions: ScenarioFaction[];
  siteDefaults: { captureRadius: number; captureTime: number; income: number };
  trainCost: number;
  unitStats: { speed: number; hp: number; attackDamage: number; attackRange: number };
  victoryText: string;
  defeatText: string;
};

/** `city:{mapId}:{cityId}` — the building id historicalToWorld assigns. */
export function scenarioBuildingId(scenario: Scenario, cityId: string): string {
  return `city:${scenario.mapId}:${cityId}`;
}

/** Every city id in the scenario, in faction order then city order. */
export function scenarioCityIds(scenario: Scenario): string[] {
  return scenario.factions.flatMap((f) => f.cities);
}

export const JINGZHOU_219: Scenario = {
  id: 'jingzhou-219',
  name: '荊州爭奪戰(建安二十四年)',
  blurb:
    '建安二十四年(219),關羽北伐襄樊前夕的荊州。曹操據宛、襄陽,扼守北疆;' +
    '劉備領江陵、夷陵、上庸,坐擁荊州西境與東三郡;孫權掌長沙、赤壁、鄂,' +
    '虎視荊州南境。三方僵持,一場大戰一觸即發。',
  mapId: 'three-kingdoms',
  recommendedEra: 'y219',
  factions: [
    {
      id: 'caocao',
      name: '曹操',
      color: '#4f6db3',
      cities: ['wan', 'xiangyang'],
      unitsPerCity: 1,
      resources: 60,
      income: 1,
    },
    {
      id: 'liubei',
      name: '劉備',
      color: '#7db35a',
      cities: ['jiangling', 'yiling', 'shangyong'],
      unitsPerCity: 1,
      resources: 60,
      income: 1,
    },
    {
      id: 'sun',
      name: '孫權',
      color: '#c2543f',
      cities: ['changsha', 'chibi', 'wuchang'],
      unitsPerCity: 1,
      resources: 60,
      income: 1,
    },
  ],
  siteDefaults: { captureRadius: 6, captureTime: 5, income: 2 },
  trainCost: 50,
  unitStats: { speed: 30, hp: 100, attackDamage: 10, attackRange: 8 },
  victoryText: '荊州八城盡歸麾下,三分之勢已破——大江上下,再無敵手。',
  defeatText: '城池盡失,麾下無兵——荊襄一夢,終究成空。',
};
