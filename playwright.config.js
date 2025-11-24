// Playwright config for E2E checks across browsers with video/screenshot capture
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const { devices } = require('@playwright/test');
const config = {
  testDir: 'tests',
  timeout: 60000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  // place the HTML report outside the artifacts outputDir to avoid the
  // reporter clearing the artifacts directory which would delete videos/traces
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15000,
    navigationTimeout: 45000,
    // Capture video for every test (stored under outputDir)
    video: 'on',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ],
  // where artifacts (videos/screenshots/report) will be written
  outputDir: 'playwright-artifacts'
};
module.exports = config;
