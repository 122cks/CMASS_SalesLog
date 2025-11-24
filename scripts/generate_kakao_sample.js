// Small standalone generator that mimics buildAggregateSummary(visits, 'kakao')
// Run with: node scripts/generate_kakao_sample.js

function pad2(n){ const num = parseInt(n,10); if (isNaN(num)) return '00'; return (num < 10 ? '0' : '') + String(num); }
function parseTime(t){ if(!t) return null; const m = t.match(/(\d{1,2}):(\d{2})/); if(!m) return null; return {h: parseInt(m[1],10), m: parseInt(m[2],10)}; }
function toMinutes(t){ const p = parseTime(t); if(!p) return null; return p.h*60 + p.m; }
function calcMinutesInterval(a,b){ const A = toMinutes(a); const B = toMinutes(b); if (A===null || B===null) throw new Error('invalid time'); let diff = B - A; if (diff < 0) diff += 24*60; return diff; }
function addMinutesToTime(timeStr, minutesToAdd){ if (!timeStr) return ''; const parts = timeStr.split(':'); if (parts.length<2) return ''; const hh = parseInt(parts[0],10); const mm = parseInt(parts[1],10); if (isNaN(hh)||isNaN(mm)) return ''; const total = hh*60 + mm + parseInt(minutesToAdd,10); const wrapped = (total + 24*60) % (24*60); const newH = Math.floor(wrapped/60); const newM = wrapped % 60; return pad2(newH) + ':' + pad2(newM); }

function reportIntro(staffName){ if(!staffName) staffName='담당자'; let base = staffName.replace(/\s*(부장|차장|과장|대리|사원)\s*$/,'').trim(); const titleMap = {'송훈재':'송훈재 부장','임준호':'임준호 차장','조영환':'조영환 부장'}; const displayName = titleMap[base] || staffName; const lines = []; lines.push(`(${displayName} 퇴근보고)`); lines.push(''); return lines.join('\n'); }

const korLetters = ['가','나','다','라','마','바','사','아','자','차','카','타','파','하'];
const getKorLabel = (i) => (korLetters[i] ? korLetters[i] + '.' : (i+1) + '.');

function extractTimes(str){ if(!str) return []; const parts = String(str).split(/[,;|\\/]+/).map(s=>s.trim()).filter(Boolean); const times = []; parts.forEach(p => { if (p.indexOf('~')!==-1){ const [a,b] = p.split('~').map(x=>x.trim()); if (/^\d{1,2}:\d{2}$/.test(a)) times.push(pad2(parseInt(a.split(':')[0],10))+':'+pad2(parseInt(a.split(':')[1],10))); if (/^\d{1,2}:\d{2}$/.test(b)) times.push(pad2(parseInt(b.split(':')[0],10))+':'+pad2(parseInt(b.split(':')[1],10))); } else { const m = p.match(/\d{1,2}:\d{2}/g); if (m) m.forEach(x=> times.push(pad2(parseInt(x.split(':')[0],10))+':'+pad2(parseInt(x.split(':')[1],10)))); } }); return times.filter(Boolean); }

