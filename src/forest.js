// forest.js — procedural conifers, birches, undergrowth and ground cover
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { makeTexture, canvas2d } from './textures.js';
import { firBranch, leafCluster, fernCluster, grassTuft } from './foliage.js';
import { rng, fbm, TAU, clamp, lerp, smoothstep } from './util.js';
import { getHeight, pathDistance } from './terrain.js';
import { blocksShot } from './shots.js';

let WIND_UNIFORMS = { uTime: { value: 0 } };

function windify(material, amplitude, height) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WIND_UNIFORMS.uTime;
    shader.uniforms.uWindAmp = { value: amplitude };
    shader.uniforms.uWindHeight = { value: height };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWindAmp;
         uniform float uWindHeight;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           float hFac = clamp(position.y / uWindHeight, 0.0, 1.0);
           hFac = hFac * hFac;
           float ipx = instanceMatrix[3][0];
           float ipz = instanceMatrix[3][2];
           float phase = uTime * 0.7 + ipx * 0.37 + ipz * 0.29;
           float gust = 0.55 + 0.45 * sin(uTime * 0.23 + ipx * 0.05 + ipz * 0.04);
           transformed.x += (sin(phase) * 0.62 + sin(phase * 2.7 + 1.7) * 0.3) * uWindAmp * hFac * gust;
           transformed.z += (cos(phase * 1.13 + 0.4) * 0.5 + sin(phase * 3.1) * 0.22) * uWindAmp * hFac * gust;
         #endif`
      );
  };
  material.customProgramCacheKey = () => `wind-${amplitude.toFixed(2)}-${height.toFixed(1)}`;
  return material;
}

export function tickWind(t) {
  WIND_UNIFORMS.uTime.value = t;
}

