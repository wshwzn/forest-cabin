// cabin.js — the hand-built log cabin at the centre of the clearing
import * as THREE from 'three';
import {
  canvas2d, makeTexture, normalFromCanvas, woodPlanks, shingleTexture, stoneWallTexture,
  windowInterior,
} from './textures.js';
import { fbm, rng, clamp, lerp, TAU, smoothstep } from './util.js';
import { getHeight } from './terrain.js';

/* ------------------------------------------------------------------ local materials */
function grainCanvas(seed, light = 56, hue = 30, sat = 26) {
  const W = 512, H = 512;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(W, H);
  ctx.fillStyle = `hsl(${hue},${sat}%,${light}%)`;
  ctx.fillRect(0, 0, W, H);
  // vertical grain (V axis = along the log)
  for (let i = 0; i < 220; i++) {
    const x = rand() * W;
    const w = 1 + rand() * 7;
    const dark = rand() > 0.45;
    ctx.fillStyle = dark
      ? `hsla(${hue - 3},${sat + 6}%,${light * (0.55 + rand() * 0.25)}%,${0.16 + rand() * 0.34})`
      : `hsla(${hue + 5},${sat - 6}%,${light * (1.18 + rand() * 0.2)}%,${0.1 + rand() * 0.2})`;
    let y = -40;
    while (y < H + 40) {
      const seg = 60 + rand() * 220;
      const wob = Math.sin((y / H) * TAU * 2 + i) * 3;
      ctx.fillRect(x + wob, y, w, seg);
      y += seg;
    }
  }
  // fibre speckles + cracks
  for (let i = 0; i < 900; i++) {
    const x = rand() * W, y = rand() * H;
    ctx.fillStyle = `hsla(${hue},${sat}%,${light * (0.5 + rand() * 0.8)}%,${0.03 + rand() * 0.12})`;
    ctx.fillRect(x, y, 1 + rand() * 2, 4 + rand() * 30);
  }
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    ctx.strokeStyle = `rgba(30,18,8,${0.2 + rand() * 0.35})`;
    ctx.lineWidth = 0.8 + rand() * 2;
    ctx.beginPath();
    let y = rand() * H;
    ctx.moveTo(x, y);
    const len = 40 + rand() * 200;
    for (let k = 0; k < 6; k++) {
      y += len / 6;
      ctx.lineTo(x + (rand() - 0.5) * 5, y);
    }
    ctx.stroke();
  }
  return c;
}

function cutEndCanvas(seed = 4) {
  const S = 256;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(S, S);
  const g = ctx.createRadialGradient(S * 0.45, S * 0.42, 4, S / 2, S / 2, S * 0.55);
  g.addColorStop(0, '#b09069');
  g.addColorStop(0.55, '#907050');
  g.addColorStop(0.86, '#6b5238');
  g.addColorStop(0.94, '#3a2a1c');   // bark ring
  g.addColorStop(1, '#241a12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // growth rings
  ctx.save();
  ctx.translate(S / 2, S / 2);
  for (let r = 3; r < S * 0.44; r += 2.5 + rand() * 5) {
    ctx.strokeStyle = `rgba(64,44,26,${0.08 + rand() * 0.22})`;
    ctx.lineWidth = 0.6 + rand() * 1.2;
    ctx.beginPath();
    const wob = 0.04 + rand() * 0.06;
    for (let a = 0; a <= TAU + 0.1; a += 0.22) {
      const rr = r * (1 + Math.sin(a * 3 + r) * wob);
      const xx = Math.cos(a) * rr, yy = Math.sin(a) * rr * 0.96;
      a === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  // radial cracks
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU;
    ctx.strokeStyle = 'rgba(36,24,14,0.55)';
    ctx.lineWidth = 0.8 + rand() * 1.8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
    ctx.lineTo(Math.cos(a + 0.02) * S * 0.42, Math.sin(a + 0.02) * S * 0.42);
    ctx.stroke();
  }
  // dark bark rim
  ctx.restore();
  ctx.strokeStyle = 'rgba(16,11,7,0.85)';
  ctx.lineWidth = S * 0.055;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - ctx.lineWidth / 2, 0, TAU);
  ctx.stroke();
  return c;
}

/* ------------------------------------------------------------------ helpers */
function box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}

function makeWindow(w, h, mats, opts = {}) {
  const g = new THREE.Group();
  const t = 0.055;           // frame thickness
  const depth = 0.10;
  const { frameMat, glassMat, sillMat } = mats;

  // glowing panes (a little recessed)
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - t * 1.6, h - t * 1.6), glassMat);
  pane.position.z = -0.035;
  g.add(pane);

  // frame
  const fw = t * 2;
  g.add(box(w, fw, depth, frameMat, 0, h / 2 - fw / 2, 0));
  g.add(box(w, fw, depth, frameMat, 0, -h / 2 + fw / 2, 0));
  g.add(box(fw, h - fw * 2, depth, frameMat, -w / 2 + fw / 2, 0, 0));
  g.add(box(fw, h - fw * 2, depth, frameMat, w / 2 - fw / 2, 0, 0));
  // muntins
  const mv = 0.035;
  g.add(box(mv, h - fw * 2, depth * 0.8, frameMat, 0, 0, 0.005));
  g.add(box(w - fw * 2, mv, depth * 0.8, frameMat, 0, 0, 0.005));
  // sill
  const sill = box(w + 0.20, 0.06, 0.20, sillMat, 0, -h / 2 - 0.03, 0.05);
  sill.rotation.x = 0.04;
  g.add(sill);

  // shutters
  if (opts.shutters !== false) {
    const sw = w * 0.42;
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.add(box(sw, h * 1.02, 0.04, mats.shutterMat, 0, 0, 0));
      for (let i = 0; i < 5; i++) {
        sh.add(box(sw * 0.92, 0.028, 0.055, frameMat, 0, -h * 0.4 + i * (h * 0.2), 0.03));
      }
      sh.position.set(s * (w / 2 + sw / 2 + 0.07), 0, 0.075);
      sh.rotation.y = s * (opts.shutterOpen ?? 0.22);
      g.add(sh);
    }
  }
  g.userData.pane = pane;
  return g;
}

