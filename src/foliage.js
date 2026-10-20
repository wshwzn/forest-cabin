// foliage.js — alpha-card textures for fir branches, birch leaves, ferns and grass
import { canvas2d, rng, TAU, clamp } from './util.js';

/**
 * A fir sprig: a central twig with paired side twigs, each carrying short needles.
 * Drawn with tapered strokes so the silhouette stays feathery rather than striped.
 */
export function firSprig(seed = 12, opts = {}) {
  const S = opts.size ?? 512;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(S, S);
  ctx.clearRect(0, 0, S, S);
  const hue = opts.hue ?? 104;
  const hueVar = opts.hueVar ?? 26;
  const baseL = opts.light ?? 26;

  const cx = S * 0.5;

  const strokeTwig = (x0, y0, x1, y1, w, l, a = 1) => {
    ctx.strokeStyle = `hsla(${hue - 14},${18 + rand() * 10}%,${l * 0.55}%,${a})`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  const needle = (x, y, ang, len, w, l, a) => {
    const ex = x + Math.cos(ang) * len;
    const ey = y + Math.sin(ang) * len;
    const mx = x + Math.cos(ang + 0.22) * len * 0.5;
    const my = y + Math.sin(ang + 0.22) * len * 0.5;
    ctx.strokeStyle = `hsla(${hue + (rand() - 0.5) * hueVar},${26 + rand() * 20}%,${l}%,${a})`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  };

  // main stem: from bottom-centre up to the tip, slightly bowed
  const stemTop = S * (0.03 + rand() * 0.04);
  const bow = (rand() - 0.5) * S * 0.06;
  const stemAt = (t) => [cx + Math.sin(t * Math.PI) * bow, S * (1 - t * 0.97) * 0.99 + stemTop * t];

  // --- side twigs
  const twigs = opts.twigs ?? 9;
  for (let i = 0; i < twigs; i++) {
    const t = 0.12 + (i / twigs) * 0.84;
    const [sx, sy] = stemAt(t);
    const span = S * (0.44 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.92) + 0.05);
    const dir = i % 2 === 0 ? 1 : -1;
    // twig angle: droops toward the tip
    const ang = dir > 0
      ? (-0.55 - rand() * 0.25) - t * 0.1
      : Math.PI + (0.55 + rand() * 0.25) + t * 0.1;
    const ex = sx + Math.cos(ang) * span;
    const ey = sy + Math.sin(ang) * span * 0.62;
    strokeTwig(sx, sy, ex, ey, 1.6 + (1 - t) * 1.4, 30, 0.85);

    // needles along the twig, angled back toward the tip
    const steps = 18 + Math.floor(span / 7);
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      const px = sx + (ex - sx) * u;
      const py = sy + (ey - sy) * u;
      const nl = S * (0.085 + 0.03 * (1 - u)) * (0.8 + rand() * 0.5);
      const baseAng = ang;
      for (const side of [-1, 1]) {
        const na = baseAng + side * 0.72 + (rand() - 0.5) * 0.22;
        const l = baseL + (1 - u) * -4 + rand() * 10;
        needle(px, py, na, nl * (0.8 + rand() * 0.35), 2.0 + rand() * 1.8, l * (0.85 + rand() * 0.3), 0.95);
      }
      // occasional needle pointing outward along the twig
      if (rand() > 0.45) {
        needle(px, py, baseAng + (rand() - 0.5) * 0.4, nl * 0.95, 1.8, baseL + rand() * 12, 0.9);
      }
    }
  }

  // --- the tip: dense forward needles
  const [tx, ty] = stemAt(1.0);
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 1.7;
    needle(tx + (rand() - 0.5) * 6, ty + rand() * S * 0.07,
      a, S * (0.045 + rand() * 0.05), 1.8 + rand() * 1.4, baseL + 14 + rand() * 16, 0.92);
  }
  // needles hugging the main stem
  for (let i = 0; i < 70; i++) {
    const t = 0.1 + rand() * 0.85;
    const [px, py] = stemAt(t);
    const side = rand() > 0.5 ? 1 : -1;
    needle(px, py, -Math.PI / 2 + side * (0.5 + rand() * 0.55), S * (0.06 + rand() * 0.05),
      1.8 + rand() * 1.4, baseL + 4 + rand() * 14, 0.9);
  }

  // --- a very faint under-painting so gaps don't sparkle, kept below alphaTest
  ctx.globalCompositeOperation = 'destination-over';
  const g = ctx.createRadialGradient(S * 0.5, S * 0.55, S * 0.08, S * 0.5, S * 0.55, S * 0.52);
  g.addColorStop(0, `hsla(${hue + 6},26%,${baseL * 0.55}%,0.20)`);
  g.addColorStop(0.7, `hsla(${hue + 12},24%,${baseL * 0.6}%,0.09)`);
  g.addColorStop(1, `hsla(${hue + 16},22%,${baseL * 0.65}%,0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** a whole fir branch: several sprigs radiating from a point, drawn into one card */
export function firBranch(seed = 3, opts = {}) {
  const S = 512;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(S, S);
  ctx.clearRect(0, 0, S, S);
  const sprigs = opts.sprigs ?? 3;
  for (let i = 0; i < sprigs; i++) {
    const src = firSprig(seed * 31 + i, opts);
    ctx.save();
    const flip = i % 2 === 1;
    const scale = 0.62 + rand() * 0.22;
    ctx.translate(S * (0.32 + 0.36 * (i / Math.max(1, sprigs - 1))), S * (0.62 + rand() * 0.2));
    ctx.rotate((rand() - 0.5) * 0.5 + (flip ? 0.12 : -0.12));
    ctx.scale(flip ? scale : scale * 0.92, scale);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(src, -S * 0.5, -S);
    ctx.restore();
  }
  return c;
}

/** birch / deciduous leaf cluster on a card */
export function leafCluster(seed = 31, hue0 = 92) {
  const S = 512;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(S, S);
  ctx.clearRect(0, 0, S, S);
  // thin twigs
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = rand() * TAU;
    const len = S * (0.28 + rand() * 0.26);
    ctx.strokeStyle = `hsla(30,24%,${16 + rand() * 8}%,0.9)`;
    ctx.lineWidth = 1.6 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.94);
    ctx.quadraticCurveTo(
      S * 0.5 + Math.cos(a) * len * 0.5 + 8, S * 0.94 - len * 0.5,
      S * 0.5 + Math.cos(a) * len, S * 0.94 - len * 0.88
    );
    ctx.stroke();
  }
  // leaves
  const n = 320;
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU;
    const r = Math.pow(rand(), 0.5) * S * 0.44;
    const x = S * 0.5 + Math.cos(a) * r;
    const y = S * 0.5 + Math.sin(a) * r * 0.98;
    if (y > S * 0.98) continue;
    const lw = S * (0.014 + rand() * 0.014);
    const lh = lw * (1.7 + rand() * 0.8);
    const hue = hue0 + (rand() - 0.5) * 34;
    const l = 18 + rand() * 16 + (1 - r / (S * 0.46)) * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * TAU);
    ctx.fillStyle = `hsla(${hue},${28 + rand() * 26}%,${l}%,${0.86 + rand() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, lw, lh, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue - 8},26%,${l * 0.6}%,0.45)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -lh);
    ctx.lineTo(0, lh);
    ctx.stroke();
    ctx.restore();
  }
  // darker inner mass (kept under the alpha test so it never becomes a blob)
  ctx.globalCompositeOperation = 'destination-over';
  const g = ctx.createRadialGradient(S * 0.5, S * 0.62, 0, S * 0.5, S * 0.62, S * 0.46);
  g.addColorStop(0, 'hsla(96,28%,11%,0.28)');
  g.addColorStop(0.7, 'hsla(96,26%,10%,0.12)');
  g.addColorStop(1, 'hsla(96,24%,10%,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** fern frond cluster (front-facing card) */
export function fernCluster(seed = 91) {
  const S = 512;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(S, S);
  ctx.clearRect(0, 0, S, S);
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const baseX = S * 0.5 + (rand() - 0.5) * S * 0.16;
    const spread = (f / (fronds - 1) - 0.5) * 2;
    const tipX = S * 0.5 + spread * S * 0.46 + (rand() - 0.5) * 30;
    const tipY = S * (0.03 + rand() * 0.16);
    const cx1 = baseX + (tipX - baseX) * 0.14;
    const cy1 = S * 0.6;
    const cx2 = tipX + (rand() - 0.5) * 44;
    const cy2 = S * 0.3;
    const hue = 92 + rand() * 26;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const t2 = 1 - t;
      pts.push([
        t2 * t2 * t2 * baseX + 3 * t2 * t2 * t * cx1 + 3 * t2 * t * t * cx2 + t * t * t * tipX,
        t2 * t2 * t2 * S + 3 * t2 * t2 * t * cy1 + 3 * t2 * t * t * cy2 + t * t * t * tipY,
        t,
      ]);
    }
    // rachis
    ctx.strokeStyle = `hsla(${hue + 14},26%,${14}%,0.9)`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(baseX, S);
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, tipX, tipY);
    ctx.stroke();
    // pinnae
    for (let i = 2; i < pts.length - 2; i++) {
      const [px, py, t] = pts[i];
      const [qx, qy] = pts[i + 1];
      const ang = Math.atan2(qy - py, qx - px);
      const len = (1 - t) * S * 0.2 + 5;
      for (const s of [-1, 1]) {
        const a2 = ang + s * 1.05;
        const ex = px + Math.cos(a2) * len;
        const ey = py + Math.sin(a2) * len + len * 0.32;
        const l = 22 + t * 12 + rand() * 10;
        ctx.strokeStyle = `hsla(${hue + (rand() - 0.5) * 18},${28 + rand() * 16}%,${l}%,${0.86})`;
        ctx.lineWidth = (1 - t) * 5 + 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + Math.cos(a2 + 0.3) * len * 0.6, py + Math.sin(a2 + 0.3) * len * 0.6, ex, ey);
        ctx.stroke();
        // fine leaflets on the pinna
        if (rand() > 0.5) {
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + (ex - px) * 0.6, py + (ey - py) * 0.6);
          ctx.lineTo(px + (ex - px) * 0.6 + Math.cos(a2 + 0.9) * len * 0.3, py + (ey - py) * 0.6 + Math.sin(a2 + 0.9) * len * 0.3);
          ctx.stroke();
        }
      }
    }
  }
  return c;
}

