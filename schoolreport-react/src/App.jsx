import React, { useMemo, useState, useEffect } from 'react'

const SCHOOL_INFO = {
  name: "명지고등학교",
  type: "사립",
  level: "고등",
  feature: "일반고등학교",
  totalStudents: 1296,
  gradeStats: [
    { grade: "1학년", classes: 13, students: 371 },
    { grade: "2학년", classes: 15, students: 449 },
    { grade: "3학년", classes: 15, students: 460 }
  ]
}

const TEXTBOOK_ORDERS = [
  { year: 2025, group: "사회(역사/도덕)", subject: "사회문제 탐구", count: 221 },
  { year: 2026, group: "사회(역사/도덕)", subject: "사회문제 탐구", count: 233 },
  { year: 2026, group: "수학", subject: "인공지능 수학", count: 76 }
]

const RAW_DATA = [
  { id: "2PkWJkpcmUciKscEigY5", date: "2025-11-27", school: "명지중학교", region: "서울특별시 서대문구", teacher: "오지영", subject: "진로", staff: "조영환 부장", reaction: "보통", activity: "명함인사, 물티슈증정, 티칭샘소개, 카톡방소개", materials: "구글스프레드시트안내, 고1학업설계안내, AI직업세계안내, 진로도서안내브로셔, 포스터전달", content: "워크북 소개시 따로 사용 계획없고 고1학업설계는 구입 고려해 보기로 함. 채팅방 안내시 너무 많아 정신 없다고 사양함.", followUp: "완료(추가조치 없음)" },
  { id: "9qE52nbIkH7BBxaJ19DX", date: "2025-11-27", school: "명지중학교", region: "서울특별시 서대문구", teacher: "송진영", subject: "학년부장 (영어)", staff: "조영환 부장", reaction: "보통", activity: "명함인사", materials: "구글스프레드시트안내, 고1학업설계안내, AI직업세계안내", content: "진로, 구글스프레드시트 소개, 이런자료는 고등학교에 맞지 않냐고 하셔서 학교마다 차이가 있는데 중학교에서 많이 이용한다하니 참고 하겠다 함", followUp: "완료(추가조치 없음)" },
  { id: "J7yUPfhLh4P9sdJWOYQP", date: "2025-11-27", school: "명지중학교", region: "서울특별시 서대문구", teacher: "미상", subject: "정보", staff: "조영환 부장", reaction: "나쁨", activity: "명함인사, 물티슈증정, 티칭샘소개, 카톡방소개", materials: "구글스프레드시트안내, 정보단행본브로셔, 교과서도서목록안내, AIDT브로셔, AIDT활용가이드북, 포스터전달", content: "자료 및 단행본 안내시 특별한 관심은 없고 채팅방 안내시에도 여러군데 가입되어 있다고 이름, 연락처 거절함. AIDT 계획 무. 교구재 구입계획 따로 없음.", followUp: "완료(추가조치 없음)" },
  { id: "mwk8vR0dMD6772HDPD7b", date: "2025-11-27", school: "명지중학교", region: "서울특별시 서대문구", teacher: "조지선", subject: "도서관사서", staff: "조영환 부장", reaction: "보통", activity: "명함인사", materials: "구글스프레드시트안내, 고1학업설계안내, AI직업세계안내", content: "보통 년중 2회 또는 필요에 따라 추가 구입하는데 올해는 마무리 되어 내년 4월 신청하면 5월에 가능하다고 구입의사 있음.", followUp: "추후확인" }
]

function ReactionBadge({ reaction }){
  if(!reaction) return null
  if(reaction === '좋음') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">좋음</span>
  if(reaction === '보통') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">보통</span>
  if(reaction === '나쁨') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">나쁨</span>
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{reaction}</span>
}

