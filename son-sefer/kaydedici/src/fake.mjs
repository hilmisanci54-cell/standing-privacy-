// Deneme modu: FastH3Model'in kullandığımız yüzeyini taklit eder. Reactor'a bağlanmadan
// kuyruk besleme, zincirleme, kayıt ve yedek akışını sınamak için. Süreler 10× hızlıdır.
const SPEED = 10;

export class FakeFastH3 {
  constructor({ recorderDisabled = false } = {}) {
    this.h = {}; this.recorderDisabled = recorderDisabled;
    this.gen = []; this.playout = []; this.history = []; this.playing = null;
    this.autoplay = false; this.cap = { generation: 4, playout: 3 };
    this.seed = 1000; this.sent = 0; this.building = false;
  }
  #on(name, fn) { (this.h[name] ||= []).push(fn); return () => { this.h[name] = this.h[name].filter(f => f !== fn); }; }
  #emit(name, msg) { (this.h[name] || []).forEach(f => { try { f(msg); } catch (e) { console.error(e); } }); }
  onClipQueued(f) { return this.#on('clip_queued', f); }
  onClipGenerated(f) { return this.#on('clip_generated', f); }
  onClipStarted(f) { return this.#on('clip_started', f); }
  onClipFinished(f) { return this.#on('clip_finished', f); }
  onClipFailed(f) { return this.#on('clip_failed', f); }
  onCommandError(f) { return this.#on('command_error', f); }
  onStateUpdate(f) { return this.#on('state_update', f); }
  onQueueUpdate(f) { return this.#on('queue_update', f); }
  onMainVideo(f) { return this.#on('main_video', f); }
  onMainAudio() { return () => {}; }

  async connect() {
    await new Promise(r => setTimeout(r, 300));
    const c = document.createElement('canvas'); c.width = 1344; c.height = 768;
    this.canvas = c; this.ctx = c.getContext('2d');
    const stream = c.captureStream(30);
    this.#emit('main_video', stream.getVideoTracks()[0], stream);
    this.timer = setInterval(() => this.#draw(), 33);
    this.#state();
  }
  #draw() {
    const g = this.ctx; g.fillStyle = '#0d1015'; g.fillRect(0, 0, 1344, 768);
    g.fillStyle = '#e8e1d4'; g.font = '600 64px system-ui'; g.textAlign = 'center';
    if (this.playing) {
      const meta = JSON.parse(this.playing.metadata || '{}');
      const t = (performance.now() - this.playing._t0) / 1000 * SPEED;
      g.fillText(`DENEME · ${meta.id || '?'}`, 672, 360);
      g.font = '400 32px ui-monospace, monospace';
      g.fillText(`${t.toFixed(1)} / ${this.playing.seconds} sn · seed ${this.playing.seed}`, 672, 420);
    } else { g.fillText('— bekleniyor —', 672, 390); }
  }
  async disconnect() { clearInterval(this.timer); }
  async setCanvas({ aspect }) { this.aspect = aspect; return { type: 'canvas_accepted', width: 1344, height: 768, aspect }; }
  async setFlushOnClipEnd({ enabled }) { return { type: 'flush_accepted', enabled }; }
  async setAutoplay({ enabled }) { this.autoplay = enabled; this.#state(); this.#tryPlay(); return { type: 'autoplay_accepted', enabled }; }
  async uploadFile(blob) { await new Promise(r => setTimeout(r, 150)); return { __fileRef: true, size: blob.size }; }
  async reset() { this.gen = []; this.playout = []; this.history = []; this.playing = null; this.#state(); this.#queue(); }
  async stop() { this.playing = null; this.#state(); }

  #known(id) { return [...this.gen, ...this.playout, ...this.history, this.playing].some(c => c && c.clip_id === id); }
  #clipInfo(c) { const { _t0, _starting, ...rest } = c; return { ...rest }; }

  async enqueue(p) {
    await new Promise(r => setTimeout(r, 60));
    const fail = reason => { this.#emit('command_error', { type: 'command_error', command: 'enqueue', reason }); return undefined; };
    if (!p.prompt) return fail('prompt is empty');
    if (this.gen.length >= this.cap.generation) return fail('generation queue is full');
    if (p.starting_frame && p.continue_from_clip_id) return fail('both a starting frame and a source clip were given');
    if (p.continue_from_clip_id && !this.#known(p.continue_from_clip_id)) return fail('source clip is unknown or no longer retained');
    const seconds = Math.min(14.375, Math.max(5.167, p.seconds ?? 10));
    const clip = { clip_id: crypto.randomUUID(), prompt: p.prompt, metadata: p.metadata || '',
      seconds, frames: Math.round(seconds * 24), seed: p.seed ?? this.seed++, ready: false,
      continue_from_clip_id: p.continue_from_clip_id || null, has_starting_frame: !!p.starting_frame };
    this.gen.push(clip);
    const msg = { type: 'clip_queued', clip: this.#clipInfo(clip) };
    this.#emit('clip_queued', msg); this.#queue(); this.#state(); this.#build();
    return msg;
  }
  #build() {
    if (this.building || this.playout.length >= this.cap.playout) return;
    const idx = this.gen.findIndex(c => !c.continue_from_clip_id ||
      [...this.playout, ...this.history].some(h => h.clip_id === c.continue_from_clip_id) || this.playing?.clip_id === c.continue_from_clip_id);
    if (idx < 0) return;
    const clip = this.gen[idx]; this.building = true;
    setTimeout(() => {
      this.gen.splice(this.gen.indexOf(clip), 1); clip.ready = true; this.playout.push(clip);
      this.building = false;
      this.#emit('clip_generated', { type: 'clip_generated', clip: this.#clipInfo(clip) });
      this.#queue(); this.#state(); this.#tryPlay(); this.#build();
    }, clip.seconds * 1000 / SPEED * 1.05);
  }
  async play({ clip_id = '' } = {}) {
    await new Promise(r => setTimeout(r, 30));
    const err = reason => this.#emit('command_error', { type: 'command_error', command: 'play', reason });
    if (this.playing) return err('a clip is already playing');
    const idx = clip_id ? this.playout.findIndex(c => c.clip_id === clip_id) : (this.playout.length ? 0 : -1);
    if (idx < 0) return err('no such clip in the playout queue');
    this.#start(this.playout.splice(idx, 1)[0]);
  }
  #tryPlay() {
    if (!this.autoplay || this.playing || !this.playout.length) return;
    this.#start(this.playout.shift());
  }
  #start(clip) {
    clip._t0 = performance.now(); this.playing = clip;
    this.#emit('clip_started', { type: 'clip_started', clip: this.#clipInfo(clip) });
    this.#queue(); this.#state(); this.#build();
    setTimeout(() => {
      this.sent += clip.seconds; this.history.push(clip); this.playing = null;
      this.#emit('clip_finished', { type: 'clip_finished', clip: this.#clipInfo(clip), seconds_sent: this.sent });
      this.#queue(); this.#state(); this.#tryPlay(); this.#build();
    }, clip.seconds * 1000 / SPEED);
  }
  async requestClip(seconds) {
    if (this.recorderDisabled) { const e = new Error('recorder disabled'); e.code = 'RECORDER_DISABLED'; throw e; }
    return { sessionId: 'deneme', kind: 'snap', startMarker: this.sent - seconds, endMarker: this.sent,
      nowMarker: this.sent, predictedReadyAtMs: Date.now(), playlistUrl: 'deneme://' + seconds };
  }
  async requestRecording() { return this.requestClip(this.sent); }
  #state() {
    this.#emit('state_update', { type: 'state_update', autoplay: this.autoplay, playing: !!this.playing,
      playing_clip_id: this.playing?.clip_id ?? null, generation_queued: this.gen.length,
      generation_capacity: this.cap.generation, playout_queued: this.playout.length,
      playout_capacity: this.cap.playout, seconds_sent: this.sent });
  }
  #queue() {
    this.#emit('queue_update', { type: 'queue_update', generation: this.gen.map(c => this.#clipInfo(c)),
      playout: this.playout.map(c => this.#clipInfo(c)), history: this.history.map(c => this.#clipInfo(c)) });
  }
}

// Deneme modunda downloadClipAsFile yerine: küçük örnek mp4.
export async function fakeDownload() {
  const r = await fetch('demo.mp4'); return r.blob();
}