/* ------------------------------------------------------------------ bark */
function barkCanvas(seed = 4, tint = [26, 14, 22], birch = false) {
  const W = 256, H = 1024;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(W, H);
  if (birch) {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#9d968a');
    g.addColorStop(0.3, '#ddd7c8');
    g.addColorStop(0.55, '#c6c0b2');
    g.addColorStop(0.8, '#e3ddce');
    g.addColorStop(1, '#a49d90');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 180; i++) {
      const y = rand() * H, x = rand() * W;
      ctx.fillStyle = `rgba(44,38,32,${0.08 + rand() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 8 + rand() * 40, 1 + rand() * 3, 0, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 22; i++) {
      const x = rand() * W, y = rand() * H;
      ctx.fillStyle = `rgba(30,26,22,${0.4 + rand() * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8 + rand() * 30, y + (rand() - 0.5) * 10);
      ctx.lineTo(x + 6 + rand() * 22, y + 5 + rand() * 12);
      ctx.closePath();
      ctx.fill();
    }
    const mg = ctx.createLinearGradient(0, H, 0, H * 0.68);
    mg.addColorStop(0, 'rgba(78,98,48,0.45)');
    mg.addColorStop(1, 'rgba(78,98,48,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, H * 0.68, W, H * 0.32);
    return c;
  }
  ctx.fillStyle = `hsl(${tint[0]},${tint[1]}%,${tint[2]}%)`;
  ctx.fillRect(0, 0, W, H);
  // vertical plates and furrows
  for (let i = 0; i < 150; i++) {
    const x = rand() * W;
    const w = 2 + rand() * 14;
    const l = tint[2] * (0.5 + rand() * 1.3);
    ctx.fillStyle = `hsla(${tint[0] + (rand() - 0.5) * 10},${tint[1] + rand() * 12}%,${l}%,${0.2 + rand() * 0.5})`;
    let y = -30;
    while (y < H + 30) {
      const seg = 40 + rand() * 200;
      ctx.fillRect(x, y, w, seg);
      y += seg + rand() * 10;
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = rand() * W;
    ctx.strokeStyle = `rgba(8,6,5,${0.2 + rand() * 0.45})`;
    ctx.lineWidth = 1 + rand() * 4;
    ctx.beginPath();
    let y = -20;
    ctx.moveTo(x, y);
    while (y < H + 20) {
      const seg = 50 + rand() * 160;
      y += seg;
      ctx.lineTo(x + (rand() - 0.5) * 9, y);
    }
    ctx.stroke();
  }
  // lichen
  for (let i = 0; i < 260; i++) {
    const x = rand() * W, y = rand() * H;
    ctx.fillStyle = `hsla(${66 + rand() * 40},${14 + rand() * 22}%,${40 + rand() * 30}%,${0.05 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + rand() * 6, 0, TAU);
    ctx.fill();
  }
  return c;
}

/* ------------------------------------------------------------------ geometry */
function trunkGeometry(rand, height, rBottom, rTop, bend = 0.35, segments = 9) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 7, false);
  const pos = geo.attributes.position;
  const c1 = (rand() - 0.5) * bend;
  const c2 = (rand() - 0.5) * bend;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + height / 2;
    const t = y / height;
    const sway = Math.sin(t * Math.PI * 0.85) * c1 + t * t * c2;
    pos.setX(i, pos.getX(i) + sway * t);
    pos.setZ(i, pos.getZ(i) + sway * 0.55 * t);
  }
  geo.computeVertexNormals();
  geo.translate(0, height / 2, 0);
  return geo;
}

/** merge a list of geometries into one (all must share attribute layout) */
function merge(list) {
  const cleaned = list.map((g) => {
    g.deleteAttribute('uv1');
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    return g.index ? g.toNonIndexed() : g;
  });
  return BufferGeometryUtils.mergeGeometries(cleaned, false);
}

/**
 * Build a fir: trunk + whorls of drooping branch cards.
 * The card is a vertical plane whose origin sits at the branch base,
 * rotated to point outward and down.
 */
function firParts(seed, opts = {}) {
  const rand = rng(seed);
  const height = opts.height ?? (9 + rand() * 6);
  const tiers = opts.tiers ?? 20;
  const perTier = opts.perTier ?? 7;
  const trunkR = height * 0.019;
  const trunkGeo = trunkGeometry(rand, height, trunkR * 1.6, trunkR * 0.18, 0.44, 9);
  const cards = [];
  const startT = 0.14;
  const maxR = opts.spread ?? height * 0.23;

  for (let t = 0; t < tiers; t++) {
    const tt = t / (tiers - 1);
    const y = height * (startT + (1 - startT) * Math.pow(tt, 0.95));
    // radius profile: widest at ~30% height, tapering to a point
    const prof = Math.pow(1 - tt, 1.15);
    const radius = maxR * (0.30 + 0.70 * prof);
    const n = Math.max(3, Math.round(perTier * (0.55 + 0.45 * prof)));
    for (let b = 0; b < n; b++) {
      const a = (b / n) * TAU + t * 1.13 + rand() * 0.4;
      const len = radius * (0.82 + rand() * 0.38);
      const width = len * (0.52 + rand() * 0.22);
      const droop = 0.28 + rand() * 0.3 + (1 - tt) * 0.12;
      const g = new THREE.PlaneGeometry(width, len, 1, 2);
      // plane spans X (width) and Y (length); move origin to its base
      g.translate(0, len * 0.5, 0);
      // slight curl along the branch
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const py = p.getY(v);
        const u = py / len;
        p.setZ(v, p.getZ(v) + Math.sin(u * Math.PI) * width * 0.10);
        p.setY(v, py - u * u * len * (0.10 + rand() * 0.08));
      }
      g.computeVertexNormals();
      // orient the card: swing it outward on its azimuth, then tilt it down
      const pitch = new THREE.Matrix4().makeRotationZ(-(Math.PI / 2 + droop * 0.55));
      const yaw = new THREE.Matrix4().makeRotationY(-a);
      g.applyMatrix4(pitch);
      g.applyMatrix4(yaw);
      g.translate(0, y, 0);
      cards.push(g);
    }
  }
  // leader spire
  for (let i = 0; i < 4; i++) {
    const g = new THREE.PlaneGeometry(height * 0.05, height * 0.16);
    g.translate(0, height * 0.08, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY((i / 4) * TAU + 0.4));
    g.translate(0, height * 0.92, 0);
    cards.push(g);
  }
  return { trunk: trunkGeo, foliage: merge(cards), height };
}

/** pine: taller, bare lower trunk, umbrella of long needles near the top */
function pineParts(seed) {
  const rand = rng(seed);
  const height = 11 + rand() * 8;
  const trunkGeo = trunkGeometry(rand, height, height * 0.021, height * 0.008, 0.55, 8);
  const cards = [];
  const tiers = 6;
  for (let t = 0; t < tiers; t++) {
    const tt = t / (tiers - 1);
    const y = height * (0.58 + tt * 0.34);
    const radius = (1 - tt * 0.55) * height * 0.20;
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * TAU + rand() * 0.7 + t * 0.8;
      const len = radius * (0.85 + rand() * 0.45);
      const g = new THREE.PlaneGeometry(len * 0.62, len, 1, 2);
      g.translate(0, len * 0.5, 0);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const u = p.getY(v) / len;
        p.setZ(v, p.getZ(v) + Math.sin(u * Math.PI) * len * 0.07);
      }
      g.computeVertexNormals();
      const yaw = new THREE.Matrix4().makeRotationY(-a);
      const pitch = new THREE.Matrix4().makeRotationZ(-(Math.PI / 2 + 0.16 + rand() * 0.2));
      g.applyMatrix4(pitch);
      g.applyMatrix4(yaw);
      g.translate(0, y, 0);
      cards.push(g);
    }
  }
  for (let i = 0; i < 5; i++) {
    const g = new THREE.PlaneGeometry(height * 0.09, height * 0.14);
    g.translate(0, height * 0.07, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY((i / 5) * TAU));
    g.translate(0, height * 0.95, 0);
    cards.push(g);
  }
  return { trunk: trunkGeo, foliage: merge(cards), height };
}

/** birch: white trunk, thin limbs, loose leaf clusters */
function birchParts(seed) {
  const rand = rng(seed);
  const height = 8 + rand() * 6;
  const trunkGeo = trunkGeometry(rand, height, height * 0.019, height * 0.007, 0.85, 8);
  const limbGeos = [];
  const cards = [];
  const clusters = 16;
  for (let i = 0; i < clusters; i++) {
    const a = rand() * TAU;
    const rr = Math.pow(rand(), 0.65) * height * 0.16;
    const y = height * (0.52 + rand() * 0.44);
    const sc = 1.1 + rand() * 1.1;
    // limb from trunk to cluster
    if (i < 9) {
      const len = Math.hypot(rr, height * 0.1);
      const lg = new THREE.CylinderGeometry(0.012, 0.035, len, 4, 1);
      lg.translate(0, len / 2, 0);
      lg.applyMatrix4(new THREE.Matrix4().makeRotationZ(-1.0 - rand() * 0.4));
      lg.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
      lg.translate(0, y - height * 0.04, 0);
      limbGeos.push(lg);
    }
    for (let k = 0; k < 4; k++) {
      const g = new THREE.PlaneGeometry(sc * 1.5, sc * 1.5);
      g.applyMatrix4(new THREE.Matrix4().makeRotationX((rand() - 0.5) * 1.1));
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(rand() * TAU));
      g.translate(
        Math.cos(a) * rr + (rand() - 0.5) * 0.8,
        y + (rand() - 0.5) * 0.9,
        Math.sin(a) * rr + (rand() - 0.5) * 0.8
      );
      cards.push(g);
    }
  }
  const trunkMerged = merge([trunkGeo, ...limbGeos]);
  return { trunk: trunkMerged, foliage: merge(cards), height };
}

function deadTreeParts(seed) {
  const rand = rng(seed);
  const height = 6 + rand() * 5;
  const trunkGeo = trunkGeometry(rand, height, height * 0.028, height * 0.006, 1.1, 7);
  const limbs = [];
  for (let i = 0; i < 10; i++) {
    const y = height * (0.3 + rand() * 0.64);
    const len = height * (0.16 + rand() * 0.3);
    const g = new THREE.CylinderGeometry(0.012 + rand() * 0.018, 0.04 + rand() * 0.05, len, 5, 1);
    g.translate(0, len / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.9 + rand() * 0.8));
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(rand() * TAU));
    g.translate(0, y, 0);
    limbs.push(g);
  }
  return { trunk: merge([trunkGeo, ...limbs]), foliage: null, height };
}

/* ------------------------------------------------------------------ public build */
export function buildForest(scene, onStage) {
  const rand = rng(1337);

  // ---- textures
  const firTex = makeTexture(firBranch(3, { sprigs: 3, twigs: 9, light: 24 }), { wrap: THREE.ClampToEdgeWrapping });
  const firTex2 = makeTexture(firBranch(17, { sprigs: 3, twigs: 10, light: 30, hue: 112 }), { wrap: THREE.ClampToEdgeWrapping });
  const leafTex = makeTexture(leafCluster(31, 94), { wrap: THREE.ClampToEdgeWrapping });
  const leafTex2 = makeTexture(leafCluster(63, 82), { wrap: THREE.ClampToEdgeWrapping });
  const fernTex = makeTexture(fernCluster(91), { wrap: THREE.ClampToEdgeWrapping });
  const grassTex = makeTexture(grassTuft(77), { wrap: THREE.ClampToEdgeWrapping });
  const barkTex = makeTexture(barkCanvas(4, [24, 15, 20]), { repeat: [2, 1] });
  const pineBarkTex = makeTexture(barkCanvas(9, [22, 22, 24]), { repeat: [2, 1] });
  const birchTex = makeTexture(barkCanvas(21, null, true), { repeat: [2, 1] });

  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x9c8468, roughness: 0.95 });
  const pineBarkMat = new THREE.MeshStandardMaterial({ map: pineBarkTex, color: 0xb08a60, roughness: 0.92 });
  const birchMat = new THREE.MeshStandardMaterial({ map: birchTex, color: 0xe4ddcf, roughness: 0.82 });
  const deadMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x7a7062, roughness: 0.95 });

  const firMat = windify(new THREE.MeshStandardMaterial({
    map: firTex, alphaTest: 0.30, side: THREE.DoubleSide,
    color: 0x9fb08e, roughness: 0.88, metalness: 0.0,
  }), 0.055, 16);
  const firMat2 = windify(new THREE.MeshStandardMaterial({
    map: firTex2, alphaTest: 0.30, side: THREE.DoubleSide,
    color: 0x93a684, roughness: 0.88,
  }), 0.05, 16);
  const leafMat = windify(new THREE.MeshStandardMaterial({
    map: leafTex, alphaTest: 0.34, side: THREE.DoubleSide,
    color: 0xbcc79c, roughness: 0.86,
  }), 0.09, 15);
  const leafMat2 = windify(new THREE.MeshStandardMaterial({
    map: leafTex2, alphaTest: 0.34, side: THREE.DoubleSide,
    color: 0xadb98d, roughness: 0.86,
  }), 0.08, 15);

  const variants = [
    { parts: firParts(3, { height: 13.5, tiers: 22, perTier: 7, spread: 3.1 }), trunkMat: barkMat, foliageMat: firMat },
    { parts: firParts(8, { height: 10.5, tiers: 19, perTier: 6, spread: 2.5 }), trunkMat: barkMat, foliageMat: firMat2 },
    { parts: pineParts(5), trunkMat: pineBarkMat, foliageMat: firMat },
    { parts: pineParts(19), trunkMat: pineBarkMat, foliageMat: firMat2 },
    { parts: birchParts(11), trunkMat: birchMat, foliageMat: leafMat },
    { parts: birchParts(29), trunkMat: birchMat, foliageMat: leafMat2 },
    { parts: firParts(41, { height: 15, tiers: 12, perTier: 5, spread: 3.2 }), trunkMat: barkMat, foliageMat: firMat2 },
    { parts: deadTreeParts(51), trunkMat: deadMat, foliageMat: null },
  ];

  const shadowGroup = new THREE.Group();
  shadowGroup.name = 'forest';
  scene.add(shadowGroup);

  const placements = variants.map(() => []);
  const occupied = [];
  const freeAt = (x, z, minDist) => {
    for (let i = 0; i < occupied.length; i++) {
      const o = occupied[i];
      const dx = o[0] - x, dz = o[1] - z;
      const rr = minDist + o[2];
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  };

  const place = (x, z, scale, vi, hero = false) => {
    const h = getHeight(x, z);
    placements[vi].push({
      x, z,
      y: h - 0.18,
      rotY: rand() * TAU,
      tiltX: (rand() - 0.5) * 0.05,
      tiltZ: (rand() - 0.5) * 0.05,
      sx: scale * (0.92 + rand() * 0.2),
      sy: scale * (0.9 + rand() * 0.28),
      sz: scale * (0.92 + rand() * 0.2),
      hero,
    });
    occupied.push([x, z, 1.1]);
  };

  // ---- hero trees that frame the clearing (chosen by hand for composition)
  const heroes = [
    [-13.5, 8.0, 1.05, 0], [12.5, 10.0, 1.10, 0], [13.4, -5.5, 1.05, 2],
    [-12.0, -3.0, 1.0, 1], [8.5, -9.0, 1.0, 0], [-6.5, -11.5, 1.05, 2],
    [9.5, 16.5, 0.95, 0], [-11.5, 17.0, 1.0, 0], [18.5, 3.0, 1.1, 1],
    [-18.0, 14.0, 1.0, 2], [3.5, 17.5, 0.9, 5], [-2.5, -14.0, 1.0, 0],
    [16.0, 18.0, 1.0, 4], [-16.5, -9.0, 1.05, 1], [6.0, 20.5, 0.95, 2],
    [-8.0, 21.0, 0.9, 0], [21.0, 12.0, 1.0, 0], [-21.0, 3.0, 1.05, 2],
  ];
  for (const [x, z, sc, vi] of heroes) {
    if (Math.hypot(x, z) < 8.0) continue;
    if (blocksShot(x, z, 3.2, 1.4)) continue;
    place(x, z, sc, vi, true);
  }

  // ---- the surrounding forest
  let placed = 0;
  let attempts = 0;
  const target = 520;
  while (placed < target && attempts < 16000) {
    attempts++;
    const a = rand() * TAU;
    const r = 9.5 + Math.pow(rand(), 0.5) * 68;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (pathDistance(x, z) < 2.2) continue;
    if (Math.abs(x) < 7.6 && Math.abs(z - 0.3) < 6.6) continue;
    if (blocksShot(x, z)) continue;
    if (!freeAt(x, z, r < 30 ? 1.8 : 2.4)) continue;
    const density = fbm(x * 0.04 + 9, z * 0.04 + 3, 3, 77);
    if (density < 0.30 && rand() > 0.25) continue;
    const near = r < 24;
    let vi;
    if (near) {
      const roll = rand();
      vi = roll < 0.42 ? (rand() < 0.5 ? 0 : 1) : roll < 0.74 ? (rand() < 0.5 ? 2 : 3) : (rand() < 0.5 ? 4 : 5);
    } else {
      vi = rand() < 0.68 ? (rand() < 0.5 ? 6 : 1) : rand() < 0.5 ? 3 : 5;
    }
    const sc = near ? 0.72 + rand() * 0.52 : 0.95 + rand() * 0.75;
    place(x, z, sc, vi);
    placed++;
  }

  // ---- instantiate
  const dummy = new THREE.Object3D();
  const buildSet = (list, variant, castShadow) => {
    if (!list.length) return;
    const trunkMesh = new THREE.InstancedMesh(variant.parts.trunk, variant.trunkMat, list.length);
    trunkMesh.castShadow = castShadow;
    trunkMesh.receiveShadow = true;
    const foliMesh = variant.parts.foliage
      ? new THREE.InstancedMesh(variant.parts.foliage, variant.foliageMat, list.length)
      : null;
    if (foliMesh) { foliMesh.castShadow = castShadow; foliMesh.receiveShadow = true; }
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.tiltX, p.rotY, p.tiltZ);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      foliMesh && foliMesh.setMatrixAt(i, dummy.matrix);
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    shadowGroup.add(trunkMesh);
    if (foliMesh) { foliMesh.instanceMatrix.needsUpdate = true; shadowGroup.add(foliMesh); }
  };

  variants.forEach((v, i) => {
    const all = placements[i];
    const hero = all.filter((p) => p.hero);
    const rest = all.filter((p) => !p.hero);
    buildSet(hero, v, true);
    buildSet(rest, v, true);
  });

  onStage && onStage('种下针叶林与白桦');

  /* ---- undergrowth ---- */
  const bushGeos = [];
  {
    const r2 = rng(55);
    for (let i = 0; i < 22; i++) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.translate(0, 0.5, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(r2() * TAU));
      g.applyMatrix4(new THREE.Matrix4().makeRotationX((r2() - 0.5) * 0.75));
      bushGeos.push(g);
    }
  }
  const bushGeo = merge(bushGeos);
  const bushMat = windify(new THREE.MeshStandardMaterial({
    map: leafTex, alphaTest: 0.34, side: THREE.DoubleSide, color: 0x93a578, roughness: 0.95,
  }), 0.04, 1.8);
  {
    const r3 = rng(404);
    const count = 110;
    const im = new THREE.InstancedMesh(bushGeo, bushMat, count);
    im.castShadow = true; im.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const col = new THREE.Color();
    let k = 0, guard = 0;
    while (k < count && guard < 5000) {
      guard++;
      const a = r3() * TAU;
      const r = 7.5 + Math.pow(r3(), 0.7) * 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDistance(x, z) < 1.5) continue;
      if (Math.abs(x) < 5.8 && Math.abs(z - 0.3) < 5.6) continue;
      if (blocksShot(x, z, 3.6, 1.0)) continue;
      const sc = 0.45 + r3() * 1.0;
      p3.set(x, getHeight(x, z) - 0.06, z);
      q.setFromEuler(new THREE.Euler(0, r3() * TAU, 0));
      s3.set(sc, sc * (0.65 + r3() * 0.5), sc);
      m4.compose(p3, q, s3);
      im.setMatrixAt(k, m4);
      col.setHSL(0.22 + r3() * 0.06, 0.18 + r3() * 0.12, 0.36 + r3() * 0.14);
      im.setColorAt(k, col);
      k++;
    }
    im.count = k;
    scene.add(im);
  }

  const fernMat = windify(new THREE.MeshStandardMaterial({
    map: fernTex, alphaTest: 0.28, side: THREE.DoubleSide, color: 0xb2c48f, roughness: 0.9,
  }), 0.035, 1.0);
  {
    const r4 = rng(808);
    const geos = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.PlaneGeometry(1.0, 1.0);
      g.translate(0, 0.5, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY((i / 3) * TAU + r4()));
      geos.push(g);
    }
    const fGeo = merge(geos);
    const count = 620;
    const im = new THREE.InstancedMesh(fGeo, fernMat, count);
    im.castShadow = true; im.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const col = new THREE.Color();
    let k = 0, guard = 0;
    while (k < count && guard < 12000) {
      guard++;
      const a = r4() * TAU;
      const r = 5.0 + Math.pow(r4(), 0.55) * 26;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDistance(x, z) < 0.95) continue;
      if (Math.abs(x) < 5.3 && Math.abs(z - 0.3) < 5.1) continue;
      if (blocksShot(x, z, 4.2, 1.35)) continue;
      if (r4() > 0.16 + fbm(x * 0.09, z * 0.09, 2, 3) * 1.05) continue;
      const sc = 0.5 + r4() * 0.85;
      p3.set(x, getHeight(x, z) - 0.04, z);
      q.setFromEuler(new THREE.Euler(0, r4() * TAU, 0));
      s3.set(sc, sc * (0.8 + r4() * 0.5), sc);
      m4.compose(p3, q, s3);
      im.setMatrixAt(k, m4);
      col.setHSL(0.24 + r4() * 0.04, 0.22 + r4() * 0.14, 0.44 + r4() * 0.14);
      im.setColorAt(k, col);
      k++;
    }
    im.count = k;
    scene.add(im);
  }

  const grassMat = windify(new THREE.MeshStandardMaterial({
    map: grassTex, alphaTest: 0.26, side: THREE.DoubleSide, color: 0xa8b98a, roughness: 0.92,
  }), 0.10, 0.6);
  {
    const r5 = rng(606);
    const geos = [];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.PlaneGeometry(0.66, 0.66);
      g.translate(0, 0.33, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(i * Math.PI / 2 + r5()));
      geos.push(g);
    }
    const gGeo = merge(geos);
    const count = 5200;
    const im = new THREE.InstancedMesh(gGeo, grassMat, count);
    im.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const col = new THREE.Color();
    let k = 0, guard = 0;
    while (k < count && guard < 40000) {
      guard++;
      const a = r5() * TAU;
      const r = 2.6 + Math.pow(r5(), 0.42) * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDistance(x, z) < 0.8) continue;
      if (Math.abs(x) < 5.3 && Math.abs(z - 0.3) < 5.1) continue;
      if (Math.abs(x - 6.4) < 2.6 && Math.abs(z - 9.2) < 1.9) continue;
      const sc = 0.65 + r5() * 1.0;
      p3.set(x, getHeight(x, z) - 0.02, z);
      q.setFromEuler(new THREE.Euler(0, r5() * TAU, 0));
      s3.set(sc, sc * (0.75 + r5() * 0.7), sc);
      m4.compose(p3, q, s3);
      im.setMatrixAt(k, m4);
      col.setHSL(0.17 + r5() * 0.08, 0.26 + r5() * 0.2, 0.44 + r5() * 0.2);
      im.setColorAt(k, col);
      k++;
    }
    im.count = k;
    scene.add(im);
  }

  /* ---- mushrooms ---- */
  {
    const capMat = new THREE.MeshStandardMaterial({ color: 0xa8492f, roughness: 0.72 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xd9cfb6, roughness: 0.9 });
    const r6 = rng(919);
    const count = 40;
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 5, 0, TAU, 0, Math.PI * 0.55), capMat, count);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.026, 1, 5), stemMat, count);
    caps.castShadow = true; stems.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    let k = 0, guard = 0;
    while (k < count && guard < 3000) {
      guard++;
      const a = r6() * TAU;
      const r = 4.5 + Math.pow(r6(), 0.5) * 16;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDistance(x, z) < 1.1) continue;
      if (Math.abs(x) < 5.4 && Math.abs(z - 0.3) < 5.2) continue;
      const sc = 0.55 + r6() * 0.9;
      const y = getHeight(x, z);
      p3.set(x, y + 0.06 * sc, z);
      q.identity();
      s3.set(0.052 * sc, 0.034 * sc, 0.052 * sc);
      m4.compose(p3, q, s3);
      caps.setMatrixAt(k, m4);
      p3.set(x, y + 0.02, z);
      s3.set(sc, 0.1 * sc, sc);
      m4.compose(p3, q, s3);
      stems.setMatrixAt(k, m4);
      k++;
    }
    caps.count = k; stems.count = k;
    scene.add(caps, stems);
  }

  onStage && onStage('铺满蕨类与野草');

  return {
    update(t) { tickWind(t); },
    treeCount: placed,
  };
}
