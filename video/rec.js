/* Sayfayı Chrome DevTools protokolüyle kare kare çekip ffmpeg'e akıtır.
   node rec.js --page <html> --out <mp4> [--fps 30] [--w 1280] [--h 720] [--limit N]
   Ortam: FFMPEG (zorunlu, H.264 destekli), CHROME (isteğe bağlı). */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = +arg('fps', 30), W = +arg('w', 1280), H = +arg('h', 720);
const LIMIT = +arg('limit', 0), PORT = +arg('port', 9333);
const PAGE = path.resolve(arg('page', 'render.html')), OUT = path.resolve(arg('out', 'out.mp4'));
const FFMPEG = process.env.FFMPEG;
const CHROME = process.env.CHROME || (() => {
  const base = '/opt/pw-browsers';
  const d = fs.existsSync(base) && fs.readdirSync(base).filter(n => /^chromium-\d+$/.test(n)).sort().pop();
  if (!d) throw new Error('Chromium bulunamadı; CHROME ortam değişkenini ayarlayın');
  return path.join(base, d, 'chrome-linux', 'chrome');
})();
if (!FFMPEG) throw new Error('FFMPEG ortam değişkeni gerekli');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı: ' + what)), ms))]);

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--disable-dev-shm-usage', '--force-device-scale-factor=1',
    '--font-render-hinting=none', '--disable-lcd-text',
    `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank'
  ], { stdio: 'ignore' });
  const cleanup = () => { try { chrome.kill(); } catch {} };
  process.on('exit', cleanup);

  let ver = null;
  for (let i = 0; i < 80 && !ver; i++){
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
    catch { await sleep(250); }
  }
  if (!ver) throw new Error('Chrome DevTools açılmadı');

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiting = new Map(), events = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)){ const w = waiting.get(m.id); waiting.delete(m.id);
      m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
    else if (m.method && events.has(m.method)){ events.get(m.method)(); events.delete(m.method); }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const n = ++id; waiting.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
  const once = m => new Promise(r => events.set(m, r));

  const { targetId } = await send('Target.createTarget', { url: 'about:blank', width: W, height: H });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const loaded = once('Page.loadEventFired');
  await S('Page.navigate', { url: 'file://' + PAGE });
  await withTimeout(loaded, 30000, 'sayfa yükleme');
  await sleep(2500);

  const dur = (await S('Runtime.evaluate', { expression: 'window.__dur', returnByValue: true })).result.value;
  if (typeof dur !== 'number') throw new Error('sayfada __dur yok — çekim kopyası mı?');
  const total = LIMIT || Math.round(dur * FPS);
  console.log(`süre ${dur}s · ${FPS} fps · ${total} kare · ${W}×${H}`);

  const ff = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'ignore', 'inherit'] });
  const write = buf => new Promise(r => ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r));

  const t0 = Date.now();
  for (let f = 0; f < total; f++){
    await S('Runtime.evaluate', { expression: `__frame(${f / FPS})`, returnByValue: true });
    const shot = await S('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
    await write(Buffer.from(shot.data, 'base64'));
    if (f % 300 === 0 || f === total - 1){
      const el = (Date.now() - t0) / 1000;
      console.log(`kare ${f + 1}/${total} · geçen ${el.toFixed(0)}s · kalan ~${(el / (f + 1) * (total - f - 1)).toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  ws.close(); cleanup();
  console.log('BİTTİ ' + OUT);
  process.exit(0);
})().catch(e => { console.error('HATA', e.message || e); process.exit(1); });
