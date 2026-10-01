// Kurguya girecek görselleri çizer: telefon mesajları, "SON" kartı, jenerik.
//   node kartlar.mjs            (Chrome/Chromium gerekir; yolu CHROME ile verebilirsiniz)
// Çıktı: kartlar/*.png, 1344×768. Mesajlar şeffaf zeminli, kartlar siyah zeminli.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1344, H = 768;
const MESSAGE = 'Bu akşam kahve? Bu kez ben ısmarlayayım.';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const pw = '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    const d = fs.readdirSync(pw).filter(n => /^chromium-\d+$/.test(n)).sort().pop();
    if (d) return path.join(pw, d, 'chrome-linux', 'chrome');
  }
  const c = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const hit = c.find(p => fs.existsSync(p));
  if (!hit) throw new Error('Chrome bulunamadı. CHROME=/yol/chrome node kartlar.mjs');
  return hit;
}

const fonts = fs.readFileSync(path.join(HERE, 'fonts.css'), 'utf8');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const base = (bg, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
  *{box-sizing:border-box;margin:0}
  html,body{width:${W}px;height:${H}px;background:${bg};overflow:hidden}
  body{font-family:"IBM Plex Sans",sans-serif;color:#efe8db;-webkit-font-smoothing:antialiased}
</style></head><body>${body}</body></html>`;

// 8-01: Deniz'in gönderdiği mesaj — giden balon, sağ altta.
const outgoing = base('transparent', `
  <div style="position:absolute;right:96px;bottom:118px;display:flex;flex-direction:column;align-items:flex-end;gap:8px">
    <div style="max-width:520px;padding:18px 24px;border-radius:26px 26px 8px 26px;background:rgba(58,108,186,.93);
      font-size:30px;line-height:1.3;font-weight:500;color:#fff;box-shadow:0 10px 40px rgba(0,0,0,.35)">${esc(MESSAGE)}</div>
    <div style="font:500 17px 'IBM Plex Mono',monospace;color:rgba(255,255,255,.75);text-shadow:0 1px 6px rgba(0,0,0,.6)">Gönderildi</div>
  </div>`);

// 8-02: Ece'nin telefonuna düşen bildirim — üst ortada kart.
const incoming = base('transparent', `
  <div style="position:absolute;left:50%;top:72px;transform:translateX(-50%);width:600px;padding:20px 24px;border-radius:24px;
    background:rgba(28,30,36,.9);box-shadow:0 12px 44px rgba(0,0,0,.45);display:grid;grid-template-columns:auto 1fr auto;gap:4px 16px;align-items:center">
    <div style="grid-row:span 2;width:52px;height:52px;border-radius:50%;background:#5f7f6b;display:grid;place-items:center;
      font:600 24px 'IBM Plex Sans',sans-serif;color:#fff">D</div>
    <div style="font-weight:600;font-size:23px">Deniz</div>
    <div style="font:400 17px 'IBM Plex Mono',monospace;color:#9a958c">şimdi</div>
    <div style="grid-column:2 / span 2;font-size:25px;line-height:1.35;color:#ddd6c9">${esc(MESSAGE)}</div>
  </div>`);

const end = base('#000', `<div style="height:100%;display:grid;place-items:center;
  font:600 112px 'Barlow Condensed',sans-serif;letter-spacing:.32em;padding-left:.32em;color:#e8e1d4">SON</div>`);

const lines = fs.readFileSync(path.join(HERE, 'jenerik.txt'), 'utf8').split(/\r?\n/).filter(l => !l.startsWith('#'));
while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
const [title, ...rest] = lines;
const credits = base('#000', `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:6px">
  <div style="font:600 64px 'Barlow Condensed',sans-serif;letter-spacing:.14em;color:#e8e1d4;margin-bottom:34px">${esc(title || '')}</div>
  ${rest.map(l => l.trim()
    ? `<div style="font-size:26px;line-height:1.4;color:#cfc8bb">${esc(l)}</div>`
    : '<div style="height:22px"></div>').join('')}</div>`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9620;
const chrome = spawn(findChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
try {
  let ver; for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(250); } }
  if (!ver) throw new Error('Chrome açılmadı');
  const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => (ws.onopen = r));
  let id = 0; const wait = new Map(), ev = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
    else if (m.method && ev.has(m.method)) { ev.get(m.method)(); ev.delete(m.method); } };
  const send = (method, params = {}, sessionId) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await S('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  fs.mkdirSync(path.join(HERE, 'kartlar'), { recursive: true });
  for (const [name, html] of [['mesaj-giden', outgoing], ['mesaj-gelen', incoming], ['son', end], ['jenerik', credits]]) {
    const tmp = path.join(HERE, 'kartlar', `.${name}.html`);
    fs.writeFileSync(tmp, html);
    const loaded = new Promise(r => ev.set('Page.loadEventFired', r));
    await S('Page.navigate', { url: 'file://' + tmp }); await loaded; await sleep(400);
    const shot = await S('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    fs.writeFileSync(path.join(HERE, 'kartlar', `${name}.png`), Buffer.from(shot.result.data, 'base64'));
    fs.unlinkSync(tmp);
    console.log(`kartlar/${name}.png`);
  }
  ws.close();
} finally { chrome.kill(); }
