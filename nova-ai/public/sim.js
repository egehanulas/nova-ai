(() => {
  "use strict";
  const canvas = document.getElementById("world");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  const $ = (id) => document.getElementById(id);
  const gravityInput = $("gravity"), bounceInput = $("bounce"), speedInput = $("speed");
  const balls = [];
  const MAX_BALLS = 100;
  let width = 0, height = 0, running = true, lastTime = 0, fpsFrames = 0, fpsTime = 0, fps = 0;
  let gravity = Number(gravityInput.value), bounce = Number(bounceInput.value), timeScale = Number(speedInput.value), mass = 1, friction = 0.18;
  let currentShape = "circle";
  let draggedBall = null, dragOffsetX = 0, dragOffsetY = 0, pointerId = null, dragVX = 0, dragVY = 0, previousPointerTime = 0;
  const colors = ["#9b83ff", "#6edbd0", "#ffb86b", "#ff7eaa", "#83b7ff"];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const b of balls) { b.x = clamp(b.x, b.r, Math.max(b.r, width - b.r)); b.y = clamp(b.y, b.r, Math.max(b.r, height - b.r)); }
    draw();
  }

  function addBall(x = width * (.25 + Math.random() * .5), y = Math.max(35, height * .15), vx = (Math.random() - .5) * 260, vy = (Math.random() - .5) * 100) {
    if (balls.length >= MAX_BALLS) balls.shift();
    const r = 9 + Math.random() * 13;
    const ball = { x: clamp(x, r, Math.max(r, width - r)), y: clamp(y, r, Math.max(r, height - r)), vx, vy, r, shape: currentShape, angle: Math.random() * Math.PI * 2, angularVelocity: 0, mass, friction, color: colors[Math.floor(Math.random() * colors.length)] };
    balls.push(ball);
    $("ballCount").textContent = String(balls.length);
    return ball;
  }

  function resolveWalls(b) {
    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * bounce; }
    if (b.x + b.r > width) { b.x = width - b.r; b.vx = -Math.abs(b.vx) * bounce; }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * bounce; }
    if (b.y + b.r > height) {
      b.y = height - b.r;
      if (Math.abs(b.vy) < 22) b.vy = 0;
      else b.vy = -Math.abs(b.vy) * bounce;
      b.vx *= .985;
    }
  }

  function vertices(body) {
    const count = body.shape === "triangle" ? 3 : body.shape === "box" ? 4 : 20;
    const points = [];
    for (let i = 0; i < count; i++) {
      const angle = body.angle + (body.shape === "triangle" ? -Math.PI / 2 + i * Math.PI * 2 / 3 : body.shape === "box" ? Math.PI / 4 + i * Math.PI / 2 : i * Math.PI * 2 / count);
      const radius = body.shape === "box" ? body.r * Math.SQRT2 * .82 : body.r;
      points.push({ x: body.x + Math.cos(angle) * radius, y: body.y + Math.sin(angle) * radius });
    }
    return points;
  }

  function project(points, axis) {
    let min = Infinity, max = -Infinity;
    for (const p of points) { const value = p.x * axis.x + p.y * axis.y; min = Math.min(min, value); max = Math.max(max, value); }
    return { min, max };
  }

  function collisionManifold(a, b) {
    const ap = vertices(a), bp = vertices(b);
    let smallest = Infinity, normal = null;
    for (const polygon of [ap, bp]) {
      for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length];
        const edgeX = p2.x - p1.x, edgeY = p2.y - p1.y, length = Math.hypot(edgeX, edgeY) || 1;
        const axis = { x: -edgeY / length, y: edgeX / length };
        const pa = project(ap, axis), pb = project(bp, axis);
        const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
        if (overlap <= 0) return null;
        if (overlap < smallest) { smallest = overlap; normal = axis; }
      }
    }
    if ((b.x - a.x) * normal.x + (b.y - a.y) * normal.y < 0) normal = { x: -normal.x, y: -normal.y };
    return { normal, depth: smallest };
  }

  function collide() {
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      if (a === draggedBall || b === draggedBall) continue;
      const manifold = collisionManifold(a, b);
      if (!manifold) continue;
      const { normal, depth } = manifold;
      const invA = 1 / Math.max(.05, a.mass), invB = 1 / Math.max(.05, b.mass), invTotal = invA + invB;
      const correction = Math.max(0, depth - .01) * .78 / invTotal;
      a.x -= normal.x * correction * invA; a.y -= normal.y * correction * invA;
      b.x += normal.x * correction * invB; b.y += normal.y * correction * invB;
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy, alongNormal = rvx * normal.x + rvy * normal.y;
      if (alongNormal >= 0) continue;
      const restitution = bounce;
      const impulse = -(1 + restitution) * alongNormal / invTotal;
      const ix = impulse * normal.x, iy = impulse * normal.y;
      a.vx -= ix * invA; a.vy -= iy * invA; b.vx += ix * invB; b.vy += iy * invB;
      const tangentX0 = rvx - alongNormal * normal.x, tangentY0 = rvy - alongNormal * normal.y;
      const tangentLength = Math.hypot(tangentX0, tangentY0);
      if (tangentLength > 1e-6) {
        const tx = tangentX0 / tangentLength, ty = tangentY0 / tangentLength;
        let jt = -(rvx * tx + rvy * ty) / invTotal;
        const mu = Math.sqrt(Math.max(0, a.friction * b.friction));
        jt = clamp(jt, -impulse * mu, impulse * mu);
        a.vx -= jt * tx * invA; a.vy -= jt * ty * invA;
        b.vx += jt * tx * invB; b.vy += jt * ty * invB;
        a.angularVelocity -= jt * a.r * invA * .025;
        b.angularVelocity -= jt * b.r * invB * .025;
      }
    }
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#0d1222"); bg.addColorStop(1, "#101329");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(160,170,220,.07)"; ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    for (const b of balls) {
      ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = b === draggedBall ? 26 : 16;
      const g = ctx.createRadialGradient(b.x - b.r * .35, b.y - b.r * .4, 1, b.x, b.y, b.r * 1.2);
      g.addColorStop(0, "#ffffff"); g.addColorStop(.2, b.color); g.addColorStop(1, b.color + "88");
      ctx.fillStyle = g; ctx.beginPath();
      if (b.shape === "box" || b.shape === "triangle") {
        const points = vertices(b); ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.closePath();
      } else ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      if (b === draggedBall) { ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    if (!balls.length) {
      ctx.fillStyle = "rgba(220,225,255,.6)"; ctx.textAlign = "center";
      ctx.font = "600 15px Inter, sans-serif"; ctx.fillText("Bir top ekle ve deneye başla", width / 2, height / 2);
      ctx.font = "12px Inter, sans-serif"; ctx.fillStyle = "rgba(170,180,215,.55)";
      ctx.fillText("Bu alana tıklayabilirsin", width / 2, height / 2 + 25);
    }
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function frame(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, .04) * timeScale;
    lastTime = now;
    if (running) {
      const steps = 2, step = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const b of balls) {
          if (b === draggedBall) continue;
          b.vy += gravity * 48 * step;
          b.x += b.vx * step; b.y += b.vy * step;
          b.angle += b.angularVelocity * step;
          b.angularVelocity *= Math.max(0, 1 - b.friction * step * .08);
          resolveWalls(b);
        }
        collide();
      }
    }
    draw();
    fpsFrames++;
    if (now - fpsTime >= 500) { fps = Math.round(fpsFrames * 1000 / Math.max(1, now - fpsTime)); fpsFrames = 0; fpsTime = now; $("fps").textContent = String(fps); }
    requestAnimationFrame(frame);
  }

  function syncRange(input, output, format = (v) => v) {
    const update = () => { const v = Number(input.value); output.textContent = format(v); return v; };
    input.addEventListener("input", update); return update;
  }
  syncRange(gravityInput, $("gravityValue"), v => v.toFixed(1));
  syncRange(bounceInput, $("bounceValue"), v => v.toFixed(2));
  syncRange(speedInput, $("speedValue"), v => v.toFixed(1) + "×");
  const massInput = $("mass"), frictionInput = $("friction");
  syncRange(massInput, $("massValue"), v => v.toFixed(1));
  syncRange(frictionInput, $("frictionValue"), v => v.toFixed(2));
  massInput.addEventListener("input", () => { mass = Number(massInput.value); for (const b of balls) b.mass = mass; });
  frictionInput.addEventListener("input", () => { friction = Number(frictionInput.value); for (const b of balls) b.friction = friction; });
  gravityInput.addEventListener("input", () => gravity = Number(gravityInput.value));
  bounceInput.addEventListener("input", () => bounce = Number(bounceInput.value));
  speedInput.addEventListener("input", () => timeScale = Number(speedInput.value));

  $("addBall").addEventListener("click", () => addBall());
  for (const [id, shape] of [["spawnCircle", "circle"], ["spawnBox", "box"], ["spawnTriangle", "triangle"]]) {
    $(id).addEventListener("click", () => {
      currentShape = shape;
      for (const buttonId of ["spawnCircle", "spawnBox", "spawnTriangle"]) $(buttonId).classList.toggle("selected", buttonId === id);
      $("shapeState").textContent = shape === "circle" ? "Daire" : shape === "box" ? "Kare" : "Üçgen";
    });
  }
  $("burst").addEventListener("click", () => { for (let i = 0; i < 10; i++) addBall(width * (.2 + Math.random() * .6), 25 + Math.random() * 90, (Math.random() - .5) * 420, -Math.random() * 180); });
  $("pause").addEventListener("click", (event) => {
    running = !running; event.currentTarget.textContent = running ? "Ⅱ Duraklat" : "▶ Devam et";
    $("simState").textContent = running ? "Çalışıyor" : "Duraklatıldı";
  });
  $("reset").addEventListener("click", () => { balls.length = 0; draggedBall = null; pointerId = null; $("ballCount").textContent = "0"; draw(); });

  canvas.addEventListener("pointerdown", (event) => {
    if (draggedBall) return;
    const point = pointerPosition(event);
    let hit = null;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (Math.hypot(point.x - b.x, point.y - b.y) <= b.r + 5) { hit = b; break; }
    }
    if (!hit) { addBall(point.x, point.y, (Math.random() - .5) * 160, -40 - Math.random() * 100); return; }
    draggedBall = hit; pointerId = event.pointerId;
    dragOffsetX = hit.x - point.x; dragOffsetY = hit.y - point.y;
    dragVX = 0; dragVY = 0; previousPointerTime = performance.now();
    canvas.setPointerCapture(pointerId);
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!draggedBall || event.pointerId !== pointerId) return;
    const point = pointerPosition(event), now = performance.now();
    const elapsed = Math.max(1, now - previousPointerTime) / 1000;
    const nextX = clamp(point.x + dragOffsetX, draggedBall.r, Math.max(draggedBall.r, width - draggedBall.r));
    const nextY = clamp(point.y + dragOffsetY, draggedBall.r, Math.max(draggedBall.r, height - draggedBall.r));
    dragVX = clamp((nextX - draggedBall.x) / elapsed, -900, 900);
    dragVY = clamp((nextY - draggedBall.y) / elapsed, -900, 900);
    draggedBall.x = nextX; draggedBall.y = nextY;
    previousPointerTime = now;
  });

  function finishDrag(event) {
    if (!draggedBall || (event && event.pointerId !== pointerId)) return;
    draggedBall.vx = dragVX; draggedBall.vy = dragVY;
    draggedBall = null; pointerId = null;
    canvas.style.cursor = "grab";
  }
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
  canvas.addEventListener("lostpointercapture", finishDrag);

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);
  canvas.style.cursor = "grab";
  resize();
  for (let i = 0; i < 5; i++) addBall(width * (.25 + i * .12), 35 + i * 8, (Math.random() - .5) * 180, -30);
  requestAnimationFrame(frame);
})();
