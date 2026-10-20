// main.js — scene orchestration, camera direction, UI and the render loop
import * as THREE from 'three';
import { buildTerrain, buildGroundDetail, buildGarden, getHeight } from './terrain.js';
import { buildCabin } from './cabin.js';
import { buildForest } from './forest.js';
import {
  createSky, createEnvironment, createLights, createMist, createGodRays,
  createDust, createSmoke, createSparks, createFireflies, createBirds, SUN_DIR,
} from './atmosphere.js';
import { createPost } from './postprocessing.js';
import { Ambience } from './audio.js';
import { SHOTS } from './shots.js';
import { clamp, lerp, smoothstep, rng } from './util.js';

const canvas = document.getElementById('stage');
const params = new URLSearchParams(location.search);
const STILL = params.has('still');

/* ------------------------------------------------------------------ renderer */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: STILL,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, STILL ? 2 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x6a7263, 0.0115);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(8, 5, 24);

/* ------------------------------------------------------------------ shots */

/* ------------------------------------------------------------------ UI refs */
const ui = {
  loader: document.getElementById('loader'),
  status: document.getElementById('status'),
  fill: document.getElementById('progress-fill'),
  enter: document.getElementById('btn-enter'),
  shot: document.getElementById('shot'),
  shotNo: document.getElementById('shot-no'),
  shotCn: document.getElementById('shot-cn'),
  shotEn: document.getElementById('shot-en'),
  btnBars: document.getElementById('btn-bars'),
  btnSound: document.getElementById('btn-sound'),
  btnLook: document.getElementById('btn-look'),
  btnFull: document.getElementById('btn-full'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  hint: document.getElementById('hint'),
};

let progress = 0;
function setProgress(p, label) {
  progress = Math.max(progress, p);
  ui.fill.style.width = `${Math.round(progress * 100)}%`;
  if (label) ui.status.textContent = label;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/* ------------------------------------------------------------------ runtime state */
const state = {
  t: 0,
  showBars: true,
  sound: true,
  shotIndex: 0,
  userYaw: 0,
  userPitch: 0,
  lookMode: 'grab',
  userZoom: 1,
  dragging: false,
  lastX: 0, lastY: 0,
  velYaw: 0, velPitch: 0,
  transition: null,
  started: false,
  intro: 0,
};

const ambience = new Ambience();
const rig = {
  pos: SHOTS[0].pos.clone().add(new THREE.Vector3(10, 8, 20)),
  target: SHOTS[0].target.clone(),
  fov: 50,
};

const camOffset = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/* ------------------------------------------------------------------ build */
let cabin = null, forest = null, sky = null, mist = null, rays = null, dust = null,
  smoke = null, sparks = null, fireflies = null, birds = null, lights = null, post = null;

async function build() {
  setProgress(0.03, '正在唤醒森林…');
  await nextFrame();

  createEnvironment(renderer, scene);
  setProgress(0.10, '点起黄昏的光');
  await nextFrame();

  lights = createLights(scene);
  sky = createSky(scene);
  if (params.has('plain')) {
    // geometry-audit mode: flat lighting, no fog, no atmosphere
    scene.fog = null;
    scene.environment = null;
    lights.sun.intensity = 1.4;
    lights.hemi.intensity = 2.2;
    lights.fill.intensity = 0.9;
    renderer.toneMappingExposure = 0.85;
  }
  setProgress(0.16, '铺开林间土地');
  await nextFrame();

  buildTerrain(scene, (label) => setProgress(progress + 0.02, label));
  await nextFrame();

  buildGroundDetail(scene, (label) => setProgress(progress + 0.02, label));
  buildGarden(scene);
  setProgress(0.32, '搭起木屋与门廊');
  await nextFrame();

  cabin = buildCabin(scene, (label) => setProgress(progress + 0.03, label));
  setProgress(0.46, '种下针叶林与白桦');
  await nextFrame();

  forest = buildForest(scene, (label) => setProgress(progress + 0.04, label));
  setProgress(0.68, '升起山间薄雾');
  await nextFrame();

  mist = createMist(scene);
  rays = createGodRays(scene);
  dust = createDust(scene);
  fireflies = createFireflies(scene);
  birds = createBirds(scene);
  smoke = createSmoke(scene, cabin.smokeAnchor.clone());
  sparks = createSparks(scene, cabin.smokeAnchor.clone().add(new THREE.Vector3(0, 0.1, 0)));
  if (params.has('noatmos')) {
    [mist.group, rays.group, dust.points, fireflies.points, birds.group, smoke.points].forEach((o) => { o.visible = false; });
  }
  if (params.has('plain')) {
    [mist.group, rays.group, dust.points, fireflies.points, birds.group, smoke.points, sky.mesh].forEach((o) => { o.visible = false; });
    scene.background = new THREE.Color(0x2b3745);
    // replace the dome with a soft gradient background
  }
  setProgress(0.84, '打磨最后一束光');
  await nextFrame();

  post = createPost(renderer, scene, camera);
  post.composer.setSize(window.innerWidth, window.innerHeight);
  setProgress(0.94, '准备就绪');
  await nextFrame();

  // compile shaders once so the first frames are smooth
  try {
    renderer.compile(scene, camera);
  } catch (e) { /* ignore */ }

  setProgress(1, '林间一切就绪');
  ui.enter.classList.add('ready');
  ui.enter.disabled = false;

  // pre-set camera to the opening shot so the poster frame is right
  applyShotInstant(0);
  renderOnce(0);
  setProgress(1, '');
}

function renderOnce(t) {
  sky.mesh.position.copy(camera.position);
  post.composer.render();
}

/* ------------------------------------------------------------------ camera direction */
function shotWithUserOffset(index, out) {
  const s = SHOTS[index];
  camOffset.copy(s.pos).sub(s.target);
  camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.userYaw);
  // pitch around the camera's local right axis
  const right = new THREE.Vector3().crossVectors(camOffset, new THREE.Vector3(0, 1, 0)).normalize();
  camOffset.applyAxisAngle(right, state.userPitch);
  // portrait screens crop the horizontal field hard, so back the lens off to keep the cabin framed
  camOffset.multiplyScalar(state.userZoom);
  out.pos.copy(s.target).add(camOffset);
  // keep above the ground — and clear of the grass, which is ~0.8m tall
  const floor = getHeight(out.pos.x, out.pos.z) + 1.15;
  if (out.pos.y < floor) out.pos.y = floor;
  out.target.copy(s.target);
  out.fov = s.fov * portraitFovScale();
  return out;
}

/**
 * Portrait phones crop the horizontal field hard. Rather than moving the lens
 * (which would walk it into foliage cleared only for the authored positions),
 * widen the vertical FOV so the horizontal framing stays close to 16:9.
 * 1 on landscape/desktop, up to ~1.55 on tall phones.
 */
function portraitFovScale() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  if (aspect >= 1.2) return 1;
  return clamp(1 + (1.2 - aspect) * 1.15, 1, 1.5);
}

