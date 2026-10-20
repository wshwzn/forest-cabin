import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push('ERR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('CERR ' + m.text()); });
await p.goto('http://127.0.0.1:5178/index.html', { waitUntil: 'load' });
await p.waitForTimeout(2500);
// enter
await p.click('#btn-enter');
await p.waitForTimeout(3000);
const shot1 = await p.evaluate(() => window.__cabin.state.shotIndex);
// skip ahead via keyboard
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(3200);
const shot2 = await p.evaluate(() => window.__cabin.state.shotIndex);
// drag to orbit
await p.mouse.move(600, 400); await p.mouse.down(); await p.mouse.move(760, 430, { steps: 12 }); await p.mouse.up();
await p.waitForTimeout(800);
const yaw = await p.evaluate(() => window.__cabin.state.userYaw);
// toggles
await p.keyboard.press('KeyB'); await p.keyboard.press('KeyH');
await p.waitForTimeout(600);
const bars = await p.evaluate(() => document.body.className);
await p.keyboard.press('KeyH');
await p.keyboard.press('KeyB');
// sound
await p.click('#btn-sound');
await p.waitForTimeout(1200);
const audio = await p.evaluate(() => ({ started: window.__cabinAmbience ? true : 'n/a' }));
await p.screenshot({ path: 'test/live.png' });
console.log(JSON.stringify({ shot1, shot2, yaw, bars, audio, errs }, null, 1));
await b.close();