/** grass tuft */
export function grassTuft(seed = 77) {
  const S = 512;
  const rand = rng(seed);
  const { c, ctx } = canvas2d(S, S);
  ctx.clearRect(0, 0, S, S);
  const blades = 30;
  for (let i = 0; i < blades; i++) {
    const bx = S * (0.06 + rand() * 0.88);
    const bw = 3 + rand() * 7;
    const bh = S * (0.42 + rand() * 0.54);
    const bend = (rand() - 0.5) * S * 0.36;
    const tipX = bx + bend;
    const hue = 74 + rand() * 30;
    const sat = 24 + rand() * 24;
    const l = 20 + rand() * 22;
    const grd = ctx.createLinearGradient(bx, S, tipX, S - bh);
    grd.addColorStop(0, `hsla(${hue - 10},${sat}%,${l * 0.45}%,0.96)`);
    grd.addColorStop(0.5, `hsla(${hue},${sat + 6}%,${l}%,0.96)`);
    grd.addColorStop(1, `hsla(${hue + 10},${sat + 12}%,${l * 1.6}%,0.9)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, S);
    ctx.quadraticCurveTo(bx + bend * 0.35 - bw * 0.5, S - bh * 0.55, tipX, S - bh);
    ctx.quadraticCurveTo(bx + bend * 0.35 + bw * 0.5, S - bh * 0.55, bx + bw / 2, S);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}
