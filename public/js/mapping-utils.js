// Minimal mapping utility used by tests and optionally by the page.
// Exported for unit testing (CommonJS).
function toNumber(v){
  if (v === null || v === undefined) return null;
  try{ const n = String(v).replace(/[,\s]/g,''); if(n === '') return null; const f = parseFloat(n); return isNaN(f) ? null : f; }catch(e){ return null; }
}
function pick(obj, keys){
  for(const k of keys){ if(!obj) continue; if(typeof obj[k] !== 'undefined' && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k]; }
  return null;
}

function setAllById(doc, id, text){
  try{
    if(!id) return;
    const nodes = Array.from(doc.querySelectorAll('#' + id));
    nodes.forEach(n => { try{ n.textContent = (text === undefined || text === null) ? '' : String(text); }catch(e){} });
  }catch(e){}
}

function fillSchoolGradeCounts(doc, meta){
  try{
    if(!meta) return;
    const grades = [1,2,3];
    grades.forEach(g => {
      const classKeys = [
        `${g}학년학급수`, `${g}학년_학급수`, `${g}학급수`, `${g}학급`, `${g}GradeClassCount`
      ];
      const studentKeys = [
        `${g}학년학생수`, `${g}학년_학생수`, `${g}학생수`, `${g}학생`, `${g}GradeStudentCount`
      ];
      const avgKeys = [
        `${g}학년학급당학생수`, `${g}학급당학생수`, `${g}학급당`, `${g}AvgStudentsPerClass`
      ];

      const cls = pick(meta, classKeys);
      const stu = pick(meta, studentKeys);
      const avg = pick(meta, avgKeys);

      let clsNum = toNumber(cls);
      const stuNum = toNumber(stu);
      const avgNum = toNumber(avg);

      if (clsNum === null && stuNum !== null && avgNum !== null && avgNum > 0){
        clsNum = Math.round(stuNum / avgNum) || null;
      }

      setAllById(doc, 'inlineG' + g + 'c', clsNum === null ? '-' : clsNum);
      setAllById(doc, 'inlineG' + g + 's', stuNum === null ? '-' : stuNum);
      setAllById(doc, 'metaG' + g + 'c', clsNum === null ? '-' : clsNum);
      setAllById(doc, 'metaG' + g + 's', stuNum === null ? '-' : stuNum);
    });
  }catch(e){ console.warn('fillSchoolGradeCounts failed', e); }
}

module.exports = { fillSchoolGradeCounts, toNumber, pick };
