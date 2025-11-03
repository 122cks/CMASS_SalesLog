// neis_grid.js
// Reusable functions to parse NEIS timetable rows and render a weekday×period×class grid.
(function(window){
  function getClassKey(r){
    const grade = r.GRADE || r.grade || '';
    const cls = r.CLASS_NM || r.CLASS || r.clrm_nm || r.CLRM_NM || r.CLASS_NM || '';
    if (grade && cls) return `${grade}-${cls}`;
    if (cls) return String(cls);
    if (grade) return `G${grade}`;
    return 'Unknown';
  }

  function parseYmdToDay(ystr){
    if (!ystr) return null;
    const s = String(ystr).replace(/[^0-9]/g,'');
    if (s.length < 8) return null;
    const y = parseInt(s.slice(0,4),10); const m = parseInt(s.slice(4,6),10); const d = parseInt(s.slice(6,8),10);
    const dt = new Date(y, m-1, d);
    if (isNaN(dt)) return null;
    return dt.getDay(); // 0 Sun .. 6 Sat
  }

  function buildGrid(rows){
    const clsSet = new Set();
    const periodSet = new Set();
    const grid = { 1:{},2:{},3:{},4:{},5:{} };

    rows.forEach(r=>{
      const key = getClassKey(r); clsSet.add(key);
      const p = parseInt(r.PERIO || r.PERIOD || r.PERIOD_NO || r.PERIO_NO || 0,10);
      if (!isNaN(p) && p>0) periodSet.add(p);
      const dow = parseYmdToDay(r.ALL_TI_YMD || r.ALL_TI_YMD || r.DATE || '');
      const weekdayNum = (dow>=1 && dow<=5) ? dow : null; // 1..5
      const per = (!isNaN(p) && p>0) ? p : null;
      const ck = key;
      const subj = (r.ITRT_CNTNT || r.SBJ_NM || r.SUBJECT || r.COURSE || '').trim();
      if (!weekdayNum || !per) return;
      grid[weekdayNum][per] = grid[weekdayNum][per] || {};
      const prev = grid[weekdayNum][per][ck];
      grid[weekdayNum][per][ck] = prev ? (prev + ' / ' + subj) : subj;
    });

    const classes = Array.from(clsSet);
    classes.sort((a,b)=>{
      const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
      const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
      for (let i=0;i<Math.max(pa.length,pb.length);i++){
        const xa = pa[i]||0, xb = pb[i]||0; if (xa!==xb) return xa-xb;
      }
      return a.localeCompare(b);
    });

    const periods = Array.from(periodSet).sort((x,y)=>x-y);

    return { grid, classes, periods };
  }

  function generateCsvRows(gridObj){
    const weekdayMap = {1:'월요일',2:'화요일',3:'수요일',4:'목요일',5:'금요일'};
    const rows = [];
    for (let wd=1; wd<=5; wd++){
      const day = gridObj.grid[wd]||{};
      for (const pStr of Object.keys(day)){
        const p = parseInt(pStr,10);
        const row = day[p];
        for (const cls of Object.keys(row||{})){
          rows.push({ weekday: weekdayMap[wd]||wd, period: p, class: cls, subject: row[cls] });
        }
      }
    }
    return rows;
  }

  function renderGridTo(container, rows, title, opts){
    opts = opts || {};
    const containerEl = (typeof container === 'string') ? document.getElementById(container) : container;
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const wrapper = document.createElement('div'); wrapper.style.marginTop='8px';
    const heading = document.createElement('h4'); heading.textContent = title; heading.style.margin='8px 0'; wrapper.appendChild(heading);

    if (!rows || !rows.length){
      const p = document.createElement('div'); p.textContent = '해당 학교의 시간표 데이터가 없습니다.'; p.style.color='#666'; wrapper.appendChild(p); containerEl.appendChild(wrapper); return;
    }

    const { grid, classes, periods } = buildGrid(rows);
    const weekdayMap = { 1:'월요일',2:'화요일',3:'수요일',4:'목요일',5:'금요일' };

    // compute visitDow if needed
    let visitDow = null;
    if (opts.showOnlyVisitWeekday && opts.visitDate){
      const vd = new Date(opts.visitDate);
      if (!isNaN(vd)) visitDow = vd.getDay();
    }
    const weekdaysToRender = visitDow && visitDow>=1 && visitDow<=5 ? [visitDow] : [1,2,3,4,5];

    // Legend
    const legend = document.createElement('div'); legend.style.display='flex'; legend.style.gap='10px'; legend.style.alignItems='center'; legend.style.margin='6px 0';
    const lh = document.createElement('div'); lh.innerHTML = '<span style="display:inline-block;width:14px;height:14px;background:#ffeaa7;border-radius:3px;margin-right:6px;border:1px solid #f1c40f;vertical-align:middle"></span>현재 교시';
    const lm = document.createElement('div'); lm.innerHTML = '<span style="display:inline-block;width:14px;height:14px;background:#f3f6ff;border-radius:3px;margin-right:6px;border:1px solid #d6dbe8;vertical-align:middle"></span>수업 셀';
    legend.appendChild(lh); legend.appendChild(lm); wrapper.appendChild(legend);

    // compute min-width based on class count
    const minWidth = Math.max(720, classes.length * 120);

    weekdaysToRender.forEach(wd=>{
      const dayTitle = weekdayMap[wd] || ('weekday'+wd);
      const subh = document.createElement('h4'); subh.textContent = dayTitle; subh.style.margin='8px 0'; wrapper.appendChild(subh);
      const scrollWrap = document.createElement('div'); scrollWrap.className='timetable-wrapper';
      scrollWrap.style.overflow='auto'; scrollWrap.style['-webkit-overflow-scrolling']='touch';
      // If we're rendering only the visit weekday, prefer a vertical layout: classes as rows, periods as columns
      const verticalLayout = (weekdaysToRender.length === 1) || !!opts.forceVerticalLayout;
      const table = document.createElement('table'); table.className = 'timetable'; table.style.borderCollapse='collapse'; table.style.marginBottom='12px';
      if (verticalLayout){
        // constrain height and allow vertical scroll for many classes
        scrollWrap.style.maxHeight = opts.maxHeight || '420px';
        scrollWrap.style.overflowY = 'auto';
        scrollWrap.style.overflowX = 'auto';
      } else {
        table.style.width='100%'; table.style.minWidth = minWidth + 'px';
      }
      const thead = document.createElement('thead'); const trh = document.createElement('tr');
      if (verticalLayout){
        const th0 = document.createElement('th'); th0.textContent='반 / 학급'; th0.style.border='1px solid #e6eefc'; th0.style.padding='6px'; th0.style.background='#f7fbff'; trh.appendChild(th0);
        periods.forEach(p=>{ const th=document.createElement('th'); th.textContent=p + '교시'; th.style.border='1px solid #e6eefc'; th.style.padding='6px'; th.style.background='#f7fbff'; trh.appendChild(th); });
      } else {
        const th0 = document.createElement('th'); th0.textContent='교시'; th0.style.border='1px solid #e6eefc'; th0.style.padding='6px'; th0.style.background='#f7fbff'; trh.appendChild(th0);
        classes.forEach(c=>{ const th=document.createElement('th'); th.textContent=c; th.style.border='1px solid #e6eefc'; th.style.padding='6px'; th.style.background='#f7fbff'; trh.appendChild(th); });
      }
      thead.appendChild(trh); table.appendChild(thead);
      const tbody = document.createElement('tbody');

      // compute current period highlight
      let currentPeriod = null;
      if (opts.visitTime){
        // opts.visitTime: 'HH:MM' or Date object
        let nowDate = null;
        if (typeof opts.visitTime === 'string'){
          const parts = opts.visitTime.split(':').map(Number);
          if (opts.visitDate){
            const vd = new Date(opts.visitDate);
            if (!isNaN(vd)){
              vd.setHours(parts[0]||0, parts[1]||0,0,0); nowDate = vd;
            }
          }
        } else if (opts.visitTime instanceof Date){ nowDate = opts.visitTime; }
        // Default period times (assumption) - can be overridden by passing opts.periodTimes as array of {period, start:'HH:MM', end:'HH:MM'}
        const defaultPeriodTimes = [
          {p:1, start:'09:00', end:'09:45'},
          {p:2, start:'09:55', end:'10:40'},
          {p:3, start:'10:50', end:'11:35'},
          {p:4, start:'11:45', end:'12:30'},
          {p:5, start:'13:30', end:'14:15'},
          {p:6, start:'14:25', end:'15:10'},
          {p:7, start:'15:20', end:'16:05'}
        ];
        const periodTimes = opts.periodTimes || defaultPeriodTimes;
        if (nowDate){
          const nowMinutes = nowDate.getHours()*60 + nowDate.getMinutes();
          for (const pt of periodTimes){
            const [sh,sm] = (pt.start||'00:00').split(':').map(Number); const [eh,em] = (pt.end||'00:00').split(':').map(Number);
            const sMin = sh*60+sm, eMin = eh*60+em;
            if (nowMinutes >= sMin && nowMinutes <= eMin){ currentPeriod = pt.p; break; }
          }
        }
      }

      if (verticalLayout){
        // Rows = classes, Columns = periods
        classes.forEach(c=>{
          const tr = document.createElement('tr');
          const tdClass = document.createElement('td'); tdClass.textContent = c; tdClass.style.border='1px solid #f2f6ff'; tdClass.style.padding='8px'; tdClass.style.fontWeight='700'; tr.appendChild(tdClass);
          periods.forEach(p=>{
            const td = document.createElement('td'); td.style.border='1px solid #f2f6ff'; td.style.padding='8px'; td.style.verticalAlign='top';
            const val = (grid[wd] && grid[wd][p] && grid[wd][p][c]) ? grid[wd][p][c] : '';
            td.textContent = val || '';
            if (currentPeriod && p === currentPeriod){ td.classList.add('current-period'); }
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
      } else {
        periods.forEach(p=>{
          const tr = document.createElement('tr');
          const tdP = document.createElement('td'); tdP.textContent = p + '교시'; tdP.style.border='1px solid #f2f6ff'; tdP.style.padding='8px'; tdP.style.fontWeight='800'; tr.appendChild(tdP);
          classes.forEach(c=>{
            const td = document.createElement('td'); td.style.border='1px solid #f2f6ff'; td.style.padding='8px'; td.style.verticalAlign='top'; td.style.minWidth='110px';
            const val = (grid[wd] && grid[wd][p] && grid[wd][p][c]) ? grid[wd][p][c] : '';
            td.textContent = val || '';
            if (currentPeriod && p === currentPeriod){ td.classList.add('current-period'); }
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
      }

      table.appendChild(tbody); scrollWrap.appendChild(table); wrapper.appendChild(scrollWrap);
    });

    // CSV
    try{
      const csvRows = generateCsvRows({grid, classes, periods});
      const csv = (window.Papa && window.Papa.unparse) ? Papa.unparse(csvRows) : csvRows.map(r=>Object.values(r).join(',')).join('\n');
      const dl = document.createElement('a'); dl.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      dl.download = title.replace(/\s+/g,'_') + '_grid.csv'; dl.textContent = 'CSV 다운로드'; dl.style.display='inline-block'; dl.style.marginTop='6px'; dl.style.color='#0b3a72'; wrapper.appendChild(dl);
    }catch(e){ }

    containerEl.appendChild(wrapper);
  }

  window.neisGrid = { getClassKey, parseYmdToDay, buildGrid, generateCsvRows, renderGridTo };
})(window);
