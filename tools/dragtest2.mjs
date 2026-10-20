// tools/dragtest2.mjs — verify both look paradigms react in mirrored ways
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
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await p.goto('http://127.0.0.1:5178/index.html?still=1&autostart=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
await p.waitForFunction(() => getComputedStyle(document.getElementById('loader')).opacity === '0', { timeout: 60000 });

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

async function drag(fromX, toX, fromY, toY) {
  await p.mouse.move(fromX, fromY);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(fromX + ((toX - fromX) * i) / 12, fromY + ((toY - fromY) * i) / 12);
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
  await p.waitForTimeout(500);
}

async function setMode(mode) {
  await p.evaluate((m) => {
    const c = window.__cabin;
    if (c.state.lookMode !== m) document.getElementById('btn-look').click();
  }, mode);
  await p.waitForTimeout(150);
}

const CX = 600, CY = 337;
const rows = [];

for (const mode of ['grab', 'look']) {
  await setMode(mode);

  // horizontal: mouse left -> right
  await lock();
  await drag(CX - 200, CX + 200, CY, CY);
  const hRight = await p.evaluate(() => +window.__cabin.state.userYaw.toFixed(3));
  await p.screenshot({ path: `test/drag/${mode}-H-ltr.png` });

  // vertical: mouse top -> bottom
  await lock();
  await drag(CX, CX, CY - 150, CY + 150);
  const vDown = await p.evaluate(() => +window.__cabin.state.userPitch.toFixed(3));
  await p.screenshot({ path: `test/drag/${mode}-V-ttb.png` });

  rows.push({ mode, yawAfterMouseRight: hRight, pitchAfterMouseDown: vDown });
}

console.log('mode | yaw(mouse left->right) | pitch(mouse top->bottom)');
for (const r of rows) {
  console.log(
    `${r.mode.padEnd(5)} | ${String(r.yawAfterMouseRight).padStart(7)} | ${String(r.pitchAfterMouseDown).padStart(7)}`,
  );
}
console.log('\n两条范式应当互为相反数（符号相反，绝对值相同）');
await b.close();
