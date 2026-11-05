const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "public", "sim.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "public", "sim.js"), "utf8");

test("NOVA Sim page loads its isolated physics script and canvas", () => {
  assert.match(html, /<canvas[^>]+id="world"/);
  assert.match(html, /src="\/sim\.js\?v=alpha1"/);
  assert.match(html, /href="\/"[^>]*>← NOVA AI'ye dön/);
});

test("physics lab exposes the expected interactive controls", () => {
  for (const id of ["gravity", "bounce", "speed", "addBall", "pause", "reset", "burst", "ballCount", "fps"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.match(script, new RegExp('\\$\\("' + id + '"\\)'));
  }
});

test("simulation includes bounded ball count, gravity, collision and animation loop", () => {
  assert.match(script, /MAX_BALLS\s*=\s*100/);
  assert.match(script, /function collide\(/);
  assert.match(script, /function resolveWalls\(/);
  assert.match(script, /requestAnimationFrame\(frame\)/);
});
