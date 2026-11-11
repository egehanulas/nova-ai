"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "public");
const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const script = fs.readFileSync(path.join(publicDir, "companion.js"), "utf8");
const styles = fs.readFileSync(path.join(publicDir, "companion.css"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

test("Companion replaces the NOVA Sim entry in the main application", () => {
  assert.match(html, /id="openCompanion"/);
  assert.match(html, /id="companionView"/);
  assert.match(html, /src="\/companion\.js/);
  assert.doesNotMatch(html, /id="novaSimView"|id="novaSimFrame"|src="\/nova-sim-tab\.js/);
});

test("Companion prompts continue through the real NOVA chat function", () => {
  for (const state of ["idle", "listening", "thinking", "speaking", "working", "success", "error"]) {
    assert.ok(script.includes(`${state}:`), `missing ${state} state`);
  }
  assert.match(script, /window\.NOVA\.sendMessage\(prompt\)/);
  assert.match(script, /nova:companion-state/);
});

test("Companion layout supports narrow screens and reduced motion", () => {
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("simulation source is retained while the main application no longer loads it", () => {
  for (const file of ["sim.html", "sim.js", "sim3d.js"]) {
    assert.ok(fs.existsSync(path.join(publicDir, file)), `${file} should remain available for recovery`);
  }
  assert.match(server, /app\.use\(\["\/sim\.html", "\/sim\.js", "\/sim3d\.js"\]/);
});