function buildAggregateSummary(visits, template){ const totalSchools = visits.length; let contactCount = 0; let additionalConfirmCount = 0; visits.forEach(v=>{ v.subjects.forEach(s=>{ if (s.contact) contactCount++; if (s.followUp && s.followUp.indexOf('추가선정')!==-1) additionalConfirmCount++; }) });
  // header + kakao
  const parts = [];
  parts.push(reportIntro(visits[0] && visits[0].staff ? visits[0].staff : ''));
  function fmtDateForHeader(raw) { if (!raw) return ''; try { const d = new Date(raw); if (!isNaN(d.getTime())) return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); } catch(e){} const m = String(raw).match(/(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; return String(raw).slice(0,10); }
  parts.push(`방문일: ${fmtDateForHeader(visits[0].visitDate || '')}`);
  parts.push(`총 방문 학교: ${totalSchools}개 · 연락처 확보: ${contactCount}건 · 추가선정 확인: ${additionalConfirmCount}건`);
  parts.push('');
  // 출근/퇴근
  const firstStart = (visits && visits.length && visits[0].visitStart) ? visits[0].visitStart : '';
  const lastEnd = (visits && visits.length && visits[visits.length-1].visitEnd) ? visits[visits.length-1].visitEnd : '';
  const computeEndCollect = (t) => { if (!t) return ''; return addMinutesToTime(t,30); };
  const lastEndTime = lastEnd || '';
  const computedEndCollect = computeEndCollect(lastEndTime);
  let finalEnd = lastEnd || '';
  if (lastEnd && computedEndCollect) finalEnd = computedEndCollect;
  let workDurationText = '';
  if (firstStart && finalEnd){ try{ const totalMin = calcMinutesInterval(firstStart, finalEnd); const hrs = Math.floor(totalMin/60); const mins = totalMin%60; workDurationText = ` (근무시간 ${hrs}h ${mins}m)`; }catch(e){} }
  parts.push(`1. 출근: ${firstStart || '-'} · 퇴근: ${finalEnd || '-'}${workDurationText}`);
  parts.push('');
  parts.push('2. 세부업무');
  parts.push('');
  // group by school preserving order
  const schoolOrder = []; const schoolGroups = {};
  visits.forEach(v=>{ const key = (v.school || '-').trim(); if (!Object.prototype.hasOwnProperty.call(schoolGroups,key)){ schoolGroups[key]=[]; schoolOrder.push(key);} schoolGroups[key].push(v); });
  schoolOrder.forEach((schoolName,sIdx)=>{
    const group = schoolGroups[schoolName] || [];
    const label = getKorLabel(sIdx).replace(/\.$/,'');
    // compute single range
    let earliest=null, latest=null, dur=null;
    try{
      const allStarts=[]; const allEnds=[];
      group.forEach(gv=>{ const sTokens = extractTimes(gv.visitStart); const eTokens = extractTimes(gv.visitEnd); if (sTokens && sTokens.length) allStarts.push(...sTokens); if (eTokens && eTokens.length) allEnds.push(...eTokens); });
      const sArr = allStarts.length ? allStarts.slice().sort() : (allEnds.length ? allEnds.slice().sort() : []);
      const eArr = allEnds.length ? allEnds.slice().sort() : (allStarts.length ? allStarts.slice().sort() : []);
      earliest = sArr.length ? sArr[0] : null; latest = eArr.length ? eArr[eArr.length-1] : null;
      if (earliest && latest){ try{ dur = calcMinutesInterval(earliest, latest);}catch(e){dur=null;} }
    }catch(e){}
    const timeStr = (earliest && latest) ? ` ${earliest}~${latest}` : '';
    parts.push(`${label}. ${schoolName || '-'}${timeStr}${dur? ` (${dur}분)`:''}`);
    parts.push('세부업무:');
    // enumerate subjects across the group, but need to number as 가1, 가2... using sIdx and sequence
    let subjIndex = 1;
    group.forEach(gv=>{
      gv.subjects.forEach(s=>{
        const subLabel = `${label}${subjIndex}`;
        const teacher = s.teacher ? `(${s.teacher})` : '';
        parts.push(`-${subLabel}. ${s.subject || '-'} ${teacher} ${s.conversation? '· '+s.conversation : ''}`.trim());
        subjIndex++;
      });
    });
    parts.push('');
  });
  // 퇴근자료정리
  if (lastEnd && computedEndCollect){ const dur = calcMinutesInterval(lastEnd, computedEndCollect); parts.push(`3. 퇴근보고 자료 정리 (${lastEnd}~${computedEndCollect}) (${dur}분)`);} else { parts.push('3. 퇴근보고 자료 정리'); }
  parts.push(''); parts.push('- 끝.');
  return parts.join('\n');
}

// Build sample dayVisits based on user's example
const dayVisits = [];
// 서울문화고등학교 with 16 '정보' subjects (we model as one visit with 16 subjects)
const seoulSubjects = [];
for (let i=1;i<=16;i++){ seoulSubjects.push({subject:'정보', teacher:'', publisher:'', meetings:[], conversation:'', followUp:'', contact:''}); }
dayVisits.push({ visitDate:'2025-10-25T00:00:00.000Z', staff:'송훈재', region:'서울', school:'서울문화고등학교', visitStart:'', visitEnd:'', subjects: seoulSubjects });

// 과천고등학교 with many repeated visit entries
// We'll add multiple visit objects to simulate repeated tokens
const gwSubjects = [{subject:'정보 (테스트)', teacher:'', publisher:'', meetings:[], conversation:'', followUp:'', contact:''}];
// create many entries with the same time 08:00~09:00 and one with 08:00~08:10
for (let i=0;i<16;i++){
  const start = (i===6)? '08:00' : '08:00'; // one will have short end later
  const end = (i===6)? '08:10' : '09:00';
  dayVisits.push({ visitDate:'2025-10-25T00:00:00.000Z', staff:'송훈재', region:'경기', school:'과천고등학교', visitStart:start, visitEnd:end, subjects: gwSubjects });
}

// generate and print
console.log(buildAggregateSummary(dayVisits,'kakao'));
