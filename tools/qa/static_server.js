const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..', 'public');
// Allow explicit CLI arg to override environment (useful when system PORT is set)
const port = Number(process.argv[2] || process.env.PORT || 8080);
const mime = {
  '.html': 'text/html', '.htm': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain'
};
const server = http.createServer((req, res) => {
  try{
    const url = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(root, url === '/' ? '/meeting.html' : url);
    // protect path traversal
    if (!filePath.startsWith(root)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.stat(filePath, (err, stats) => {
      if(err){ res.writeHead(404); res.end('Not Found'); return; }
      if(stats.isDirectory()) filePath = path.join(filePath, 'index.html');
      const ext = path.extname(filePath).toLowerCase();
      const ct = mime[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('error', ()=>{ res.writeHead(500); res.end('Server Error'); });
    });
  }catch(e){ res.writeHead(500); res.end('Server Error'); }
});
server.listen(port, ()=> console.log('static server serving', root, 'on port', port));

process.on('SIGINT', ()=>{ server.close(()=> process.exit(0)); });
process.on('SIGTERM', ()=>{ server.close(()=> process.exit(0)); });
