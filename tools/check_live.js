const fs = require('fs');
const https = require('https');
const { createHash } = require('crypto');

function sha256File(path){
  const data = fs.readFileSync(path);
  return createHash('sha256').update(data).digest('hex');
}

function fetch(url){
  return new Promise((resolve,reject)=>{
    https.get(url, res=>{
      if(res.statusCode!==200){ reject(new Error('status '+res.statusCode)); return; }
      let body='';
      res.setEncoding('utf8');
      res.on('data', c=> body+=c);
      res.on('end', ()=> resolve(body));
    }).on('error', reject);
  });
}

(async ()=>{
  try{
    const live = await fetch('https://cmass-sales.web.app/meeting.js');
    fs.writeFileSync('tools/live_meeting.js', live, 'utf8');
    const localHash = sha256File('public/meeting.js');
    const liveHash = sha256File('tools/live_meeting.js');
    console.log('local:', localHash);
    console.log('live :', liveHash);
    if(localHash === liveHash) console.log('MATCH: live served the same meeting.js');
    else console.log('DIFFER: live meeting.js differs (deploy pending)');
  }catch(e){ console.error('failed:', e.message); process.exit(1); }
})();
