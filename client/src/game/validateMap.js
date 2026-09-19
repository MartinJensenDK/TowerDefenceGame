const TILE_CHARS = '.RWD';
const REQUIRED = ['id', 'name', 'theme', 'width', 'height', 'tiles', 'paths', 'base', 'waves', 'startGold'];

/**
 * Validates a map definition. Throws a descriptive Error on the first problem.
 * @param {object} map
 * @param {Record<string, object>} enemyDefs
 * @returns {true}
 */
export function validateMap(map, enemyDefs) {
  const fail = (msg) => {
    throw new Error(`Map "${map?.id ?? '?'}": ${msg}`);
  };
  if (!map || typeof map !== 'object') fail('not an object');
  for (const k of REQUIRED) if (!(k in map)) fail(`missing field ${k}`);

  if (!Array.isArray(map.tiles) || map.tiles.length !== map.height) fail(`tiles must have ${map.height} rows`);
  map.tiles.forEach((row, y) => {
    if (typeof row !== 'string' || row.length !== map.width) fail(`row ${y} must have ${map.width} chars`);
    for (const c of row) if (!TILE_CHARS.includes(c)) fail(`row ${y} has invalid tile '${c}'`);
  });

  const tile = (x, y) => map.tiles[y]?.[x];
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;

  const [bx, by] = map.base;
  if (!inBounds(bx, by) || tile(bx, by) !== 'R') fail('base must be on a road tile');

  if (!Array.isArray(map.paths) || map.paths.length === 0) fail('at least one path required');
  map.paths.forEach((path, i) => {
    if (!Array.isArray(path) || path.length < 2) fail(`path ${i} needs at least 2 waypoints`);
    const [sx, sy] = path[0];
    const onEdge = sx === 0 || sy === 0 || sx === map.width - 1 || sy === map.height - 1;
    if (!onEdge) fail(`path ${i} must start on a map edge`);
    const [ex, ey] = path[path.length - 1];
    if (ex !== bx || ey !== by) fail(`path ${i} must end at base`);
    for (let w = 0; w < path.length - 1; w++) {
      const [x0, y0] = path[w];
      const [x1, y1] = path[w + 1];
      if (x0 !== x1 && y0 !== y1) fail(`path ${i} segment ${w} is not axis-aligned`);
      const dx = Math.sign(x1 - x0);
      const dy = Math.sign(y1 - y0);
      let x = x0;
      let y = y0;
      for (;;) {
        if (!inBounds(x, y)) fail(`path ${i} leaves the map at ${x},${y}`);
        if (tile(x, y) !== 'R') fail(`path ${i} crosses non-road tile at ${x},${y}`);
        if (x === x1 && y === y1) break;
        x += dx;
        y += dy;
      }
    }
  });

  if (!Array.isArray(map.waves) || map.waves.length !== 20) fail('exactly 20 waves required');
  map.waves.forEach((wave, i) => {
    if (!Array.isArray(wave.spawns) || wave.spawns.length === 0) fail(`wave ${i + 1} has no spawns`);
    for (const s of wave.spawns) {
      if (!enemyDefs[s.type]) fail(`wave ${i + 1} uses unknown enemy '${s.type}'`);
      if (!Number.isInteger(s.count) || s.count < 1) fail(`wave ${i + 1} has invalid count`);
      if (!(s.interval > 0)) fail(`wave ${i + 1} has invalid interval`);
      const p = s.path ?? 0;
      if (!map.paths[p]) fail(`wave ${i + 1} uses unknown path ${p}`);
    }
  });

  if (!(map.startGold >= 0)) fail('startGold must be a non-negative number');
  return true;
}
