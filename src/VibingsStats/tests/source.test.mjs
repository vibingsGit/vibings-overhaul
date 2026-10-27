// Build and version rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("version is the same everywhere", () => {
  const yml = read("../settings.yml").match(/^version:\s*(\S+)/m)[1];
  const pkg = JSON.parse(read("../package.json")).version;
  const ui = read("../src/api.js").match(/export const VERSION = "([^"]+)"/)[1];
  assert.deepEqual({ pkg, ui }, { pkg: yml, ui: yml });
});

// stash-plugin-builder rewrites the source with String.replace, which turns
// "$" + backtick (and "$'" / "$&") into other text and breaks the bundle.
test("no replacement patterns that stash-plugin-builder corrupts", () => {
  const files = ["../src/", "../src/views/", "../../_shared/"].flatMap((dir) =>
    readdirSync(new URL(dir, import.meta.url)).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => dir + f));
  for (const f of files) assert.doesNotMatch(read(f), /\$[`'&]/, f);
});
