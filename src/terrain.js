// terrain.js — forest floor, winding dirt path, garden bed and ground dressing
import * as THREE from 'three';
import { fbm, smoothstep, clamp, lerp, rng, TAU, noise2, canvas2d, makeTexture } from './util.js';

export const WORLD = 150;

/* ---------------------------------------------------------------- height field */
export function getHeight(x, z) {
  let h = (fbm(x * 0.028 + 4.2, z * 0.028 + 9.1, 4, 101) - 0.5) * 4.2;
  h += (fbm(x * 0.09, z * 0.09, 3, 55) - 0.5) * 0.9;
  // forest rises away from the clearing, especially behind the cabin
  const r = Math.hypot(x, z * 0.9);
  h += smoothstep(10, 46, r) * 2.4;
  h += smoothstep(8, 26, Math.max(0, -z)) * 1.2;
  // gentle fall in front of the house
  h -= smoothstep(10, 34, Math.max(0, z)) * 1.1;
  // flatten the clearing and the house pad
  const padRect = Math.max(Math.abs(x) - 5.4, Math.abs(z - 0.3) - 5.2);
  const pad = 1 - smoothstep(0, 5.2, padRect);
  h = lerp(h, 0, pad);
  const clearing = 1 - smoothstep(9, 17, Math.hypot(x, z));
  h = lerp(h, h * 0.3, clearing * 0.8);
  // hollow along the path
  const pd = pathDistance(x, z);
  const carve = (1 - smoothstep(0.55, 2.0, pd)) * 0.18;
  h -= carve;
  return h;
}

/* ---------------------------------------------------------------- the path */
export const PATH_POINTS = [
  [0.0, 4.6], [0.55, 6.4], [1.9, 8.6], [2.2, 11.2], [0.9, 13.9],
  [0.2, 16.8], [1.7, 19.6], [3.5, 22.4], [3.2, 26.0], [1.4, 30.0], [0.6, 35.0],
];
const PATH_SAMPLES = (() => {
  const pts = [];
  const curve = new THREE.CatmullRomCurve3(
    PATH_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.5
  );
  const N = 260;
  for (let i = 0; i <= N; i++) {
    const p = curve.getPoint(i / N);
    pts.push([p.x, p.z]);
  }
  return pts;
})();

export function nearestPath(x, z) {
  let best = 1e9, bi = 0;
  for (let i = 0; i < PATH_SAMPLES.length; i++) {
    const dx = PATH_SAMPLES[i][0] - x, dz = PATH_SAMPLES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; }
  }
  return { dist: Math.sqrt(best), t: bi / (PATH_SAMPLES.length - 1), index: bi, point: PATH_SAMPLES[bi] };
}
export function pathDistance(x, z) { return nearestPath(x, z).dist; }

