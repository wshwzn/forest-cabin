// shots.js — the director's shot list, shared by the camera rig and vegetation clearing
import * as THREE from 'three';

export const SHOTS = [
  {
    id: 'clearing', cn: '林间空地', en: 'THE CLEARING',
    pos: new THREE.Vector3(8.6, 2.35, 12.2),
    target: new THREE.Vector3(0.05, 2.45, 1.1),
    fov: 36, dwell: 15,
  },
  {
    id: 'path', cn: '门前小径', en: 'THE PATH HOME',
    pos: new THREE.Vector3(1.05, 1.38, 10.4),
    target: new THREE.Vector3(-0.1, 1.95, 1.9),
    fov: 34, dwell: 13,
  },
  {
    id: 'window', cn: '窗灯', en: 'LAMPLIGHT',
    pos: new THREE.Vector3(3.35, 1.62, 5.5),
    target: new THREE.Vector3(1.5, 1.92, 2.35),
    fov: 31, dwell: 12,
  },
  {
    id: 'trees', cn: '林梢之光', en: 'LIGHT THROUGH THE PINES',
    pos: new THREE.Vector3(-9.2, 3.4, 12.4),
    target: new THREE.Vector3(1.4, 3.1, 0.2),
    fov: 43, dwell: 15,
  },
  {
    id: 'chimney', cn: '柴垛与炊烟', en: 'WOODPILE & SMOKE',
    pos: new THREE.Vector3(9.6, 2.6, 8.2),
    target: new THREE.Vector3(2.6, 4.7, -0.8),
    fov: 43, dwell: 14,
  },
  {
    id: 'eaves', cn: '暮色屋檐', en: 'DUSK EAVES',
    pos: new THREE.Vector3(-4.9, 1.15, 7.0),
    target: new THREE.Vector3(0.9, 2.95, 1.0),
    fov: 40, dwell: 13,
  },
];

/** squared distance from point p to the ground-plane segment a->b */
function distToSegment2(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const len2 = vx * vx + vz * vz || 1e-6;
  let t = (wx * vx + wz * vz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return dx * dx + dz * dz;
}

/**
 * How much "sightline room" a point has: the minimum of
 *  (a) distance to the nearest camera position, and
 *  (b) distance to any camera->target sightline (inflated toward the lens).
 */
export function framingClearance(x, z) {
  let camDist = Infinity;
  let lineDist = Infinity;
  for (const s of SHOTS) {
    const d = Math.hypot(x - s.pos.x, z - s.pos.z);
    if (d < camDist) camDist = d;
    const dl = Math.sqrt(distToSegment2(x, z, s.pos.x, s.pos.z, s.target.x, s.target.z));
    if (dl < lineDist) lineDist = dl;
  }
  // things far behind the subject are fine
  const zBehind = Math.max(0, -x * 0) + 0;
  return { camDist, lineDist };
}

/** true when vegetation at x,z would intrude on any shot */
export function blocksShot(x, z, camRadius = 4.6, lineRadius = 2.2) {
  for (const s of SHOTS) {
    const d = Math.hypot(x - s.pos.x, z - s.pos.z);
    if (d < camRadius) return true;
    const dl = Math.sqrt(distToSegment2(x, z, s.pos.x, s.pos.z, s.target.x, s.target.z));
    // taper the corridor: wider near the lens, tighter at the subject
    const t = Math.min(1, d / Math.max(1, Math.hypot(s.pos.x - s.target.x, s.pos.z - s.target.z)));
    if (dl < lineRadius * (1.35 - t * 0.55)) return true;
  }
  return false;
}
