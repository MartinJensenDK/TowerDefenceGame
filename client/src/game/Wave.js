export function hpMultiplier(wave) {
  return 1 + 0.06 * (wave - 1);
}

export function waveBonus(wave) {
  return { gold: 20, score: 50 * wave };
}

/** Expands a wave definition into a sorted list of {at, type, path}. */
export function buildSchedule(waveDef) {
  const out = [];
  for (const s of waveDef.spawns) {
    const delay = s.delay ?? 0;
    const path = s.path ?? 0;
    for (let i = 0; i < s.count; i++) out.push({ at: delay + i * s.interval, type: s.type, path });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** One wave in flight: releases spawns as its clock advances. */
export class WaveRun {
  constructor(number, waveDef) {
    this.number = number;
    this.schedule = buildSchedule(waveDef);
    this.time = 0;
    this.index = 0;
    this.early = false;
  }

  get spawningDone() {
    return this.index >= this.schedule.length;
  }

  update(dt) {
    this.time += dt;
    const due = [];
    while (this.index < this.schedule.length && this.schedule[this.index].at <= this.time + 1e-9) {
      due.push(this.schedule[this.index]);
      this.index++;
    }
    return due;
  }
}

export const ENDLESS_MIX = [
  { type: 'scout', weight: 0.32, cost: 1, interval: 0.4 },
  { type: 'bat', weight: 0.13, cost: 2, interval: 0.7 },
  { type: 'archer', weight: 0.13, cost: 2, interval: 0.6 },
  { type: 'brute', weight: 0.12, cost: 3, interval: 1.0 },
  { type: 'knight', weight: 0.1, cost: 4, interval: 1.0 },
  { type: 'wolfrider', weight: 0.1, cost: 4, interval: 0.8 },
  { type: 'eaglerider', weight: 0.1, cost: 4, interval: 0.9 },
];

/** Endless bosses take turns: wave 60 gets a Boss Troll, 70 a Rhino Knight, 80 a Wolf Master, 90 a Boss Troll, … */
export const ENDLESS_BOSSES = ['boss', 'rhino', 'wolfpack'];

/** Generates wave n (> WAVE_COUNT) from a budget of 40 + 8n; a boss every 10th wave, the Troll King every 50th. */
export function generateEndlessWave(n, pathCount = 1, rng = Math.random) {
  let budget = 40 + 8 * n;
  const counts = Object.fromEntries(ENDLESS_MIX.map((m) => [m.type, 0]));
  while (budget > 0) {
    const r = rng();
    let acc = 0;
    let pick = ENDLESS_MIX[0];
    for (const m of ENDLESS_MIX) {
      acc += m.weight;
      if (r < acc) {
        pick = m;
        break;
      }
    }
    if (pick.cost > budget) pick = ENDLESS_MIX[0];
    counts[pick.type]++;
    budget -= pick.cost;
  }
  const spawns = [];
  let delay = 0;
  for (const m of ENDLESS_MIX) {
    const count = counts[m.type];
    if (count === 0) continue;
    spawns.push({ type: m.type, count, interval: m.interval, delay, path: spawns.length % pathCount });
    delay += 2;
  }
  if (n % 10 === 0) {
    const type = ENDLESS_BOSSES[(n / 10) % ENDLESS_BOSSES.length];
    spawns.push({ type, count: Math.max(1, Math.floor(n / 25) - 1), interval: 8, delay: 1, path: 0 });
  }
  if (n % 50 === 0) spawns.push({ type: 'giant', count: n / 50 - 1 || 1, interval: 20, delay: 3, path: 0 });
  return { spawns };
}
