// Son Sefer kaydedicisi — yerel sunucu. Bağımlılık yok; Node 18+ yeterli.
//   REACTOR_API_KEY=rk_... node server.mjs      (ya da anahtarı .env dosyasına yazın)
// Anahtar yalnızca bu süreçte kalır: tarayıcıya kısa ömürlü, tek modele kısıtlı bir JWT gider.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const PUBLIC = path.join(ROOT, 'public');
const FRAMES = path.join(ROOT, 'frames');
const CLIPS = path.join(ROOT, 'clips');
const SHOTLIST = path.resolve(ROOT, '..', 'cekim-listesi.json');
fs.mkdirSync(CLIPS, { recursive: true });

function apiKey() {
  if (process.env.REACTOR_API_KEY?.trim()) return process.env.REACTOR_API_KEY.trim();
  const env = path.join(ROOT, '.env');
  if (fs.existsSync(env)) {
    const m = fs.readFileSync(env, 'utf8').match(/^\s*REACTOR_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  }
  return null;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const SAFE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,80}$/;

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'bulunamadı' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('çok büyük')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function mintToken() {
  const key = apiKey();
  if (!key) return [500, { error: 'REACTOR_API_KEY bulunamadı. Ortam değişkeni olarak verin ya da kaydedici/.env dosyasına yazın.' }];
  const r = await fetch('https://api.reactor.inc/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Reactor-API-Key': key },
    body: JSON.stringify({
      expires_after: 6 * 3600,
      authorization_details: [{
        type: 'session',
        resources: { models: { match: ['reactor/fast-h3'] } },
        constraints: { max_sessions: 4, max_session_duration_seconds: 3 * 3600 },
      }],
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || typeof body.jwt !== 'string') {
    const msg = body?.message || body?.error?.message || body?.error || `Reactor ${r.status} döndü`;
    return [r.status >= 400 ? r.status : 502, { error: String(msg) }];
  }
  return [200, { jwt: body.jwt, expiresAt: body.expires_at ?? null }];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  try {
    if (req.method === 'POST' && p === '/api/token') {
      const [code, body] = await mintToken(); return send(res, code, body);
    }
    if (req.method === 'GET' && p === '/api/status') {
      const frames = fs.existsSync(FRAMES) ? fs.readdirSync(FRAMES).filter(f => SAFE.test(f)) : [];
      const clips = fs.readdirSync(CLIPS).filter(f => /\.(mp4|webm)$/.test(f));
      return send(res, 200, { hasKey: !!apiKey(), frames, clips });
    }
    if (req.method === 'POST' && p === '/api/save') {
      const name = url.searchParams.get('name') || '';
      if (!SAFE.test(name) || !/\.(mp4|webm|json)$/.test(name)) return send(res, 400, { error: 'geçersiz dosya adı' });
      const buf = await readBody(req, 2 * 1024 ** 3);
      if (!buf.length) return send(res, 400, { error: 'boş dosya' });
      fs.writeFileSync(path.join(CLIPS, name), buf);
      return send(res, 200, { saved: name, bytes: buf.length });
    }
    if (req.method === 'GET' && p === '/cekim-listesi.json') return serveFile(res, SHOTLIST);
    if (req.method === 'GET' && p.startsWith('/frames/')) {
      const n = p.slice(8); return SAFE.test(n) ? serveFile(res, path.join(FRAMES, n)) : send(res, 400, { error: 'geçersiz' });
    }
    if (req.method === 'GET' && p.startsWith('/clips/')) {
      const n = p.slice(7); return SAFE.test(n) ? serveFile(res, path.join(CLIPS, n)) : send(res, 400, { error: 'geçersiz' });
    }
    if (req.method === 'GET') {
      const rel = p === '/' ? 'index.html' : p.slice(1);
      const file = path.join(PUBLIC, path.normalize(rel));
      if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'yasak' });
      return serveFile(res, file);
    }
    send(res, 405, { error: 'yöntem desteklenmiyor' });
  } catch (e) {
    send(res, 500, { error: e?.message || String(e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Son Sefer kaydedicisi → http://localhost:${PORT}`);
  console.log(apiKey() ? 'REACTOR_API_KEY bulundu.' : 'UYARI: REACTOR_API_KEY yok — yalnızca deneme modu çalışır.');
});
