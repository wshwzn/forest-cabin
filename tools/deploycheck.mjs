// tools/deploycheck.mjs — load the live GitHub Pages URL and prove it really renders
import { chromium } from 'playwright-core';

const URL_ = process.argv[2] || 'https://wshwzn.github.io/forest-cabin/';

const b = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  ignoreDefaultArgs: ['--no-startup-window'],
});
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });

const errs = [];
const failed = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
p.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
p.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });

const t0 = Date.now();
await p.goto(URL_, { waitUntil: 'load', timeout: 90000 });
console.log('页面加载耗时(ms):', Date.now() - t0);

try {
  await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
  console.log('场景就绪: ✅');
} catch {
  console.log('场景就绪: ❌ 超时');
}

await p.waitForFunction(() => getComputedStyle(document.getElementById('loader')).opacity === '0', { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(4000);

const info = await p.evaluate(() => {
  const c = window.__cabin;
  return {
    shots: c.SHOTS.length,
    camera: c.camera.position.toArray().map((v) => +v.toFixed(2)),
    textures: c.renderer.info.memory.textures,
    geometries: c.renderer.info.memory.geometries,
    // the canvas must contain actual pixels, not a blank frame
    hasWebGL: !!c.renderer.getContext(),
    fov: +c.camera.fov.toFixed(1),
  };
});

// sample the canvas: a real render is not uniformly black
const pixels = await p.evaluate(() => {
  const cv = document.getElementById('stage');
  const gl = cv.getContext('webgl2') || cv.getContext('webgl');
  const w = 64, h = 64;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(
    Math.floor(cv.width / 2) - w / 2,
    Math.floor(cv.height / 2) - h / 2,
    w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf,
  );
  let sum = 0, nonBlack = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const v = buf[i] + buf[i + 1] + buf[i + 2];
    sum += v;
    if (v > 24) nonBlack++;
  }
  return { avg: +(sum / (w * h) / 3).toFixed(1), nonBlackPct: +((nonBlack / (w * h)) * 100).toFixed(1) };
});

await p.screenshot({ path: 'test/deployed.png' });
console.log('场景信息:', JSON.stringify(info));
console.log('画面中心采样:', JSON.stringify(pixels), pixels.nonBlackPct > 20 ? '✅ 有实际内容' : '❌ 疑似空白');
console.log('错误数:', errs.length, errs.slice(0, 5));
console.log('失败请求:', failed.length, failed.slice(0, 5));

// mobile sanity check on the same deployment
const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await m.goto(URL_, { waitUntil: 'load', timeout: 90000 });
await m.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
await m.waitForTimeout(3500);
const mfov = await m.evaluate(() => +window.__cabin.camera.fov.toFixed(1));
await m.screenshot({ path: 'test/deployed-mobile.png' });
console.log('手机端 FOV:', mfov, mfov > 40 ? '✅ 竖屏已放宽视野' : '⚠ 未生效');

await b.close();