/* ---------------------------------------------------------------- ground texture */
function forestFloorTexture() {
  const S = 1024;
  const rand = rng(404);
  const { c, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#2a2219';
  ctx.fillRect(0, 0, S, S);

  // broad soil colour patches (tiling)
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const r2 = rng(9);
    for (let i = 0; i < 240; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S, rad = 20 + r2() * 150;
      const h = 24 + r2() * 16, s = 16 + r2() * 22, l = 12 + r2() * 14;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `hsla(${h},${s}%,${l}%,0.16)`);
      g.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
  }

  // leaf litter
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const r2 = rng(21);
    for (let i = 0; i < 1500; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S;
      const w = 4 + r2() * 16, h = w * (0.4 + r2() * 0.4);
      const hue = 24 + r2() * 34;
      const sat = 20 + r2() * 40;
      const l = 14 + r2() * 26;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r2() * TAU);
      ctx.fillStyle = `hsla(${hue},${sat}%,${l}%,${0.35 + r2() * 0.5})`;
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); ctx.fill();
      // midrib
      ctx.strokeStyle = `hsla(${hue - 6},${sat}%,${l * 0.65}%,0.35)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
      ctx.restore();
    }
  }

  // pine needles
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const r2 = rng(33);
    for (let i = 0; i < 1400; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S;
      const a = r2() * TAU, len = 6 + r2() * 22;
      ctx.strokeStyle = `hsla(${28 + r2() * 30},${26 + r2() * 20}%,${12 + r2() * 18}%,${0.25 + r2() * 0.4})`;
      ctx.lineWidth = 0.7 + r2();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  // moss clumps
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const r2 = rng(47);
    for (let i = 0; i < 90; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S, rad = 24 + r2() * 110;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `hsla(${74 + r2() * 24},${30 + r2() * 24}%,${16 + r2() * 14}%,0.30)`);
      g.addColorStop(0.6, `hsla(${78 + r2() * 20},${28 + r2() * 18}%,${14 + r2() * 10}%,0.12)`);
      g.addColorStop(1, 'hsla(80,30%,12%,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
  }

  // small stones & twigs
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const r2 = rng(61);
    for (let i = 0; i < 220; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S, rr = 1.2 + r2() * 4.5;
      ctx.fillStyle = `hsla(${30 + r2() * 20},${4 + r2() * 12}%,${22 + r2() * 26}%,${0.5 + r2() * 0.4})`;
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * (0.6 + r2() * 0.4), r2() * TAU, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 40; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S;
      const a = r2() * TAU, len = 10 + r2() * 34;
      ctx.strokeStyle = `hsla(${26 + r2() * 10},22%,${10 + r2() * 10}%,0.6)`;
      ctx.lineWidth = 1.5 + r2() * 2.5;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 4, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  return c;
}

function dirtTexture(seed = 8) {
  const S = 512;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#4a3a28';
  ctx.fillRect(0, 0, S, S);
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const r2 = rng(seed + 3);
    for (let i = 0; i < 400; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S, rad = 6 + r2() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const l = 16 + r2() * 20;
      g.addColorStop(0, `hsla(${30 + r2() * 14},${18 + r2() * 16}%,${l}%,0.35)`);
      g.addColorStop(1, `hsla(32,20%,${l}%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 700; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S, rr = 0.8 + r2() * 3.4;
      ctx.fillStyle = `hsla(${28 + r2() * 24},${10 + r2() * 22}%,${20 + r2() * 30}%,${0.3 + r2() * 0.5})`;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    }
    // footprints-ish ruts
    for (let i = 0; i < 26; i++) {
      const x = r2() * S + ox * S, y = r2() * S + oy * S, w = 6 + r2() * 14;
      ctx.strokeStyle = `hsla(32,22%,${10 + r2() * 8}%,0.22)`;
      ctx.lineWidth = 1 + r2() * 2;
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.4, r2() * TAU, 0, TAU);
      ctx.stroke();
    }
  }
  return c;
}

