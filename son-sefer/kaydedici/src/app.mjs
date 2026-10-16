// Son Sefer kaydedicisi — FastH3 ile 64 klibi sırayla üretir, her birini ayrı dosyaya kaydeder.
import { FastH3Model } from '@reactor-models/fast-h3/core';
import { downloadClipAsFile } from '@reactor-team/js-sdk';
import { FakeFastH3, fakeDownload } from './fake.mjs';

const qs = new URLSearchParams(location.search);
const DEMO = qs.has('deneme');
const RECORDER_OFF = qs.has('kayit-yok');      // deneme: sunucu kaydı başarısız olsun, yedek denensin
const PAD_BEFORE = 0.6;   // klip bitince bu kadar siyah bekle, sonra kaydı iste
const PAD_EXTRA = 1.6;    // istenen pencere = klip süresi + bu kadar (başta ve sonda siyah pay)
const PREFIX = DEMO ? 'deneme_' : '';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => n.append(c?.nodeType ? c : document.createTextNode(c ?? '')));
  return n;
};

let LIST = null, STATUS = null, director = null;
const rows = new Map();            // id -> { row, chip, note, redo }

// ------------------------------------------------------------------ günlük
function log(msg, kind = '') {
  const t = new Date().toLocaleTimeString('tr-TR', { hour12: false });
  const line = el('div', { class: 'log-line ' + kind }, el('time', {}, t), msg);
  $('#log').prepend(line);
  console[kind === 'err' ? 'error' : 'log'](msg);
}
const LABEL = { bekliyor: 'Bekliyor', yukleniyor: 'Kare yükleniyor', kuyrukta: 'Kuyrukta', hazir: 'Hazır',
  oynatiliyor: 'Oynatılıyor', kaydediliyor: 'Kaydediliyor', kaydedildi: 'Kaydedildi',
  yedek: 'Yedekten kaydedildi', hata: 'Hata', atlandi: 'Atlandı' };
function setClip(id, st, note = '') {
  const r = rows.get(id); if (!r) return;
  r.chip.dataset.st = st; r.chip.textContent = LABEL[st] || st;
  if (note !== null) r.note.textContent = note;
}

// ------------------------------------------------------------------ açılış
async function boot() {
  LIST = await (await fetch('/cekim-listesi.json')).json();
  STATUS = await (await fetch('/api/status')).json();
  if (DEMO) document.body.classList.add('demo');
  renderChecks(); renderList();
  const missing = neededFrames(allIds()).filter(f => !STATUS.frames.includes(f));
  $('#frames-state').textContent = missing.length
    ? `Eksik açılış karesi: ${missing.join(', ')} — frames/ klasörüne koyun.`
    : 'Açılış karelerinin hepsi frames/ klasöründe.';
  $('#frames-state').dataset.ok = String(!missing.length);
  $('#key-state').textContent = DEMO ? 'Deneme modu — Reactor\'a bağlanılmıyor.'
    : STATUS.hasKey ? 'REACTOR_API_KEY bulundu.' : 'REACTOR_API_KEY yok — sunucuyu anahtarla başlatın.';
  $('#key-state').dataset.ok = String(DEMO || STATUS.hasKey);
  const done = STATUS.clips.filter(f => f.startsWith(PREFIX));
  for (const c of LIST.clips) if (done.includes(`${PREFIX}${c.id}.mp4`)) setClip(c.id, 'kaydedildi', 'önceki çalıştırmadan');
}
const allIds = () => LIST.clips.map(c => c.id);
const clipOf = id => LIST.clips.find(c => c.id === id);
function neededFrames(ids) { return [...new Set(ids.map(clipOf).filter(c => c.starting_frame).map(c => c.starting_frame))]; }

