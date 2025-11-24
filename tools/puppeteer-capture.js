const puppeteer = require('puppeteer');
const fs = require('fs');
(async ()=>{
  const url = process.argv[2] || 'https://cmass-sales.web.app/meeting?nocache=1';
  const outDir = './tools/output';
  try{ fs.mkdirSync(outDir, { recursive: true }); }catch(e){}
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => {
    try{ logs.push({type: msg.type(), text: msg.text()}); }catch(e){}
  });
  page.on('pageerror', err => { logs.push({type: 'pageerror', text: String(err)}); });
  page.on('requestfailed', r => { logs.push({type:'requestfailed', url: r.url(), status: r.failure()}); });
  console.log('visiting', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e=>{});
  // wait a little for debug overlay logs to appear
  await page.waitForTimeout(1200);
  const content = await page.content();
  fs.writeFileSync(outDir + '/dom.html', content, 'utf8');
  fs.writeFileSync(outDir + '/console.json', JSON.stringify(logs, null, 2), 'utf8');
  const ls = await page.evaluate(()=> { try{ const obj = {}; for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); obj[k]=localStorage.getItem(k);} return obj;}catch(e){return {err:String(e)}} });
  fs.writeFileSync(outDir + '/localStorage.json', JSON.stringify(ls, null, 2), 'utf8');
  await page.screenshot({ path: outDir + '/screenshot.png', fullPage: true });
  await browser.close();
  console.log('done');
})();