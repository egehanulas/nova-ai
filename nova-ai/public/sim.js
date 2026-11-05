(() => {
  "use strict";
  const canvas = document.getElementById("world");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  const $ = (id) => document.getElementById(id);
  const gravityInput = $("gravity"), bounceInput = $("bounce"), speedInput = $("speed");
  const gravityAngleInput = $("gravityAngle"), maxSpeedInput = $("maxSpeed");
  const fields = [];
  const balls = [];
  const MAX_BALLS = 100;
  let width = 0, height = 0, running = true, lastTime = 0, fpsFrames = 0, fpsTime = 0, fps = 0;
  let gravity = Number(gravityInput.value), gravityAngle = Number(gravityAngleInput.value) * Math.PI / 180, maxSpeed = Number(maxSpeedInput.value), bounce = Number(bounceInput.value), timeScale = Number(speedInput.value), mass = 1, friction = 0.18;
  let currentShape = "circle";
  let initialSpeed=180, initialDirection=-45, sampleClock=0;
  const telemetry={speed:[],energy:[],force:[]}, chartLimit=90;
  let selectedBall = null, selectedField = null, draggedField = null, fieldDragOffsetX = 0, fieldDragOffsetY = 0, moveFieldsMode = false;
  let fieldStrength = 520, fieldRadius = 125;
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

  function addBall(x = width * (.25 + Math.random() * .5), y = Math.max(35, height * .15), vx = Math.cos(initialDirection*Math.PI/180)*initialSpeed, vy = Math.sin(initialDirection*Math.PI/180)*initialSpeed) {
    if (balls.length >= MAX_BALLS) balls.shift();
    const r = 9 + Math.random() * 13;
    const ball = { x: clamp(x, r, Math.max(r, width - r)), y: clamp(y, r, Math.max(r, height - r)), vx, vy, r, shape: currentShape, angle: Math.random() * Math.PI * 2, angularVelocity: 0, mass, friction, color: colors[Math.floor(Math.random() * colors.length)] };
    balls.push(ball);
    $("ballCount").textContent = String(balls.length);
    return ball;
  }

  function resolveWalls(b) {
    const wallFriction = clamp(b.friction * .12, 0, .12);
    if (b.x - b.r < 0) {
      b.x = b.r;
      if (b.vx < 0) { const impact = Math.abs(b.vx); b.vx = impact * bounce; b.vy *= 1 - wallFriction; b.angularVelocity += impact * wallFriction / Math.max(1, b.r); }
    }
    if (b.x + b.r > width) {
      b.x = width - b.r;
      if (b.vx > 0) { const impact = Math.abs(b.vx); b.vx = -impact * bounce; b.vy *= 1 - wallFriction; b.angularVelocity -= impact * wallFriction / Math.max(1, b.r); }
    }
    if (b.y - b.r < 0) {
      b.y = b.r;
      if (b.vy < 0) { const impact = Math.abs(b.vy); b.vy = impact * bounce; b.vx *= 1 - wallFriction; b.angularVelocity -= impact * wallFriction / Math.max(1, b.r); }
    }
    if (b.y + b.r > height) {
      b.y = height - b.r;
      if (b.vy > 0) {
        const impact = Math.abs(b.vy);
        b.vy = impact < 22 ? 0 : -impact * bounce;
        b.vx *= 1 - wallFriction;
        b.angularVelocity += impact * wallFriction / Math.max(1, b.r);
      }
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
        // Tangential impulse transfers a small amount of spin to both bodies.
        a.angularVelocity -= jt * a.r * invA * .025;
        b.angularVelocity += jt * b.r * invB * .025;
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
    for (const field of fields) {
      ctx.save(); ctx.beginPath(); ctx.arc(field.x, field.y, field.radius, 0, Math.PI * 2);
      ctx.fillStyle = field.type === "attract" ? "rgba(112,226,176,.07)" : "rgba(255,126,170,.07)"; ctx.fill();
      ctx.strokeStyle = field.type === "attract" ? "rgba(112,226,176,.65)" : "rgba(255,126,170,.65)"; ctx.setLineDash([6,5]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = field.type === "attract" ? "#70e2b0" : "#ff7eaa"; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(field.type === "attract" ? "ÇEKİM" : "İTİM", field.x, field.y - field.radius - 7); if (field === selectedField) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(field.x, field.y, 12, 0, Math.PI * 2); ctx.stroke(); } ctx.fillStyle = field.type === "attract" ? "#70e2b0" : "#ff7eaa"; ctx.beginPath(); ctx.arc(field.x, field.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(field.x - 9, field.y); ctx.lineTo(field.x + 9, field.y); ctx.moveTo(field.x, field.y - 9); ctx.lineTo(field.x, field.y + 9); ctx.stroke(); ctx.restore();
    }
    for (const b of balls) {
      ctx.save(); if (b === selectedBall) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2); ctx.stroke(); } ctx.shadowColor = b.color; ctx.shadowBlur = b === draggedBall ? 26 : 16;
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
      // Adaptive substeps reduce tunnelling when objects move quickly or time is accelerated.
      const fastest = balls.reduce((value, b) => b === draggedBall ? value : Math.max(value, Math.hypot(b.vx, b.vy)), 0);
      const smallest = balls.reduce((value, b) => b === draggedBall ? value : Math.min(value, b.r), Infinity);
      const safeTravel = Number.isFinite(smallest) ? Math.max(3, smallest * .45) : 12;
      const steps = clamp(Math.ceil((fastest * dt) / safeTravel), 1, 24);
      const step = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const b of balls) {
          if (b === draggedBall) continue;
          const gx = Math.cos(gravityAngle) * gravity * 48;
          const gy = Math.sin(gravityAngle) * gravity * 48;
          b.vx += gx * step; b.vy += gy * step;
          for (const field of fields) {
            const dx = field.x - b.x, dy = field.y - b.y, distance = Math.hypot(dx, dy);
            if (distance > 1 && distance < field.radius) {
              const falloff = 1 - distance / field.radius;
              const direction = field.type === "attract" ? 1 : -1;
              const acceleration = direction * field.strength * falloff;
              b.vx += dx / distance * acceleration * step; b.vy += dy / distance * acceleration * step;
            }
          }
          const velocity = Math.hypot(b.vx, b.vy);
          if (maxSpeed > 0 && velocity > maxSpeed) { b.vx = b.vx / velocity * maxSpeed; b.vy = b.vy / velocity * maxSpeed; }
          b.x += b.vx * step; b.y += b.vy * step;
          b.angle += b.angularVelocity * step;
          b.angularVelocity *= Math.max(0, 1 - b.friction * step * .08);
          resolveWalls(b);
        }
        collide();
      }
    }
    sampleClock+=dt;
    if(sampleClock>=.12){sampleClock=0;recordTelemetry();}
    drawTelemetry();
    draw();
    fpsFrames++;
    if (now - fpsTime >= 500) { fps = Math.round(fpsFrames * 1000 / Math.max(1, now - fpsTime)); fpsFrames = 0; fpsTime = now; $("fps").textContent = String(fps); }
    requestAnimationFrame(frame);
  }

  function recordTelemetry(){
    const energy=balls.reduce((s,b)=>s+.5*b.mass*(b.vx*b.vx+b.vy*b.vy),0);
    const speed=balls.length?balls.reduce((s,b)=>s+Math.hypot(b.vx,b.vy),0)/balls.length:0;
    const force=balls.reduce((s,b)=>s+b.mass*Math.hypot(gravity*Math.cos(gravityAngle)*48,gravity*Math.sin(gravityAngle)*48),0);
    for(const [k,v] of [["speed",speed],["energy",energy],["force",force]]){telemetry[k].push(v);if(telemetry[k].length>chartLimit)telemetry[k].shift();}
    $("energyReadout").textContent=energy.toFixed(0)+" J*";$("speedReadout").textContent=speed.toFixed(1)+" px/sn";$("forceReadout").textContent=force.toFixed(0)+" N*";
  }
  function drawTelemetry(){
    for(const key of ["speed","energy","force"]){const el=$("chart-"+key),c=el?.getContext("2d");if(!c)continue;const w=el.width=el.clientWidth*2,h=el.height=el.clientHeight*2;c.clearRect(0,0,w,h);const a=telemetry[key],max=Math.max(1,...a);if(a.length<2)continue;c.strokeStyle=key==="speed"?"#6edbd0":key==="energy"?"#ffb86b":"#9b83ff";c.lineWidth=3;c.beginPath();a.forEach((v,i)=>{const x=i/(chartLimit-1)*w,y=h-6-v/max*(h-12);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();}
  }
  function syncRange(input, output, format = (v) => v) {
    const update = () => { const v = Number(input.value); output.textContent = format(v); return v; };
    input.addEventListener("input", update); return update;
  }
  syncRange(gravityInput, $("gravityValue"), v => v.toFixed(1));
  syncRange(gravityAngleInput, $("gravityAngleValue"), v => Math.round(v) + "°");
  syncRange(maxSpeedInput, $("maxSpeedValue"), v => v === 0 ? "Sınırsız" : Math.round(v) + " px/sn");
  syncRange(bounceInput, $("bounceValue"), v => v.toFixed(2));
  syncRange(speedInput, $("speedValue"), v => v.toFixed(1) + "×");
  const initialSpeedInput=$("initialSpeed"),initialDirectionInput=$("initialDirection");
  syncRange(initialSpeedInput,$("initialSpeedValue"),v=>Math.round(v)+" px/sn");
  syncRange(initialDirectionInput,$("initialDirectionValue"),v=>Math.round(v)+"°");
  initialSpeedInput.addEventListener("input",()=>initialSpeed=Number(initialSpeedInput.value));
  initialDirectionInput.addEventListener("input",()=>initialDirection=Number(initialDirectionInput.value));
  const massInput = $("mass"), frictionInput = $("friction");
  syncRange(massInput, $("massValue"), v => v.toFixed(1));
  syncRange(frictionInput, $("frictionValue"), v => v.toFixed(2));
  const fieldStrengthInput = $("fieldStrength"), fieldRadiusInput = $("fieldRadius");
  syncRange(fieldStrengthInput, $("fieldStrengthValue"), v => String(Math.round(v)));
  syncRange(fieldRadiusInput, $("fieldRadiusValue"), v => Math.round(v) + " px");
  fieldStrengthInput.addEventListener("input", () => { fieldStrength = Number(fieldStrengthInput.value); if (selectedField) selectedField.strength = fieldStrength; draw(); });
  fieldRadiusInput.addEventListener("input", () => { fieldRadius = Number(fieldRadiusInput.value); if (selectedField) selectedField.radius = fieldRadius; draw(); });
  massInput.addEventListener("input", () => { mass = Number(massInput.value); for (const b of balls) b.mass = mass; });
  frictionInput.addEventListener("input", () => { friction = Number(frictionInput.value); for (const b of balls) b.friction = friction; });
  gravityInput.addEventListener("input", () => gravity = Number(gravityInput.value));
  gravityAngleInput.addEventListener("input", () => gravityAngle = Number(gravityAngleInput.value) * Math.PI / 180);
  maxSpeedInput.addEventListener("input", () => maxSpeed = Number(maxSpeedInput.value));
  bounceInput.addEventListener("input", () => bounce = Number(bounceInput.value));
  speedInput.addEventListener("input", () => timeScale = Number(speedInput.value));

  $("addBall").addEventListener("click", () => addBall());
  function renderFieldCards(){const host=$("fieldCards");if(!host)return;host.replaceChildren();fields.forEach((field,index)=>{const card=document.createElement("div");card.className="field-card"+(field===selectedField?" active":"");const name=document.createElement("span");name.textContent=(field.type==="attract"?"Çekim":"İtim")+" alanı "+(index+1);const grip=document.createElement("button");grip.type="button";grip.className="field-grip";grip.textContent="⠿";grip.title="Basılı tutup sürükle";grip.addEventListener("pointerdown",e=>{e.preventDefault();selectField(field);draggedField=field;pointerId=e.pointerId;const r=canvas.getBoundingClientRect();fieldDragOffsetX=field.x-(e.clientX-r.left);fieldDragOffsetY=field.y-(e.clientY-r.top);grip.setPointerCapture(pointerId);});grip.addEventListener("pointermove",e=>{if(draggedField!==field||e.pointerId!==pointerId)return;const r=canvas.getBoundingClientRect();field.x=clamp(e.clientX-r.left+fieldDragOffsetX,0,width);field.y=clamp(e.clientY-r.top+fieldDragOffsetY,0,height);draw();});const select=document.createElement("button");select.type="button";select.className="field-select";select.textContent="Seç";select.addEventListener("click",()=>selectField(field));card.append(name,grip,select);host.append(card);});}
  function selectField(field) { selectedField = field; renderFieldCards(); $("deleteField").disabled = !field; if (field) { fieldStrength = field.strength; fieldRadius = field.radius; fieldStrengthInput.value = String(fieldStrength); fieldRadiusInput.value = String(fieldRadius); $("fieldStrengthValue").textContent = String(Math.round(fieldStrength)); $("fieldRadiusValue").textContent = Math.round(fieldRadius) + " px"; $("fieldState").textContent = (field.type === "attract" ? "Çekim" : "İtim") + " alanı seçildi. Merkez tutamacından taşıyabilir, gücünü ve yarıçapını ayarlayabilirsin."; } else $("fieldState").textContent = "Alan taşı modunu aç, sonra sahnedeki alanın merkez tutamacını sürükle."; draw(); }
  function addField(type) { const field = { x: width * (.35 + Math.random() * .3), y: height * (.35 + Math.random() * .3), radius: fieldRadius, strength: fieldStrength, type }; fields.push(field); selectField(field); }
  $("addAttract").addEventListener("click", () => addField("attract"));
  $("addRepel").addEventListener("click", () => addField("repel"));
  $("clearFields").addEventListener("click", () => { fields.length = 0; selectField(null); });

  $("deleteField").addEventListener("click", () => { if (!selectedField) return; const index = fields.indexOf(selectedField); if (index >= 0) fields.splice(index, 1); selectField(null); $("fieldState").textContent = "Seçili kuvvet alanı silindi."; });
  function snapshot() { return { version: 2, settings: { gravity, gravityAngle: Number(gravityAngleInput.value), bounce, timeScale, maxSpeed, mass, friction, currentShape, fieldStrength, fieldRadius }, balls: balls.map(b => ({ ...b, x:b.x/width, y:b.y/height })), fields: fields.map(f => ({ ...f, x:f.x/width, y:f.y/height })) }; }
  $("savePreset").addEventListener("click",()=>{try{const data=snapshot();data.settings.initialSpeed=initialSpeed;data.settings.initialDirection=initialDirection;localStorage.setItem("nova-sim-alpha8-preset",JSON.stringify(data));localStorage.setItem("nova-sim-alpha7-preset",JSON.stringify(data));$("presetState").textContent="Deney kaydedildi";}catch{$("presetState").textContent="Kayıt başarısız";}});
  $("saveComparison").addEventListener("click",()=>{try{localStorage.setItem("nova-sim-alpha8-comparison",JSON.stringify(snapshot()));$("comparisonState").textContent="A deneyi kaydedildi.";}catch{$("comparisonState").textContent="Kayıt başarısız";}});
  $("compareExperiment").addEventListener("click",()=>{try{const a=JSON.parse(localStorage.getItem("nova-sim-alpha8-comparison")||"null"),b=snapshot();if(!a)throw Error();const summary=d=>({n:d.balls.length,f:d.fields.length,v:d.balls.length?Math.round(d.balls.reduce((s,x)=>s+Math.hypot(x.vx,x.vy),0)/d.balls.length):0,e:Math.round(d.balls.reduce((s,x)=>s+.5*x.mass*(x.vx*x.vx+x.vy*x.vy),0))}),x=summary(a),y=summary(b);$("comparisonState").textContent=`A: ${x.n} nesne · ${x.f} alan · ${x.v} px/sn · ${x.e} J* | B: ${y.n} nesne · ${y.f} alan · ${y.v} px/sn · ${y.e} J*`;}catch{$("comparisonState").textContent="Önce A deneyini kaydet.";}});
  $("loadPreset").addEventListener("click", () => {
    try {
      const data = JSON.parse(localStorage.getItem("nova-sim-alpha8-preset") || localStorage.getItem("nova-sim-alpha7-preset") || localStorage.getItem("nova-sim-alpha5-preset") || "null");
      if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.balls) || !data.settings) throw new Error("invalid");
      const v = data.settings;
      for (const [key,value] of [["gravity",v.gravity],["gravityAngle",v.gravityAngle],["bounce",v.bounce],["speed",v.timeScale],["maxSpeed",v.maxSpeed],["mass",v.mass],["friction",v.friction]]) { const input=$(key); if (Number.isFinite(value)) { input.value=String(value); input.dispatchEvent(new Event("input")); } }
      currentShape = ["circle","box","triangle"].includes(v.currentShape) ? v.currentShape : "circle";
      if(Number.isFinite(v.initialSpeed)){initialSpeed=clamp(v.initialSpeed,0,1200);initialSpeedInput.value=String(initialSpeed);initialSpeedInput.dispatchEvent(new Event("input"));} if(Number.isFinite(v.initialDirection)){initialDirection=clamp(v.initialDirection,-180,180);initialDirectionInput.value=String(initialDirection);initialDirectionInput.dispatchEvent(new Event("input"));}
      if (Number.isFinite(v.fieldStrength)) { fieldStrength = clamp(v.fieldStrength,50,3000); fieldStrengthInput.value=String(fieldStrength); fieldStrengthInput.dispatchEvent(new Event("input")); }
      if (Number.isFinite(v.fieldRadius)) { fieldRadius = clamp(v.fieldRadius,30,500); fieldRadiusInput.value=String(fieldRadius); fieldRadiusInput.dispatchEvent(new Event("input")); }
      balls.length=0; selectedBall=null;
      for (const b of data.balls.slice(0,MAX_BALLS)) if ([b.x,b.y,b.vx,b.vy,b.r,b.mass,b.friction].every(Number.isFinite) && ["circle","box","triangle"].includes(b.shape)) balls.push({ ...b, x:clamp(b.x,0,1)*width, y:clamp(b.y,0,1)*height, mass:clamp(b.mass,.05,20), friction:clamp(b.friction,0,1), r:clamp(b.r,4,60), angle:Number.isFinite(b.angle)?b.angle:0, angularVelocity:Number.isFinite(b.angularVelocity)?b.angularVelocity:0 });
      fields.length=0; selectedField=null; $("deleteField").disabled=true; if (Array.isArray(data.fields)) for (const f of data.fields.slice(0,30)) if ([f.x,f.y,f.radius,f.strength].every(Number.isFinite) && ["attract","repel"].includes(f.type)) fields.push({ ...f, x:clamp(f.x,0,1)*width, y:clamp(f.y,0,1)*height, radius:clamp(f.radius,20,500), strength:clamp(f.strength,0,3000) });
      $("ballCount").textContent=String(balls.length); $("presetState").textContent="Deney yüklendi"; renderFieldCards(); draw();
    } catch { $("presetState").textContent="Kayıt bulunamadı veya geçersiz"; }
  });
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

  
  function mergeSelected() {
    if (!selectedBall || !balls.includes(selectedBall)) { $("universeState").textContent = "Önce sahneden bir nesne seç."; return; }
    let nearest = null, nearestDistance = Infinity;
    for (const body of balls) {
      if (body === selectedBall) continue;
      const distance = Math.hypot(body.x - selectedBall.x, body.y - selectedBall.y);
      if (distance < nearestDistance) { nearestDistance = distance; nearest = body; }
    }
    if (!nearest) { $("universeState").textContent = "Birleştirmek için en az iki nesne gerekli."; return; }
    const a = selectedBall, b = nearest, totalMass = a.mass + b.mass;
    const mergedX = (a.x * a.mass + b.x * b.mass) / totalMass;
    const mergedY = (a.y * a.mass + b.y * b.mass) / totalMass;
    const mergedVX = (a.vx * a.mass + b.vx * b.mass) / totalMass;
    const mergedVY = (a.vy * a.mass + b.vy * b.mass) / totalMass;
    const mergedSpin = (a.angularVelocity * a.mass + b.angularVelocity * b.mass) / totalMass;
    a.x = mergedX; a.y = mergedY;
    a.vx = mergedVX; a.vy = mergedVY;
    a.r = Math.min(60, Math.sqrt(a.r * a.r + b.r * b.r));
    a.mass = totalMass;
    a.angularVelocity = mergedSpin;
    balls.splice(balls.indexOf(b), 1);
    $("ballCount").textContent = String(balls.length);
    $("universeState").textContent = "İki nesne birleşti; kütle ve momentum korunumuna göre birleştirildi.";
    draw();
  }
  function splitSelected() {
    if (!selectedBall || !balls.includes(selectedBall)) { $("universeState").textContent = "Önce sahneden bir nesne seç."; return; }
    if (balls.length >= MAX_BALLS) { $("universeState").textContent = "Nesne sınırına ulaşıldı."; return; }
    const body = selectedBall, childMass = Math.max(.1, body.mass / 2), childRadius = Math.max(5, body.r / Math.sqrt(2));
    body.mass = childMass; body.r = childRadius;
    const offset = childRadius * .8, impulse = 65;
    body.x = clamp(body.x - offset, childRadius, width - childRadius);
    const child = { ...body, x: clamp(body.x + offset * 2, childRadius, width - childRadius), y: body.y, vx: body.vx + impulse, vy: body.vy, angle: body.angle, angularVelocity: body.angularVelocity };
    body.vx -= impulse; balls.push(child); selectedBall = child;
    $("ballCount").textContent = String(balls.length);
    $("universeState").textContent = "Nesne iki parçaya bölündü; toplam kütle ve momentum dengelendi.";
    draw();
  }
  $("mergeSelected").addEventListener("click", mergeSelected);
  $("splitSelected").addEventListener("click", splitSelected);

  canvas.addEventListener("pointerdown", (event) => {
    if (draggedBall) return;
    const point = pointerPosition(event);
    for(let i=fields.length-1;i>=0;i--){const f=fields[i];if(Math.hypot(point.x-f.x,point.y-f.y)<=18){selectField(f);draggedField=f;pointerId=event.pointerId;fieldDragOffsetX=f.x-point.x;fieldDragOffsetY=f.y-point.y;canvas.setPointerCapture(pointerId);event.preventDefault();return;}}
    let hit = null;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (Math.hypot(point.x - b.x, point.y - b.y) <= b.r + 5) { hit = b; break; }
    }
    if (!hit) { addBall(point.x, point.y, (Math.random() - .5) * 160, -40 - Math.random() * 100); return; }
    draggedBall = hit; selectedBall = hit; $("universeState").textContent = "Nesne seçildi."; pointerId = event.pointerId;
    dragOffsetX = hit.x - point.x; dragOffsetY = hit.y - point.y;
    dragVX = 0; dragVY = 0; previousPointerTime = performance.now();
    canvas.setPointerCapture(pointerId);
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const point = pointerPosition(event);
    if (draggedField) { draggedField.x = clamp(point.x + fieldDragOffsetX, 0, width); draggedField.y = clamp(point.y + fieldDragOffsetY, 0, height); draw(); return; }
    if (!draggedBall) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - previousPointerTime) / 1000;
    const nextX = clamp(point.x + dragOffsetX, draggedBall.r, Math.max(draggedBall.r, width - draggedBall.r));
    const nextY = clamp(point.y + dragOffsetY, draggedBall.r, Math.max(draggedBall.r, height - draggedBall.r));
    dragVX = clamp((nextX - draggedBall.x) / elapsed, -900, 900);
    dragVY = clamp((nextY - draggedBall.y) / elapsed, -900, 900);
    draggedBall.x = nextX; draggedBall.y = nextY;
    previousPointerTime = now;
  });

  function finishDrag(event) {
    if (event && event.pointerId !== pointerId) return;
    if (draggedField) { draggedField = null; pointerId = null; renderFieldCards(); $("fieldState").textContent = "Kuvvet alanının konumu güncellendi."; return; }
    if (!draggedBall) return;
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