function renderChecks() {
  const box = $('#scenes');
  for (const [n, name] of Object.entries(LIST.scenes)) {
    const cs = LIST.clips.filter(c => c.scene === +n);
    const secs = cs.reduce((a, c) => a + c.seconds, 0);
    box.append(el('label', { class: 'scene-check' },
      el('input', { type: 'checkbox', value: n, id: 'sc' + n }),
      el('span', {}, el('b', {}, `Sahne ${n}`), ` ${name}`),
      el('small', {}, `${cs.length} klip · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)));
  }
}
function renderList() {
  const box = $('#clips'); box.textContent = '';
  for (const [n, name] of Object.entries(LIST.scenes)) {
    const sec = el('section', { class: 'scene' }, el('h3', {}, `Sahne ${n} — ${name}`));
    for (const c of LIST.clips.filter(c => c.scene === +n)) {
      const chip = el('span', { class: 'chip', 'data-st': 'bekliyor' }, 'Bekliyor');
      const note = el('span', { class: 'note' });
      const redo = el('button', { class: 'redo', title: 'Aynı prompt, yeni seed ile yeniden üret', disabled: true,
        onclick: () => director?.retake(c.id) }, '↻ Yeniden');
      const src = c.starting_frame ? `açılış: ${c.starting_frame}` : `devam: ${c.continue_from}`;
      const row = el('div', { class: 'clip' },
        el('div', { class: 'clip-head' }, el('b', { class: 'cid' }, c.id), el('span', { class: 'meta' }, `${c.seconds} sn · ${src}`),
          c.test ? el('span', { class: 'tag' }, 'Türkçe test') : '', chip, redo),
        el('details', {}, el('summary', {}, c.prompt.slice(0, 110) + '…'), el('p', {}, c.prompt)),
        note);
      rows.set(c.id, { row, chip, note, redo }); sec.append(row);
    }
    box.append(sec);
  }
}

// ------------------------------------------------------------------ yardımcılar
async function getJwt() {
  const r = await fetch('/api/token', { method: 'POST' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.jwt) throw new Error(b.error || `Jeton alınamadı (${r.status})`);
  return b.jwt;
}
async function save(name, blob) {
  const r = await fetch('/api/save?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || `Kaydedilemedi (${r.status})`);
  return b;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ yönetmen
class Director {
  constructor() {
    this.model = DEMO ? new FakeFastH3({ recorderDisabled: RECORDER_OFF }) : new FastH3Model();
    this.download = DEMO ? fakeDownload : (clip, opts) => downloadClipAsFile(clip, null, opts);
    this.serverId = new Map();   // "1-04" -> son çekimin clip_id'si
    this.takes = new Map();      // "1-04" -> çekim sayısı
    this.byServer = new Map();   // clip_id -> { id, take, label }
    this.jobs = [];              // enqueue bekleyenler, sırayla
    this.playOrder = [];         // oynatılacak clip_id'ler, sırayla
    this.ready = new Set();      // playout kuyruğundaki clip_id'ler
    this.cap = { queued: 0, capacity: 1 };
    this.playing = null; this.pumping = false; this.stopped = false;
    this.stream = new MediaStream(); this.backup = null;
    this.records = []; this.saveChain = Promise.resolve(); this.jwt = null;
  }

  async connect() {
    const m = this.model;
    m.onMainVideo(t => this.#track(t)); m.onMainAudio(t => this.#track(t));
    m.onStateUpdate(s => {
      this.cap = { queued: s.generation_queued ?? 0, capacity: s.generation_capacity ?? 1 };
      $('#meters').textContent = `Üretim kuyruğu ${s.generation_queued}/${s.generation_capacity} · ` +
        `oynatma kuyruğu ${s.playout_queued}/${s.playout_capacity} · gönderilen ${Math.round(s.seconds_sent || 0)} sn`;
      this.#pump();
    });
    m.onClipQueued(({ clip }) => this.#mark(clip, 'kuyrukta', `seed ${clip.seed} · ${(+clip.seconds).toFixed(2)} sn`));
    m.onClipGenerated(({ clip }) => { this.ready.add(clip.clip_id); this.#mark(clip, 'hazir', null); this.#playNext(); });
    m.onClipStarted(({ clip }) => { this.ready.delete(clip.clip_id); this.#mark(clip, 'oynatiliyor', null); this.#startBackup(clip); });
    m.onClipFinished(({ clip }) => this.#finished(clip));
    m.onClipFailed(({ clip, reason }) => { this.#mark(clip, 'hata', reason); log(`Üretim başarısız: ${this.#label(clip)} — ${reason}`, 'err'); });
    m.onCommandError(({ command, reason }) => log(`Komut reddedildi (${command}): ${reason}`, 'err'));

    // Önceki oturumların kayıtlarını koru: seed'ler yeniden üretim için lazım.
    try { const r = await fetch(`/clips/${PREFIX}kayit.json`); if (r.ok) this.records = await r.json(); } catch {}
    log(DEMO ? 'Deneme oturumu açılıyor…' : 'Reactor oturumu açılıyor…');
    if (DEMO) await m.connect(); else { this.jwt = await getJwt(); await m.connect(this.jwt); }
    await m.setCanvas({ aspect: LIST.session.aspect });
    // Ayrı dosyalara temiz kayıt için: klipler arası siyah, oynatma elle.
    await m.setFlushOnClipEnd({ enabled: true });
    await m.setAutoplay({ enabled: false });
    log('Oturum hazır: 16:9, klipler arası siyah, sıralı oynatma.', 'ok');
  }

  #track(track) {
    this.stream.getTracks().filter(t => t.kind === track.kind).forEach(t => this.stream.removeTrack(t));
    this.stream.addTrack(track);
    const v = $('#preview'); if (v.srcObject !== this.stream) v.srcObject = this.stream;
    v.play().catch(() => {});
  }
  #label(clip) { const b = this.byServer.get(clip.clip_id); return b ? b.label : clip.clip_id.slice(0, 8); }
  #mark(clip, st, note) { const b = this.byServer.get(clip.clip_id); if (b) setClip(b.id, st, note); }

  // Bir sahne listesini (ya da tek tek test kliplerini) kuyruğa al.
  plan(ids, { standalone = false } = {}) {
    for (const id of ids) {
      const c = clipOf(id);
      this.jobs.push({ id, prompt: c.prompt, seconds: c.seconds,
        starting_frame: standalone ? null : c.starting_frame,
        continue_from: standalone ? null : c.continue_from, standalone });
      setClip(id, 'bekliyor', '');
    }
    this.#pump();
  }

  retake(id) {
    const c = clipOf(id);
    if (c.continue_from && !this.serverId.has(c.continue_from)) {
      return log(`${id} yeniden üretilemez: bağlı olduğu ${c.continue_from} bu oturumda yok.`, 'err');
    }
    this.jobs.push({ id, prompt: c.prompt, seconds: c.seconds, starting_frame: c.starting_frame,
      continue_from: c.continue_from, seed: Math.floor(Math.random() * 2 ** 31), retake: true });
    log(`${id} yeni seed ile yeniden kuyruğa alındı.`);
    this.#pump();
  }

  async #pump() {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (this.jobs.length && this.cap.queued < this.cap.capacity && !this.stopped) {
        const job = this.jobs.shift();
        const ok = await this.#enqueue(job);
        if (!ok) this.#skipDependents(job.id);
        this.cap.queued++;   // state_update gelene kadar iyimser sayım
      }
    } finally { this.pumping = false; }
  }

  async #enqueue(job) {
    const take = (this.takes.get(job.id) || 0) + 1;
    const p = { prompt: job.prompt, seconds: job.seconds, seed: job.seed ?? null,
      metadata: JSON.stringify({ id: job.id, take }), position: null };
    try {
      if (job.starting_frame) {
        setClip(job.id, 'yukleniyor', job.starting_frame);
        const r = await fetch('/frames/' + job.starting_frame);
        if (!r.ok && !DEMO) throw new Error(`frames/${job.starting_frame} bulunamadı`);
        p.starting_frame = await this.model.uploadFile(r.ok ? await r.blob() : new Blob(['deneme']));
      } else if (job.continue_from) {
        const src = this.serverId.get(job.continue_from);
        if (!src) throw new Error(`${job.continue_from} bu oturumda üretilmedi`);
        p.continue_from_clip_id = src;
      }
      const reply = await this.model.enqueue(p);
      if (!reply?.clip?.clip_id) throw new Error('enqueue reddedildi (ayrıntı günlükte)');
      const cid = reply.clip.clip_id;
      const label = take > 1 ? `${job.id} (çekim ${take})` : job.id;
      this.takes.set(job.id, take); this.serverId.set(job.id, cid);
      this.byServer.set(cid, { id: job.id, take, label, standalone: job.standalone });
      this.playOrder.push(cid);
      setClip(job.id, 'kuyrukta', `seed ${reply.clip.seed} · ${(+reply.clip.seconds).toFixed(2)} sn`);
      rows.get(job.id).redo.disabled = false;
      return true;
    } catch (e) {
      setClip(job.id, 'hata', e.message || String(e));
      log(`${job.id}: ${e.message || e}`, 'err');
      return false;
    }
  }

  #skipDependents(id) {
    const dead = new Set([id]); let changed = true;
    while (changed) {
      changed = false;
      for (const j of this.jobs) if (j.continue_from && dead.has(j.continue_from) && !dead.has(j.id)) { dead.add(j.id); changed = true; }
    }
    this.jobs = this.jobs.filter(j => {
      if (j.id !== id && dead.has(j.id)) { setClip(j.id, 'atlandi', `${id} başarısız olduğu için`); return false; }
      return true;
    });
  }

  async #playNext() {
    if (this.playing || this.stopped) return;
    const next = this.playOrder[0];
    if (!next || !this.ready.has(next)) return;
    this.playOrder.shift(); this.playing = next;
    try { await this.model.play({ clip_id: next }); }
    catch (e) { this.playing = null; log(`Oynatılamadı: ${e.message || e}`, 'err'); }
  }

  #startBackup(clip) {
    this.backup = null;
    if (!this.stream.getVideoTracks().length || typeof MediaRecorder === 'undefined') return;
    try {
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
      const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.start(500); this.backup = { cid: clip.clip_id, rec, chunks };
    } catch { this.backup = null; }
  }
  #stopBackup(cid) {
    const b = this.backup; if (!b || b.cid !== cid) return Promise.resolve(null);
    this.backup = null;
    return new Promise(res => { b.rec.onstop = () => res(new Blob(b.chunks, { type: 'video/webm' })); setTimeout(() => b.rec.stop(), 300); });
  }

  async #finished(clip) {
    const info = this.byServer.get(clip.clip_id);
    if (!info) return;
    setClip(info.id, 'kaydediliyor', null);
    const backupP = this.#stopBackup(clip.clip_id);
    await sleep(PAD_BEFORE * 1000);
    let snap = null, snapErr = null;
    try { snap = await this.model.requestClip(+clip.seconds + PAD_EXTRA); } catch (e) { snapErr = e; }
    this.playing = null; this.#playNext();   // kayıt istendi; sıradaki klip başlayabilir

    const base = info.standalone ? `test_${info.id}` : (info.take > 1 ? `${info.id}_v${info.take}` : info.id);
    this.saveChain = this.saveChain.then(async () => {
      let file = null, usedBackup = false;
      if (snap) {
        try {
          const blob = await this.download(snap, { jwt: this.jwt || undefined });
          file = `${PREFIX}${base}.mp4`; await save(file, blob);
        } catch (e) { snapErr = e; }
      }
      if (!file) {
        const b = await backupP;
        if (b?.size) { file = `${PREFIX}${base}.webm`; await save(file, b); usedBackup = true; }
      }
      if (file) {
        setClip(info.id, usedBackup ? 'yedek' : 'kaydedildi', `${file} · seed ${clip.seed}`);
        log(`${info.label} → clips/${file}` + (usedBackup ? `  (sunucu kaydı başarısız: ${snapErr?.code || snapErr?.message || snapErr})` : ''), usedBackup ? 'warn' : 'ok');
        this.records.push({ id: info.id, take: info.take, file, clip_id: clip.clip_id, seed: clip.seed,
          seconds: +clip.seconds, frames: clip.frames, padded: !usedBackup, pad_before: PAD_BEFORE,
          window_seconds: +clip.seconds + PAD_EXTRA, standalone: !!info.standalone, saved_at: new Date().toISOString() });
        await save(`${PREFIX}kayit.json`, new Blob([JSON.stringify(this.records, null, 1)], { type: 'application/json' }));
      } else {
        setClip(info.id, 'hata', `kaydedilemedi: ${snapErr?.message || snapErr}`);
        log(`${info.label} kaydedilemedi: ${snapErr?.message || snapErr}`, 'err');
      }
    }).catch(e => log(`Kayıt zinciri hatası: ${e.message || e}`, 'err'));
  }

  async saveWholeSession() {
    log('Oturumun tamamı isteniyor…');
    const clip = await this.model.requestRecording();
    const blob = await this.download(clip, { jwt: this.jwt || undefined });
    const name = `${PREFIX}oturum-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.mp4`;
    await save(name, blob); log(`Oturum kaydı → clips/${name}`, 'ok');
  }

  async close() {
    this.stopped = true; this.jobs = [];
    try { await this.saveChain; } catch {}
    try { await this.model.disconnect(); } catch {}
    log('Oturum kapatıldı. Bu oturumun klip geçmişi silindi.', 'warn');
  }
}

