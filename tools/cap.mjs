// tools/cap.mjs — capture shots of the running scene
// usage: node tools/cap.mjs [outdir] [shotlist: 1,2,3] [query]
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2] || 'shots';
const shotList = (process.argv[3] || '1').split(',').map(Number);
const extra = process.argv[4] || '';
const width = Number(process.env.W || 1600);
const height = Number(process.env.H || 900);
const wait = Number(process.env.WAIT || 2500);

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[err] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

const url = `http://127.0.0.1:5178/index.html?still=1&autostart=1${extra}`;
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
await page.waitForFunction(() => getComputedStyle(document.getElementById('loader')).opacity === '0', { timeout: 60000 });
console.log('ready in', Date.now() - t0, 'ms');

for (const i of shotList) {
  await page.evaluate((n) => {
    const c = window.__cabin;
    c.setShot(n - 1, true);
    c.state.transition = null;
    c.state.intro = 1;
    c.state.t = 30 + n * 3;
  }, i);
  await page.waitForTimeout(wait);
  const file = path.join(outDir, `shot${i}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
}
const info = await page.evaluate(() => {
  const r = window.__cabin.renderer;
  return { calls: r.info.render.calls, tris: r.info.render.triangles, tex: r.info.memory.textures, geo: r.info.memory.geometries };
});
console.log('INFO', JSON.stringify(info));
if (logs.length) console.log(logs.join('\n'));
await browser.close();
