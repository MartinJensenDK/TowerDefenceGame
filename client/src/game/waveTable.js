/**
 * The 50-wave table every map is built from. Each row is a list of spawn groups
 * [type, count, interval, delay]; generateWaveTable() scales counts (walkers, riders
 * and flyers only, never bosses), divides intervals by `pace` and deals the groups
 * across the map's paths. Maps keep the expanded table in their JSON so a map can
 * still be hand-tuned afterwards (scripts/regenerate-waves.mjs rewrites them all).
 */
export const WAVE_COUNT = 50;

/** Enemy types that count as bosses: they never get multiplied by the map scale. */
export const BOSS_TYPES = ['boss', 'rhino', 'wolfpack', 'giant'];

/** The wave each enemy type first appears on (used by tests and the endless mix). */
export const FIRST_WAVE = {
  scout: 1, brute: 3, bat: 6, boss: 10,
  archer: 11, knight: 12, rhino: 20,
  wolfrider: 21, wolfpack: 30,
  eaglerider: 31, giant: 50,
};

// prettier-ignore
export const WAVE_ROWS = [
  /* 1 */ [['scout', 6, 1.0]],
  /* 2 */ [['scout', 10, 0.8]],
  /* 3 */ [['scout', 8, 0.8], ['brute', 2, 2.0, 4]],
  /* 4 */ [['scout', 12, 0.7]],
  /* 5 */ [['brute', 5, 1.5]],
  /* 6 */ [['scout', 10, 0.7], ['bat', 4, 1.0, 3]],
  /* 7 */ [['bat', 8, 0.9]],
  /* 8 */ [['brute', 6, 1.4], ['scout', 10, 0.6, 2]],
  /* 9 */ [['scout', 20, 0.5]],
  /* 10 */ [['boss', 1, 5.0], ['scout', 8, 0.6, 3]],
  /* 11 */ [['archer', 8, 0.8]],
  /* 12 */ [['scout', 12, 0.5], ['knight', 2, 2.5, 4]],
  /* 13 */ [['knight', 4, 2.0], ['archer', 6, 0.8, 3]],
  /* 14 */ [['bat', 10, 0.7], ['archer', 8, 0.7, 2]],
  /* 15 */ [['brute', 6, 1.3], ['knight', 4, 2.0, 3]],
  /* 16 */ [['archer', 14, 0.6]],
  /* 17 */ [['knight', 6, 1.6], ['scout', 16, 0.45, 2]],
  /* 18 */ [['bat', 12, 0.6], ['brute', 6, 1.2, 4]],
  /* 19 */ [['knight', 8, 1.4], ['archer', 10, 0.6, 3], ['bat', 6, 0.8, 8]],
  /* 20 */ [['rhino', 1, 5.0], ['knight', 6, 1.5, 4], ['scout', 12, 0.5, 8]],
  /* 21 */ [['wolfrider', 4, 1.5]],
  /* 22 */ [['archer', 12, 0.6], ['wolfrider', 4, 1.2, 5]],
  /* 23 */ [['knight', 8, 1.4], ['wolfrider', 6, 1.2, 4]],
  /* 24 */ [['bat', 14, 0.6], ['brute', 8, 1.1, 2]],
  /* 25 */ [['wolfrider', 10, 1.0]],
  /* 26 */ [['boss', 2, 6.0], ['scout', 20, 0.4, 3]],
  /* 27 */ [['knight', 10, 1.2], ['archer', 12, 0.6, 4]],
  /* 28 */ [['wolfrider', 8, 1.0], ['bat', 10, 0.7, 3]],
  /* 29 */ [['brute', 10, 1.0], ['knight', 8, 1.2, 3], ['wolfrider', 6, 1.0, 10]],
  /* 30 */ [['wolfpack', 1, 5.0], ['rhino', 1, 5.0, 12], ['wolfrider', 8, 1.0, 4]],
  /* 31 */ [['eaglerider', 5, 1.4]],
  /* 32 */ [['bat', 12, 0.6], ['eaglerider', 6, 1.2, 4]],
  /* 33 */ [['knight', 12, 1.1], ['eaglerider', 6, 1.2, 3]],
  /* 34 */ [['wolfrider', 12, 0.9], ['archer', 14, 0.5, 3]],
  /* 35 */ [['eaglerider', 10, 1.0], ['scout', 25, 0.35, 2]],
  /* 36 */ [['boss', 2, 6.0], ['knight', 10, 1.2, 3]],
  /* 37 */ [['brute', 12, 0.9], ['eaglerider', 8, 1.1, 4]],
  /* 38 */ [['archer', 20, 0.5], ['wolfrider', 10, 0.9, 6]],
  /* 39 */ [['knight', 14, 1.0], ['eaglerider', 10, 1.0, 5], ['bat', 12, 0.6, 10]],
  /* 40 */ [['rhino', 2, 20.0], ['wolfpack', 1, 5.0, 10], ['eaglerider', 8, 1.1, 4]],
  /* 41 */ [['wolfrider', 14, 0.8], ['eaglerider', 8, 1.0, 4]],
  /* 42 */ [['knight', 16, 0.9], ['archer', 16, 0.5, 3]],
  /* 43 */ [['boss', 3, 5.0], ['brute', 12, 0.9, 3]],
  /* 44 */ [['eaglerider', 14, 0.9], ['bat', 16, 0.5, 3]],
  /* 45 */ [['wolfpack', 2, 14.0], ['wolfrider', 12, 0.8, 4]],
  /* 46 */ [['scout', 40, 0.3], ['knight', 12, 1.0, 5]],
  /* 47 */ [['rhino', 2, 14.0], ['archer', 20, 0.5, 3], ['eaglerider', 10, 1.0, 8]],
  /* 48 */ [['knight', 20, 0.8], ['wolfrider', 14, 0.8, 6], ['bat', 14, 0.6, 12]],
  /* 49 */ [['rhino', 2, 12.0], ['wolfpack', 2, 12.0, 6], ['eaglerider', 12, 0.9, 4], ['brute', 12, 0.9, 10]],
  /* 50 */ [['giant', 1, 5.0], ['knight', 16, 1.0, 6], ['wolfrider', 12, 0.8, 14], ['eaglerider', 12, 0.9, 22], ['archer', 20, 0.5, 30]],
];

/**
 * Expands WAVE_ROWS into map JSON `waves`.
 * @param {{pathCount?: number, scale?: number, pace?: number}} opts
 *   scale multiplies non-boss counts (rounded up), pace divides intervals (2 = twice as fast),
 *   groups are dealt across paths round-robin so every road sees traffic.
 */
export function generateWaveTable({ pathCount = 1, scale = 1, pace = 1 } = {}) {
  return WAVE_ROWS.map((row, wi) => ({
    spawns: row.map(([type, count, interval, delay = 0], gi) => {
      const boss = BOSS_TYPES.includes(type);
      const spawn = {
        type,
        count: boss ? count : Math.ceil(count * scale),
        interval: round2(boss ? interval : interval / pace),
      };
      if (delay > 0) spawn.delay = delay;
      if (pathCount > 1) spawn.path = (wi + gi) % pathCount;
      return spawn;
    }),
  }));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
