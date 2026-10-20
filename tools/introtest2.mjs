// tools/introtest2.mjs — measure the real user path: click "enter", then time the opening move
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

// NO autostart: sit on the loading poster, exactly like a first-time visitor
await p.goto('http://127.0.0.1:5178/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
await p.waitForFunction(() => !document.getElementById('btn-enter').disabled, { timeout: 60000 });
await p.waitForTimeout(600);

// click "进入林间" — the true t=0 of the opening
const t0 = Date.now();
await p.click('#btn-enter');

const samples = [0, 500, 1000, 1500, 2000, 2500, 3000, 3400];
const rows = [];
for (const at of samples) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await p.waitForTimeout(wait);
  const s = await p.evaluate(() => {
    const c = window.__cabin;
    const v = c.camera.position.toArray().map((n) => +n.toFixed(2));
    return {
      intro: +c.state.intro.toFixed(2),
      moving: !!c.state.transition,
      tr: c.state.transition ? +(c.state.transition.t / c.state.transition.dur).toFixed(2) : null,
      fov: +c.camera.fov.toFixed(1),
      cam: v,
    };
  });
  rows.push({ at, ...s });
  await p.screenshot({ path: `test/intro/beat-${String(at).padStart(4, '0')}.png` });
}

console.log('t(ms) | 淡入进度 | 运镜进度 | FOV  | 相机位置');
for (const r of rows) {
  console.log(
    `${String(r.at).padStart(5)} | ${String(r.intro).padStart(7)} | ${String(r.tr ?? 'done').padStart(7)} | ${String(r.fov).padStart(4)} | ${r.cam.join(',')}`,
  );
}

// when does the camera settle? measure the frame the transition clears
const settle = await p.evaluate(async () => {
  const c = window.__cabin;
  const start = performance.now();
  while (c.state.transition && performance.now() - start < 15000) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  return Math.round(performance.now() - start);
});
console.log('\n运镜收敛剩余耗时(ms):', settle);

// the shot's own text is the signature that the move has landed
const fade = await p.evaluate(async () => {
  const start = performance.now();
  while (window.__cabin.state.intro < 1 && performance.now() - start < 15000) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  return Math.round(performance.now() - start);
});
console.log('淡入收敛剩余耗时(ms):', fade);
await b.close();
