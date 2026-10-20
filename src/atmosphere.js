// atmosphere.js — dusk sky, ground mist, god rays, dust, chimney smoke, fireflies
import * as THREE from 'three';
import { smokePuff, dotSprite, makeTexture } from './textures.js';
import { rng, TAU, clamp, lerp, smoothstep, fbm } from './util.js';
import { getHeight } from './terrain.js';

// low golden-hour sun, to the camera's left and behind it, so the facade is raked
export const SUN_DIR = new THREE.Vector3(-0.52, 0.30, 0.80).normalize();
export const SUN_COLOR = new THREE.Color(0xffb070);
export const HAZE_COLOR = new THREE.Color(0x8fa08c);

/* ------------------------------------------------------------------ sky */
const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const skyFrag = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunCol;
  uniform float uTime;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += noise(p) * a;
      p = p * 2.03 + vec2(13.1, 7.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);
    float sunDot = clamp(dot(d, uSunDir), 0.0, 1.0);

    // base vertical gradient
    float t = pow(clamp(h, 0.0, 1.0), 0.62);
    vec3 col = mix(uHorizon, uZenith, t);
    // below horizon fades to ground haze
    col = mix(col, uGround, smoothstep(0.02, -0.22, h));

    // warm sunset bloom near the horizon toward the sun
    float horizonGlow = pow(1.0 - abs(h), 6.0);
    col += uSunCol * horizonGlow * (0.20 + 0.85 * pow(sunDot, 2.2));

    // broad atmospheric halo
    col += uSunCol * pow(sunDot, 4.5) * 0.30;
    col += uSunCol * pow(sunDot, 22.0) * 0.55;

    // streaky cloud bands, lit from below near the sun
    vec2 uv = d.xz / (abs(d.y) + 0.16);
    float clouds = fbm(uv * 0.85 + vec2(uTime * 0.004, uTime * 0.0018));
    clouds = smoothstep(0.46, 0.85, clouds);
    vec3 cloudCol = mix(vec3(0.13, 0.12, 0.15), uSunCol * 1.25, pow(sunDot, 2.0) * 0.9 + 0.18);
    float cloudMask = clouds * smoothstep(0.0, 0.18, h) * smoothstep(0.95, 0.35, h);
    col = mix(col, cloudCol, cloudMask * 0.52);

    // sun disc
    float disc = smoothstep(0.99955, 0.99985, sunDot);
    col += uSunCol * disc * 16.0;

    // faint stars in the upper sky
    vec3 sd = d * 190.0;
    float star = hash(floor(sd.xz) + floor(sd.y) * 17.0);
    star = pow(star, 220.0) * smoothstep(0.22, 0.75, h);
    col += vec3(0.75, 0.82, 1.0) * star * 0.85;

    // subtle grain to avoid banding
    float g = hash(gl_FragCoord.xy + uTime);
    col += (g - 0.5) * 0.006;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky(scene) {
  const geo = new THREE.SphereGeometry(420, 48, 32);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uZenith: { value: new THREE.Color(0x1b2f42) },
      uHorizon: { value: new THREE.Color(0xf6b184) },
      uGround: { value: new THREE.Color(0x6b6b52) },
      uSunCol: { value: new THREE.Color(0xffc089) },
      uTime: { value: 0 },
    },
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat, update(t) { mat.uniforms.uTime.value = t; mesh.position.copy(scene.userData.cameraPos || new THREE.Vector3()); } };
}

/* ------------------------------------------------------------------ environment map */
export function createEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  // build a tiny scene containing only the sky
  const envScene = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uZenith: { value: new THREE.Color(0x2a4258) },
      uHorizon: { value: new THREE.Color(0xf0b083) },
      uGround: { value: new THREE.Color(0x3d4433) },
      uSunCol: { value: SUN_COLOR.clone().multiplyScalar(1.4) },
      uTime: { value: 0 },
    },
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 20), skyMat);
  envScene.add(s);
  const rt = pmrem.fromScene(envScene, 0.04, 0.1, 100);
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  s.geometry.dispose();
  skyMat.dispose();
  return rt.texture;
}

/* ------------------------------------------------------------------ lights */
export function createLights(scene) {
  const sun = new THREE.DirectionalLight(0xffb078, 5.0);
  sun.position.copy(SUN_DIR).multiplyScalar(52);
  sun.target.position.set(0, 1.2, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 96;
  const sc = 26;
  sun.shadow.camera.left = -sc;
  sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc;
  sun.shadow.camera.bottom = -sc;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0x93a7ba, 0x4a4130, 0.95);
  scene.add(hemi);

  // cool sky bounce from the opposite side of the sun
  const fill = new THREE.DirectionalLight(0x8aa3c0, 0.62);
  fill.position.set(20, 16, 26);
  scene.add(fill);

  // warm bounce off the sunset horizon, low and in front
  const bounce = new THREE.DirectionalLight(0xffbe8e, 0.55);
  bounce.position.set(6, 2.4, 20);
  scene.add(bounce);

  return { sun, hemi, fill, bounce };
}

