#!/usr/bin/env node
/**
 * Rewrites the `waves` field of every shipped map from the shared 50-wave table
 * (client/src/game/waveTable.js) using each map's profile below. Run after tuning
 * the table: `node scripts/regenerate-waves.mjs`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWaveTable } from '../client/src/game/waveTable.js';

/** Per-map wave profile: pace speeds the spawns up, scale adds more of each walker/rider/flyer. */
export const MAP_WAVE_PROFILES = {
  green: { scale: 1, pace: 1 },
  snow: { scale: 1.15, pace: 1 },
  desert: { scale: 1, pace: 1.25 },
  water: { scale: 1, pace: 1 },
  vast: { scale: 1.5, pace: 1 },
  dunes: { scale: 1.5, pace: 1 },
};

const mapsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/src/data/maps');

for (const [id, profile] of Object.entries(MAP_WAVE_PROFILES)) {
  const file = path.join(mapsDir, `${id}.json`);
  const text = readFileSync(file, 'utf8');
  const map = JSON.parse(text);
  map.waves = generateWaveTable({ pathCount: map.paths.length, ...profile });
  // generated 100x100 maps are stored with 1-space indent; hand-written maps keep their compact
  // layout and only the waves block (one wave per line) is replaced
  let out;
  if (map.width >= 100) out = JSON.stringify(map, null, 1);
  else {
    const waves = map.waves.map((w) => '    ' + JSON.stringify(w).replace(/([{,:])/g, '$1 ').replace(/([}\]])/g, ' $1'));
    const head = text.slice(0, text.indexOf('"waves": ['));
    out = `${head}"waves": [\n${waves.join(',\n')}\n  ]\n}`;
  }
  writeFileSync(file, out + '\n');
  console.log(`${id}: ${map.waves.length} waves (${map.paths.length} path(s), scale ${profile.scale}, pace ${profile.pace})`);
}
