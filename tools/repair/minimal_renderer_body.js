// Minimal renderer body (no surrounding <script> tags)
function getStaffFromQuery(){ try{ const p = new URLSearchParams(window.location.search||''); return (p.get('staff')||p.get('user')||'').toString().trim(); }catch(e){ return ''; } }

async function loadPersonalVisits(){
  const staff = getStaffFromQuery();
  try{ const lbl = document.getElementById('staffLabel'); if (lbl) lbl.textContent = staff ? ('담당자: ' + staff) : ''; }catch(e){}
  if (!staff){ try{ document.getElementById('noAuth').style.display='block'; document.getElementById('loading').style.display='none'; }catch(e){} return; }

  try{ const loadingEl = document.getElementById('loading'); if (loadingEl) loadingEl.textContent = '데이터를 불러오는 중...'; }catch(e){}

  try{
    const qs = new URLSearchParams(); qs.set('useEntries','true'); qs.set('pageSize','500'); qs.set('user', staff);
    const res = await fetch('/api/visits?' + qs.toString()); let j = null;
    try{ j = await res.json(); }catch(e){ j = { ok:true, rows: [] }; }
    const rows = Array.isArray(j.rows) ? j.rows : [];
    const visits = rows.filter(r => ((r.staff||'').toString().trim()) === staff);

    document.getElementById('totalVisits').textContent = visits.length;
    const uniq = Array.from(new Set(visits.map(v => (v.school||'').toString().trim()).filter(Boolean)));
    document.getElementById('uniqueSchools').textContent = uniq.length;
    document.getElementById('recentDate').textContent = visits.length ? ((visits[0].visitDate||visits[0].createdAt||'').toString().substring(0,10)) : '-';

    const cont = document.getElementById('schoolVisitsTableContainer');
    if (!visits.length){ if (cont) cont.innerHTML = '<div class="small">데이터가 없습니다.</div>'; }
    else {
      let html = '<table class="notes-table"><thead><tr><th>방문일</th><th>학교</th><th>방문시간</th><th>선생님명</th><th>과목명</th><th>특이사항</th></tr></thead><tbody>';
      visits.slice(0,500).forEach(e => {
        html += '<tr>' +
          `<td>${(e.visitDate||'').toString().substring(0,10)}</td>` +
          `<td>${e.school||''}</td>` +
          `<td>${e.visitStart||''}~${e.visitEnd||''}</td>` +
          `<td>${e.teacher||''}</td>` +
          `<td>${e.subject||''}</td>` +
          `<td>${(e.conversation||e.note||'').toString().replace(/\n/g,' ')}</td>` +
          '</tr>';
      });
      html += '</tbody></table>';
      if (cont) cont.innerHTML = html;
    }

  }catch(e){ console.warn('loadPersonalVisits failed', e); try{ document.getElementById('loading').textContent = '불러오기 중 오류'; }catch(_){} }
  finally{ try{ document.getElementById('dashboardArea').style.display='block'; document.getElementById('loading').style.display='none'; }catch(e){} }
}

window.addEventListener('DOMContentLoaded', function(){ try{ if (typeof loadPersonalVisits === 'function') loadPersonalVisits(); }catch(e){} });