const shotA = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38 };
const shotB = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38 };

function applyShotInstant(i) {
  shotWithUserOffset(i, shotA);
  rig.pos.copy(shotA.pos);
  rig.target.copy(shotA.target);
  rig.fov = shotA.fov;
  camera.position.copy(rig.pos);
  camera.lookAt(rig.target);
  camera.fov = rig.fov;
  camera.updateProjectionMatrix();
}

function goToShot(i, opts = {}) {
  const idx = ((i % SHOTS.length) + SHOTS.length) % SHOTS.length;
  state.shotIndex = idx;
  updateShotLabel(idx);
  const instant = opts.instant;
  shotWithUserOffset(idx, shotA);
  if (instant) {
    applyShotInstant(idx);
    state.transition = null;
    return;
  }
  state.transition = {
    fromPos: rig.pos.clone(), toPos: shotA.pos.clone(),
    fromTarget: rig.target.clone(), toTarget: shotA.target.clone(),
    fromFov: rig.fov, toFov: shotA.fov,
    t: 0, dur: opts.dur ?? 2.6,
  };
  if (!opts.silent) ambience.whoosh();
}

function updateShotLabel(i) {
  ui.shotNo.textContent = `${String(i + 1).padStart(2, '0')} / ${String(SHOTS.length).padStart(2, '0')}`;
  ui.shotCn.textContent = SHOTS[i].cn;
  ui.shotEn.textContent = SHOTS[i].en;
  ui.shot.classList.remove('swap');
  void ui.shot.offsetWidth;
  ui.shot.classList.add('swap');
}

