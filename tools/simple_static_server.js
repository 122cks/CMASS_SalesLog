const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.PORT || 8080;
const root = path.join(__dirname, '..', 'public');

const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json'
};

const server = http.createServer((req, res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(root, p.replace(/^\//,''));
  if (!file.startsWith(root)) { res.statusCode = 403; res.end('Forbidden'); return; }
  fs.stat(file, (err, st)=>{
    if (err || !st.isFile()) { res.statusCode = 404; res.end('Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, ()=>{ console.log('simple_static_server listening on', port, 'serving', root); });
