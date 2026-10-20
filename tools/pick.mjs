import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 500 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://127.0.0.1:5178/index.html?still=1&autostart=1&plain=1&raw=1&cam=2.2,2.0,7.2&look=-0.4,1.7,2.3&fov=42', { waitUntil: 'load' });
await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 120000 });
await p.waitForTimeout(2000);
const res = await p.evaluate(() => {
  const { scene, camera, THREE } = window.__cabin;
  const rc = new THREE.Raycaster();
  const out = [];
  for (const [nx, ny] of [[0.0,-0.05],[0.05,0.0],[-0.07,-0.02],[0.1,0.05]]) {
    rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = rc.intersectObjects(scene.children, true);
    const h = hits.find(h => h.object.isMesh && h.object.material && !h.object.material.isShaderMaterial);
    if (!h) { out.push({ nx, ny, none: true, all: hits.slice(0,3).map(x=>x.object.type) }); continue; }
    let chain = [];
    let o = h.object;
    while (o) { chain.push(o.type + (o.name ? ':'+o.name : '')); o = o.parent; }
    out.push({ nx, ny, d: +h.distance.toFixed(2), geo: h.object.geometry.type, matType: h.object.material.type, matName: h.object.material.name, color: h.object.material.color?.getHexString?.(),
      map: !!h.object.material.map, emissive: h.object.material.emissive?.getHexString?.(), ei: h.object.material.emissiveIntensity, chain: chain.slice(0,4),
      hasColorMap: h.object.material.map ? { w: h.object.material.map.image?.width } : null });
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await b.close();
