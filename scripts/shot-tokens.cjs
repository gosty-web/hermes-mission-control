const path = '/root/hermes-workspace/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js';
const { chromium } = require(path);
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const styles = [];
  page.on('response', r => { if (/styles-.*\.css/.test(r.url())) styles.push(r.url().split('/').pop()); });
  await page.goto('http://localhost:3000/profiles', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const res = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.dataset.theme,
      hover: cs.getPropertyValue('--theme-hover').trim(),
      muted2: cs.getPropertyValue('--theme-muted-2').trim(),
      accentSoft: cs.getPropertyValue('--theme-accent-soft').trim(),
      accentStrong: cs.getPropertyValue('--theme-accent-strong').trim(),
      dangerSoft: cs.getPropertyValue('--theme-danger-soft').trim(),
      onAccent: cs.getPropertyValue('--theme-on-accent').trim(),
    };
  });
  console.log('CSS_LOADED', styles.join(','));
  console.log('TOKENS', JSON.stringify(res));
  await browser.close();
  process.exit(0);
})();