function makeDoor(mats, w = 0.95, h = 2.05) {
  const g = new THREE.Group();
  const { doorMat, frameMat, ironMat, glassMat } = mats;
  // casing
  const cw = 0.10;
  g.add(box(w + cw * 2, h + cw, 0.12, frameMat, 0, (h + cw) / 2 - 0.02, 0.03));
  g.add(box(w, h, 0.08, doorMat, 0, h / 2, 0.08));
  // vertical planks
  for (let i = 1; i < 4; i++) {
    g.add(box(0.012, h * 0.96, 0.012, ironMat, -w / 2 + (w / 4) * i, h / 2, 0.125, 0, 0, 0, false));
  }
  // cross braces
  g.add(box(w * 0.94, 0.10, 0.035, frameMat, 0, h * 0.32, 0.13));
  g.add(box(w * 0.94, 0.10, 0.035, frameMat, 0, h * 0.66, 0.13));
  // small 4-pane window in the door
  const ww = 0.42, wh = 0.34;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat);
  pane.position.set(0, h * 0.80, 0.128);
  g.add(pane);
  g.add(box(ww + 0.07, 0.035, 0.05, frameMat, 0, h * 0.80 + wh / 2, 0.14));
  g.add(box(ww + 0.07, 0.035, 0.05, frameMat, 0, h * 0.80 - wh / 2, 0.14));
  g.add(box(0.035, wh, 0.05, frameMat, -ww / 2, h * 0.80, 0.14));
  g.add(box(0.035, wh, 0.05, frameMat, ww / 2, h * 0.80, 0.14));
  g.add(box(0.022, wh, 0.045, frameMat, 0, h * 0.80, 0.142));
  g.add(box(ww, 0.022, 0.045, frameMat, 0, h * 0.80, 0.142));
  // hinges
  for (const y of [h * 0.22, h * 0.70]) {
    const hinge = new THREE.Group();
    hinge.add(box(0.26, 0.05, 0.022, ironMat, 0.11, 0, 0));
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 6), ironMat);
    pin.rotation.x = Math.PI / 2;
    hinge.add(pin);
    hinge.position.set(-w / 2 + 0.07, y, 0.135);
    g.add(hinge);
  }
  // handle + latch
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 14), ironMat);
  handle.position.set(w / 2 - 0.16, h * 0.47, 0.14);
  g.add(handle);
  g.add(box(0.09, 0.02, 0.02, ironMat, w / 2 - 0.20, h * 0.52, 0.14));
  return g;
}

function makeLantern(mats) {  const g = new THREE.Group();
  const { ironMat, glowMat } = mats;
  // hanging chain
  for (let i = 0; i < 3; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 4, 8), ironMat);
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    link.position.y = 0.09 + i * 0.045;
    g.add(link);
  }
  // frame
  const bodyH = 0.26, bodyW = 0.15;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.78, bodyH * 0.82, bodyW * 0.78), glowMat);
  glow.position.y = -0.13;
  g.add(glow);
  g.add(box(bodyW, 0.026, bodyW, ironMat, 0, 0, -0.13));
  // top cone
  const top = new THREE.Mesh(new THREE.ConeGeometry(bodyW * 0.82, 0.10, 4), ironMat);
  top.position.y = 0.075;
  top.rotation.y = Math.PI / 4;
  g.add(top);
  // corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.014, bodyH, 0.014, ironMat, (sx * bodyW) / 2, -0.13, (sz * bodyW) / 2));
  }
  // bottom plate
  g.add(box(bodyW * 1.05, 0.022, bodyW * 1.05, ironMat, 0, -0.265, -0.13));
  // side glass (thin translucent warm panels)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffdca8, emissive: 0xffa64d, emissiveIntensity: 0.55,
    transparent: true, opacity: 0.28, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false,
  });
  for (const sx of [-1, 1]) {
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(bodyW * 0.9, bodyH * 0.9), glassMat);
    gp.position.set((sx * bodyW) / 2, -0.13, -0.13);
    gp.rotation.y = Math.PI / 2;
    g.add(gp);
  }
  for (const sz of [-1, 1]) {
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(bodyW * 0.9, bodyH * 0.9), glassMat);
    gp.position.set(0, -0.13, -0.13 + (sz * bodyW) / 2);
    gp.rotation.y = sz > 0 ? 0 : Math.PI;
    g.add(gp);
  }
  g.userData.glow = glow;
  return g;
}

