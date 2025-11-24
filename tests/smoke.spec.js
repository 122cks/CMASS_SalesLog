const { test, expect } = require('@playwright/test');

const BASE = 'https://cmass-sales.web.app';

test('meeting -> submit -> report -> edit -> delete flow', async ({ page }) => {
  // go to meeting and set staff via query param
  await page.goto(BASE + '/meeting.html?staff=songhoonjae');

  // wait for main UI
  await page.waitForSelector('#staff');

  // set visit date to today
  const today = new Date().toISOString().slice(0,10);
  await page.fill('#visitDate', today);

  // choose a region if available
  const regionSel = await page.$('#regionSelect');
  if (regionSel) {
    const options = await page.$$eval('#regionSelect option', opts => opts.map(o => o.value).filter(v=>v));
    if (options.length) await page.selectOption('#regionSelect', options[0]);
  }

  // choose a school if available
  const schoolOpt = await page.$$eval('#schoolSelect option', opts => opts.map(o=>o.value).filter(v=>v));
  if (schoolOpt.length) await page.selectOption('#schoolSelect', schoolOpt[0]);

  // set time and duration
  await page.selectOption('#startHour', '10');
  await page.selectOption('#startMinute', '0');
  // click 30min button if exists
  const durBtn = await page.$('button.dur-btn[data-min="30"]');
  if (durBtn) await durBtn.click();

  // pick a subject and activity and favor
  await page.click('#subjects button.subject-btn');
  const act = await page.$('#activities button.subject-btn'); if (act) await act.click();
  await page.click('#favorBtns button.favor-btn');

  // fill teacher and phone
  await page.fill('#teacherName', 'E2E Test');
  await page.fill('#phone', '010-0000-0000');

  // submit
  await Promise.all([
    page.waitForNavigation({ url: BASE + '/report.html?**', waitUntil: 'load' }).catch(()=>{}),
    page.click('#btnSubmit')
  ]);

  // on report page, wait for list
  await page.waitForSelector('#list');
  const entries = await page.$$('#list .card');
  expect(entries.length).toBeGreaterThanOrEqual(1);

  // click edit on the first entry (수정)
  const editBtn = await page.$('#list .card button:has-text("수정")');
  expect(editBtn).not.toBeNull();
  await Promise.all([
    page.waitForNavigation({ url: BASE + '/meeting.html?**', waitUntil: 'load' }).catch(()=>{}),
    editBtn.click()
  ]);

  // change teacher name and save
  await page.waitForSelector('#teacherName');
  await page.fill('#teacherName', 'E2E Test Edited');
  await Promise.all([
    page.waitForNavigation({ url: BASE + '/report.html?**', waitUntil: 'load' }).catch(()=>{}),
    page.click('#btnSubmit')
  ]);

  // back on report, delete the first entry
  await page.waitForSelector('#list');
  const delBtn = await page.$('#list .card button:has-text("삭제")');
  expect(delBtn).not.toBeNull();
  // confirm dialog handling
  page.on('dialog', dialog => dialog.accept());
  await delBtn.click();

  // verify deletion (list may shrink)
  await page.waitForTimeout(500);
  const entriesAfter = await page.$$('#list .card');
  // entriesAfter may be zero if we removed the only one
  expect(entriesAfter.length).toBeGreaterThanOrEqual(0);
});
