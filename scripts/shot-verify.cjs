const path = '/root/hermes-workspace/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js';
const { chromium } = require(path);
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0,200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0,200)));
  const targets = [
    ['/profiles', '/root/dash-shots/verify-profiles.png'],
    ['/', '/root/dash-shots/verify-dashboard.png'],
    ['/conductor', '/root/dash-shots/verify-conductor.png'],
    ['/swarm2', '/root/dash-shots/verify-swarm2.png'],
  ];
  const perRoute = {};
  for (const [route, p] of targets) {
    const before = errors.length;
    try {
      await page.goto('http://localhost:3000' + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: p });
      console.log('SHOT', route, page.title());
    } catch (e) { console.log('FAIL', route, String(e).slice(0,150)); }
    perRoute[route] = 'err' + (errors.length - before);
  }
  console.log('=== JS ERRORS ===');
  console.log(errors.length ? errors.join('\n') : 'none');
  console.log('PER_ROUTE', JSON.stringify(perRoute));
  await browser.close();
})();