// ------------------------------------------------------------------ düğmeler
function selectedScenes() { return [...document.querySelectorAll('#scenes input:checked')].map(i => +i.value); }

async function ensureDirector() {
  if (director) return director;
  director = new Director();
  try { await director.connect(); }
  catch (e) { log(`Bağlanılamadı: ${e.message || e}`, 'err'); director = null; throw e; }
  $('#btn-close').disabled = false; $('#btn-session').disabled = false;
  return director;
}

$('#btn-test').addEventListener('click', async () => {
  const d = await ensureDirector().catch(() => null); if (!d) return;
  log('Test: 1-04 ve 1-06 tek başına (açılış karesi ve zincir olmadan) üretiliyor.');
  d.plan(['1-04', '1-06'], { standalone: true });
});

$('#btn-run').addEventListener('click', async () => {
  const scenes = selectedScenes();
  if (!scenes.length) return log('Önce en az bir sahne seçin.', 'err');
  const ids = LIST.clips.filter(c => scenes.includes(c.scene)).map(c => c.id);
  const outside = LIST.clips.filter(c => ids.includes(c.id) && c.continue_from && !ids.includes(c.continue_from));
  if (outside.length) {
    return log(outside.map(c => `${c.id}, ${c.continue_from} klibine bağlı`).join('; ') +
      ` — o sahneyi de seçin (aynı oturumda üretilmeli).`, 'err');
  }
  const missing = neededFrames(ids).filter(f => !STATUS.frames.includes(f));
  if (missing.length && !DEMO) return log(`Eksik açılış karesi: ${missing.join(', ')}`, 'err');
  const d = await ensureDirector().catch(() => null); if (!d) return;
  log(`Sahne ${scenes.join(', ')}: ${ids.length} klip kuyruğa alınıyor.`);
  d.plan(ids);
});

$('#btn-session').addEventListener('click', () => director?.saveWholeSession().catch(e => log(`Oturum kaydı alınamadı: ${e.message || e}`, 'err')));
$('#btn-close').addEventListener('click', async () => {
  if (!director) return;
  await director.close(); director = null;
  $('#btn-close').disabled = true; $('#btn-session').disabled = true;
  rows.forEach(r => (r.redo.disabled = true));
});

// ?tani — SDK ve WASM'ın yüklendiğini, Reactor'a gerçek bağlantı denemeden önce sınar.
if (qs.has('tani')) window.__tani = async () => {
  const m = new FastH3Model();
  try { await m.connect('eyJhbGciOiJub25lIn0.eyJ0YW5pIjoxfQ.'); return 'bağlandı'; }
  catch (e) { return `${e?.constructor?.name || 'Error'} | ${e?.code || '-'} | ${e?.message || e}`; }
};

boot().catch(e => log(`Başlatılamadı: ${e.message || e}`, 'err'));
