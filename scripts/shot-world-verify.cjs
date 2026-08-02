// World-builder verification harness: conductor + /world + zoomed diorama +
// agent-click detail + seat-occupancy probe + JS error capture.
// NOTE: sibling dashboard-builder owns scripts/shot-verify.cjs (multi-route);
// this world-specific script lives separately to avoid stepping on it.
const path = '/root/hermes-workspace/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js';
const { chromium } = require(path);
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
    page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)));

    // 1) Conductor view (World + Offices live there)
    await page.goto('http://localhost:3000/conductor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: '/root/dash-shots/pixel-world-conductor.png' });

    // 2) /world standalone — wait for agents to settle at their desks (~14s)
    await page.goto('http://localhost:3000/world', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(14000);
    await page.screenshot({ path: '/root/dash-shots/pixel-world-standalone3.png' });

    // 3) seat-occupancy probe: skin pixels in each office's desk-seat zone
    const probe = await page.evaluate(() => {
      const cv = document.querySelector('canvas');
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const scale = Math.min(cv.clientWidth / 2400, cv.clientHeight / 1500);
      const toSX = (wx) => (cv.clientWidth / 2 - 1200 * scale + wx * scale);
      const toSY = (wy) => (cv.clientHeight / 2 - 750 * scale + wy * scale);
      const isSkin = (r, g, b) => Math.abs(r - 242) < 20 && Math.abs(g - 201) < 20 && Math.abs(b - 160) < 20;
      const offices = [
        { id: 'builder', x: 520, y: 470, w: 240, h: 250 },
        { id: 'orchestrator', x: 1600, y: 470, w: 240, h: 250 },
        { id: 'researcher', x: 300, y: 900, w: 240, h: 250 },
      ];
      const out = {};
      for (const o of offices) {
        const iy = o.y + 16, ih = o.h - 52, iBot = iy + ih, deskY = iBot - 26;
        const ix = o.x + 12, iw = o.w - 24;
        const z = { x0: toSX(ix), x1: toSX(ix + iw), y0: toSY(deskY - 36), y1: toSY(deskY - 6) };
        let n = 0;
        for (let y = Math.max(0, Math.round(z.y0)); y < Math.min(cv.height, Math.round(z.y1)); y++) {
          for (let x = Math.max(0, Math.round(z.x0)); x < Math.min(cv.width, Math.round(z.x1)); x++) {
            const i = (y * cv.width + x) * 4;
            if (d[i + 3] > 60 && isSkin(d[i], d[i + 1], d[i + 2])) n++;
          }
        }
        out[o.id] = n;
      }
      return out;
    });
    console.log('SEAT PROBE (14s):', JSON.stringify(probe));

    // 4) zoom into the builder office for the diorama close-up
    const box = await page.locator('canvas').boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -250);
      await page.waitForTimeout(800);
      await page.screenshot({ path: '/root/dash-shots/pixel-world-zoomed3.png' });
    }

    // 5) agent-click detail (click the builder office interior)
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 350); // zoom back out
    await page.waitForTimeout(500);
    try {
      const p = await page.evaluate(() => {
        const cv = document.querySelector('canvas');
        const scale = Math.min(cv.clientWidth / 2400, cv.clientHeight / 1500);
        return { x: cv.clientWidth / 2 - 1200 * scale + 640 * scale, y: cv.clientHeight / 2 - 750 * scale + 600 * scale };
      });
      await page.mouse.click(box.x + p.x, box.y + p.y);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/root/dash-shots/pixel-world-detail4.png' });
      const detailText = await page.evaluate(() => {
        const els = [...document.querySelectorAll('div,span')];
        const hit = els.find(e => /current task|active tool/i.test(e.textContent || '') && (e.textContent || '').length < 400);
        return hit ? hit.textContent.slice(0, 160) : null;
      });
      console.log('DETAIL PANEL:', detailText ? JSON.stringify(detailText) : 'NOT FOUND');
    } catch (e) {
      console.log('detail-click skip:', String(e).slice(0, 120));
    }

    console.log('=== JS ERRORS ===');
    console.log(errors.length ? errors.join('\n') : 'none');
  } finally {
    await browser.close();
  }
})();
