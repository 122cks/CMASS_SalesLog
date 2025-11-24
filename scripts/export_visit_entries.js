#!/usr/bin/env node
// Export Firestore visit_entries documents to CSV or HTML table
// Usage:
//   node scripts/export_visit_entries.js --serviceAccount ./serviceAccount.json --out out.html --format html --staff songhoonjae --visitDate 2025-11-07

const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));

async function main(){
  const saPath = argv.serviceAccount || argv.sa;
  if (!saPath){
    console.error('서비스 계정 키(--serviceAccount)를 지정하세요.');
    process.exit(2);
  }
  const out = argv.out || argv.o || null;
  const format = (argv.format || 'html').toLowerCase();
  const staff = argv.staff || null;
  const visitDate = argv.visitDate || argv.date || null;
  const school = argv.school || null;
  const visitStart = argv.visitStart || argv.start || null; // format HH:MM
  const phone = argv.phone || null;

  if (!fs.existsSync(saPath)){
    console.error('서비스 계정 파일을 찾을 수 없습니다:', saPath);
    process.exit(3);
  }

  const admin = require('firebase-admin');
  const sa = require(path.resolve(saPath));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  try{
  let q = db.collection('visit_entries');
  if (staff) q = q.where('staff','==', String(staff));
  if (visitDate) q = q.where('visitDate','==', String(visitDate));
  if (school) q = q.where('school','==', String(school));
  if (visitStart) q = q.where('visitStart','==', String(visitStart));
  if (phone) q = q.where('phone','==', String(phone));
    q = q.orderBy('visitDate','asc').limit(10000);

    const snap = await q.get();
    if (snap.empty){
      console.log('조회결과가 없습니다. (조건: staff=' + staff + ', visitDate=' + visitDate + ')');
      process.exit(0);
    }

    const rows = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      // normalize fields
      rows.push({
        server_id: d.server_id || d._id || doc.id || '',
        staff: d.staff || '',
        staffLabel: d.staffLabel || '',
        region: d.region || '',
        school: d.school || '',
        meta: d.meta || d.schoolMeta || '',
        visitDate: d.visitDate || '',
        visitStart: d.visitStart || '',
        duration: d.duration || '',
        subjects: Array.isArray(d.subjects) ? d.subjects.join(' | ') : (d.subjects || ''),
        teacher: d.teacher || d.teacherName || '',
        publisher: d.publisher || '',
        phone: d.Phonenumber || d.phone || '',
        email: d.email || '',
        requests: d.ask || d.requests || '',
        notes: d.conversation || d.notes || '',
        deliveries: d.delivery || d.deliveries || '',
        followUp: d.followUp || '',
        _savedAt: d._savedAt || ''
      });
    });

    if (format === 'csv'){
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(',')];
      for (const r of rows){
        const line = headers.map(h => '"' + String((r[h]===undefined||r[h]===null)?'':r[h]).replace(/"/g,'""') + '"').join(',');
        lines.push(line);
      }
      const output = lines.join('\n');
      if (out){ fs.writeFileSync(out, output, 'utf8'); console.log('CSV로 저장되었습니다:', out); } else { console.log(output); }
    } else {
      // html
      const headers = Object.keys(rows[0]);
      const html = [];
      html.push('<!doctype html>');
      html.push('<html><head><meta charset="utf-8"><title>visit_entries export</title>');
      html.push('<style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f2f6fb}</style>');
      html.push('</head><body>');
      html.push('<h2>visit_entries export</h2>');
      html.push('<table>');
      html.push('<thead><tr>' + headers.map(h=>'<th>'+escapeHtml(h)+'</th>').join('') + '</tr></thead>');
      html.push('<tbody>');
      for (const r of rows){
        html.push('<tr>' + headers.map(h=>'<td>'+escapeHtml(String((r[h]===undefined||r[h]===null)?'':r[h]))+'</td>').join('') + '</tr>');
      }
      html.push('</tbody></table>');
      html.push('<p>총 문서: ' + rows.length + '</p>');
      html.push('</body></html>');
      const outHtml = html.join('\n');
      if (out){ fs.writeFileSync(out, outHtml, 'utf8'); console.log('HTML로 저장되었습니다:', out); } else { console.log(outHtml); }
    }

    process.exit(0);
  }catch(err){
    console.error('실행 중 오류:', err && err.message || err);
    process.exit(4);
  }
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }

main();
