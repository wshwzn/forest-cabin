// tools/audit.mjs — load the scene once and report errors, perf, and runtime health
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:5178/index.html?still=1&autostart=1';
const b = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const logs = [];
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
p.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

const t0 = Date.now();
await p.goto(url, { waitUntil: 'load', timeout: 120000 });
try {
  await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
} catch {
  console.log('READY TIMEOUT after', Date.now() - t0, 'ms');
}
const readyMs = Date.now() - t0;
await p.waitForFunction(() => getComputedStyle(document.getElementById('loader')).opacity === '0', { timeout: 60000 }).catch(() => {});

// let it run, measure frame pacing
const fps = await p.evaluate(
  () =>
    new Promise((res) => {
      const times = [];
      let last = performance.now();
      const tick = (now) => {
        times.push(now - last);
        last = now;
        if (times.length < 90) requestAnimationFrame(tick);
        else {
          const s = times.slice(20).sort((a, b) => a - b);
          res({ median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], n: times.length });
        }
      };
      requestAnimationFrame(tick);
    }),
);

const info = await p.evaluate(() => {
  const c = window.__cabin;
  const r = c.renderer;
  return {
    calls: r.info.render.calls,
    tris: r.info.render.triangles,
    textures: r.info.memory.textures,
    geometries: r.info.memory.geometries,
    programs: r.info.programs?.length,
    children: c.scene.children.length,
    camera: c.camera.position.toArray().map((v) => +v.toFixed(2)),
    shots: c.SHOTS.length,
    audio: c.audioState(),
  };
});

// walk every shot and confirm it settles without throwing
const shotResults = [];
for (let i = 0; i < info.shots; i++) {
  const r = await p.evaluate(async (n) => {
    try {
      window.__cabin.setShot(n, true);
      await new Promise((res) => setTimeout(res, 260));
      return { ok: true, cam: window.__cabin.camera.position.toArray().map((v) => +v.toFixed(2)) };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  }, i);
  shotResults.push(`shot${i + 1} ${r.ok ? 'ok cam=' + r.cam.join(',') : 'FAIL ' + r.err}`);
}

console.log('READY_MS', readyMs);
console.log('FPS', JSON.stringify(fps));
console.log('PERF', JSON.stringify(info));
console.log(shotResults.join('\n'));
const bad = logs.filter((l) => /pageerror|\[error\]|requestfailed/i.test(l));
console.log('ERRORS', bad.length);
console.log(bad.slice(0, 20).join('\n'));
console.log('ALL_LOGS', logs.length);
await b.close();
