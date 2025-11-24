
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const PUBLIC = path.resolve(__dirname, '..', 'public');
const HOST = '127.0.0.1';
const PORT = process.env.PROXY_PORT || 8080;

function sendFile(res, filePath){
  fs.readFile(filePath, (err, data)=>{
    if (err){ res.statusCode = 404; res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const map = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
    res.setHeader('Content-Type', map[ext] || 'application/octet-stream');
    res.end(data);
  });
}

const server = http.createServer((req, res)=>{
  try{
    const url = req.url || '/';
    if (url.startsWith('/api/')){
      // proxy to live host
      const target = 'https://cmass-sales.web.app' + url;
      const opts = new URL(target);
      const proxyReq = https.request(opts, proxyRes =>{
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', e=>{ res.statusCode=502; res.end('proxy error'); });
      if (req.method === 'POST' || req.method === 'PUT'){
        req.pipe(proxyReq);
      } else { proxyReq.end(); }
      return;
    }
    // serve static
    let p = url.split('?')[0];
    if (p === '/' || p === '') p = '/front.html';
    const filePath = path.join(PUBLIC, decodeURIComponent(p));
    // security: ensure path is within PUBLIC
    if (!filePath.startsWith(PUBLIC)) { res.statusCode=403; res.end('forbidden'); return; }
    fs.stat(filePath, (err, st)=>{
      if (err){ res.statusCode=404; res.end('Not found'); return; }
      if (st.isDirectory()){
        sendFile(res, path.join(filePath, 'index.html'));
      } else {
        sendFile(res, filePath);
      }
    });
  }catch(e){ res.statusCode=500; res.end('server error'); }
});

server.listen(PORT, HOST, ()=>{
  console.log('Local proxy server listening at http://' + HOST + ':' + PORT + '/ (serving ' + PUBLIC + ')');
});

process.on('SIGINT', ()=>{ server.close(()=> process.exit(0)); });