/* ---------------------------------------------------------------- splat map */
function splatMap() {
  const S = 1024;
  const { c, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, S, S);
  const toPx = (x, z) => [((x + WORLD / 2) / WORLD) * S, ((z + WORLD / 2) / WORLD) * S];

  // moss channel (green): large soft patches
  ctx.globalCompositeOperation = 'lighter';
  const rand = rng(5);
  for (let i = 0; i < 220; i++) {
    const x = rand() * S, y = rand() * S, r = 30 + rand() * 150;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,${40 + rand() * 80},0,0.30)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  // path channel (red): soft ribbon with irregular edges
  ctx.globalCompositeOperation = 'lighter';
  const steps = PATH_SAMPLES.length;
  for (let i = 0; i < steps; i++) {
    const [x, z] = PATH_SAMPLES[i];
    const [px, py] = toPx(x, z);
    const n = 0.55 + noise2(i * 0.07, 2.3, 71) * 0.45;
    const r = (WORLD > 0 ? (S / WORLD) : 1) * (1.15 + n * 0.55);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.6);
    g.addColorStop(0, 'rgba(255,0,0,0.42)');
    g.addColorStop(0.45, 'rgba(220,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, r * 2.6, 0, TAU); ctx.fill();
  }
  // clearing around the cabin gets more trodden earth
  {
    const [px, py] = toPx(0, 1.5);
    const g = ctx.createRadialGradient(px, py, 0, px, py, (S / WORLD) * 8.5);
    g.addColorStop(0, 'rgba(255,0,0,0.42)');
    g.addColorStop(0.55, 'rgba(210,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, (S / WORLD) * 8.5, 0, TAU); ctx.fill();
  }
  // garden patch: rich dark soil, no moss
  {
    const [px, py] = toPx(6.4, 9.2);
    const g = ctx.createRadialGradient(px, py, 0, px, py, (S / WORLD) * 3.4);
    g.addColorStop(0, 'rgba(200,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, (S / WORLD) * 3.4, 0, TAU); ctx.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ---------------------------------------------------------------- build */
export function buildTerrain(scene, onStage) {
  const seg = 420;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = getHeight(x, z);
    pos.setY(i, y);
    const moss = smoothstep(0.40, 0.72, fbm(x * 0.06 + 20, z * 0.06, 3, 13));
    const n = fbm(x * 0.12, z * 0.12, 3, 71);
    // a gentle multiplier over the tiled albedo: greener where mossy, warmer in dips
    const warm = 0.94 + n * 0.12;
    tmp.setRGB(
      lerp(warm, 0.80, moss * 0.8),
      lerp(warm, 1.02, moss * 0.8),
      lerp(warm * 0.94, 0.72, moss * 0.8)
    );
    const shade = 1 - (1 - smoothstep(5.5, 17, Math.hypot(x, z))) * 0.14;
    // fade distant ground into the fog so the horizon never reads as a bare hill
    const far = 1 - smoothstep(16, 52, Math.hypot(x, z)) * 0.55;
    tmp.multiplyScalar(shade * far);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const floorCanvas = forestFloorTexture();
  const floorTex = makeTexture(floorCanvas, { repeat: [1, 1], aniso: 16 });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  const dirtTex = makeTexture(dirtTexture(), { repeat: [1, 1], aniso: 16 });
  const splat = splatMap();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
  });
  mat.userData.uniforms = {
    uFloor: { value: floorTex },
    uDirt: { value: dirtTex },
    uSplat: { value: splat },
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFloor = mat.userData.uniforms.uFloor;
    shader.uniforms.uDirt = mat.userData.uniforms.uDirt;
    shader.uniforms.uSplat = mat.userData.uniforms.uSplat;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWPos;
         uniform sampler2D uFloor;
         uniform sampler2D uDirt;
         uniform sampler2D uSplat;`
      )
      .replace(
        '#include <map_fragment>',
        `vec3 fCol = texture2D(uFloor, vWPos.xz * 0.24).rgb;
         vec3 fCol2 = texture2D(uFloor, vWPos.xz * 0.071 + vec2(0.37, 0.61)).rgb;
         vec3 baseCol = mix(fCol, fCol2, 0.42);
         vec3 dCol = texture2D(uDirt, vWPos.xz * 0.52).rgb;
         vec4 sp = texture2D(uSplat, (vWPos.xz + ${(WORLD / 2).toFixed(1)}) / ${WORLD.toFixed(1)});
         float pathP = smoothstep(0.30, 0.72, sp.r);
         vec3 groundCol = mix(baseCol * (0.55 + 0.75 * sp.g), dCol * 1.06, pathP);
         diffuseColor.rgb *= groundCol * 2.35;`
      );
  };
  mat.customProgramCacheKey = () => 'forest-ground';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  onStage && onStage('铺开林间土地');

  return { mesh, geo, mat, getHeight };
}

/* ---------------------------------------------------------------- ground dressing */
export function buildGroundDetail(scene, onStage) {
  const rand = rng(2024);
  const group = new THREE.Group();
  group.name = 'groundDetail';

  // ---------- stones
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x8d8579, roughness: 0.92, metalness: 0.0, flatShading: true,
  });
  const stoneGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = stoneGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 0.7 + fbm(v.x * 2 + 5, v.z * 2 + 1, 2, 9) * 0.6;
      v.multiplyScalar(n);
      p.setXYZ(i, v.x, v.y * 0.62, v.z);
    }
    stoneGeo.computeVertexNormals();
  }
  const stoneCount = 46;
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);
  stones.castShadow = true; stones.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < stoneCount; i++) {
    let x, z, tries = 0;
    do {
      const a = rand() * TAU, r = 6 + Math.pow(rand(), 0.6) * 40;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      tries++;
    } while ((pathDistance(x, z) < 1.4 || Math.abs(x) < 5.6 && Math.abs(z) < 5.4) && tries < 30);
    const sc = 0.16 + Math.pow(rand(), 2.4) * 0.9;
    pv.set(x, getHeight(x, z) - sc * 0.16, z);
    q.setFromEuler(new THREE.Euler(rand() * 0.4, rand() * TAU, rand() * 0.4));
    s.set(sc * (0.8 + rand() * 0.7), sc * (0.55 + rand() * 0.5), sc * (0.8 + rand() * 0.7));
    m4.compose(pv, q, s);
    stones.setMatrixAt(i, m4);
    col.setHSL(0.09 + rand() * 0.04, 0.05 + rand() * 0.08, 0.24 + rand() * 0.2);
    stones.setColorAt(i, col);
  }
  group.add(stones);

  // ---------- fallen branches & logs
  const branchMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2b, roughness: 0.95 });
  const branchGeo = new THREE.CylinderGeometry(0.5, 0.7, 1, 6, 1);
  const branchCount = 40;
  const branches = new THREE.InstancedMesh(branchGeo, branchMat, branchCount);
  branches.castShadow = true; branches.receiveShadow = true;
  for (let i = 0; i < branchCount; i++) {
    let x, z;
    do {
      const a = rand() * TAU, r = 5 + rand() * 34;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (pathDistance(x, z) < 1.2);
    const len = 0.5 + rand() * 2.6;
    const rad = 0.02 + rand() * 0.055;
    pv.set(x, getHeight(x, z) + rad * 0.7, z);
    q.setFromEuler(new THREE.Euler(rand() * 0.25, rand() * TAU, Math.PI / 2 + (rand() - 0.5) * 0.3));
    s.set(rad * 2, len * 2, rad * 2);
    m4.compose(pv, q, s);
    branches.setMatrixAt(i, m4);
    col.setHSL(0.07 + rand() * 0.03, 0.16 + rand() * 0.1, 0.13 + rand() * 0.1);
    branches.setColorAt(i, col);
  }
  group.add(branches);

  // ---------- stepping stones along the path near the house
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x7d766a, roughness: 0.9, flatShading: true });
  const stepGeo = new THREE.CylinderGeometry(0.34, 0.38, 0.1, 7);
  const nSteps = 14;
  const stepMesh = new THREE.InstancedMesh(stepGeo, stepMat, nSteps);
  stepMesh.receiveShadow = true; stepMesh.castShadow = true;
  for (let i = 0; i < nSteps; i++) {
    const t = 0.02 + i * 0.052;
    const idx = Math.floor(t * (PATH_SAMPLES.length - 1));
    const [x, z] = PATH_SAMPLES[idx];
    const off = (i % 2 ? 1 : -1) * (0.18 + rand() * 0.2);
    const px = x + off, pz = z + (rand() - 0.5) * 0.25;
    pv.set(px, getHeight(px, pz) + 0.015, pz);
    q.setFromEuler(new THREE.Euler(0, rand() * TAU, 0));
    const sc = 0.8 + rand() * 0.45;
    s.set(sc, 1, sc * (0.8 + rand() * 0.3));
    m4.compose(pv, q, s);
    stepMesh.setMatrixAt(i, m4);
    col.setHSL(0.10, 0.03 + rand() * 0.05, 0.22 + rand() * 0.12);
    stepMesh.setColorAt(i, col);
  }
  group.add(stepMesh);

  scene.add(group);
  onStage && onStage('撒下碎石与落叶');
  return group;
}

/* ---------------------------------------------------------------- garden */
export function buildGarden(scene) {
  const g = new THREE.Group();
  g.name = 'garden';
  const rand = rng(17);
  const cx = 6.4, cz = 9.2;
  const w = 4.4, d = 2.8;
  const baseY = getHeight(cx, cz);

  const soil = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.16, d),
    new THREE.MeshStandardMaterial({ color: 0x3a2b1c, roughness: 1 })
  );
  soil.position.set(cx, baseY + 0.06, cz);
  soil.rotation.y = 0.12;
  soil.receiveShadow = true;
  g.add(soil);

  // wooden edging
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x5b4630, roughness: 0.9 });
  const mkEdge = (len, x, z, rotY) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(len, 0.26, 0.09), edgeMat);
    box.position.set(x, baseY + 0.1, z);
    box.rotation.y = rotY;
    box.castShadow = true; box.receiveShadow = true;
    g.add(box);
  };
  const hw = w / 2, hd = d / 2;
  mkEdge(w, cx, cz - hd, 0.12);
  mkEdge(w, cx, cz + hd, 0.12);
  mkEdge(d, cx - hw, cz, Math.PI / 2 + 0.12);
  mkEdge(d, cx + hw, cz, Math.PI / 2 + 0.12);

  // leafy rows
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5c7a35, roughness: 0.85, side: THREE.DoubleSide });
  const leafGeo = new THREE.SphereGeometry(0.22, 6, 4);
  const rows = 4;
  const plants = new THREE.InstancedMesh(leafGeo, leafMat, rows * 7);
  let k = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const col = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 7; i++) {
      const lx = cx - hw + 0.5 + i * ((w - 1) / 6);
      const lz = cz - hd + 0.45 + r * ((d - 0.9) / (rows - 1));
      const sc = 0.7 + rand() * 0.6;
      p3.set(lx + (rand() - 0.5) * 0.12, baseY + 0.1 + 0.12 * sc, lz + (rand() - 0.5) * 0.1);
      q.setFromEuler(new THREE.Euler(rand() * 0.3, rand() * TAU, rand() * 0.3));
      s3.set(sc, sc * (0.9 + rand() * 0.5), sc);
      m4.compose(p3, q, s3);
      plants.setMatrixAt(k, m4);
      col.setHSL(0.22 + rand() * 0.05, 0.34 + rand() * 0.18, 0.22 + rand() * 0.12);
      plants.setColorAt(k, col);
      k++;
    }
  }
  plants.castShadow = true; plants.receiveShadow = true;
  g.add(plants);

  // tomato stakes
  const stakeMat = new THREE.MeshStandardMaterial({ color: 0x6a5840, roughness: 0.95 });
  for (let i = 0; i < 4; i++) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.1, 5), stakeMat);
    st.position.set(cx - hw + 0.5 + i * 1.25, baseY + 0.62, cz + hd - 0.4);
    st.rotation.z = (rand() - 0.5) * 0.1;
    st.castShadow = true;
    g.add(st);
  }

  // a couple of cabbages
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x6f8c46, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const cab = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), cabMat);
    cab.position.set(cx - hw + 0.9 + i * 1.25, baseY + 0.28, cz - hd + 0.5);
    cab.scale.set(1, 0.75, 1);
    cab.castShadow = true;
    g.add(cab);
  }

  scene.add(g);
  return g;
}
