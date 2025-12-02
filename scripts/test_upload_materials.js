// test_upload_materials.js
// Usage: node scripts/test_upload_materials.js [projectId]

const admin = require('firebase-admin');

async function main(){
  try{
    if (!admin.apps.length){
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
    const db = admin.firestore();

    const sample = {
      staff: 'ChoYounghwan',
      staffLabel: '조영환 부장',
      region: '경기도고양시덕양구',
      school: '서정중학교',
      visitDate: '2025-11-22',
      visitStart: '09:50',
      duration: 100,
      visitEnd: '11:30',
      subject: ['도서관사서'],
      teacherName: '테스트',
      publisher: '씨마스',
      activities: ['명함인사','달력증정'],
      materials: [
        '구글스프레드시트안내','고1학업설계안내','AI직업세계안내','정보단행본브로셔','진로도서안내브로셔','고교학점제워크북','창업가정신워크북','교과서도서목록안내','교과서샘플활동북','교과서샘플워크북','연수안내브로셔','AIDT브로셔','AIDT활용가이드북','포스터전달','평가문제집','수업자료프린트물'
      ],
      request: '테스트1',
      conversation: '테스트2',
      issue: '테스트3',
      delivery: '테스트4',
      gift: '테스트5',
      followup: '고객요청사항 해소예정',
      _savedAt: new Date().toISOString()
    };

    console.log('Adding test document to visit_entries...');
    const ref = await db.collection('visit_entries').add(sample);
    console.log('Added doc id=', ref.id);
    const doc = await db.collection('visit_entries').doc(ref.id).get();
    console.log('Read back document data:');
    console.log(JSON.stringify(doc.data(), null, 2));

    // Cleanup: optionally delete the test doc? We'll leave it by default; user can delete manually.
    process.exit(0);
  }catch(err){
    console.error('Error in test_upload_materials', err);
    process.exit(2);
  }
}

main();