/* ------------------------------------------------------------------ ground mist */
export function createMist(scene) {
  const group = new THREE.Group();
  group.name = 'mist';
  const rand = rng(77);
  const tex = makeTexture(dotSprite(128, 1.6), { wrap: THREE.ClampToEdgeWrapping });
  const layers = [];
  const N = 30;
  for (let i = 0; i < N; i++) {
    const r = 3 + Math.pow(rand(), 0.6) * 48;
    const a = rand() * TAU;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 12 + rand() * 34;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(0xb9c4bf).lerp(new THREE.Color(0xe8c8a6), rand() * 0.55),
      transparent: true,
      opacity: 0.035 + rand() * 0.065,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, getHeight(x, z) + 0.25 + rand() * 0.9, z);
    sp.scale.set(w, w * (0.16 + rand() * 0.14), 1);
    sp.userData = {
      baseX: x, baseZ: z, baseY: sp.position.y,
      speed: 0.05 + rand() * 0.10, phase: rand() * TAU, amp: 0.5 + rand() * 1.4,
      baseOpacity: mat.opacity,
    };
    group.add(sp);
    layers.push(sp);
  }
  // a tall fog bank far behind the house to separate the background
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex, color: 0xd3c4ae, transparent: true,
      opacity: 0.035 + rand() * 0.045, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    const z = -16 - rand() * 42;
    const x = -46 + rand() * 92;
    sp.position.set(x, 1.6 + rand() * 4.5, z);
    const w = 26 + rand() * 34;
    sp.scale.set(w, w * 0.42, 1);
    sp.userData = { baseX: x, baseZ: z, baseY: sp.position.y, speed: 0.025, phase: rand() * TAU, amp: 1.6, baseOpacity: mat.opacity };
    group.add(sp);
    layers.push(sp);
  }
  scene.add(group);
  return {
    group,
    update(t) {
      for (const sp of layers) {
        const u = sp.userData;
        sp.position.x = u.baseX + Math.sin(t * u.speed + u.phase) * u.amp;
        sp.position.z = u.baseZ + Math.cos(t * u.speed * 0.7 + u.phase) * u.amp * 0.6;
        sp.material.opacity = u.baseOpacity * (0.8 + 0.2 * Math.sin(t * 0.2 + u.phase));
      }
    },
  };
}

