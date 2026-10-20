// tools/introtest.mjs — measure the opening move and capture its beats
import { chromium } from 'playwright-core';
import fs from 'node:fs';

fs.mkdirSync('test/intro', { recursive: true });

const b = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  ignoreDefaultArgs: ['--no-startup-window'],
});
const p = await b.newPage({ viewport: { width: 1200, height: 675 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await p.goto('http://127.0.0.1:5178/index.html?still=1&autostart=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });

// restart the intro cleanly from the poster frame
await p.evaluate(() => {
  const c = window.__cabin;
  c.state.autoTour = false;
  c.state.intro = 0;
  c.state.transition = null;
  c.state.userYaw = 0;
  c.state.userPitch = 0;
});
await p.waitForTimeout(300);

const t0 = Date.now();
const marks = [];
const samples = [0, 400, 800, 1200, 1600, 2000, 2400, 2800, 3200];

for (let i = 0; i < samples.length; i++) {
  const target = samples[i];
  const elapsed = Date.now() - t0;
  if (target > elapsed) await p.waitForTimeout(target - elapsed);
  const s = await p.evaluate(() => ({
    intro: +window.__cabin.state.intro.toFixed(3),
    fading: !!window.__cabin.state.transition,
    fade: +window.__cabin.state.t.toFixed(2),
    cam: window.__cabin.camera.position.toArray().map((v) => +v.toFixed(2)),
  }));
  marks.push({ at: samples[i], ...s });
  await p.screenshot({ path: `test/intro/t${String(samples[i]).padStart(4, '0')}.png` });
}

console.log('t(ms) | intro | 淡入值位置 | 相机位置');
for (const m of marks) console.log(`${String(m.at).padStart(5)} | ${m.intro} | ${m.cam.join(',')}`);

// how long until the intro is fully done?
const total = await p.evaluate(async () => {
  const start = performance.now();
  while (window.__cabin.state.intro < 1 && performance.now() - start < 8000) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  return Math.round(performance.now() - start);
});
console.log('\n淡入完成剩余耗时(ms):', total);
await b.close();
