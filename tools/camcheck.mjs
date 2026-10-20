import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://127.0.0.1:5178/index.html?still=1&autostart=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 120000 });
await p.waitForTimeout(1500);
for (let i = 0; i < 6; i++) {
  const r = await p.evaluate((n) => {
    const c = window.__cabin;
    c.setShot(n, true);
    c.state.transition = null; c.state.intro = 1;
    return null;
  }, i);
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => {
    const { camera } = window.__cabin;
    return { pos: camera.position.toArray().map(v => +v.toFixed(2)), fov: +camera.fov.toFixed(1), zoom: window.__cabin.state.userZoom };
  });
  console.log(i + 1, JSON.stringify(info));
}
await b.close();