function updateCamera(dt) {
  if (state.debugCam) {
    rig.pos.copy(state.debugCam.pos);
    rig.target.copy(state.debugCam.look);
    rig.fov = state.debugCam.fov;
  } else if (state.transition) {
    const tr = state.transition;
    tr.t += dt;
    const k = clamp(tr.t / tr.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    rig.pos.lerpVectors(tr.fromPos, tr.toPos, e);
    rig.target.lerpVectors(tr.fromTarget, tr.toTarget, e);
    rig.fov = lerp(tr.fromFov, tr.toFov, e);
    if (k >= 1) state.transition = null;
  } else {
    // follow the (possibly orbiting) shot framing
    shotWithUserOffset(state.shotIndex, shotB);
    rig.pos.lerp(shotB.pos, 1 - Math.pow(0.0015, dt));
    rig.target.lerp(shotB.target, 1 - Math.pow(0.004, dt));
    rig.fov = lerp(rig.fov, shotB.fov, 1 - Math.pow(0.01, dt));
  }

  // handheld breathing + a very slow drift for a living frame
  const t = state.t;
  const breath = 0.012 + 0.006 * Math.sin(t * 0.23);
  tmpV.set(
    Math.sin(t * 0.31) * breath + Math.sin(t * 0.71 + 1.3) * breath * 0.4,
    Math.sin(t * 0.26 + 0.7) * breath * 0.8,
    Math.cos(t * 0.19 + 2.1) * breath * 0.6
  );
  camera.position.copy(rig.pos).add(tmpV);
  camera.lookAt(rig.target);
  // slight roll
  camera.rotateZ(Math.sin(t * 0.17) * 0.0035);

  // shots are stepped manually only; no auto tour
}

/* ------------------------------------------------------------------ intro / fade */
function updateFade(dt) {
  if (!post) return;
  const film = post.film;
  if (!state.started) {
    film.uniforms.uFade.value = 1;
    return;
  }
  state.intro = Math.min(state.intro + dt / 2.0, 1);
  const e = smoothstep(0, 1, state.intro);
  let fade = e;
  // dip to black during shot transitions
  if (state.transition) {
    const k = state.transition.t / state.transition.dur;
    const dip = Math.sin(clamp((k - 0.25) / 0.5, 0, 1) * Math.PI);
    fade *= 1 - dip * 0.32;
  }
  film.uniforms.uFade.value = fade;
}

/* ------------------------------------------------------------------ lights animation */
function updateLights(t) {
  if (!cabin) return;
  const { porchLight, windowLights, lantern } = cabin;
  const flick = 0.9 + 0.06 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 17.7 + 1.1) + 0.03 * Math.sin(t * 31.1);
  porchLight.intensity = cabin.lightFlicker.base * (0.92 + 0.08 * flick);
  windowLights[0].intensity = 1.1 * (0.95 + 0.05 * flick);
  windowLights[1].intensity = 0.7 * (0.94 + 0.06 * flick);
  if (lantern && lantern.userData.glow) {
    lantern.userData.glow.material.color.setHSL(0.09, 0.72, 0.62 + 0.04 * flick);
  }
}

/* ------------------------------------------------------------------ main loop */
const timer = new THREE.Timer();
timer.connect(document);
let frameCount = 0;
let fpsAccum = 0, fpsFrames = 0;
let pixels = Math.min(window.devicePixelRatio, 1.75);

