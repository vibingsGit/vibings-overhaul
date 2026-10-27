// The version lives in settings.yml (what Stash shows), package.json, the UI
// (api.js) and the backend; status checks compare them, so they must agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("version is the same everywhere", () => {
  const yml = read("../settings.yml").match(/^version:\s*(\S+)/m)[1];
  const pkg = JSON.parse(read("../package.json")).version;
  const ui = read("../src/api.js").match(/export const VERSION = "([^"]+)"/)[1];
  const backend = read("../backend/vibings_battles.py").match(/^VERSION = "([^"]+)"/m)[1];
  assert.deepEqual({ pkg, ui, backend }, { pkg: yml, ui: yml, backend: yml });
});
