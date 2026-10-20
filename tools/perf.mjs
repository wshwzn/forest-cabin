import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://127.0.0.1:5178/index.html?still=1&autostart=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 120000 });
await p.waitForTimeout(3000);
const fps = await p.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else res((n / ((performance.now() - t0) / 1000)).toFixed(1)); };
  requestAnimationFrame(tick);
}));
const info = await p.evaluate(() => { const r = window.__cabin.renderer; r.info.autoReset = false; return null; });
const info2 = await p.evaluate(() => { const r = window.__cabin.renderer; return { calls: r.info.render.calls, tris: r.info.render.triangles }; });
console.log('FPS', fps, 'INFO', JSON.stringify(info2));
await b.close();
