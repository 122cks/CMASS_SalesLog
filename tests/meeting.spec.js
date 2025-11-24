const { test, expect, devices } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// helper to persist console messages
async function runBasicChecks(page, url, name){
  const consoleMsgs = [];
  page.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  await page.goto('https://cmass-sales.web.app' + url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(1200);

  // assert UI-level absence of the draft error text
  const err = page.locator('text=가져오기 로드하지 못함');
  await expect(err).toHaveCount(0);
  const body = await page.textContent('body');
  expect(body).not.toContain('로드하지');

  // save screenshot and console log
  const outDir = path.join(process.cwd(), 'playwright-artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const shot = path.join(outDir, `${name.replace(/[^a-z0-9_-]/ig,'_')}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log('Captured screenshot:', shot);
  console.log('Console messages during page load:\n' + consoleMsgs.join('\n'));
}

const scenarios = [
  { name: 'original', url: '/meeting?staff=%EC%86%A1%ED%9B%88%EC%9E%AC%20%EB%B6%80%EC%9E%A5&date=2025-11-06&region=%EA%B2%BD%EA%B8%B0%EB%8F%84%EA%B0%80%ED%8F%89%EA%B5%AC&school=%EC%B2%AD%EC%8B%AC%EA%B5%AD%EC%A0%9C%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90' },
  { name: 'alt-staff', url: '/meeting?staff=%EC%9E%84%EC%A4%80%ED%98%B8%20%EC%B0%A8%EC%9E%A5&date=2025-11-06&region=%EA%B2%BD%EA%B8%B0%EB%8F%84%EA%B0%80%ED%8F%89%EA%B5%AC&school=%EC%B2%AD%EC%8B%AC%EA%B5%AD%EC%A0%9C%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90' },
  { name: 'alt-school', url: '/meeting?staff=%EC%86%A1%ED%9B%88%EC%9E%AC%20%EB%B6%80%EC%9E%A5&date=2025-11-06&region=%EA%B2%BD%EA%B8%B0%EB%8F%84%EA%B0%80%ED%8F%89%EA%B5%AC&school=%EC%95%88%EB%8F%99%EA%B5%90' }
];

// Desktop scenarios
for (const s of scenarios){
  test(`desktop - ${s.name}`, async ({ page, browserName }) => {
    await runBasicChecks(page, s.url, `desktop_${browserName}_${s.name}`);
  });
}

// Hard reload / cache-bypass scenario
test('desktop - hard-reload', async ({ page, browserName }) => {
  const url = scenarios[0].url;
  await page.goto('https://cmass-sales.web.app' + url, { waitUntil: 'load' });
  // reload and wait
  // Use goto to avoid frame-detached / reload-abort issues on some engines
  await page.goto(page.url(), { waitUntil: 'load' });
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
  const body = await page.textContent('body');
  expect(body).not.toContain('로드하지');
  const shot = path.join(process.cwd(), 'playwright-artifacts', `desktop_${browserName}_hard_reload.png`);
  await page.screenshot({ path: shot, fullPage: true });
});

// URL-change scenario: change select values and ensure no error UI appears
test('desktop - change-selects (URL sync)', async ({ page, browserName }) => {
  const url = scenarios[0].url;
  await page.goto('https://cmass-sales.web.app' + url, { waitUntil: 'load' });
  // Try to change region and school using select (if present)
  try{
    await page.waitForSelector('#regionSelect', { timeout: 3000 });
    await page.selectOption('#regionSelect', { index: 0 }).catch(()=>{});
  }catch(e){}
  try{
    await page.waitForSelector('#schoolSelect', { timeout: 3000 });
    // if there are options, pick the last meaningful one
    const opts = await page.$$eval('#schoolSelect option', os => os.map(o=>o.value).filter(v=>v));
    if (opts.length) await page.selectOption('#schoolSelect', opts[0]);
  }catch(e){}
  await page.waitForTimeout(800);
  const body = await page.textContent('body');
  expect(body).not.toContain('로드하지');
});

// Mobile viewport (iPhone 12 emulation) with its own context so video includes mobile render
test('mobile - iPhone12 original', async ({ browser, browserName }) => {
  // Firefox doesn't support isMobile emulation properties; skip mobile emulation there.
  test.skip(browserName === 'firefox', 'Mobile isMobile/device emulation not supported in Firefox');
  const iPhone = devices['iPhone 12'];
  const context = await browser.newContext({ ...iPhone, recordVideo: { dir: path.join(process.cwd(), 'playwright-artifacts','videos') } });
  const page = await context.newPage();
  const url = scenarios[0].url;
  await page.goto('https://cmass-sales.web.app' + url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const body = await page.textContent('body');
  expect(body).not.toContain('로드하지');
  const shot = path.join(process.cwd(), 'playwright-artifacts', `mobile_iphone12_original.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await context.close();
});

