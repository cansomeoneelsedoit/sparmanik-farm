const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BUILD_DIR = path.join(__dirname, 'build');

// Debug: log directory info at startup
console.log('__dirname:', __dirname);
console.log('BUILD_DIR:', BUILD_DIR);
console.log('build/ exists:', fs.existsSync(BUILD_DIR));
console.log('cwd:', process.cwd());
try {
  const cwdFiles = fs.readdirSync(process.cwd());
  console.log('cwd files:', cwdFiles.join(', '));
} catch (e) {
  console.log('Cannot list cwd:', e.message);
}
try {
  const dirFiles = fs.readdirSync(__dirname);
  console.log('__dirname files:', dirFiles.join(', '));
} catch (e) {
  console.log('Cannot list __dirname:', e.message);
}
if (fs.existsSync(BUILD_DIR)) {
  const buildFiles = fs.readdirSync(BUILD_DIR);
  console.log('build/ files:', buildFiles.join(', '));
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json'
};

const server = http.createServer((req, res) => {
  console.log('Request:', req.method, req.url);
  
  // If build dir doesn't exist, return a helpful message
  if (!fs.existsSync(BUILD_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Build directory not found</h1><p>Looking for: ' + BUILD_DIR + '</p><p>CWD: ' + process.cwd() + '</p>');
    return;
  }

  let filePath = path.join(BUILD_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Security: prevent path traversal
  if (!filePath.startsWith(BUILD_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // If file doesn't exist, serve index.html (SPA fallback)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(BUILD_DIR, 'index.html');
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    console.error('File read error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error: ' + err.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
});
