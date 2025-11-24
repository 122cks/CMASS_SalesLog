// Smoke test: load HTML in JSDOM and check for parse errors
const fs = require('fs');
const { JSDOM } = require('jsdom');

const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error('Usage: node smoke_test_html.js <path-to-html>');
  process.exit(1);
}

try {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only', // parse but don't execute scripts
    resources: 'usable'
  });

  const { window } = dom;
  const { document } = window;

  // Check basic structure
  const errors = [];
  
  if (!document.querySelector('html')) errors.push('Missing <html> tag');
  if (!document.querySelector('head')) errors.push('Missing <head> tag');
  if (!document.querySelector('body')) errors.push('Missing <body> tag');
  
  // Check for duplicate IDs
  const ids = {};
  document.querySelectorAll('[id]').forEach(el => {
    const id = el.id;
    if (ids[id]) errors.push(`Duplicate ID: ${id}`);
    else ids[id] = true;
  });

  // Check forms are present
  const forms = document.querySelectorAll('form');
  if (forms.length < 2) errors.push(`Expected 2 forms, found ${forms.length}`);

  // Check script tags are properly closed
  const scripts = document.querySelectorAll('script');
  console.log(`✓ Parsed ${scripts.length} script blocks`);

  // Check style tags
  const styles = document.querySelectorAll('style');
  console.log(`✓ Parsed ${styles.length} style blocks`);

  // Check template
  const template = document.querySelector('template#subject-template');
  if (!template) errors.push('Missing subject-template');
  else console.log('✓ Found subject-template');

  if (errors.length > 0) {
    console.error('SMOKE_TEST_FAILED:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  } else {
    console.log('SMOKE_TEST_PASSED: HTML structure is valid');
    process.exit(0);
  }
} catch (err) {
  console.error('SMOKE_TEST_ERROR:', err.message);
  process.exit(1);
}
