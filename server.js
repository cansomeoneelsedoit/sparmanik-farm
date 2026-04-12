const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BUILD_DIR = path.join(__dirname, 'build');

const mimeTypes = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject', '.map': 'application/json'
};

const server = http.createServer((req, res) => {
  if (!fs.existsSync(BUILD_DIR)) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h1>Build directory not found</h1>');
    return;
  }
  let filePath = path.join(BUILD_DIR, req.url === '/' ? 'index.html' : req.url);
  if (!filePath.startsWith(BUILD_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(BUILD_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
    });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Sparmanik Farm server running on port ' + PORT);
});
