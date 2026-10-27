// Weighted pair selection for Vibings Battles.
//
// Pure functions (no Stash or DOM access) so they can be unit tested with
// `node --test`. The UI supplies:
//   ranked  - items the backend knows: [{ id, rating, battles }]
//   sample  - ids from a fresh random Stash sample (brings in new items)
//   options - tuning + session memory (recent pairs/items, missing ids)
//
// Strategy:
//   1. Anchor A: under-battled items are favoured. Unranked items from the
//      sample compete with ranked items through `newItemWeight`.
//   2. Opponent B: weighted by rating closeness to A (close matches refine
//      the order fastest) times the same under-battled preference.
//   Recently shown pairs are excluded and recently shown items damped, so
//   the same item does not appear over and over.
//   Filters: `deny` ids never battle; a non-null `allow` set is the only
//   pool. `conflicts(a, b)` rejects pairs (e.g. a shared performer).

export const DEFAULT_PAIRING = {
  initialRating: 1500,
  // Gaussian width of the closeness weight, in Elo points.
  closeness: 150,
  // How strongly a few-battle item is preferred: weight = 1 / (1 + battles)^exp.
  battlesExponent: 1,
  // Relative weight of an unranked item compared to a 0-battle ranked item.
  newItemWeight: 1,
  // Multiplier for items shown in the last few pairs.
  recentItemDamping: 0.15,
};

export function pairKey(a, b) {
  return [String(a), String(b)].sort().join(":");
}

function weightedPick(entries, rng) {
  let total = 0;
  for (const e of entries) total += e.weight;
  if (!(total > 0)) return null;
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

/**
 * Build the candidate list: ranked items plus unranked sample ids.
 * Ids in `missing` (deleted from Stash) or `deny` are dropped; with an
 * `allow` set only those ids are kept.
 */
export function buildCandidates(ranked, sample, initialRating, missing = new Set(), { allow = null, deny = null } = {}) {
  const byId = new Map();
  const usable = (id) => !missing.has(id) && !deny?.has(id) && (!allow || allow.has(id));
  for (const it of ranked) {
    const id = String(it.id);
    if (!usable(id)) continue;
    byId.set(id, { id, rating: it.rating, battles: it.battles || 0, ranked: true });
  }
  for (const raw of sample) {
    const id = String(raw);
    if (!usable(id) || byId.has(id)) continue;
    byId.set(id, { id, rating: initialRating, battles: 0, ranked: false });
  }
  return [...byId.values()];
}

/**
 * Pick two candidate ids. Returns [idA, idB] or null when fewer than two
 * usable candidates exist.
 */
export function pickPair(ranked, sample, options = {}, rng = Math.random) {
  const o = { ...DEFAULT_PAIRING, ...options };
  const recentPairs = o.recentPairs || new Set();
  const recentItems = o.recentItems || new Set();
  const candidates = buildCandidates(ranked, sample, o.initialRating, o.missing, { allow: o.allow, deny: o.deny });
  if (candidates.length < 2) return null;

  const baseWeight = (c) => {
    let w = 1 / Math.pow(1 + c.battles, o.battlesExponent);
    if (!c.ranked) w *= o.newItemWeight;
    if (recentItems.has(c.id)) w *= o.recentItemDamping;
    return w;
  };

  const anchors = candidates.map((c) => ({ c, weight: baseWeight(c) }));
  // A few attempts in case an anchor has no fresh opponent left.
  for (let attempt = 0; attempt < 5; attempt++) {
    const a = weightedPick(anchors, rng);
    if (!a) return null;
    const opponents = [];
    for (const c of candidates) {
      if (c.id === a.c.id || recentPairs.has(pairKey(a.c.id, c.id))) continue;
      if (o.conflicts?.(a.c.id, c.id)) continue;
      const diff = (c.rating - a.c.rating) / o.closeness;
      opponents.push({ c, weight: baseWeight(c) * Math.exp(-diff * diff) + 1e-9 });
    }
    const b = weightedPick(opponents, rng);
    if (b) return rng() < 0.5 ? [a.c.id, b.c.id] : [b.c.id, a.c.id];
    a.weight = 0; // this anchor is exhausted
  }
  return null;
}

/** Keep a bounded most-recent-first memory of shown pairs and items. */
export function rememberPair(memory, idA, idB, { pairs = 30, items = 4 } = {}) {
  const pairList = [pairKey(idA, idB), ...memory.pairList.filter((k) => k !== pairKey(idA, idB))].slice(0, pairs);
  const itemList = [String(idA), String(idB), ...memory.itemList.filter((i) => i !== String(idA) && i !== String(idB))].slice(0, items);
  return { pairList, itemList, recentPairs: new Set(pairList), recentItems: new Set(itemList) };
}

export function emptyMemory() {
  return { pairList: [], itemList: [], recentPairs: new Set(), recentItems: new Set() };
}
