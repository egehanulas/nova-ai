const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "public", "sim.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "public", "sim.js"), "utf8");

test("NOVA Sim Alpha 3 page loads its versioned physics script and canvas", () => {
  assert.match(html, /<canvas[^>]+id="world"/);
  assert.match(html, /src="\/sim\.js\?v=alpha3-shapes"/);
  assert.match(html, /Fizik Laboratuvarı · Alpha 3/);
  assert.match(html, /href="\/"[^>]*>← NOVA AI'ye dön/);
});

test("physics lab exposes all simulation controls", () => {
  for (const id of ["gravity", "bounce", "speed", "addBall", "pause", "reset", "burst", "ballCount", "fps"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.match(script, new RegExp('\\$\\("' + id + '"\\)'));
  }
});

test("simulation keeps ball count bounded and runs gravity, collisions and animation", () => {
  assert.match(script, /MAX_BALLS\s*=\s*100/);
  assert.match(script, /function collide\(/);
  assert.match(script, /function resolveWalls\(/);
  assert.match(script, /requestAnimationFrame\(frame\)/);
});

test("balls can be grabbed, dragged, released and launched with pointer velocity", () => {
  assert.match(html, /touch-action:none/);
  assert.match(script, /canvas\.setPointerCapture\(pointerId\)/);
  assert.match(script, /canvas\.addEventListener\("pointermove"/);
  assert.match(script, /canvas\.addEventListener\("pointerup", finishDrag\)/);
  assert.match(script, /draggedBall\.vx = dragVX/);
  assert.match(script, /draggedBall\.vy = dragVY/);
  assert.match(script, /if \(b === draggedBall\) continue/);
});

test("Alpha 3 exposes circle, box and triangle shape selectors", () => {
  for (const id of ["spawnCircle", "spawnBox", "spawnTriangle", "shapeState"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(script, /currentShape = "circle"/);
  assert.match(script, /shape: currentShape/);
  assert.match(script, /b\.shape === "box"/);
  assert.match(script, /b\.shape === "triangle"/);
});
