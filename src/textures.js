// textures.js — every texture in the scene is painted procedurally on a canvas.
import * as THREE from 'three';
import {
  canvas2d, makeTexture, normalFromCanvas, noise2, fbm, rng, wrapped, clamp, lerp, TAU,
} from './util.js';

const registry = [];
function keep(t) { registry.push(t); return t; }
export { canvas2d, makeTexture, normalFromCanvas };
export function disposeTextures() {
  registry.forEach((t) => t.dispose());
  registry.length = 0;
}

/* ------------------------------------------------------------------ noise overlay */
function speckle(ctx, w, h, amount = 0.06, size = 1, seed = 5) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rand = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 255 * amount;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ weathered wood */
/**
 * Horizontal board siding / plank texture.
 * opts: { w, h, planks, base:[h,s,l], vary, seed, gapDark, mossy }
 */
export function woodPlanks(opts = {}) {
  const W = opts.w ?? 1024, H = opts.h ?? 512;
  const planks = opts.planks ?? 8;
  const rand = rng(opts.seed ?? 11);
  const base = opts.base ?? [28, 22, 40];
  const { c, ctx } = canvas2d(W, H);
  ctx.fillStyle = `hsl(${base[0]},${base[1]}%,${base[2] * 0.55}%)`;
  ctx.fillRect(0, 0, W, H);

  const ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const y = p * ph;
    const l = base[2] + (rand() - 0.5) * (opts.vary ?? 14);
    const hue = base[0] + (rand() - 0.5) * 8;
    const sat = base[1] + (rand() - 0.5) * 10;
    ctx.fillStyle = `hsl(${hue},${sat}%,${l}%)`;
    ctx.fillRect(0, y + 1.5, W, ph - 3);

    // grain: long sine streaks
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y + 2, W, ph - 4);
    ctx.clip();
    const lines = 26 + Math.floor(rand() * 14);
    for (let i = 0; i < lines; i++) {
      const gy = y + 3 + rand() * (ph - 6);
      const amp = rand() * 3.2 + 0.4;
      const freq = 0.004 + rand() * 0.012;
      const phase = rand() * TAU;
      const dark = rand() > 0.42;
      ctx.strokeStyle = dark
        ? `hsla(${hue - 4},${sat + 6}%,${l * 0.52}%,${0.10 + rand() * 0.24})`
        : `hsla(${hue + 6},${sat - 4}%,${l * 1.34}%,${0.05 + rand() * 0.12})`;
      ctx.lineWidth = rand() * 1.6 + 0.35;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const yy = gy + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase * 1.7) * amp * 0.35;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // knots
    const knots = Math.floor(rand() * 2.2);
    for (let k = 0; k < knots; k++) {
      const kx = rand() * W, ky = y + ph * (0.3 + rand() * 0.4);
      const kr = ph * (0.10 + rand() * 0.14);
      const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr * 2.4);
      g.addColorStop(0, 'rgba(28,18,10,0.85)');
      g.addColorStop(0.35, 'rgba(50,32,18,0.45)');
      g.addColorStop(1, 'rgba(60,40,22,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(kx, ky, kr * 2.6, kr * 1.7, rand() * 0.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(34,22,12,0.55)';
      for (let r = 0; r < 3; r++) {
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(kx, ky, kr * (1.1 + r * 0.35), kr * (0.7 + r * 0.24), 0.2, 0, TAU);
        ctx.stroke();
      }
    }
    // weather streaks running down the board
    for (let i = 0; i < 7; i++) {
      const x = rand() * W;
      const g = ctx.createLinearGradient(0, y, 0, y + ph);
      g.addColorStop(0, 'rgba(20,14,8,0.16)');
      g.addColorStop(0.5, 'rgba(20,14,8,0.05)');
      g.addColorStop(1, 'rgba(220,210,180,0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y + 2, 1 + rand() * 5, ph - 4);
    }
    ctx.restore();

    // shadow under the board above + bottom edge highlight
    const sh = ctx.createLinearGradient(0, y, 0, y + 7);
    sh.addColorStop(0, 'rgba(6,4,2,0.72)');
    sh.addColorStop(1, 'rgba(6,4,2,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, y, W, 7);
    ctx.fillStyle = 'rgba(255,230,190,0.10)';
    ctx.fillRect(0, y + ph - 2.5, W, 1.2);

    // nails
    if (opts.nails !== false) {
      const nails = 3 + Math.floor(rand() * 3);
      for (let n = 0; n < nails; n++) {
        const nx = (n + 0.5) * (W / nails) + (rand() - 0.5) * 30;
        const ny = y + ph * (rand() > 0.5 ? 0.28 : 0.72);
        ctx.fillStyle = 'rgba(12,9,7,0.75)';
        ctx.beginPath(); ctx.arc(nx, ny, 1.8, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(200,170,130,0.20)';
        ctx.beginPath(); ctx.arc(nx - 0.6, ny - 0.6, 0.9, 0, TAU); ctx.fill();
      }
    }
  }

  // moss / damp green bloom in the lower area
  if (opts.mossy !== false) {
    wrapped(ctx, W, H, (g) => {
      const rand2 = rng((opts.seed ?? 11) + 99);
      for (let i = 0; i < 60; i++) {
        const x = rand2() * W, y = H * (0.45 + rand2() * 0.6);
        const r = 10 + rand2() * 46;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(78,92,44,0.16)');
        gr.addColorStop(0.6, 'rgba(66,82,40,0.06)');
        gr.addColorStop(1, 'rgba(60,76,36,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
    });
  }
  speckle(ctx, W, H, 0.10, 1, 3);
  return c;
}

/** vertical bark for trunks */
export function barkTexture(seed = 4, tint = [26, 16, 26]) {
  const W = 512, H = 1024;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(W, H);
  ctx.fillStyle = `hsl(${tint[0]},${tint[1]}%,${tint[2]}%)`;
  ctx.fillRect(0, 0, W, H);

  wrapped(ctx, W, H, (g) => {
    const r2 = rng(seed + 7);
    // vertical ridges
    for (let i = 0; i < 240; i++) {
      const x = r2() * W;
      const w = 1 + r2() * 9;
      const l = tint[2] * (0.45 + r2() * 1.25);
      g.fillStyle = `hsla(${tint[0] + (r2() - 0.5) * 12},${tint[1] + r2() * 14}%,${l}%,${0.25 + r2() * 0.55})`;
      let y = -40;
      while (y < H + 40) {
        const seg = 30 + r2() * 150;
        g.fillRect(x + Math.sin((y / H) * TAU * 2 + i) * 2.5, y, w, seg);
        y += seg + r2() * 12;
      }
    }
    // deep furrows
    for (let i = 0; i < 90; i++) {
      const x = r2() * W;
      g.strokeStyle = `rgba(8,6,5,${0.18 + r2() * 0.4})`;
      g.lineWidth = 1 + r2() * 5;
      g.beginPath();
      let y = -20;
      while (y < H + 20) {
        const seg = 40 + r2() * 120;
        g.moveTo(x, y);
        g.lineTo(x + (r2() - 0.5) * 8, y + seg);
        y += seg + r2() * 20;
      }
      g.stroke();
    }
    // lichen dots
    for (let i = 0; i < 500; i++) {
      const x = r2() * W, y = r2() * H;
      const l = 46 + r2() * 30;
      g.fillStyle = `hsla(${70 + r2() * 40},${14 + r2() * 22}%,${l}%,${0.06 + r2() * 0.20})`;
      g.beginPath(); g.arc(x, y, 1 + r2() * 5, 0, TAU); g.fill();
    }
  });
  speckle(ctx, W, H, 0.09, 1, seed + 3);
  return c;
}

/** overlapping shingle roof, seen from above/outside */
export function shingleTexture(seed = 21, baseTint = [22, 15, 19]) {
  const W = 1024, H = 1024;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(W, H);
  ctx.fillStyle = `hsl(${baseTint[0]},${baseTint[1]}%,${baseTint[2] * 0.7}%)`;
  ctx.fillRect(0, 0, W, H);

  const rows = 22;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const offset = (r % 2) * (W / 26);
    const cols = 13;
    for (let i = -1; i <= cols; i++) {
      const x = i * (W / cols) + offset;
      const jitter = (rand() - 0.5) * 4;
      const hue = baseTint[0] + (rand() - 0.5) * 14;
      const sat = baseTint[1] + (rand() - 0.5) * 12;
      const l = baseTint[2] + (rand() - 0.5) * 10;
      ctx.fillStyle = `hsl(${hue},${sat}%,${l}%)`;
      const shw = W / cols - 2.5;
      roundRect(ctx, x + 1.2, y + jitter, shw, rh * 2.1, 3.5);
      ctx.fill();
      // per-shingle grain
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, x + 1.2, y + jitter, shw, rh * 2.1, 3.5);
      ctx.clip();
      for (let k = 0; k < 8; k++) {
        ctx.strokeStyle = `rgba(10,7,5,${0.05 + rand() * 0.14})`;
        ctx.lineWidth = 0.7 + rand();
        ctx.beginPath();
        const gy = y + jitter + rand() * rh * 2;
        ctx.moveTo(x, gy);
        ctx.bezierCurveTo(x + shw * 0.3, gy + 2, x + shw * 0.7, gy - 2, x + shw, gy + 1);
        ctx.stroke();
      }
      // top shade + bottom shadow
      const grd = ctx.createLinearGradient(0, y + jitter, 0, y + jitter + rh * 2.1);
      grd.addColorStop(0, 'rgba(255,235,210,0.10)');
      grd.addColorStop(0.25, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = grd;
      ctx.fillRect(x, y + jitter, shw, rh * 2.1);
      ctx.restore();
    }
    // row shadow
    const sh = ctx.createLinearGradient(0, y, 0, y + rh * 0.8);
    sh.addColorStop(0, 'rgba(4,3,2,0.55)');
    sh.addColorStop(1, 'rgba(4,3,2,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, y, W, rh * 0.8);
  }

  // moss creeping in patches
  wrapped(ctx, W, H, (g) => {
    const r2 = rng(seed + 31);
    for (let i = 0; i < 130; i++) {
      const x = r2() * W, y = r2() * H, rad = 6 + r2() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${72 + r2() * 24},${92 + r2() * 26},${44 + r2() * 16},${0.16 + r2() * 0.26})`);
      gr.addColorStop(1, 'rgba(70,90,42,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
  });
  speckle(ctx, W, H, 0.10, 1, seed + 12);
  return c;
}

export function stoneWallTexture(seed = 33) {
  const W = 1024, H = 1024;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(W, H);
  ctx.fillStyle = 'hsl(32,10%,13%)';
  ctx.fillRect(0, 0, W, H);

  // mortar noise
  wrapped(ctx, W, H, (g) => {
    const r2 = rng(seed + 2);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `hsla(38,14%,${18 + r2() * 22}%,${0.06 + r2() * 0.18})`;
      g.beginPath(); g.arc(r2() * W, r2() * H, 1 + r2() * 9, 0, TAU); g.fill();
    }
  });

  // irregular stone courses
  let y = 0;
  while (y < H) {
    const rowH = 54 + rand() * 60;
    let x = -rand() * 60;
    while (x < W) {
      const sw = 56 + rand() * 120;
      const hue = 30 + (rand() - 0.5) * 16;
      const sat = 6 + rand() * 10;
      const l = 30 + rand() * 20;
      const pts = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand() * 0.3;
        const rx = (sw / 2) * (0.78 + rand() * 0.22);
        const ry = (rowH / 2) * (0.78 + rand() * 0.22);
        pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
      }
      const cx = x + sw / 2, cy = y + rowH / 2;
      ctx.save();
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        const X = cx + px, Y = cy + py;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      // base
      const g = ctx.createRadialGradient(cx - sw * 0.2, cy - rowH * 0.22, 2, cx, cy, sw * 0.7);
      g.addColorStop(0, `hsl(${hue},${sat}%,${l + 9}%)`);
      g.addColorStop(0.7, `hsl(${hue},${sat}%,${l}%)`);
      g.addColorStop(1, `hsl(${hue - 3},${sat + 2}%,${l * 0.7}%)`);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.clip();
      for (let k = 0; k < 55; k++) {
        ctx.fillStyle = `hsla(${hue + (rand() - 0.5) * 20},${sat}%,${l + (rand() - 0.5) * 26}%,${0.05 + rand() * 0.16})`;
        ctx.beginPath(); ctx.arc(cx + (rand() - 0.5) * sw, cy + (rand() - 0.5) * rowH, 1 + rand() * 8, 0, TAU); ctx.fill();
      }
      // moss in the joints
      if (rand() > 0.55) {
        const mg = ctx.createRadialGradient(cx + sw * 0.3, cy + rowH * 0.32, 0, cx + sw * 0.3, cy + rowH * 0.32, sw * 0.4);
        mg.addColorStop(0, `rgba(70,92,40,${0.18 + rand() * 0.2})`);
        mg.addColorStop(1, 'rgba(70,92,40,0)');
        ctx.fillStyle = mg;
        ctx.fillRect(cx - sw, cy - rowH, sw * 2, rowH * 2);
      }
      ctx.restore();
      // stone outline/shadow
      ctx.strokeStyle = 'rgba(6,5,4,0.55)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        const X = cx + px, Y = cy + py;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.stroke();
      x += sw + 5;
    }
    y += rowH + 5;
  }
  speckle(ctx, W, H, 0.10, 1, seed + 6);
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** bundle a colour canvas + derived normal + roughness-ish map into a material set */
export function materialMaps(canvas, normalStrength = 1.6, opts = {}) {
  const color = keep(makeTexture(canvas, opts));
  const nc = normalFromCanvas(canvas, normalStrength);
  const normal = keep(makeTexture(nc, { ...opts, srgb: false }));
  return { color, normal };
}

/* ------------------------------------------------------------------ window glow */
export function windowInterior() {
  const W = 256, H = 320;
  const { c, ctx } = canvas2d(W, H);
  // warm room light
  const g = ctx.createRadialGradient(W * 0.5, H * 0.5, 10, W * 0.5, H * 0.55, H * 0.75);
  g.addColorStop(0, '#ffd9a0');
  g.addColorStop(0.45, '#ffb265');
  g.addColorStop(0.8, '#b45f28');
  g.addColorStop(1, '#4a2410');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // back wall / shelf silhouettes
  ctx.fillStyle = 'rgba(60,26,10,0.55)';
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  ctx.fillStyle = 'rgba(48,20,8,0.7)';
  ctx.fillRect(W * 0.08, H * 0.42, W * 0.22, H * 0.2);
  ctx.fillRect(W * 0.72, H * 0.5, W * 0.16, H * 0.14);
  // curtain edges
  ctx.fillStyle = 'rgba(38,16,8,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W * 0.18, 0);
  ctx.bezierCurveTo(W * 0.1, H * 0.4, W * 0.14, H * 0.7, W * 0.04, H);
  ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0); ctx.lineTo(W * 0.86, 0);
  ctx.bezierCurveTo(W * 0.94, H * 0.45, W * 0.9, H * 0.72, W * 0.98, H);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  // a lamp glow spot
  const lg = ctx.createRadialGradient(W * 0.62, H * 0.46, 0, W * 0.62, H * 0.46, W * 0.34);
  lg.addColorStop(0, 'rgba(255,248,220,0.95)');
  lg.addColorStop(0.25, 'rgba(255,214,150,0.6)');
  lg.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  return c;
}

/* ------------------------------------------------------------------ foliage alpha cards */
export function grassBladeCard() {
  const W = 256, H = 256;
  const rand = rng(77);
  const { c, ctx } = canvas2d(W, H);
  ctx.clearRect(0, 0, W, H);
  const blades = 16;
  for (let i = 0; i < blades; i++) {
    const bx = W * (0.1 + rand() * 0.8);
    const bw = 2.2 + rand() * 4.2;
    const bh = H * (0.45 + rand() * 0.52);
    const bend = (rand() - 0.5) * W * 0.42;
    const tipX = bx + bend;
    const hue = 74 + rand() * 26;
    const sat = 26 + rand() * 22;
    const l = 22 + rand() * 24;
    const grd = ctx.createLinearGradient(bx, H, tipX, H - bh);
    grd.addColorStop(0, `hsla(${hue - 8},${sat}%,${l * 0.5}%,0.95)`);
    grd.addColorStop(0.55, `hsla(${hue},${sat + 6}%,${l}%,0.95)`);
    grd.addColorStop(1, `hsla(${hue + 8},${sat + 10}%,${l * 1.5}%,0.9)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, H);
    ctx.quadraticCurveTo(bx + bend * 0.4 - bw * 0.45, H - bh * 0.55, tipX, H - bh);
    ctx.quadraticCurveTo(bx + bend * 0.4 + bw * 0.45, H - bh * 0.55, bx + bw / 2, H);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

export function fernFrondCard() {
  const W = 256, H = 256;
  const rand = rng(91);
  const { c, ctx } = canvas2d(W, H);
  ctx.clearRect(0, 0, W, H);
  const fronds = 5;
  for (let f = 0; f < fronds; f++) {
    const baseX = W * (0.5 + (rand() - 0.5) * 0.3);
    const tipX = W * (0.5 + (rand() - 0.5) * 1.0);
    const tipY = H * (0.04 + rand() * 0.2);
    const cx1 = baseX + (tipX - baseX) * 0.2;
    const cy1 = H * 0.62;
    const cx2 = tipX + (rand() - 0.5) * 40;
    const cy2 = H * 0.34;
    const steps = 22;
    const hue = 88 + rand() * 28;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const t2 = 1 - t;
      // cubic bezier point
      const px = t2 * t2 * t2 * baseX + 3 * t2 * t2 * t * cx1 + 3 * t2 * t * t * cx2 + t * t * t * tipX;
      const py = t2 * t2 * t2 * H + 3 * t2 * t2 * t * cy1 + 3 * t2 * t * t * cy2 + t * t * t * tipY;
      const nx = t2 * t2 * (cx1 - baseX) + 2 * t2 * t * (cx2 - cx1) + t * t * (tipX - cx2);
      const ny = t2 * t2 * (cy1 - H) + 2 * t2 * t * (cy2 - cy1) + t * t * (tipY - cy2);
      const ang = Math.atan2(ny, nx);
      const len = (1 - t) * W * 0.24 + 5;
      const l = 26 + rand() * 12 + t * 18;
      ctx.strokeStyle = `hsla(${hue},${30 + rand() * 18}%,${l}%,${0.85})`;
      ctx.lineWidth = 1.6 + (1 - t) * 2.2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        const ex = px + Math.cos(ang + s * 1.15) * len;
        const ey = py + Math.sin(ang + s * 1.15) * len + len * 0.25;
        ctx.quadraticCurveTo(px + Math.cos(ang + s * 0.7) * len * 0.6, py + Math.sin(ang + s * 0.7) * len * 0.6, ex, ey);
        ctx.lineWidth = (1 - t) * 3.4 + 0.8;
        ctx.stroke();
      }
    }
    ctx.strokeStyle = `hsla(${hue - 6},34%,${18}%,0.9)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseX, H);
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, tipX, tipY);
    ctx.stroke();
  }
  return c;
}

/** a round cluster of leaves with alpha, used for canopy cards */
export function canopyCard(seed = 12) {
  const W = 512, H = 512;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(W, H);
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const a = rand() * TAU;
    const rr = Math.pow(rand(), 0.62) * W * 0.46;
    const x = W / 2 + Math.cos(a) * rr;
    const y = H / 2 + Math.sin(a) * rr * 0.92;
    const s = 8 + rand() * 22;
    const hue = 78 + rand() * 40;
    const sat = 24 + rand() * 26;
    const l = 14 + rand() * 30;
    const alpha = 0.55 + rand() * 0.45;
    ctx.fillStyle = `hsla(${hue},${sat}%,${l}%,${alpha})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * TAU);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.62, s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  return c;
}

/** soft smoke puff */
export function smokePuff(seed = 3) {
  const W = 256;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(W, W);
  ctx.clearRect(0, 0, W, W);
  for (let i = 0; i < 26; i++) {
    const x = W / 2 + (rand() - 0.5) * W * 0.44;
    const y = W / 2 + (rand() - 0.5) * W * 0.44;
    const r = W * (0.08 + rand() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.05 + rand() * 0.07})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // fade the border so puffs blend
  const vg = ctx.createRadialGradient(W / 2, W / 2, W * 0.28, W / 2, W / 2, W * 0.5);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, W);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** dust mote */
export function dotSprite(size = 64, softness = 2.2) {
  const { c, ctx } = canvas2d(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,244,220,0.65)');
  g.addColorStop(1, 'rgba(255,230,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export { keep as registerTexture };
