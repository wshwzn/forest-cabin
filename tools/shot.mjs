// tools/shot.mjs — capture stills of the scene with the local Chrome install
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:5178/index.html?still=1&autostart=1';
const outDir = process.argv[3] || 'shots';
const shots = (process.argv[4] || '1').split(',').map(Number);
const width = Number(process.env.W || 1600);
const height = Number(process.env.H || 900);
const extraWait = Number(process.env.WAIT || 1200);

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--use-angle=default',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
  ],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load', timeout: 120000 });

// wait until the scene reports ready
try {
  await page.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
} catch (e) {
  console.log('READY TIMEOUT');
}
await page.waitForTimeout(extraWait);

for (const i of shots) {
  await page.evaluate((n) => {
    window.__cabin.setShot(n - 1, true);
    window.__cabin.state.intro = 1;
    window.__cabin.state.transition = null;
  }, i);
  await page.waitForTimeout(900);
  const file = path.join(outDir, `shot${i}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
}

const perf = await page.evaluate(() => ({
  calls: window.__cabin.renderer.info.render.calls,
  tris: window.__cabin.renderer.info.render.triangles,
  textures: window.__cabin.renderer.info.memory.textures,
  geometries: window.__cabin.renderer.info.memory.geometries,
}));
console.log('PERF', JSON.stringify(perf));
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
