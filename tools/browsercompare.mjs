// tools/browsercompare.mjs — measure the same scene in Chrome vs Edge
import { chromium } from 'playwright-core';

const targets = [
  { name: 'Chrome', path: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  { name: 'Edge', path: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' },
];

const url = 'http://127.0.0.1:5178/index.html?still=1&autostart=1';

for (const t of targets) {
  let b;
  try {
    b = await chromium.launch({
      executablePath: t.path,
      headless: false,
      args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-position=0,0', '--window-size=1300,760'],
    });
  } catch (e) {
    console.log(t.name, 'LAUNCH FAIL', e.message.split('\n')[0]);
    continue;
  }
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => window.__cabin && window.__cabin.ready(), { timeout: 180000 });
  await p.waitForTimeout(6000); // let the adaptive-res logic settle

  const res = await p.evaluate(
    () =>
      new Promise((resolve) => {
        const gaps = [];
        let last = performance.now();
        let n = 0;
        const tick = (now) => {
          gaps.push(now - last);
          last = now;
          if (++n < 200) requestAnimationFrame(tick);
          else {
            const s = gaps.slice(40).sort((a, b) => a - b);
            const c = window.__cabin;
            const gl = c.renderer.getContext();
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            resolve({
              median: +s[Math.floor(s.length / 2)].toFixed(2),
              p95: +s[Math.floor(s.length * 0.95)].toFixed(2),
              max: +s[s.length - 1].toFixed(2),
              jankPct: +((s.filter((g) => g > 20).length / s.length) * 100).toFixed(1),
              pixelRatio: +c.renderer.getPixelRatio().toFixed(3),
              drawSize: c.renderer.getDrawingBufferSize(new c.THREE.Vector2()).toArray(),
              gpu: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
              ua: navigator.userAgent,
              colorSpace: c.renderer.outputColorSpace,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );

  console.log(`\n=== ${t.name} ===`);
  console.log('frame median', res.median, 'ms  =>', (1000 / res.median).toFixed(1), 'fps');
  console.log('p95', res.p95, 'ms | worst', res.max, 'ms | jank frames(>20ms)', res.jankPct + '%');
  console.log('pixelRatio', res.pixelRatio, '| drawingBuffer', res.drawSize.join('x'));
  console.log('gpu', res.gpu);
  console.log('ua', res.ua.slice(0, 100));
  await b.close();
}
