// Up next and the next / previous scene.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.document = { createElement: () => ({ remove() {} }), body: { appendChild() {} } };
globalThis.window = { PluginApi: { React: {} } };
globalThis.location = { search: "?qfp=2&sortby=random_123&t=40&autoplay=true" };

const q = await import("../src/queue.js");

beforeEach(() => store.clear());

const queue = { scenes: [{ id: "10" }, { id: "11" }, { id: "12" }], hasMore: false };

test("up next comes first, without the current scene", () => {
  q.addToQueue(20);
  q.playNext(21);
  assert.deepEqual(q.getUpNext(), ["21", "20"]);
  assert.deepEqual(q.nextTarget(queue, "11", false), { kind: "upnext", id: "21" });
  assert.deepEqual(q.nextTarget(queue, "21", false), { kind: "upnext", id: "20" });
  q.moveInQueue("20", -1);
  assert.deepEqual(q.getUpNext(), ["20", "21"]);
  q.removeFromQueue("20");
  assert.deepEqual(q.getUpNext(), ["21"]);
});

test("then Stash's queue, more pages, repeat", () => {
  assert.deepEqual(q.nextTarget(queue, "10", false), { kind: "stash", id: "11" });
  assert.equal(q.nextTarget(queue, "12", false), null);
  assert.deepEqual(q.nextTarget(queue, "12", true), { kind: "stash", id: "10" });
  assert.deepEqual(q.nextTarget({ ...queue, hasMore: true }, "12", false), { kind: "stash-more" });
  assert.equal(q.nextTarget(null, "12", true), null);
  assert.deepEqual(q.prevTarget(queue, "11"), { kind: "stash", id: "10" });
  assert.equal(q.prevTarget(queue, "10"), null);
});

test("scene links keep the queue parameters", () => {
  assert.equal(q.sceneUrl(5), "/scenes/5?qfp=2&sortby=random_123");
  assert.equal(q.sceneUrl(5, { autoplay: true }), "/scenes/5?qfp=2&sortby=random_123&autoplay=true");
});

test("randomized next: stable pick, not the current scene, prefers unplayed", () => {
  const scenes = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }];
  const a = q.nextTarget({ scenes }, "2", false, true);
  assert.equal(a.kind, "random");
  assert.notEqual(a.id, "2");
  assert.deepEqual(q.nextTarget({ scenes }, "2", false, true), a); // the same pick until the scene changes
  assert.equal(q.pickRandom(scenes, "1", ["2", "3"], () => 0), "2"); // 3 was just played
  assert.equal(q.pickRandom(scenes, "1", ["2", "3"], () => 0.99), "4");
  assert.equal(q.pickRandom([{ id: "1" }], "1"), null);
  q.notePlayed("3");
  q.notePlayed("4");
  assert.deepEqual(q.prevTarget({ scenes }, "1", true), { kind: "random", id: "4" });
});

test("dropping in the queue panel", () => {
  assert.deepEqual(q.dropOrder(["a", "b"], "a", 2), ["b", "a"]); // to the end of up next
  assert.deepEqual(q.dropOrder(["a", "b"], "b", 0), ["b", "a"]);
  assert.deepEqual(q.dropOrder(["a", "b"], "s", 1), ["a", "s", "b"]); // a queue scene into up next
  assert.deepEqual(q.dropOrder(["a", "b"], "s", 3), ["a", "b"]); // a queue scene stays in the queue
  assert.deepEqual(q.dropOrder(["a", "b"], "a", 3), ["b"]); // back to the queue
});
