// tools/dragtest.mjs — simulate horizontal drags in both directions and capture the result
import { chromium } from 'playwright-core';
import fs from 'node:fs';

fs.mkdirSync('test/drag', { recursive: true });

const b = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  ignoreDefaultArgs: ['--no-startup-window'],
});
const p = await b.newPage({ viewport: { width: 1200, height: 675 } });

await p.goto('http://127.0.0.1:5178/index.html?still=1&autostart=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
await p.waitForFunction(() => getComputedStyle(document.getElementById('loader')).opacity === '0', { timeout: 60000 });

// lock to shot 1, kill tour + intro so the only variable is the drag
const lock = async () => {
  await p.evaluate(() => {
    const c = window.__cabin;
    c.state.autoTour = false;
    c.state.intro = 1;
    c.state.transition = null;
    c.state.userYaw = 0;
    c.state.userPitch = 0;
    c.setShot(0, true);
  });
  await p.waitForTimeout(700);
};

// a drag is pointerdown -> several pointermove -> pointerup
async function drag(fromX, toX, fromY, toY) {
  await p.mouse.move(fromX, fromY);
  await p.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(fromX + ((toX - fromX) * i) / steps, fromY + ((toY - fromY) * i) / steps);
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
  await p.waitForTimeout(600);
}

const CX = 600, CY = 337;

// baseline
await lock();
await p.screenshot({ path: 'test/drag/00-baseline.png' });

// 鼠标从左侧移动到右侧 (dx > 0)
await lock();
await drag(CX - 220, CX + 220, CY, CY);
await p.screenshot({ path: 'test/drag/01-mouse-left-to-right.png' });
const yawA = await p.evaluate(() => +window.__cabin.state.userYaw.toFixed(3));

// 鼠标从右侧移动到左侧 (dx < 0)
await lock();
await drag(CX + 220, CX - 220, CY, CY);
await p.screenshot({ path: 'test/drag/02-mouse-right-to-left.png' });
const yawB = await p.evaluate(() => +window.__cabin.state.userYaw.toFixed(3));

console.log('mouse L->R : userYaw =', yawA);
console.log('mouse R->L : userYaw =', yawB);
await b.close();