function loop() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  state.t += dt;

  updateCamera(dt);
  updateFade(dt);
  updateIdle(dt);

  sky.update(state.t);
  sky.mesh.position.copy(camera.position);
  mist.update(state.t);
  rays.update(state.t);
  dust.update(state.t);
  fireflies.update(state.t);
  birds.update(state.t);
  smoke.update(state.t, dt);
  sparks.update(state.t, dt);
  forest.update(state.t);
  post.update(state.t);
  updateLights(state.t);

  // adaptive resolution: if we're consistently slow, drop pixel ratio
  fpsAccum += dt; fpsFrames++;
  if (fpsFrames >= 90) {
    const avg = fpsAccum / fpsFrames;
    if (avg > 1 / 42 && pixels > 0.9) {
      pixels = Math.max(0.9, pixels - 0.2);
      renderer.setPixelRatio(pixels);
      post.setSize(window.innerWidth, window.innerHeight);
    }
    fpsAccum = 0; fpsFrames = 0;
  }

  post.composer.render();
  if (params.has('raw')) {
    renderer.render(scene, camera);
  }
  frameCount++;
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ interactions */
function onPointerDown(e) {
  if (e.target.closest && e.target.closest('.hud, .controls, .shot-nav')) return;
  state.dragging = true;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  canvas.classList.add('dragging');
  ui.hint.classList.add('gone');
}
function onPointerMove(e) {
  if (!state.dragging) return;
  const dx = e.clientX - state.lastX;
  const dy = e.clientY - state.lastY;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  applyLookDelta(dx, dy);
}

/**
 * Translate a pointer delta into orbit rotation.
 *
 * The two paradigms differ only in the sign of both axes, which keeps
 * horizontal and vertical consistent with each other:
 *   'grab' — you drag the picture. Move the mouse right and the cabin
 *            slides right, i.e. you walk around to the cabin's right side.
 *   'look' — you turn your head (FPS style). Move the mouse right and the
 *            view pans right, so you end up seeing the cabin's left side.
 */
const LOOK_MODE_SIGN = { grab: 1, look: -1 };

function applyLookDelta(dx, dy) {
  const sign = LOOK_MODE_SIGN[state.lookMode] || 1;
  // the orbit vector rotates about Y for yaw and about the camera's local
  // right axis for pitch; those two axes run in opposite senses, so pitch
  // needs its own sign to line up with yaw under both paradigms.
  state.userYaw = clamp(state.userYaw - dx * 0.0026 * sign, -1.25, 1.25);
  state.userPitch = clamp(state.userPitch + dy * 0.0020 * sign, -1.05, 1.05);
}
function onPointerUp() {
  state.dragging = false;
  canvas.classList.remove('dragging');
}
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.userZoom = clamp(state.userZoom + e.deltaY * 0.0008, 0.62, 1.55);
}, { passive: false });

// touch pinch
let pinchDist = 0;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    pinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    state.userZoom = clamp(state.userZoom - (d - pinchDist) * 0.004, 0.62, 1.55);
    pinchDist = d;
  }
}, { passive: true });

function setBars(on) {
  state.showBars = on;
  document.body.classList.toggle('no-bars', !on);
  ui.btnBars.classList.toggle('active', on);
}
ui.btnBars.addEventListener('click', () => setBars(!state.showBars));
ui.btnSound.addEventListener('click', async () => {
  if (!ambience.started) {
    await ambience.start();
    state.sound = true;
  } else {
    state.sound = ambience.toggle();
  }
  ui.btnSound.classList.toggle('active', state.sound);
});
ui.btnFull.addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});
const LOOK_LABEL = { grab: '拖拽', look: '视角' };

function setLookMode(mode) {
  state.lookMode = mode;
  ui.btnLook.textContent = LOOK_LABEL[mode];
  const kbd = document.createElement('kbd');
  kbd.textContent = 'V';
  ui.btnLook.appendChild(kbd);
  ui.btnLook.classList.toggle('active', mode === 'grab');
  ui.btnLook.title =
    mode === 'grab'
      ? '抓取画面：鼠标往右移，小屋跟着往右走（当前）'
      : '转动视角：鼠标往右移，视线往右转（当前）';
  try { localStorage.setItem('cabin-look-mode', mode); } catch (e) { /* private mode */ }
}

ui.btnLook.addEventListener('click', () => {
  setLookMode(state.lookMode === 'grab' ? 'look' : 'grab');
});

