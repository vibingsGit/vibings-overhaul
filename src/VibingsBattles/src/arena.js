// Arena: an automatic free-for-all between performers.
//
// Pure functions (no Stash or DOM access) so they can be unit tested with
// `node --test`. The whole fight is simulated up front; the UI only plays
// the events back, so skipping to the end gives the same result.
//
// Every fighter starts with MAX_HP. Each turn a random living fighter
// attacks: usually a random opponent, sometimes the weakest one. Damage is
// scaled by the attacker's power, which grows with its Elo relative to the
// lineup's average: power = 10^((elo - mean) / 800 * influence). With full
// influence a fighter 400 Elo above average hits about 3x as hard; with no
// influence everyone is equal and luck decides.

export const MAX_HP = 100;
const MISS_CHANCE = 0.08;
const CRIT_CHANCE = 0.12;
const FINISHER_CHANCE = 0.35; // chance to go for the weakest opponent
const DAMAGE_MIN = 8;
const DAMAGE_RANGE = 14;

/** Deterministic PRNG (mulberry32). */
export function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fighterPower(elo, meanElo, influencePct) {
  return Math.pow(10, ((elo - meanElo) / 800) * (influencePct / 100));
}

/** Elo change per placement, winner first (same formula as the backend). */
export function arenaDeltas(n, winBonus, lossPenalty) {
  return Array.from({ length: n }, (_, place) =>
    place === 0 ? winBonus : Math.round((-lossPenalty * place / (n - 1)) * 100) / 100
  );
}

/**
 * fighters: [{ id, elo }]. Returns
 * {
 *   events: [{ type: "hit", from, to, dmg, crit } | { type: "miss", from, to }
 *            | { type: "ko", from, to, place } | { type: "win", id }],  (fighter indexes)
 *   hp: [[hp per fighter] after each event],
 *   ranking: [fighter index, winner first], kills: [per fighter], power: [per fighter]
 * }
 */
export function simulateArena(fighters, { eloInfluence = 50, rng = Math.random } = {}) {
  const n = fighters.length;
  if (n < 2) throw new Error("an arena needs at least two fighters");
  const mean = fighters.reduce((sum, f) => sum + f.elo, 0) / n;
  const power = fighters.map((f) => fighterPower(f.elo, mean, eloInfluence));
  const hp = fighters.map(() => MAX_HP);
  const kills = fighters.map(() => 0);
  const alive = fighters.map((_, i) => i);
  const knockedOut = [];
  const events = [];
  const frames = [];
  const push = (ev) => { events.push(ev); frames.push([...hp]); };

  for (let guard = 0; alive.length > 1 && guard < 10000; guard++) {
    const from = alive[Math.floor(rng() * alive.length)];
    const others = alive.filter((i) => i !== from);
    const to = rng() < FINISHER_CHANCE
      ? others.reduce((w, i) => (hp[i] < hp[w] ? i : w), others[0])
      : others[Math.floor(rng() * others.length)];
    if (rng() < MISS_CHANCE) {
      push({ type: "miss", from, to });
      continue;
    }
    const crit = rng() < CRIT_CHANCE;
    const dmg = Math.max(1, Math.round((DAMAGE_MIN + rng() * DAMAGE_RANGE) * power[from] * (crit ? 2 : 1)));
    hp[to] = Math.max(0, hp[to] - dmg);
    push({ type: "hit", from, to, dmg, crit });
    if (hp[to] === 0) {
      kills[from] += 1;
      alive.splice(alive.indexOf(to), 1);
      knockedOut.push(to);
      push({ type: "ko", from, to, place: n - knockedOut.length + 1 });
    }
  }
  push({ type: "win", id: alive[0] });
  return { events, hp: frames, ranking: [alive[0], ...knockedOut.reverse()], kills, power };
}

/** Text for the fight feed. `name(i)` gives a fighter's name. */
export function describeArenaEvent(ev, name) {
  switch (ev.type) {
    case "hit": return `${ev.crit ? "Critical! " : ""}${name(ev.from)} hits ${name(ev.to)} for ${ev.dmg}`;
    case "miss": return `${name(ev.to)} dodges ${name(ev.from)}`;
    case "ko": return `${name(ev.from)} knocks out ${name(ev.to)} (#${ev.place})`;
    case "win": return `${name(ev.id)} wins the arena!`;
    default: return "";
  }
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