/* ------------------------------------------------------------------ god rays */
export function createGodRays(scene) {
  const group = new THREE.Group();
  group.name = 'godrays';
  const rand = rng(303);

  const vert = /* glsl */`
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;
  const frag = /* glsl */`
    precision highp float;
    varying vec2 vUv;
    varying vec3 vWorld;
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uSeed;
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
                 mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
    }
    void main() {
      // vUv.y runs along the beam (0 apex -> 1 base), vUv.x around the cone
      float along = vUv.y;
      float edge = abs(sin(vUv.x * 3.14159 * 6.0));
      float streak = noise(vec2(vUv.x * 12.0 + uSeed, along * 5.0 - uTime * 0.05));
      float n2 = noise(vec2(vUv.x * 30.0 + uSeed * 2.0, along * 9.0 - uTime * 0.12));
      float body = smoothstep(0.0, 0.35, along) * smoothstep(1.0, 0.45, along);
      float a = body * (0.25 + 0.75 * edge) * (0.55 + 0.45 * streak) * (0.75 + 0.25 * n2);
      a *= uIntensity;
      gl_FragColor = vec4(uColor * a, a);
    }
  `;

  const shafts = [];
  const defs = [
    // x, z, height, radius, rot, intensity
    [-6.5, -8.0, 16, 2.6, 0.2, 0.30],
    [3.0, -11.0, 18, 3.2, -0.3, 0.26],
    [-13.0, 3.0, 15, 2.2, 0.5, 0.22],
    [9.5, -3.0, 17, 2.8, -0.6, 0.30],
    [16.0, 9.0, 15, 2.0, 0.9, 0.18],
    [-17.0, -9.0, 16, 2.4, 0.1, 0.20],
    [0.0, 12.0, 15, 2.2, 0.4, 0.14],
    [-3.5, 6.5, 14, 1.5, -0.2, 0.12],
  ];
  for (let i = 0; i < defs.length; i++) {
    const [x, z, h, r, rot, inten] = defs[i];
    const geo = new THREE.CylinderGeometry(0.35, r, h, 20, 1, true);
    geo.translate(0, -h / 2, 0);   // apex at origin, base below
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffd2a0) },
        uTime: { value: 0 },
        uIntensity: { value: inten },
        uSeed: { value: rand() * 10 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    // orient the beam so it leans away from the sun
    m.position.set(x, getHeight(x, z) + h * 0.9, z);
    const tilt = new THREE.Vector3(-SUN_DIR.x, 0, -SUN_DIR.z).normalize().multiplyScalar(0.55);
    m.rotation.order = 'YXZ';
    m.rotation.y = rot;
    m.rotation.x = tilt.x * 0 + 0.34;
    m.rotation.z = tilt.z * 0 + 0.22;
    m.renderOrder = 4;
    group.add(m);
    shafts.push({ mesh: m, mat, base: inten, phase: rand() * TAU, speed: 0.15 + rand() * 0.2 });
  }
  scene.add(group);
  return {
    group,
    update(t) {
      for (const s of shafts) {
        s.mat.uniforms.uTime.value = t;
        s.mat.uniforms.uIntensity.value = s.base * (0.72 + 0.28 * Math.sin(t * s.speed + s.phase));
      }
    },
  };
}

/* ------------------------------------------------------------------ dust motes */
export function createDust(scene) {
  const rand = rng(515);
  const N = 620;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * TAU;
    const r = 1.5 + Math.pow(rand(), 0.55) * 14;
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 2;
    const y = 0.4 + Math.pow(rand(), 0.7) * 7;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    seed[i] = rand();
    size[i] = 0.35 + rand() * 1.1;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const tex = makeTexture(dotSprite(64), { wrap: THREE.ClampToEdgeWrapping });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: tex },
      uColor: { value: new THREE.Color(0xffcf9a) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity: { value: 0.30 },
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * 0.22 + aSeed * 6.28;
        p.x += sin(t * 0.9 + aSeed * 12.0) * 0.9;
        p.z += cos(t * 0.75 + aSeed * 7.0) * 0.9;
        p.y += sin(t * 0.5 + aSeed * 3.0) * 0.55;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.45 + 0.55 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 20.0);
        vA = twinkle * smoothstep(30.0, 2.0, -mv.z);
        gl_PointSize = aSize * uPixelRatio * (58.0 / max(-mv.z, 0.4)) * (0.6 + 0.4 * aSeed);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float a = tex.a * vA * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);
  return { points, update(t) { mat.uniforms.uTime.value = t; } };
}

/* ------------------------------------------------------------------ chimney smoke */
export function createSmoke(scene, anchor) {
  const rand = rng(808);
  const N = 46;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const data = [];
  for (let i = 0; i < N; i++) {
    data.push({
      life: rand(),
      speed: 0.16 + rand() * 0.12,
      drift: rand() * 2 - 1,
      swirl: rand() * TAU,
      size: 0.5 + rand() * 0.7,
      seed: rand(),
    });
    pos[i * 3] = anchor.x; pos[i * 3 + 1] = anchor.y; pos[i * 3 + 2] = anchor.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const aAlpha = new Float32Array(N);
  const aSize = new Float32Array(N);
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));

  const tex = makeTexture(smokePuff(3), { wrap: THREE.ClampToEdgeWrapping });
  const smokeColor = new THREE.Color(0xa9a79f);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uColor: { value: smokeColor },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */`
      attribute float aAlpha;
      attribute float aSize;
      uniform float uPixelRatio;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = aAlpha;
        gl_PointSize = aSize * uPixelRatio * (150.0 / max(-mv.z, 0.5));
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vA;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float a = tex.a * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);

  const posAttr = geo.attributes.position;
  const alphaAttr = geo.attributes.aAlpha;
  const sizeAttr = geo.attributes.aSize;

  return {
    points,
    update(t, dt) {
      for (let i = 0; i < N; i++) {
        const d = data[i];
        d.life += dt * d.speed * 0.55;
        if (d.life > 1) d.life -= 1;
        const life = d.life;
        const rise = life * 9.5;
        const sway = Math.sin(t * 0.5 + d.seed * 12) * life * 1.1;
        const x = anchor.x + sway + d.drift * life * 2.2 - life * life * 1.4;
        const y = anchor.y + rise;
        const z = anchor.z + Math.cos(t * 0.35 + d.seed * 9) * life * 0.9 + life * 1.6;
        posAttr.setXYZ(i, x, y, z);
        const fadeIn = smoothstep(0, 0.06, life);
        const fadeOut = 1 - smoothstep(0.42, 1.0, life);
        alphaAttr.setX(i, fadeIn * fadeOut * 0.30);
        sizeAttr.setX(i, (0.9 + life * 4.2) * d.size);
      }
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ chimney sparks */
export function createSparks(scene, anchor) {
  const rand = rng(2024);
  const N = 26;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const seeds = new Float32Array(N);
  const data = [];
  for (let i = 0; i < N; i++) {
    const d = { life: rand(), speed: 0.35 + rand() * 0.5, drift: rand() * 2 - 1, phase: rand() * TAU };
    data.push(d);
    seeds[i] = rand();
    pos[i * 3] = anchor.x; pos[i * 3 + 1] = anchor.y; pos[i * 3 + 2] = anchor.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const aAlpha = new Float32Array(N);
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
  const tex = makeTexture(dotSprite(32), { wrap: THREE.ClampToEdgeWrapping });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */`
      attribute float aAlpha;
      uniform float uPixelRatio;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = aAlpha;
        gl_PointSize = uPixelRatio * (30.0 / max(-mv.z, 0.5));
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying float vA;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(1.0, 0.62, 0.22, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const posAttr = geo.attributes.position;
  const alphaAttr = geo.attributes.aAlpha;
  return {
    points,
    update(t, dt) {
      for (let i = 0; i < N; i++) {
        const d = data[i];
        d.life += dt * d.speed;
        if (d.life > 1) d.life -= 1;
        const life = d.life;
        posAttr.setXYZ(
          i,
          anchor.x + Math.sin(t * 1.7 + d.phase) * life * 0.5 + d.drift * life * 0.8,
          anchor.y + life * 3.4,
          anchor.z + Math.cos(t * 1.3 + d.phase) * life * 0.5 + life * 0.5
        );
        alphaAttr.setX(i, (1 - life) * 0.9);
      }
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ fireflies */
export function createFireflies(scene) {
  const rand = rng(616);
  const N = 80;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const anchors = [];
  for (let i = 0; i < N; i++) {
    const a = rand() * TAU;
    const r = 4 + Math.pow(rand(), 0.55) * 16;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = getHeight(x, z) + 0.4 + rand() * 2.4;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    seed[i] = rand();
    anchors.push([x, y, z]);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const tex = makeTexture(dotSprite(64), { wrap: THREE.ClampToEdgeWrapping });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: tex },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * 0.5 + aSeed * 20.0;
        p.x += sin(t * 0.7) * 0.9;
        p.y += sin(t * 0.45 + 1.2) * 0.5;
        p.z += cos(t * 0.6) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float blink = pow(max(sin(uTime * (0.9 + aSeed) + aSeed * 30.0), 0.0), 6.0);
        vA = blink * smoothstep(34.0, 4.0, -mv.z);
        gl_PointSize = uPixelRatio * (52.0 / max(-mv.z, 0.5)) * (0.7 + aSeed);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying float vA;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float a = tex.a * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.42), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return { points, update(t) { mat.uniforms.uTime.value = t; } };
}

/* ------------------------------------------------------------------ distant birds */
export function createBirds(scene) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2f33, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false });
  const shape = new THREE.BufferGeometry();
  const verts = new Float32Array([
    0, 0, 0, -0.6, 0.16, 0, -0.2, -0.02, 0,
    0, 0, 0, 0.6, 0.16, 0, 0.2, -0.02, 0,
  ]);
  shape.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  shape.computeVertexNormals();
  const birds = [];
  const rand = rng(909);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(shape, mat);
    const s = 1.4 + rand() * 1.2;
    m.scale.setScalar(s);
    m.userData = { phase: rand() * TAU, speed: 0.09 + rand() * 0.05, radius: 30 + rand() * 20, y: 26 + rand() * 12, offset: rand() * TAU };
    group.add(m);
    birds.push(m);
  }
  scene.add(group);
  return {
    group,
    update(t) {
      for (const b of birds) {
        const u = b.userData;
        const a = u.offset + t * u.speed;
        b.position.set(Math.cos(a) * u.radius, u.y + Math.sin(t * 0.3 + u.phase) * 1.5, Math.sin(a) * u.radius - 10);
        b.rotation.y = -a + Math.PI / 2;
        b.rotation.z = Math.sin(t * 3 + u.phase) * 0.25;
        const flap = Math.sin(t * 7 + u.phase) * 0.45;
        b.scale.y = (1.4 + Math.sin(t * 7 + u.phase) * 0.25);
      }
    },
  };
}
