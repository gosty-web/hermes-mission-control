const path = '/root/hermes-workspace/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js';
const { chromium } = require(path);
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const bad = [];
  page.on('requestfailed', r => bad.push('FAILED ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text().slice(0,160)); });
  await page.goto('http://localhost:3000/swarm2', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/root/dash-shots/verify-swarm2.png' });
  console.log('TITLE', page.title());
  console.log('=== BAD ===');
  console.log(bad.length ? bad.join('\n') : 'none');
  const pane = await page.evaluate(() => {
    const err = document.querySelector('[class*="error"]');
    return err ? (err.textContent||'').trim().slice(0,300) : '(no error element)';
  });
  console.log('ERROR_ELEM', pane);
  await browser.close();
  process.exit(0);
})();