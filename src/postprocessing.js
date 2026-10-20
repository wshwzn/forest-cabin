// postprocessing.js — bloom, film grade, vignette, grain, chromatic aberration
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const FilmShader = {
  name: 'FilmGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uVignette: { value: 0.62 },
    uGrain: { value: 0.030 },
    uAberration: { value: 0.0022 },
    uSaturation: { value: 1.04 },
    uContrast: { value: 1.045 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uFade;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // gentle radial chromatic aberration
      float ab = uAberration * r2 * 2.2;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

      // split-tone: cool shadows, amber highlights
      vec3 shadowTint = vec3(0.93, 1.00, 1.05);
      vec3 highTint = vec3(1.06, 1.005, 0.94);
      col *= mix(shadowTint, highTint, smoothstep(0.10, 0.72, lum));

      // saturation & filmic S-curve
      col = mix(vec3(lum), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col = clamp(col, 0.0, 1.0);

      // vignette
      float vig = 1.0 - uVignette * smoothstep(0.10, 0.78, r2 * 1.55);
      col *= vig;

      // fine grain, stronger in shadows
      float g1 = hash(uv * uResolution + uTime * 71.0) - 0.5;
      float g2 = hash(uv * uResolution * 1.7 - uTime * 37.0) - 0.5;
      col += (g1 * 0.65 + g2 * 0.35) * uGrain * (1.15 - lum * 0.85);

      // subtle horizontal halation line (anamorphic hint)
      col += vec3(0.02, 0.008, 0.0) * pow(1.0 - abs(uv.y - 0.5) * 2.0, 6.0) * smoothstep(0.75, 1.4, lum);

      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y), 0.42, 0.72, 0.82
  );
  composer.addPass(bloom);

  const output = new OutputPass();
  composer.addPass(output);

  const film = new ShaderPass(FilmShader);
  film.renderToScreen = true;
  film.uniforms.uResolution.value.set(size.x * pr, size.y * pr);
  composer.addPass(film);

  return {
    composer, bloom, film,
    setSize(w, h) {
      const p = renderer.getPixelRatio();
      composer.setPixelRatio(p);
      composer.setSize(w, h);
      bloom.setSize(w * p, h * p);
      film.uniforms.uResolution.value.set(w * p, h * p);
    },
    update(t) {
      film.uniforms.uTime.value = t;
    },
  };
}
