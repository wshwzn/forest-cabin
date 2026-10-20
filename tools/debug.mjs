// tools/debug.mjs — load the page, print all console output and errors
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:5178/index.html?still=1&autostart=1';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${e.stack || ''}`));
page.on('requestfailed', (r) => console.log(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`); });
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(Number(process.env.WAIT || 8000));
const st = await page.evaluate(() => ({
  status: document.getElementById('status')?.textContent,
  hasCabin: !!window.__cabin,
  ready: window.__cabin ? window.__cabin.ready() : null,
}));
console.log('STATE', JSON.stringify(st));
await page.screenshot({ path: process.argv[3] || 'shots/debug.png' });
await browser.close();
