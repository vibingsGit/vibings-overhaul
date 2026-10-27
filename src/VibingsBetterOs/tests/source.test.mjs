// Build and version rules, and the pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("version is the same everywhere", () => {
  const yml = read("../settings.yml").match(/^version:\s*(\S+)/m)[1];
  const pkg = JSON.parse(read("../package.json")).version;
  const ui = read("../src/api.js").match(/export const VERSION = "([^"]+)"/)[1];
  const backend = read("../backend/vibings_better_os.py").match(/^VERSION = "([^"]+)"/m)[1];
  assert.deepEqual({ pkg, ui, backend }, { pkg: yml, ui: yml, backend: yml });
});

// stash-plugin-builder rewrites the source with String.replace, which turns
// "$" + backtick (and "$'" / "$&") into other text and breaks the bundle.
test("no replacement patterns that stash-plugin-builder corrupts", () => {
  const files = ["../src/", "../../_shared/"].flatMap((dir) =>
    readdirSync(new URL(dir, import.meta.url)).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => dir + f));
  for (const f of files) assert.doesNotMatch(read(f), /\$[`'&]/, f);
});

test("time helpers", async () => {
  globalThis.window = { PluginApi: {} };
  const { normTs, newestTs, fmtPos, parsePos } = await import("../src/api.js");
  assert.equal(normTs("2026-10-24T13:10:10.900+03:00"), "2026-10-24T10:10:10Z");
  assert.equal(normTs("nope"), null);
  assert.equal(newestTs(["2026-10-24T10:10:10Z", "2026-10-25T00:00:00Z", "2026-01-01T00:00:00Z"]), "2026-10-25T00:00:00Z");
  assert.equal(fmtPos(65.9), "1:05");
  assert.equal(fmtPos(3723), "1:02:03");
  assert.equal(parsePos("1:05"), 65);
  assert.equal(parsePos("1:02:03"), 3723);
  assert.equal(parsePos("90"), 90);
  assert.equal(parsePos("1:xx"), null);
  assert.equal(parsePos(""), null);
});
