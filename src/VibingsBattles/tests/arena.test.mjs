// Unit tests for src/arena.js. Run: node --test 'tests/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateArena, seededRandom, arenaDeltas, fighterPower, MAX_HP, ordinal } from "../src/arena.js";

const lineup = (...elos) => elos.map((elo, i) => ({ id: String(i), elo }));

test("every fighter is ranked exactly once and the fight ends", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const sim = simulateArena(lineup(1500, 1520, 1480, 1600, 1400, 1550), { rng: seededRandom(seed) });
    assert.deepEqual([...sim.ranking].sort(), [0, 1, 2, 3, 4, 5]);
    const last = sim.events[sim.events.length - 1];
    assert.deepEqual(last, { type: "win", id: sim.ranking[0] });
    assert.equal(sim.events.filter((e) => e.type === "ko").length, 5);
    assert.equal(sim.kills.reduce((a, b) => a + b, 0), 5);
    assert.equal(sim.hp.length, sim.events.length);
    const finalHp = sim.hp[sim.hp.length - 1];
    assert.ok(finalHp[sim.ranking[0]] > 0 && finalHp[sim.ranking[0]] <= MAX_HP);
    sim.ranking.slice(1).forEach((i) => assert.equal(finalHp[i], 0));
  }
});

test("the same seed gives the same fight", () => {
  const a = simulateArena(lineup(1500, 1600, 1400), { rng: seededRandom(7) });
  const b = simulateArena(lineup(1500, 1600, 1400), { rng: seededRandom(7) });
  assert.deepEqual(a, b);
});

test("ko places count down from last", () => {
  const sim = simulateArena(lineup(1500, 1500, 1500, 1500), { rng: seededRandom(3) });
  assert.deepEqual(sim.events.filter((e) => e.type === "ko").map((e) => e.place), [4, 3, 2]);
});

test("Elo influence makes strong fighters win more", () => {
  const wins = (influence) => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const sim = simulateArena(lineup(1900, 1500, 1500, 1500), { eloInfluence: influence, rng: seededRandom(seed) });
      if (sim.ranking[0] === 0) n++;
    }
    return n / 300;
  };
  const none = wins(0);
  const full = wins(100);
  assert.ok(none > 0.12 && none < 0.4, `no influence: ${none}`);
  assert.ok(full > 0.6, `full influence: ${full}`);
});

test("power and deltas", () => {
  assert.equal(fighterPower(1500, 1500, 100), 1);
  assert.ok(Math.abs(fighterPower(1900, 1500, 100) - Math.sqrt(10)) < 1e-9);
  assert.equal(fighterPower(1900, 1500, 0), 1);
  assert.deepEqual(arenaDeltas(5, 20, 10), [20, -2.5, -5, -7.5, -10]);
  assert.deepEqual(arenaDeltas(2, 20, 10), [20, -10]);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
});
