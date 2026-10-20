import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
await p.goto('http://127.0.0.1:5178/index.html?still=1&autostart=1&plain=1&cam=4.2,1.9,4.6&look=3.2,1.7,0.6&fov=34', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 120000 });
await p.waitForFunction(() => getComputedStyle(document.getElementById('loader')).opacity === '0', { timeout: 60000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: 'test/corner.png' });
await b.close();
