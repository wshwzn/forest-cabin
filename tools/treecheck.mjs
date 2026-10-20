import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
p.on('pageerror', e => console.log('ERR', e.message));
p.on('console', m => { if (m.type()==='error') console.log('CERR', m.text()); });
await p.goto('http://127.0.0.1:5178/index.html?still=1&autostart=1&plain=1&raw=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 120000 });
await p.waitForTimeout(1500);
const res = await p.evaluate(() => {
  const { scene, camera, THREE } = window.__cabin;
  const g = scene.getObjectByName('forest');
  const info = g.children.map(c => ({ type: c.type, count: c.count, tris: c.geometry ? c.geometry.attributes.position.count/3 : 0, vis: c.visible, hasMap: !!c.material?.map, alphaTest: c.material?.alphaTest }));
  return { n: g.children.length, info, camPos: camera.position.toArray().map(v=>+v.toFixed(1)) };
});
console.log(JSON.stringify(res, null, 1));
await b.close();
