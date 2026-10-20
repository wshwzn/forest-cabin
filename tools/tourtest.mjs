// tools/tourtest.mjs — confirm the auto tour is gone and stays gone
import { chromium } from 'playwright-core';

const b = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  ignoreDefaultArgs: ['--no-startup-window'],
});
const p = await b.newPage({ viewport: { width: 1200, height: 675 } });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('ERR ' + m.text()); });

await p.goto('http://127.0.0.1:5178/index.html?autostart=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
await p.waitForFunction(() => getComputedStyle(document.getElementById('loader')).opacity === '0', { timeout: 60000 });

// 1. the button must be gone from the DOM
const btnTour = await p.evaluate(() => !!document.getElementById('btn-tour'));
// 2. no tour state left
const stateKeys = await p.evaluate(() => ['autoTour', 'tourTimer'].filter((k) => k in window.__cabin.state));
// 3. the remaining control buttons
const buttons = await p.evaluate(() =>
  [...document.querySelectorAll('.controls button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
);

// 4. wait well past the longest dwell (15s) and confirm the shot never changes
const first = await p.evaluate(() => window.__cabin.state.shotIndex);
console.log('第 1 镜索引:', first, '— 等待 16 秒观察是否自动切镜…');
await p.waitForTimeout(16000);
const after = await p.evaluate(() => window.__cabin.state.shotIndex);

// 5. Space must do nothing
await p.keyboard.press('Space');
await p.waitForTimeout(1200);
const afterSpace = await p.evaluate(() => window.__cabin.state.shotIndex);

// 6. arrow keys must still work
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(1600);
const afterArrow = await p.evaluate(() => ({ idx: window.__cabin.state.shotIndex, label: document.getElementById('shot-cn').textContent }));

console.log('btn-tour 是否存在:', btnTour, '(应为 false)');
console.log('残留状态字段:', JSON.stringify(stateKeys), '(应为 [])');
console.log('控制按钮:', JSON.stringify(buttons));
console.log('16 秒后镜号:', after, after === first ? '✅ 未自动切换' : '❌ 仍在自动切换');
console.log('按空格后镜号:', afterSpace, afterSpace === first ? '✅ 空格无效' : '❌ 空格仍生效');
console.log('按 → 后:', JSON.stringify(afterArrow), afterArrow.idx !== first ? '✅ 手动切镜正常' : '❌ 手动切镜失效');
console.log('错误数:', errs.length, errs.slice(0, 3));
await b.close();
