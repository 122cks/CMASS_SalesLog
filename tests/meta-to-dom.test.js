const { JSDOM } = require('jsdom');
const assert = require('assert');
const { fillSchoolGradeCounts } = require('../public/js/mapping-utils');

function makeDoc(){
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="schoolMetaInline" class="meta-card" style="display:none;">
      <div class="grade-rows">
        <div class="grade-row"><div class="grade-label">1학년:</div><div class="grade-value"><span id="inlineG1c"></span> 학급 / <span id="inlineG1s"></span> 학생</div></div>
        <div class="grade-row"><div class="grade-label">2학년:</div><div class="grade-value"><span id="inlineG2c"></span> 학급 / <span id="inlineG2s"></span> 학생</div></div>
        <div class="grade-row"><div class="grade-label">3학년:</div><div class="grade-value"><span id="inlineG3c"></span> 학급 / <span id="inlineG3s"></span> 학생</div></div>
      </div>
    </div>
    <div id="schoolMeta" class="meta-card">
      <div class="grade-row"><div class="grade-label">1학년:</div><div class="grade-value"><span id="metaG1c"></span> 학급 / <span id="metaG1s"></span> 학생</div></div>
    </div>
  </body></html>`, { runScripts: 'outside-only' });
  return dom.window.document;
}

describe('fillSchoolGradeCounts', function(){
  it('fills inline and meta spans for happy path', function(){
    const doc = makeDoc();
    const meta = { '1학년학급수': '8', '1학년학생수': '176', '2학년학급수': '8', '2학년학생수': '162', '3학년학급수': '8', '3학년학생수': '177' };
    fillSchoolGradeCounts(doc, meta);
    assert.strictEqual(doc.getElementById('inlineG1c').textContent, '8');
    assert.strictEqual(doc.getElementById('inlineG1s').textContent, '176');
    assert.strictEqual(doc.getElementById('metaG1c').textContent, '8');
  });

  it('estimates class count when only students and avg per class provided', function(){
    const doc = makeDoc();
    const meta = { '1학년학생수': '150', '1학년학급당학생수': '25' };
    fillSchoolGradeCounts(doc, meta);
    // 150 / 25 = 6
    assert.strictEqual(doc.getElementById('inlineG1c').textContent, '6');
    assert.strictEqual(doc.getElementById('inlineG1s').textContent, '150');
  });

  it('writes - when values missing', function(){
    const doc = makeDoc();
    const meta = { }; // empty
    fillSchoolGradeCounts(doc, meta);
    assert.strictEqual(doc.getElementById('inlineG1c').textContent, '-');
    assert.strictEqual(doc.getElementById('inlineG1s').textContent, '-');
  });
});
