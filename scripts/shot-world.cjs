const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  // ── Embedded Conductor World view ──────────────────────────────────────
  await page.goto('http://127.0.0.1:3000/conductor', { waitUntil: 'networkidle' })
  // switch Offices -> World toggle
  const worldBtn = page.getByRole('button', { name: 'World' }).first()
  await worldBtn.click()
  await page.waitForTimeout(1500)

  const section = page.locator('section').filter({ has: page.locator('canvas') }).first()
  await section.screenshot({ path: 'docs/screenshots/pixel-world-conductor.png' })

  // ── Building hover tooltip: move mouse over an office building ────────
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) {
    // hover near the BUILDER office (left cluster, upper area of the embed)
    await page.mouse.move(box.x + box.width * 0.24, box.y + box.height * 0.28)
    await page.waitForTimeout(600)
    await section.screenshot({ path: 'docs/screenshots/pixel-world-hover.png' })
  }

  // ── Click an office → worker detail panel (skills + capabilities) ─────
  await page.mouse.click(box.x + box.width * 0.24, box.y + box.height * 0.28)
  await page.waitForTimeout(900)
  await section.screenshot({ path: 'docs/screenshots/pixel-world-detail.png' })

  // ── Standalone /world full-map view (if route exists) ─────────────────
  const wr = await page.goto('http://127.0.0.1:3000/world', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => null)
  if (wr && wr.status() < 400) {
    await page.waitForTimeout(1800)
    await page.screenshot({ path: 'docs/screenshots/pixel-world-full.png' })
  }

  console.log('JSERR', errors.length ? JSON.stringify(errors) : 'none')
  await browser.close()
})()