// restore the last choice; default to the grab paradigm
try {
  const saved = localStorage.getItem('cabin-look-mode');
  setLookMode(saved === 'look' ? 'look' : 'grab');
} catch (e) {
  setLookMode('grab');
}

ui.btnPrev.addEventListener('click', () => goToShot(state.shotIndex - 1));
ui.btnNext.addEventListener('click', () => goToShot(state.shotIndex + 1));

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') setBars(!state.showBars);
  else if (e.code === 'KeyM') ui.btnSound.click();
  else if (e.code === 'KeyV') ui.btnLook.click();
  else if (e.code === 'KeyF') ui.btnFull.click();
  else if (e.code === 'ArrowRight') goToShot(state.shotIndex + 1);
  else if (e.code === 'ArrowLeft') goToShot(state.shotIndex - 1);
  else if (e.code === 'KeyH') document.body.classList.toggle('hud-off');
  else if (/^Digit[1-6]$/.test(e.code)) goToShot(Number(e.code.slice(5)) - 1);
});

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  post && post.setSize(w, h);
  if (dust) dust.points.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  if (smoke) smoke.points.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
});

/* ------------------------------------------------------------------ idle HUD fading */
let idleTimer = 0;
let idleHidden = false;
function pokeHud() {
  idleTimer = 0;
  if (idleHidden) {
    idleHidden = false;
    document.body.classList.remove('hud-dim');
  }
}
window.addEventListener('pointermove', pokeHud, { passive: true });
window.addEventListener('pointerdown', pokeHud, { passive: true });
window.addEventListener('keydown', pokeHud);
function updateIdle(dt) {
  if (!state.started) return;
  idleTimer += dt;
  if (idleTimer > 6 && !idleHidden && !state.dragging) {
    idleHidden = true;
    document.body.classList.add('hud-dim');
  }
}

/* ------------------------------------------------------------------ enter */
async function enter() {
  if (state.started) return;
  state.started = true;
  ui.loader.classList.add('hidden');
  setTimeout(() => ui.hint.classList.add('gone'), 9000);
  document.body.classList.add('started');
  // opening camera move: settle in from a slightly wider, higher position
  shotWithUserOffset(0, shotA);
  rig.pos.copy(shotA.pos).multiplyScalar(1.12).add(new THREE.Vector3(0, 0.9, 0));
  rig.target.copy(shotA.target);
  rig.fov = shotA.fov + 7;
  state.transition = {
    fromPos: rig.pos.clone(), toPos: shotA.pos.clone(),
    fromTarget: rig.target.clone(), toTarget: shotA.target.clone(),
    fromFov: rig.fov, toFov: shotA.fov,
    t: 0, dur: 3.2,
  };
  if (state.sound) {
    try { await ambience.start(); } catch (e) { /* audio optional */ }
  }
}
ui.enter.addEventListener('click', enter);

/* ------------------------------------------------------------------ boot */
build().then(() => {
  if (STILL || params.has('autostart')) {
    enter();
    if (params.has('shot')) {
      goToShot(clamp(Number(params.get('shot')) - 1, 0, SHOTS.length - 1), { instant: true });
      state.transition = null;
      state.intro = 1;
    }
    if (params.has('cam')) {
      const c = params.get('cam').split(',').map(Number);
      const l = (params.get('look') || '0,1,0').split(',').map(Number);
      const f = Number(params.get('fov') || 40);
      state.debugCam = { pos: new THREE.Vector3(...c), look: new THREE.Vector3(...l), fov: f };
    }
    if (params.has('t')) state.t = Number(params.get('t'));
  }
  timer.reset();
  timer.update();
  requestAnimationFrame(loop);
}).catch((err) => {
  console.error(err);
  setProgress(1, `加载失败：${err.message}`);
});

// expose a tiny API for screenshots / debugging
window.__cabin = {
  scene, camera, renderer, state, SHOTS, THREE,
  ambience,
  audioState: () => ({ started: ambience.started, enabled: ambience.enabled, ctx: ambience.ctx?.state }),
  setShot(i, instant = true) { goToShot(i, { instant, silent: true }); },
  setTime(t) { state.t = t; },
  ready: () => !!post,
};
