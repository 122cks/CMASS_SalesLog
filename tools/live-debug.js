// Minimal Playwright script to open /meeting, collect console logs, network failures,
// localStorage, and save a DOM snapshot. Requires Playwright installed locally.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function run() {
  const outDir = path.resolve(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    logs.push({ type: 'console', text: msg.text(), location: msg.location() });
  });
  page.on('pageerror', err => {
    logs.push({ type: 'pageerror', text: err.message, stack: err.stack });
  });
  page.on('requestfailed', req => {
    logs.push({ type: 'requestfailed', url: req.url(), method: req.method(), failure: req.failure() });
  });

  const url = 'https://cmass-sales.web.app/meeting';
  console.log('Opening', url);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(e => logs.push({ type: 'goto_error', error: e.message }));

  // Give the page a few seconds to run any scripts
  await page.waitForTimeout(2000);

  // collect localStorage
  const ls = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      try { out[k] = localStorage.getItem(k); } catch(e){ out[k] = 'ERR:'+e.message }
    }
    return out;
  });

  // save DOM snapshot
  const html = await page.content();

  fs.writeFileSync(path.join(outDir, 'console.json'), JSON.stringify(logs, null, 2));
  fs.writeFileSync(path.join(outDir, 'localStorage.json'), JSON.stringify(ls, null, 2));
  fs.writeFileSync(path.join(outDir, 'dom.html'), html);

  console.log('Saved outputs to', outDir);
  await browser.close();
}

run().catch(e => {
  console.error('Error in live-debug:', e);
  process.exit(1);
});