/* ------------------------------------------------------------------ main build */
export function buildCabin(scene, onStage) {
  const G = new THREE.Group();
  G.name = 'cabin';
  G.position.set(0, 0, 0.2);
  scene.add(G);

  /* ---------------- textures & materials ---------------- */
  const logCanvas = grainCanvas(3, 60, 28, 30);
  const logTex = makeTexture(logCanvas, { repeat: [1.4, 1] });
  const logNormal = makeTexture(normalFromCanvas(logCanvas, 1.2), { srgb: false, repeat: [1.4, 1] });

  const trimCanvas = woodPlanks({ w: 512, h: 512, planks: 4, base: [26, 24, 42], vary: 10, seed: 8, mossy: false });
  const trimTex = makeTexture(trimCanvas, { repeat: [1, 1] });
  const trimNormal = makeTexture(normalFromCanvas(trimCanvas, 1.6), { srgb: false });

  const doorCanvas = woodPlanks({ w: 512, h: 512, planks: 7, base: [24, 30, 34], vary: 12, seed: 12, mossy: false });
  const doorTex = makeTexture(doorCanvas, { repeat: [1, 1] });
  const doorNormal = makeTexture(normalFromCanvas(doorCanvas, 2.0), { srgb: false });

  const deckCanvas = woodPlanks({ w: 512, h: 512, planks: 6, base: [28, 12, 40], vary: 16, seed: 31, mossy: true });
  const deckTex = makeTexture(deckCanvas, { repeat: [2, 2] });

  const roofCanvas = shingleTexture(21, [24, 13, 40]);
  const roofTex = makeTexture(roofCanvas, { repeat: [4, 3] });
  const roofNormal = makeTexture(normalFromCanvas(roofCanvas, 2.0), { srgb: false, repeat: [4, 3] });

  const stoneCanvas = stoneWallTexture(41);
  const stoneTex = makeTexture(stoneCanvas, { repeat: [1, 1] });
  const stoneNormal = makeTexture(normalFromCanvas(stoneCanvas, 2.6), { srgb: false, repeat: [1, 1] });
  // stone used for the foundation: coarse world-scale tiling
  const foundTex = stoneTex.clone();
  foundTex.repeat.set(2.6, 1.2);
  foundTex.needsUpdate = true;
  const foundNormal = stoneNormal.clone();
  foundNormal.repeat.set(2.6, 1.2);
  foundNormal.needsUpdate = true;

  const cutTex = makeTexture(cutEndCanvas(9), { repeat: [1, 1] });
  // the cut ends are seen edge-on, so they need their own darker, rougher map
  const cutTexDark = cutTex.clone();
  cutTexDark.needsUpdate = true;

  const mats = {
    log: new THREE.MeshStandardMaterial({
      map: logTex, normalMap: logNormal, normalScale: new THREE.Vector2(0.7, 0.7),
      color: 0xd9b98f, roughness: 0.88, metalness: 0.0,
    }),
    logDark: new THREE.MeshStandardMaterial({
      map: logTex, normalMap: logNormal, color: 0x8f7454, roughness: 0.92,
    }),
    cut: new THREE.MeshStandardMaterial({ map: cutTexDark, color: 0x8a6f50, roughness: 0.92 }),
    cutEnd: new THREE.MeshStandardMaterial({
      map: cutTexDark, color: 0x6d5540, roughness: 0.96,
    }),
    frame: new THREE.MeshStandardMaterial({
      map: trimTex, normalMap: trimNormal, color: 0x6d563c, roughness: 0.92,
    }),
    trim: new THREE.MeshStandardMaterial({
      map: trimTex, normalMap: trimNormal, color: 0x5a4630, roughness: 0.94,
    }),
    door: new THREE.MeshStandardMaterial({
      map: doorTex, normalMap: doorNormal, color: 0xae8b63, roughness: 0.87,
    }),
    shutter: new THREE.MeshStandardMaterial({
      map: doorTex, color: 0x6f7a5c, roughness: 0.92,
    }),
    sill: new THREE.MeshStandardMaterial({
      map: trimTex, color: 0x8a7052, roughness: 0.9,
    }),
    deck: new THREE.MeshStandardMaterial({
      map: deckTex, color: 0xa89579, roughness: 0.95,
    }),
    roof: new THREE.MeshStandardMaterial({
      map: roofTex, normalMap: roofNormal, normalScale: new THREE.Vector2(1.1, 1.1),
      color: 0xa9a49c, roughness: 0.93, metalness: 0.02,
    }),
    stone: new THREE.MeshStandardMaterial({
      map: stoneTex, normalMap: stoneNormal, normalScale: new THREE.Vector2(1.2, 1.2),
      color: 0xa9a196, roughness: 0.95,
    }),
    foundation: new THREE.MeshStandardMaterial({
      map: foundTex, normalMap: foundNormal, normalScale: new THREE.Vector2(1.1, 1.1),
      color: 0x9d968a, roughness: 0.96,
    }),
    stoneCap: new THREE.MeshStandardMaterial({ color: 0x8f8779, roughness: 0.9, flatShading: true }),
    iron: new THREE.MeshStandardMaterial({ color: 0x241f1c, roughness: 0.55, metalness: 0.8 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffd39a }),
    glassMat: null,
  };

  const interior = makeTexture(windowInterior(), { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping });
  mats.glassMat = new THREE.MeshStandardMaterial({
    map: interior,
    emissive: 0xffb066,
    emissiveMap: interior,
    emissiveIntensity: 0.62,
    color: 0x0a0603,
    roughness: 0.42,
    metalness: 0.0,
  });
  // alias map used by the window / door / lantern builders
  mats.frameMat = mats.frame;
  mats.sillMat = mats.sill;
  mats.shutterMat = mats.shutter;
  mats.doorMat = mats.door;
  mats.ironMat = mats.iron;
  mats.glowMat = mats.glow;

  const W = 6.0, D = 4.6;
  const y0 = 0.52;
  const wallH = 2.46;
  const eaveY = y0 + wallH;          // 2.98
  const ridgeY = 4.74;
  const halfSpanRoof = D / 2 + 0.62;
  const angle = Math.atan((ridgeY - eaveY) / halfSpanRoof);
  // gables run left-right, so the roof ridge is along Z
  const gableW = W;

  /* ---------------- stone foundation ---------------- */
  const found = box(W + 0.30, 1.0, D + 0.30, mats.foundation, 0, y0 - 0.5, 0);
  G.add(found);
  // a skirt of stones at the base
  const rand = rng(88);
  for (let i = 0; i < 16; i++) {
    const side = i % 4;
    const t = rand();
    let px, pz, ry;
    if (side === 0) { px = lerp(-W / 2, W / 2, t); pz = D / 2 + 0.18; ry = 0; }
    else if (side === 1) { px = lerp(-W / 2, W / 2, t); pz = -D / 2 - 0.18; ry = 0; }
    else if (side === 2) { pz = lerp(-D / 2, D / 2, t); px = W / 2 + 0.18; ry = Math.PI / 2; }
    else { pz = lerp(-D / 2, D / 2, t); px = -W / 2 - 0.18; ry = Math.PI / 2; }
    const s = 0.18 + rand() * 0.26;
    const st = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mats.stoneCap);
    st.position.set(px, 0.10 + rand() * 0.1, pz);
    st.rotation.set(rand(), rand() * TAU, rand());
    st.scale.y = 0.6;
    st.castShadow = true; st.receiveShadow = true;
    G.add(st);
  }

  /* ---------------- log walls ---------------- */
  const courses = 10;
  const spacing = wallH / courses;
  const logR = spacing * 0.62;
  const logGeoX = new THREE.CylinderGeometry(logR, logR, 1, 16, 1, false);
  logGeoX.rotateZ(Math.PI / 2);   // axis along X
  const logGeoZ = new THREE.CylinderGeometry(logR, logR, 1, 16, 1, false);
  logGeoZ.rotateX(Math.PI / 2);   // axis along Z

  for (let c = 0; c < courses; c++) {
    const y = y0 + logR + c * spacing;
    const extend = c % 2 === 0;
    // X-running logs (front + back)
    for (const zs of [-1, 1]) {
      const len = W + (extend ? 0.56 : 0.12);
      const m = new THREE.Mesh(logGeoX, mats.log);
      m.scale.set(len, 1, 1);
      const z = zs * (D / 2 - logR * 0.82);
      m.position.set(0, y, z);
      m.rotation.x = (rand() - 0.5) * 0.008;
      m.castShadow = true; m.receiveShadow = true;
      G.add(m);
      // cut ends: slightly darker and rougher than the log face
      if (extend) {
        for (const xs of [-1, 1]) {
          const cap = new THREE.Mesh(new THREE.CircleGeometry(logR * 0.98, 12), mats.cutEnd);
          cap.position.set(xs * len / 2, y, z);
          cap.rotation.y = xs > 0 ? Math.PI / 2 : -Math.PI / 2;
          G.add(cap);
        }
      }
    }
    // Z-running logs (left + right)
    for (const xs of [-1, 1]) {
      const len = D + (extend ? 0.12 : 0.56);
      const m = new THREE.Mesh(logGeoZ, mats.log);
      m.scale.set(1, 1, len);
      const x = xs * (W / 2 - logR * 0.82);
      m.position.set(x, y + spacing * 0.0, 0);
      m.rotation.z = (rand() - 0.5) * 0.008;
      m.castShadow = true; m.receiveShadow = true;
      G.add(m);
      if (!extend) {
        for (const zs of [-1, 1]) {
          const cap = new THREE.Mesh(new THREE.CircleGeometry(logR * 0.98, 12), mats.cutEnd);
          cap.position.set(x, y, zs * len / 2);
          cap.rotation.y = zs > 0 ? 0 : Math.PI;
          G.add(cap);
        }
      }
    }
  }

  // dark interior shell + ceiling so the gaps read as shadow
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x1b120b, roughness: 1, side: THREE.BackSide });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(W - 0.24, wallH + 0.1, D - 0.24), shellMat);
  shell.position.set(0, y0 + (wallH + 0.1) / 2, 0);
  G.add(shell);
  // chinking suggestion between logs (thin dark strips)
  const chinkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  for (let c = 0; c < courses - 1; c++) {
    const y = y0 + logR + c * spacing + spacing / 2;
    for (const zs of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, spacing * 0.16, 0.04), chinkMat);
      strip.position.set(0, y, zs * (D / 2 - 0.02));
      G.add(strip);
    }
    for (const xs of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, spacing * 0.16, D - 0.1), chinkMat);
      strip.position.set(xs * (W / 2 - 0.02), y, 0);
      G.add(strip);
    }
  }

  /* ---------------- gable ends ---------------- */
  const gableShape = new THREE.Shape();
  const gh = ridgeY - eaveY;
  gableShape.moveTo(-W / 2, 0);
  gableShape.lineTo(W / 2, 0);
  gableShape.lineTo(0, gh);
  gableShape.lineTo(-W / 2, 0);
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.16, bevelEnabled: false });
  for (const zs of [-1, 1]) {
    const gm = new THREE.Mesh(gableGeo, mats.trim);
    gm.position.set(0, eaveY, zs * (D / 2 - 0.08) - (zs > 0 ? 0.16 : 0));
    gm.castShadow = true; gm.receiveShadow = true;
    G.add(gm);
  }
  // barge boards
  for (const zs of [-1, 1]) {
    for (const xs of [-1, 1]) {
      const len = Math.hypot(W / 2, gh) + 0.35;
      const bb = box(len, 0.10, 0.14, mats.trim,
        xs * W / 4, eaveY + gh / 2 + 0.03, zs * (D / 2 + 0.06));
      bb.rotation.z = -xs * Math.atan2(gh, W / 2);
      G.add(bb);
    }
  }

  /* ---------------- roof ----------------
     Ridge runs along Z (into the scene); slopes fall to +X and -X; the
     triangular gable therefore faces the camera at +Z.                       */
  const overhangEave = 0.62;     // past the side walls, along X
  const overhangRake = 0.62;     // past the gable walls, along Z
  const halfSpan = W / 2 + overhangEave;
  const slopeLen = Math.hypot(halfSpan, ridgeY - eaveY) * 1.02;
  const roofD = D + overhangRake * 2;      // length of the ridge

  for (const xs of [-1, 1]) {
    const slabGeo = new THREE.BoxGeometry(slopeLen, 0.16, roofD, 6, 1, 1);
    // extend away from the ridge on this side of the building
    slabGeo.translate((xs * slopeLen) / 2, 0, 0);
    // a slight sag so the plane doesn't read as a perfect plate
    const sp = slabGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const t = Math.abs(sp.getX(i)) / slopeLen;
      sp.setY(i, sp.getY(i) + Math.sin(t * Math.PI) * 0.035 - t * 0.02);
    }
    slabGeo.computeVertexNormals();
    const slab = new THREE.Mesh(slabGeo, mats.roof);
    slab.position.set(0, ridgeY + 0.05, 0);
    // tilt so the outer edge drops
    slab.rotation.z = xs > 0 ? -angle : angle;
    slab.castShadow = true; slab.receiveShadow = true;
    G.add(slab);
    // shingle courses: thin lips so the surface reads as layered, not a plate
    const nCourses = 8;
    for (let i = 1; i <= nCourses; i++) {
      const t = i / (nCourses + 1);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.032, roofD), mats.logDark);
      lip.position.set(xs * slopeLen * t, 0.095, 0);
      lip.receiveShadow = true; lip.castShadow = false;
      const holder = new THREE.Group();
      holder.position.copy(slab.position);
      holder.rotation.copy(slab.rotation);
      holder.add(lip);
      G.add(holder);
    }
  }
  // rake boards along the gable edges, proud of the roof plane
  for (const xs of [-1, 1]) {
    for (const zs of [-1, 1]) {
      const rbGeo = new THREE.BoxGeometry(slopeLen + 0.05, 0.26, 0.13);
      rbGeo.translate((xs * (slopeLen + 0.05)) / 2, 0, 0);
      const rb = new THREE.Mesh(rbGeo, mats.trim);
      rb.position.set(0, ridgeY + 0.02, zs * (roofD / 2 - 0.05));
      rb.rotation.z = xs > 0 ? -angle : angle;
      rb.castShadow = true; rb.receiveShadow = true;
      G.add(rb);
    }
  }
  // ridge cap
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, roofD, 14, 1, true, 0, Math.PI), mats.logDark);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, ridgeY + 0.11, 0);
  ridge.castShadow = true;
  G.add(ridge);
  G.add(box(0.32, 0.10, roofD, mats.trim, 0, ridgeY + 0.01, 0));

  // fascia at the eaves + rafter tails (now along X)
  for (const xs of [-1, 1]) {
    G.add(box(0.07, 0.20, roofD, mats.trim, xs * (halfSpan - 0.03), eaveY + 0.02, 0));
    for (let i = 0; i < 9; i++) {
      const z = -D / 2 - 0.42 + i * ((D + 0.84) / 8);
      const rt = box(0.70, 0.11, 0.075, mats.trim,
        xs * (W / 2 + 0.28), eaveY - 0.11, z);
      rt.rotation.z = xs * angle;
      G.add(rt);
    }
  }

  /* ---------------- chimney ---------------- */
  const chX = 2.34, chZ = -1.06;
  const chTopY = ridgeY + 0.86;
  const chW = 0.94, chD = 0.80;
  const stackH = chTopY;
  {
    // a stacked stone box with UVs scaled in world units so the masonry
    // texture keeps a constant scale on every face (no stretching)
    const geo = new THREE.BoxGeometry(chW, stackH, chD);
    const uv = geo.attributes.uv;
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const tile = 0.46;   // metres per texture tile
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      let u, v;
      if (nx > 0.5) { u = p.getZ(i) / tile; v = p.getY(i) / tile; }
      else if (ny > 0.5) { u = p.getX(i) / tile; v = p.getZ(i) / tile; }
      else { u = p.getX(i) / tile; v = p.getY(i) / tile; }
      uv.setXY(i, u, v);
    }
    const chimney = new THREE.Mesh(geo, mats.stone);
    chimney.position.set(chX, stackH / 2, chZ);
    chimney.castShadow = true; chimney.receiveShadow = true;
    G.add(chimney);
    // a few stones proud of the face for silhouette interest
    const r7 = rng(707);
    const lumpGeo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 22; i++) {
      const face = Math.floor(r7() * 4);
      const t = 0.1 + r7() * 0.8;
      const yy = 0.5 + r7() * (stackH - 1.0);
      let px = chX, pz = chZ, sx = 0.16, sz = 0.16;
      if (face === 0) { px = chX + (t - 0.5) * chW; pz = chZ + chD / 2; sz = 0.09; sx = 0.13; }
      else if (face === 1) { px = chX + (t - 0.5) * chW; pz = chZ - chD / 2; sz = 0.09; sx = 0.13; }
      else if (face === 2) { px = chX + chW / 2; pz = chZ + (t - 0.5) * chD; sx = 0.09; sz = 0.13; }
      else { px = chX - chW / 2; pz = chZ + (t - 0.5) * chD; sx = 0.09; sz = 0.13; }
      const st = new THREE.Mesh(lumpGeo, mats.stone);
      st.position.set(px, yy, pz);
      st.scale.set(sx, 0.10 + r7() * 0.06, sz);
      st.rotation.set(r7(), r7() * TAU, r7());
      st.castShadow = true;
      G.add(st);
    }
    // sooty band just under the cap
    const soot = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 1 });
    G.add(box(chW + 0.01, 0.5, chD + 0.01, soot, chX, chTopY - 0.30, chZ));
  }
  const chTop = box(chW + 0.14, 0.16, chD + 0.14, mats.stoneCap, chX, chTopY + 0.06, chZ);
  G.add(chTop);
  const chHole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x0c0907, roughness: 1 }));
  chHole.position.set(chX, chTopY + 0.15, chZ);
  G.add(chHole);
  const chCap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.28, 4), mats.iron);
  chCap.position.set(chX, chTopY + 0.40, chZ);
  chCap.rotation.y = Math.PI / 4;
  chCap.castShadow = true;
  G.add(chCap);

  /* ---------------- porch ---------------- */
  const porchW = 3.9, porchD = 1.95;
  const porchZ = D / 2 + porchD / 2;
  const deck = box(porchW, 0.14, porchD, mats.deck, 0, y0 - 0.03, porchZ);
  G.add(deck);
  // deck skirt
  G.add(box(porchW + 0.06, 0.3, 0.08, mats.trim, 0, y0 - 0.18, porchZ + porchD / 2));
  // deck boards lines
  for (let i = 1; i < 9; i++) {
    G.add(box(porchW, 0.006, 0.012, mats.logDark, 0, y0 + 0.045, porchZ - porchD / 2 + (porchD / 9) * i, 0, 0, 0, false));
  }
  // posts
  const postX = porchW / 2 - 0.16;
  const postH = eaveY - y0 - 0.12;
  for (const sx of [-1, 1]) {
    const post = box(0.15, postH, 0.15, mats.frame, sx * postX, y0 + postH / 2, porchZ + porchD / 2 - 0.12);
    G.add(post);
    // stone footing
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.16, 7), mats.stone);
    foot.position.set(sx * postX, y0 + 0.02, porchZ + porchD / 2 - 0.12);
    foot.castShadow = true;
    G.add(foot);
    // brace
    const br = box(0.55, 0.08, 0.09, mats.trim, sx * (postX - 0.22), eaveY - 0.45, porchZ + porchD / 2 - 0.12);
    br.rotation.z = sx * 0.7;
    G.add(br);
  }
  // header beam
  G.add(box(porchW, 0.16, 0.16, mats.trim, 0, eaveY - 0.06, porchZ + porchD / 2 - 0.12));
  // porch shed roof
  {
    const pAngle = 0.22;
    const pSlope = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.4, 0.11, porchD + 0.55), mats.roof);
    pSlope.position.set(0, eaveY + 0.20, porchZ + 0.1);
    pSlope.rotation.x = pAngle;
    pSlope.castShadow = true; pSlope.receiveShadow = true;
    G.add(pSlope);
    G.add(box(porchW + 0.4, 0.07, 0.06, mats.trim, 0, eaveY + 0.10, porchZ + porchD / 2 + 0.3));
  }

  /* ---------------- steps & path stones ---------------- */
  // foreground stairs use the foundation material
  for (let i = 0; i < 2; i++) {
    const s = box(2.0 - i * 0.25, 0.18, 0.42, mats.foundation, 0.05, y0 - 0.10 - i * 0.19, porchZ + porchD / 2 + 0.24 + i * 0.34);
    s.rotation.y = (rand() - 0.5) * 0.03;
    G.add(s);
  }

  /* ---------------- windows ---------------- */
  const winGroups = [];
  const addWindow = (w, h, x, y, z, ry, opts = {}) => {
    const wg = makeWindow(w, h, mats, opts);
    wg.position.set(x, y, z);
    wg.rotation.y = ry;
    G.add(wg);
    winGroups.push(wg);
    return wg;
  };
  const frontZ = D / 2 + 0.06;
  // big front window, right of the door
  addWindow(1.16, 0.98, 1.62, y0 + 1.62, frontZ, 0, { shutterOpen: 0.3 });
  // smaller window left of the door
  addWindow(0.78, 0.86, -1.95, y0 + 1.56, frontZ, 0);
  // side windows
  addWindow(0.92, 0.86, -W / 2 - 0.06, y0 + 1.55, 0.55, -Math.PI / 2);
  addWindow(0.86, 0.82, W / 2 + 0.06, y0 + 1.50, 1.05, Math.PI / 2, { shutters: false });
  // gable attic window
  addWindow(0.66, 0.66, 0, eaveY + 0.72, D / 2 + 0.06, 0, { shutters: false });

  /* ---------------- door ---------------- */
  const door = makeDoor(mats);
  const doorX = -0.55;
  door.position.set(doorX, y0 + 0.06, D / 2 + 0.02);
  G.add(door);
  // threshold
  G.add(box(1.3, 0.08, 0.26, mats.stone, doorX, y0 + 0.04, D / 2 + 0.14));
  // doormat
  const matMat = new THREE.MeshStandardMaterial({ color: 0x4b4030, roughness: 1 });
  const doormat = box(0.8, 0.02, 0.42, matMat, doorX, y0 + 0.085, D / 2 + 0.42);
  G.add(doormat);

  /* ---------------- flower boxes ---------------- */
  const boxMat = mats.trim;
  const bloomColors = [0xd9556b, 0xe8b34a, 0xe6e0cf, 0xc75a3c];
  for (const [bx, bw] of [[1.62, 0.9], [-1.95, 0.66]]) {
    const fb = box(bw, 0.2, 0.24, boxMat, bx, y0 + 1.03, frontZ + 0.16);
    G.add(fb);
    const r2 = rng(Math.floor(bx * 100) + 7);
    for (let i = 0; i < 16; i++) {
      const px = bx + (r2() - 0.5) * bw * 0.86;
      const pz = frontZ + 0.16 + (r2() - 0.5) * 0.16;
      const py = y0 + 1.14 + r2() * 0.16;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05 + r2() * 0.03, 5, 4), new THREE.MeshStandardMaterial({ color: 0x4f6b32, roughness: 0.9 }));
      leaf.position.set(px, py, pz);
      leaf.castShadow = true;
      G.add(leaf);
      if (r2() > 0.35) {
        const col = bloomColors[Math.floor(r2() * bloomColors.length)];
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.026 + r2() * 0.012, 5, 4), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, emissive: col, emissiveIntensity: 0.08 }));
        fl.position.set(px + (r2() - 0.5) * 0.05, py + 0.05, pz + 0.03);
        G.add(fl);
      }
    }
  }

  /* ---------------- porch furnishings ---------------- */
  // bench
  {
    const bench = new THREE.Group();
    bench.add(box(1.5, 0.06, 0.42, mats.deck, 0, 0.46, 0));
    bench.add(box(1.5, 0.07, 0.30, mats.deck, 0, 0.86, -0.16, -0.14, 0, 0));
    for (const sx of [-1, 1]) {
      bench.add(box(0.07, 0.46, 0.07, mats.frame, sx * 0.62, 0.23, 0.14));
      bench.add(box(0.07, 0.46, 0.07, mats.frame, sx * 0.62, 0.23, -0.14));
      bench.add(box(0.06, 0.42, 0.06, mats.frame, sx * 0.62, 0.64, -0.16, -0.14, 0, 0));
    }
    bench.position.set(-1.30, y0 + 0.05, porchZ - 0.18);
    bench.rotation.y = 0.06;
    G.add(bench);
    // folded blanket
    const bl = box(0.4, 0.09, 0.32, new THREE.MeshStandardMaterial({ color: 0x8a3f30, roughness: 1 }), -1.62, y0 + 0.54, porchZ - 0.18);
    G.add(bl);
  }
  // lantern hanging from the porch beam
  const lantern = makeLantern(mats);
  lantern.position.set(0.52, eaveY - 0.30, porchZ + porchD / 2 - 0.22);
  G.add(lantern);

  // rain barrel
  {
    const barrel = new THREE.Group();
    const bMat = new THREE.MeshStandardMaterial({ map: trimTex, color: 0x8a6f4f, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.72, 14, 1), bMat);
    body.castShadow = true; body.receiveShadow = true;
    barrel.add(body);
    for (const y of [-0.24, 0, 0.24]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.272 - Math.abs(y) * 0.08, 0.014, 5, 18), mats.iron);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      barrel.add(band);
    }
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.25, 14), new THREE.MeshStandardMaterial({ color: 0x0d1a1a, roughness: 0.08, metalness: 0.6 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.30;
    barrel.add(water);
    barrel.position.set(2.15, y0 + 0.30, porchZ + 0.25);
    G.add(barrel);
  }

  /* ---------------- firewood stack (right side) ---------------- */
  {
    const stackX = W / 2 + 0.62, stackZ = 1.0;
    const baseY = getHeight(stackX, stackZ);
    const logLen = 0.9;
    const rows = 5, cols = 7;
    const fwGeo = new THREE.CylinderGeometry(0.085, 0.085, logLen, 10, 1);
    fwGeo.rotateX(Math.PI / 2);
    const fwMat = new THREE.MeshStandardMaterial({
      map: logTex, color: 0xb99468, roughness: 0.92,
    });
    const fw = new THREE.InstancedMesh(fwGeo, fwMat, rows * cols);
    fw.castShadow = true; fw.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const r3 = rng(303);
    const col = new THREE.Color();
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let c2 = 0; c2 < cols; c2++) {
        const jitter = (r3() - 0.5) * 0.05;
        p3.set(stackX + (r3() - 0.5) * 0.06, baseY + 0.10 + r * 0.166, stackZ - cols / 2 * 0.178 + c2 * 0.178 + jitter);
        q.setFromEuler(new THREE.Euler(0, 0, (r3() - 0.5) * 0.12));
        const sc = 0.85 + r3() * 0.3;
        s3.set(sc, sc, 1);
        m4.compose(p3, q, s3);
        fw.setMatrixAt(k, m4);
        col.setHSL(0.08 + r3() * 0.03, 0.2 + r3() * 0.12, 0.26 + r3() * 0.12);
        fw.setColorAt(k, col);
        k++;
      }
    }
    G.add(fw);
    // cut ends facing the camera
    const capGeo = new THREE.CircleGeometry(0.082, 10);
    const caps = new THREE.InstancedMesh(capGeo, mats.cut, rows * cols);
    let k2 = 0;
    for (let r = 0; r < rows; r++) {
      for (let c2 = 0; c2 < cols; c2++) {
        p3.set(stackX + 0.02, baseY + 0.10 + r * 0.166, stackZ - cols / 2 * 0.178 + c2 * 0.178);
        q.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
        s3.set(1, 1, 1);
        m4.compose(p3, q, s3);
        caps.setMatrixAt(k2++, m4);
      }
    }
    caps.receiveShadow = true;
    G.add(caps);

    // chopping block + axe
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.5, 12), new THREE.MeshStandardMaterial({ map: logTex, color: 0x8a6b4a, roughness: 1 }));
    stump.position.set(stackX + 0.55, baseY + 0.25, stackZ + 1.25);
    stump.castShadow = true; stump.receiveShadow = true;
    G.add(stump);
    const stumpTop = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), mats.cut);
    stumpTop.rotation.x = -Math.PI / 2;
    stumpTop.position.set(stackX + 0.55, baseY + 0.505, stackZ + 1.25);
    G.add(stumpTop);
    const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, 0.62, 6), mats.frame);
    axeHandle.position.set(stackX + 0.52, baseY + 0.78, stackZ + 1.20);
    axeHandle.rotation.z = 0.24;
    axeHandle.castShadow = true;
    G.add(axeHandle);
    const axeHead = box(0.18, 0.10, 0.035, mats.iron, stackX + 0.44, baseY + 0.52, stackZ + 1.16, 0, 0, 0.2);
    G.add(axeHead);
    // split logs on the ground
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 7), mats.cut);
      l.position.set(stackX + 0.3 + r3() * 0.6, baseY + 0.07, stackZ + 0.55 + r3() * 0.3);
      l.rotation.set(Math.PI / 2, r3() * TAU, 0.1);
      l.castShadow = true;
      G.add(l);
    }
  }

  /* ---------------- small props ---------------- */
  // bucket on the porch steps
  {
    const bucket = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.10, 0.24, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x4c4438, roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide }));
    b.castShadow = true;
    bucket.add(b);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.10, 12), mats.iron);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.11;
    bucket.add(bottom);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 14, Math.PI), mats.iron);
    handle.position.y = 0.12;
    handle.rotation.z = 0.1;
    bucket.add(handle);
    bucket.position.set(1.25, y0 + 0.22, porchZ + porchD / 2 + 0.1);
    G.add(bucket);
  }
  // potted plant by the door
  {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.10, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x7d4a32, roughness: 0.95 }));
    pot.position.set(-1.75, y0 + 0.16, porchZ + 0.2);
    pot.castShadow = true; pot.receiveShadow = true;
    G.add(pot);
    const r4 = rng(55);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.10, 5, 4), new THREE.MeshStandardMaterial({ color: 0x4a6a35, roughness: 0.9 }));
      leaf.position.set(-1.75 + (r4() - 0.5) * 0.2, y0 + 0.36 + r4() * 0.22, porchZ + 0.2 + (r4() - 0.5) * 0.16);
      leaf.scale.set(1, 0.7, 1);
      leaf.castShadow = true;
      G.add(leaf);
    }
  }
  // ladder leaning against the gable
  {
    const ladder = new THREE.Group();
    const lMat = mats.frame;
    for (const sx of [-1, 1]) {
      const rail = box(0.05, 2.6, 0.05, lMat, sx * 0.19, 1.3, 0);
      ladder.add(rail);
    }
    for (let i = 0; i < 7; i++) {
      ladder.add(box(0.4, 0.04, 0.035, lMat, 0, 0.28 + i * 0.34, 0));
    }
    ladder.position.set(-W / 2 - 1.05, getHeight(-W / 2 - 1.05, 2.4) + 0.1, 2.35);
    ladder.rotation.z = 0.13;
    ladder.rotation.x = -0.12;
    G.add(ladder);
  }

  /* ---------------- signpost by the path ---------------- */
  {
    const sx = 5.2, sz = 9.4;
    const sy = getHeight(sx, sz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.0, 7), mats.trim);
    post.position.set(sx, sy + 1.0, sz);
    post.castShadow = true;
    G.add(post);
    // painted sign
    const { c, ctx } = canvas2d(512, 160);
    ctx.fillStyle = '#5c452f';
    ctx.fillRect(0, 0, 512, 160);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(30,20,10,${0.05 + Math.random() * 0.16})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const y = Math.random() * 160;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + 4, 340, y - 4, 512, y + 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,206,168,0.30)';
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, 492, 140);
    ctx.fillStyle = '#e8d3ac';
    ctx.font = '600 58px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CABIN', 240, 78);
    ctx.font = '600 46px Georgia, serif';
    ctx.fillText('\u2192', 436, 80);
    const signTex = makeTexture(c, { wrap: THREE.ClampToEdgeWrapping, repeat: [1, 1] });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.34, 0.05), new THREE.MeshStandardMaterial({ map: signTex, color: 0xcbb08a, roughness: 0.9 }));
    sign.position.set(sx - 0.52, sy + 1.72, sz);
    sign.rotation.y = -0.55;
    sign.castShadow = true;
    G.add(sign);
    // small hooks
    G.add(box(0.02, 0.12, 0.02, mats.iron, sx - 0.12, sy + 1.90, sz - 0.02));
  }

  /* ---------------- interior / porch lights ---------------- */
  // all interior lights sit *inside* the walls so they never blow out the trim
  const warm = 0xffb066;
  const porchLight = new THREE.PointLight(warm, 2.2, 7.0, 2.0);
  porchLight.position.set(0.52, eaveY - 0.55, porchZ + porchD / 2 - 0.20);
  G.add(porchLight);

  const windowLights = [];
  const wl = new THREE.PointLight(0xffa85e, 1.1, 4.2, 2.0);
  wl.position.set(1.62, y0 + 1.55, D / 2 - 0.55);
  G.add(wl);
  windowLights.push(wl);

  const wl2 = new THREE.PointLight(0xff9d54, 0.7, 3.6, 2.0);
  wl2.position.set(-W / 2 + 0.55, y0 + 1.5, 0.55);
  G.add(wl2);
  windowLights.push(wl2);

  /* ---------------- world anchors ---------------- */
  const world = new THREE.Vector3();
  const smokeAnchor = new THREE.Vector3(chX, 5.55, chZ);
  G.localToWorld(smokeAnchor);

  onStage && onStage('搭起木屋与门廊');
  return {
    group: G,
    materials: mats,
    porchLight,
    windowLights,
    lantern,
    smokeAnchor,
    doorPos: new THREE.Vector3(doorX, y0, D / 2 + 0.4),
    roofTop: ridgeY,
    lightFlicker: { base: 3.4, phase: Math.random() * 100 },
  };
}