export default function App(){
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [staff, setStaff] = useState('')
  const visitDate = RAW_DATA[0]?.date || ''

  useEffect(()=>{
    const today = new Date();
    setEndDate(today.toISOString().slice(0,10))
    const start = new Date(today.getTime() - (30*24*60*60*1000));
    setStartDate(start.toISOString().slice(0,10))
  }, [])

  const staffs = useMemo(()=>{
    const s = new Set(); RAW_DATA.forEach(r=>{ if(r.staff) s.add(r.staff) }); return Array.from(s)
  }, [])

  const filtered = useMemo(()=>{
    const q = String(search||'').trim().toLowerCase()
    return RAW_DATA.filter(item=>{
      if(startDate){ const d = new Date(item.date); const s = new Date(startDate+'T00:00:00'); if(d < s) return false }
      if(endDate){ const d = new Date(item.date); const e = new Date(endDate+'T23:59:59'); if(d > e) return false }
      if(staff){ if(String(item.staff||'') !== String(staff)) return false }
      if(!q) return true
      return (String(item.teacher||'')+' '+String(item.subject||'')+' '+String(item.content||'')+' '+String(item.materials||'')).toLowerCase().includes(q)
    }).sort((a,b)=> new Date(a.date) - new Date(b.date))
  }, [search, startDate, endDate, staff])

  // group by date -> school
  const grouped = useMemo(()=>{
    const map = new Map()
    filtered.forEach(r=>{
      const dk = r.date||'미상'
      if(!map.has(dk)) map.set(dk, new Map())
      const smap = map.get(dk)
      const sk = r.school || '미상'
      if(!smap.has(sk)) smap.set(sk, [])
      smap.get(sk).push(r)
    })
    return map
  }, [filtered])

  const downloadCSV = () =>{
    const headers = ["방문일","지역","학교","선생님","과목","담당자","반응","영업활동","전달자료","대화내용","후속조치"]
    const rows = filtered.map(it=>[it.date,it.region,it.school,it.teacher,it.subject,it.staff,it.reaction,it.activity,it.materials,it.content,it.followUp])
    let csv = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(',') + '\r\n'
    rows.forEach(row=>{ csv += row.map(f=>`"${String(f||'').replace(/"/g,'""')}"`).join(',') + '\r\n' })
    const link = document.createElement('a'); link.href = encodeURI(csv); link.download = `영업활동현황_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto mb-6">
        <h1 className="text-2xl font-bold text-slate-800">학교별 영업 활동 통합 리포트</h1>
        <p className="text-slate-500 mt-1">학교 기본 정보 및 교과서 주문 현황 포함</p>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">학교 기본 정보</h2>
            <div className="space-y-3">
              <div className="muted">학교명</div>
              <div className="font-bold text-slate-800 text-lg">{SCHOOL_INFO.name}</div>
              <div className="muted">설립구분 / 학교급</div>
              <div>{SCHOOL_INFO.type} ({SCHOOL_INFO.feature}) · {SCHOOL_INFO.level}</div>
              <div className="muted mt-2">총 학생수</div>
              <div className="font-bold text-blue-600">{SCHOOL_INFO.totalStudents.toLocaleString()}명</div>
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-600 mb-3">학년별 현황</h3>
              <div className="space-y-2">
                {SCHOOL_INFO.gradeStats.map((g,i)=>(
                  <div key={i} className="bg-slate-50 p-2 rounded-lg flex justify-between items-center text-sm">
                    <span className="font-medium text-slate-700">{g.grade}</span>
                    <div className="flex gap-3 text-slate-600"><span>{g.classes}학급</span><span className="text-slate-300">|</span><span>{g.students}명</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">교과서 주문 현황</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">연도</th>
                    <th className="px-4 py-3">교과군</th>
                    <th className="px-4 py-3">과목명</th>
                    <th className="px-4 py-3 text-right">부수</th>
                  </tr>
                </thead>
                <tbody>
                  {TEXTBOOK_ORDERS.map((o,idx)=>(
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="px-4 py-3 font-medium">{o.year}</td>
                      <td className="px-4 py-3 text-slate-600">{o.group}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{o.subject}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">{o.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-800">영업 활동 일지 <span className="text-sm text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded">{visitDate}</span></h2>
          </div>
          <div className="flex items-center gap-2">
            <input className="px-3 py-2 border rounded w-64" placeholder="선생님, 내용 검색..." value={search} onChange={e=>setSearch(e.target.value)} />
            <input type="date" className="px-3 py-2 border rounded" value={startDate} onChange={e=>setStartDate(e.target.value)} />
            <input type="date" className="px-3 py-2 border rounded" value={endDate} onChange={e=>setEndDate(e.target.value)} />
            <select className="px-3 py-2 border rounded" value={staff} onChange={e=>setStaff(e.target.value)}>
              <option value="">전체</option>
              {staffs.map((s,idx)=>(<option key={idx} value={s}>{s}</option>))}
            </select>
            <button className="px-4 py-2 bg-slate-700 text-white rounded" onClick={downloadCSV}>활동내역 다운로드</button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4">
            <div className="space-y-4">
              {Array.from(grouped.keys()).sort((a,b)=> new Date(b) - new Date(a)).map((dateKey)=> (
                <div key={dateKey}>
                  <div className="flex justify-between items-center bg-white p-3 rounded border border-slate-100">
                    <div className="font-bold">{dateKey}</div>
                    <div className="text-slate-500">{grouped.get(dateKey).size}개 학교</div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {Array.from(grouped.get(dateKey).keys()).sort().map((schoolName)=>{
                      const rows = grouped.get(dateKey).get(schoolName) || []
                      return (
                        <DateSchoolRow key={schoolName+dateKey} schoolName={schoolName} rows={rows} />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function DateSchoolRow({ schoolName, rows }){
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded">
        <div>
          <div className="font-bold">{schoolName}</div>
          <div className="text-slate-500 text-sm">{rows[0]?.region || ''}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-1 bg-slate-50 rounded text-sm">{rows.length}건</div>
          <button className="px-3 py-1 bg-slate-800 text-white rounded text-sm" onClick={()=>setOpen(v=>!v)}>{open? '접기' : '펼치기'}</button>
        </div>
      </div>
      {open && (
        <div className="mt-3 bg-white p-3 border border-slate-100 rounded">
          {rows.map(r=> (
            <div key={r.id} className="flex gap-4 py-3 border-t first:border-t-0">
              <div style={{minWidth:220}}>
                <div className="font-bold">{r.teacher || '미상'}</div>
                <div className="text-slate-500 text-sm">{r.school}</div>
                <div className="text-slate-400 text-xs mt-1">{r.date}</div>
              </div>
              <div className="flex-1">
                <div className="text-slate-700">{r.content}</div>
                <div className="text-slate-500 text-sm mt-2">활동: {r.activity}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(Array.isArray(r.materials) ? r.materials : String(r.materials||'').split(',')).map((m,idx)=> (
                    <span key={idx} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">{m.trim()}</span>
                  ))}
                </div>
              </div>
              <div style={{minWidth:160,textAlign:'right'}}>
                <div className="mb-2"><ReactionBadge reaction={r.reaction} /></div>
                <div className="text-slate-500 text-sm">{r.followUp}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
