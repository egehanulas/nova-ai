const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "public", "sim.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "public", "sim.js"), "utf8");

test("NOVA Sim Alpha 7 page loads its versioned physics script and canvas", () => {
  assert.match(html, /<canvas[^>]+id="world"/);
  assert.match(html, /src="\/sim\.js\?v=alpha7-universe"/);
  assert.match(html, /Fizik Laboratuvarı · Alpha 7/);
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

test("Alpha 7 exposes circle, box and triangle shape selectors", () => {
  for (const id of ["spawnCircle", "spawnBox", "spawnTriangle", "shapeState"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(script, /currentShape = "circle"/);
  assert.match(script, /shape: currentShape/);
  assert.match(script, /b\.shape === "box"/);
  assert.match(script, /b\.shape === "triangle"/);
});

test("Alpha 7 exposes mass and friction material controls", () => {
  for (const id of ["mass", "massValue", "friction", "frictionValue"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(script, /massInput\.addEventListener\("input"/);
  assert.match(script, /frictionInput\.addEventListener\("input"/);
  assert.match(script, /mass, friction,/);
  assert.match(script, /mass, friction,/);
});

test("Alpha 7 uses polygon SAT manifolds and mass-weighted collision response", () => {
  assert.match(script, /function vertices\(/);
  assert.match(script, /function project\(/);
  assert.match(script, /function collisionManifold\(/);
  assert.match(script, /const invA = 1 \/ Math\.max\(\.05, a\.mass\)/);
  assert.match(script, /const restitution = bounce/);
  assert.match(script, /Math\.sqrt\(Math\.max\(0, a\.friction \* b\.friction\)\)/);
});

test("Alpha 7 exposes custom gravity direction, speed cap, force fields and presets", () => {
  for (const id of ["gravityAngle","gravityAngleValue","maxSpeed","maxSpeedValue","addAttract","addRepel","clearFields","savePreset","loadPreset","presetState"]) assert.ok(html.includes(`id="${id}"`));
  assert.ok(script.includes("gravityAngleInput"));
  assert.ok(script.includes("for (const field of fields)"));
  assert.ok(script.includes("maxSpeed > 0 && velocity > maxSpeed"));
  assert.ok(script.includes("nova-sim-alpha5-preset"));
  assert.ok(script.includes("data.version !== 1"));
});

test("Alpha 7 adapts physics substeps to object speed and prevents duplicate spin impulse", () => {
  assert.match(script, /const fastest = balls\.reduce/);
  assert.match(script, /const safeTravel = Number\.isFinite\(smallest\)/);
  assert.match(script, /Math\.ceil\(\(fastest \* dt\) \/ safeTravel\)/);
  assert.match(script, /clamp\(Math\.ceil\(\(fastest \* dt\) \/ safeTravel\), 1, 24\)/);
  assert.match(script, /const wallFriction = clamp\(b\.friction \* \.12, 0, \.12\)/);
  assert.equal((script.match(/a\.angularVelocity -= jt \* a\.r \* invA \* \.025/g) || []).length, 1);
  assert.equal((script.match(/b\.angularVelocity \+= jt \* b\.r \* invB \* \.025/g) || []).length, 1);
});

\ntest("Alpha 7 adds selected-object merge and split universe tools", () => {
  for (const id of ["mergeSelected", "splitSelected", "universeState", "fieldStrength", "fieldRadius"]) assert.ok(html.includes('id="' + id + '"'));
  assert.match(script, /function mergeSelected\(/);
  assert.match(script, /function splitSelected\(/);
  assert.match(script, /totalMass = a\.mass \+ b\.mass/);
  assert.match(script, /childMass = Math\.max\(\.1, body\.mass \/ 2\)/);
  assert.match(script, /localStorage\.setItem\("nova-sim-alpha7-preset"/);
  assert.match(script, /\[1, 2\]\.includes\(data\.version\)/);
});
