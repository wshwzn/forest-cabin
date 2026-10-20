// util.js — small math / noise / canvas helpers shared by the whole scene
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rng(seed = 1) {
  const r = mulberry32(seed);
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.chance = (p) => r() < p;
  return r;
}

const HASH = (x, y, seed) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** smooth value noise, optionally periodic (for seamless tiling) */
export function noise2(x, y, seed = 0, period = 0) {
  let ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (v) => (period ? ((v % period) + period) % period : v);
  const x0 = wrap(ix), x1 = wrap(ix + 1), y0 = wrap(iy), y1 = wrap(iy + 1);
  const a = HASH(x0, y0, seed), b = HASH(x1, y0, seed);
  const c = HASH(x0, y1, seed), d = HASH(x1, y1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm(x, y, oct = 4, seed = 0, period = 0, lacunarity = 2.0, gain = 0.5) {
  let sum = 0, amp = 0.5, norm = 0, px = x, py = y, p = period;
  for (let i = 0; i < oct; i++) {
    sum += noise2(px, py, seed + i * 37, p) * amp;
    norm += amp;
    amp *= gain;
    px *= lacunarity; py *= lacunarity;
    p = p ? p * lacunarity : 0;
  }
  return sum / norm;
}

export function ridged(x, y, oct = 4, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0, px = x, py = y;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise2(px, py, seed + i * 53) * 2 - 1);
    sum += n * n * amp; norm += amp; amp *= 0.5;
    px *= 2.03; py *= 2.03;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- canvas
export function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: false });
  return { c, ctx };
}

export function makeTexture(canvas, opts = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = opts.wrap ?? THREE.RepeatWrapping;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 8;
  t.needsUpdate = true;
  return t;
}

/** derive a tangent-space normal map from the luminance of a canvas */
export function normalFromCanvas(src, strength = 2.2, flipY = false) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) / 255;
  }
  const { c, ctx } = canvas2d(w, h);
  const out = ctx.createImageData(w, h);
  const s = flipY ? -strength : strength;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yc = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (lum[yc + xp] - lum[yc + xm]) * s;
      const dy = (lum[yp + x] - lum[ym + x]) * s;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (yc + x) * 4;
      out.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** soft radial sprite */
export function radialSprite(size, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', power = 1) {
  const { c, ctx } = canvas2d(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = Math.pow(1 - t, 2.2 * power);
    g.addColorStop(t, i === 0 ? inner : `rgba(255,255,255,${a.toFixed(3)})`);
  }
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export function hsl(h, s, l, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

/** paint with 9 wrapped copies so the result tiles seamlessly */
export function wrapped(ctx, w, h, fn) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      ctx.save();
      ctx.translate(ox * w, oy * h);
      fn(ctx);
      ctx.restore();
    }
  }
}

export function deg(d) { return (d * Math.PI) / 180; }

export function randomPointInRing(r0, r1, rand) {
  const a = rand() * TAU;
  const r = Math.sqrt(lerp(r0 * r0, r1 * r1, rand()));
  return [Math.cos(a) * r, Math.sin(a) * r];
}
