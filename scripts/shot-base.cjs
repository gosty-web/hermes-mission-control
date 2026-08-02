const path = '/root/hermes-workspace/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js';
const { chromium } = require(path);
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0,200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0,200)));
  const targets = [
    ['/', '/root/dash-shots/base-dashboard.png'],
    ['/conductor', '/root/dash-shots/base-conductor.png'],
    ['/world', '/root/dash-shots/base-world.png'],
    ['/swarm2', '/root/dash-shots/base-swarm2.png'],
  ];
  for (const [route, p] of targets) {
    try {
      await page.goto('http://localhost:3000' + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: p });
      console.log('SHOT', route, page.title());
    } catch (e) { console.log('FAIL', route, String(e).slice(0,150)); }
  }
  console.log('=== JS ERRORS ===');
  console.log(errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();