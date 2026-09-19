/** A tiny valid map for unit tests: straight road along row 1 from x=0 to x=5. */
export function makeTestMap(overrides = {}) {
  return {
    id: 'test',
    name: 'Test Map',
    theme: 'green',
    width: 6,
    height: 3,
    tiles: ['......', 'RRRRRR', '......'],
    paths: [[[0, 1], [5, 1]]],
    base: [5, 1],
    waves: Array.from({ length: 20 }, () => ({
      spawns: [{ type: 'scout', count: 1, interval: 1 }],
    })),
    startGold: 500,
    modifiers: { frostBonus: 1 },
    ...overrides,
  };
}
