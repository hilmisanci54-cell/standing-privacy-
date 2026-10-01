#!/usr/bin/env python3
"""Son Sefer — kurgu.

Kaydedicinin ürettiği 64 klibi, çekim listesinin "Kurgu ve son işlem" sayfasına göre tek filme
dönüştürür.

  python3 kurgu.py                          # ../kaydedici/clips  →  cikti/son-sefer.mp4
  python3 kurgu.py --klipler /yol/clips     # klipler başka yerdeyse
  python3 kurgu.py --taslak                 # eksik klipler yerine siyah koyar (ara kurgu için)
  python3 kurgu.py --hizli                  # hızlı kodlama, deneme için

Gereksinim: Python 3.9+ ve libx264'lü ffmpeg. ffmpeg PATH'te yoksa: pip install imageio-ffmpeg
İsteğe bağlı sesler (sesler/ klasörü): yagmur.* (1–4. sahne katmanı; yoksa sentezlenir),
final-piyano.* (8-03'ten sonra karanlıkta süren piyano; yoksa karanlık sessiz geçer).
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# ---- çekim listesinin 24. sayfasındaki kurgu kararları
OVERLAP = 0.4            # her kesmede ses bindirme (0,3–0,5 sn): görüntü kesmesi aynı yerde kalır
FADE_OUT_AT = '4-14'     # "4-14'ün sonunda 2–3 sn'de karart"
FADE_OUT_SEC = 2.5
BLACK_GAP = 0.7          # kararma ile sabah arasında kısa siyah
FADE_IN_AT = '5-01'      # "5-01'i karadan aç"
FADE_IN_SEC = 1.5
RAIN_UNTIL = '4-14'      # "Sahne 1–4 altına tek bir sürekli yağmur sesi katmanı koy, 4'ün sonunda yavaşça azalt"
RAIN_FADE_OUT = 8.0
END_AFTER = '8-03'       # "asansör kapısı kapanınca kesme yapıp karart"
END_BLACK = 6.0          # "piyano karanlıkta 5–8 sn devam etsin"
SON_SEC, CREDITS_SEC, CARD_FADE = 3.5, 6.0, 0.8
# Telefon mesajı: (görsel, başlangıç, bitiş) — klibin kırpılmış hâline göre saniye; eksi değer = sondan.
MESSAGES = {'8-01': ('mesaj-giden.png', -3.8, -0.4),   # Deniz gönderiyor: son saniyeler
            '8-02': ('mesaj-gelen.png', 2.5, 7.0)}     # Ece okuyor
MSG_FADE = 0.3
# Kaydedicinin siyah paylarını bulmak için: yalnızca saf siyah (sahnelerin karanlığına dokunmaz).
BLACK = 'blackdetect=d=0.08:pix_th=0.02:pic_th=0.985'
AUDIO_EXT = ('.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg')


def die(msg):
    sys.exit(f'HATA: {msg}')


def ffmpeg_bin():
    p = shutil.which('ffmpeg')
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        die('ffmpeg bulunamadı. Kurun ya da: pip install imageio-ffmpeg')


FF = None


def run(args, quiet=True):
    r = subprocess.run([FF, '-hide_banner', '-nostdin', *args], capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    if r.returncode != 0 and not quiet:
        tail = '\n'.join(r.stderr.strip().splitlines()[-12:])
        die(f'ffmpeg başarısız:\n{tail}')
    return r


def probe(path):
    err = run(['-i', str(path)]).stderr
    info = {'audio': 'Audio:' in err}
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err)
    info['duration'] = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else None
    m = re.search(r'Video:.*?, (\d{2,5})x(\d{2,5})[, \[]', err)
    info['size'] = (int(m[1]), int(m[2])) if m else None
    m = re.search(r'Video:.*?, ([\d.]+) fps', err)
    info['fps'] = float(m[1]) if m else None
    if info['duration'] is None:                       # MediaRecorder webm'lerinde süre başlıkta yok
        err = run(['-i', str(path), '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']).stderr
        t = re.findall(r'time=(\d+):(\d+):([\d.]+)', err)
        if t:
            h, mi, s = t[-1]
            info['duration'] = int(h) * 3600 + int(mi) * 60 + float(s)
    return info


def count_frames(path):
    # akış kopyalanırken ffmpeg 7 kare sayacını basmıyor; çözerek say
    err = run(['-i', str(path), '-map', '0:v:0', '-f', 'null', '-']).stderr
    m = re.findall(r'frame=\s*(\d+)', err)
    return int(m[-1]) if m else None


def content_bounds(path, dur):
    """Baştaki ve sondaki saf siyahı bul; içerik aralığını döndür."""
    err = run(['-i', str(path), '-vf', BLACK, '-an', '-f', 'null', '-']).stderr
    segs = [(float(a), float(b)) for a, b in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', err)]
    start, end = 0.0, dur
    for a, b in segs:
        if a <= 0.05:
            start = max(start, b)
        if b >= dur - 0.12:
            end = min(end, a)
    return start, end


def find_audio(name):
    for ext in AUDIO_EXT:
        p = HERE / 'sesler' / f'{name}{ext}'
        if p.exists():
            return p
    return None


def fmt(t):
    return f'{int(t // 60):02d}:{t % 60:06.3f}'


def main():
    global FF
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--klipler', default=str(ROOT / 'kaydedici' / 'clips'))
    ap.add_argument('--cikti', default=str(HERE / 'cikti' / 'son-sefer.mp4'))
    ap.add_argument('--taslak', action='store_true', help='eksik klipler yerine siyah koy')
    ap.add_argument('--hizli', action='store_true', help='hızlı kodlama (deneme)')
    a = ap.parse_args()
    FF = ffmpeg_bin()
    if 'libx264' not in run(['-encoders']).stdout:
        die('Bu ffmpeg libx264 içermiyor. Tam bir ffmpeg kurun ya da: pip install imageio-ffmpeg')

    shot = json.loads((ROOT / 'cekim-listesi.json').read_text(encoding='utf-8'))
    clips_dir = Path(a.klipler)
    work = HERE / 'cikti' / '.ara'
    work.mkdir(parents=True, exist_ok=True)
    out = Path(a.cikti)
    out.parent.mkdir(parents=True, exist_ok=True)

    rec = {}
    kayit = clips_dir / 'kayit.json'
    if kayit.exists():
        for r in json.loads(kayit.read_text(encoding='utf-8')):
            rec[r['file']] = r

    # ---- 1. klipleri bul
    warn, sources, missing = [], {}, []
    for c in shot['clips']:
        src = next((clips_dir / f"{c['id']}{e}" for e in ('.mp4', '.webm') if (clips_dir / f"{c['id']}{e}").exists()), None)
        if src:
            sources[c['id']] = src
            if src.suffix == '.webm':
                warn.append(f"{c['id']}: yedek kayıt (.webm) kullanılıyor; kalitesi düşük olabilir")
        else:
            missing.append(c['id'])
            takes = sorted(clips_dir.glob(f"{c['id']}_v*.mp4"))
            if takes:
                warn.append(f"{c['id']}: {c['id']}.mp4 yok ama {', '.join(t.name for t in takes)} var — "
                            f"kurguya girecek çekimi {c['id']}.mp4 adıyla kaydedin")
    if missing and not a.taslak:
        die(f"{len(missing)} klip eksik: {' '.join(missing)}\n"
            f"Klasör: {clips_dir}\nAra kurgu için --taslak ile çalıştırın (eksikler siyah geçer).")
    if not sources:
        die(f'{clips_dir} içinde hiç klip yok.')

    first = probe(next(iter(sources.values())))
    W, H = first['size'] or (1344, 768)
    W, H = W - W % 2, H - H % 2
    FPS = first['fps'] or 24
    if FPS > 60:
        FPS = 30
    print(f'Biçim: {W}×{H}, {FPS:g} fps · {len(sources)} klip bulundu' + (f', {len(missing)} eksik (siyah)' if missing else ''))

    # ---- 2. temizle: siyah payları kırp, biçimi eşitle
    vf = (f'fps={FPS},scale={W}:{H}:force_original_aspect_ratio=decrease,'
          f'pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p')
    clean = {}
    for c in shot['clips']:
        cid = c['id']
        if cid not in sources:
            clean[cid] = None
            continue
        src = sources[cid]
        dst = work / f'{cid}.mp4'
        meta = work / f'{cid}.json'
        sig = {'v': 2, 'src': str(src), 'mtime': src.stat().st_mtime, 'size': src.stat().st_size, 'fmt': [W, H, FPS]}
        if dst.exists() and meta.exists() and json.loads(meta.read_text()).get('sig') == sig:
            clean[cid] = json.loads(meta.read_text())['nf']
            continue
        info = probe(src)
        if not info['duration']:
            die(f'{src.name}: süre okunamadı')
        s, e = content_bounds(src, info['duration'])
        expected = (rec.get(src.name) or {}).get('seconds') or c['seconds']
        if e - s < 1.0:
            warn.append(f'{cid}: siyah algılama içerik bulamadı, klip olduğu gibi kullanıldı')
            s, e = 0.0, info['duration']
        elif abs((e - s) - expected) > 0.6:
            warn.append(f'{cid}: içerik {e - s:.2f} sn, beklenen {expected:.2f} sn — kontrol edin')
        args = ['-y', '-ss', f'{s:.3f}', '-to', f'{e:.3f}', '-i', str(src)]
        if not info['audio']:
            args += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
        args += ['-vf', vf, '-af', 'aresample=48000,aformat=channel_layouts=stereo',
                 '-map', '0:v:0', '-map', '0:a:0' if info['audio'] else '1:a:0',
                 '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-c:a', 'pcm_s16le',
                 '-shortest', '-f', 'mov', str(dst)]
        run(args, quiet=False)
        nf = count_frames(dst)
        if not nf:
            die(f'{dst.name}: kare sayılamadı')
        meta.write_text(json.dumps({'sig': sig, 'nf': nf, 'trim': [s, e]}))
        clean[cid] = nf
        print(f'  {cid}  {fmt(s)} – {fmt(e)}  →  {nf} kare ({nf / FPS:.2f} sn)')

    # ---- 3. zaman çizelgesi — kare cinsinden. Saniyeyle hesaplanırsa her kırpmada kesirli kare
    # yuvarlanır, 64 klipte ~1,5 sn birikir ve ses görüntüden kayar.
    fr = lambda sec: int(round(sec * FPS))
    ids = [c['id'] for c in shot['clips']]
    planned = {c['id']: c['seconds'] for c in shot['clips']}
    h = fr(OVERLAP / 2)
    items = []
    for i, cid in enumerate(ids):
        nf = clean[cid] or fr(planned[cid])
        prev_ok = i > 0 and ids[i - 1] != FADE_OUT_AT
        next_ok = i < len(ids) - 1 and cid not in (FADE_OUT_AT, END_AFTER)
        items.append({'kind': 'clip' if clean[cid] else 'black', 'id': cid, 'nf': nf,
                      'hin': h if prev_ok else 0, 'hout': h if next_ok else 0})
        if cid == FADE_OUT_AT:
            items.append({'kind': 'black', 'id': 'kararma', 'nf': fr(BLACK_GAP), 'hin': 0, 'hout': 0})
    items.append({'kind': 'black', 'id': 'karanlık', 'nf': fr(END_BLACK), 'hin': 0, 'hout': 0})
    items.append({'kind': 'card', 'id': 'SON', 'png': HERE / 'kartlar' / 'son.png', 'nf': fr(SON_SEC), 'hin': 0, 'hout': 0})
    items.append({'kind': 'card', 'id': 'jenerik', 'png': HERE / 'kartlar' / 'jenerik.png', 'nf': fr(CREDITS_SEC), 'hin': 0, 'hout': 0})
    f0 = 0
    for it in items:
        it['seg'] = it['nf'] - it['hin'] - it['hout']
        it['f0'] = f0
        f0 += it['seg']
        it['start'], it['end'], it['len'] = it['f0'] / FPS, f0 / FPS, it['seg'] / FPS
    TOTAL = f0 / FPS
    at = {it['id']: it for it in items}

    # ---- 4. filtre grafiği
    inputs, fc, afc, vlabels, alabels = [], [], [], [], []

    def add_input(*args):
        inputs.extend(args)
        return sum(1 for x in inputs if x == '-i') - 1

    for k, it in enumerate(items):
        if it['kind'] == 'clip':
            n = add_input('-i', str(work / f"{it['id']}.mp4"))
            v = f"[{n}:v]trim=start_frame={it['hin']}:end_frame={it['nf'] - it['hout']},setpts=PTS-STARTPTS"
            if it['id'] == FADE_IN_AT:
                v += f",fade=t=in:st=0:d={FADE_IN_SEC}"
            if it['id'] == FADE_OUT_AT:
                v += f",fade=t=out:st={it['len'] - FADE_OUT_SEC:.4f}:d={FADE_OUT_SEC}"
            fc.append(v + f'[v{k}]')
            # ses: klibin tamamı kendi karelerine hizalı; bindirme bölgelerinde çapraz geçiş
            D, hin, hout = it['nf'] / FPS, it['hin'] / FPS, it['hout'] / FPS
            af = f'asetpts=PTS-STARTPTS,atrim=0:{D:.5f}'
            if hin:
                af += f",afade=t=in:st=0:d={2 * hin:.4f}:curve=qsin"
            if it['id'] == FADE_IN_AT:
                af += f',afade=t=in:st=0:d={FADE_IN_SEC}'
            if hout:
                af += f",afade=t=out:st={D - 2 * hout:.4f}:d={2 * hout:.4f}:curve=qsin"
            if it['id'] == FADE_OUT_AT:
                af += f",afade=t=out:st={D - FADE_OUT_SEC:.4f}:d={FADE_OUT_SEC}"
            if it['id'] == END_AFTER:
                af += f",afade=t=out:st={max(0, D - 1.5):.4f}:d=1.5"
            delay = max(0, int(round((it['f0'] - it['hin']) / FPS * 1000)))
            afc.append(f"[{n}:a]{af},adelay={delay}:all=1[a{k}]")
            alabels.append(f'[a{k}]')
        elif it['kind'] == 'black':
            fc.append(f"color=c=black:s={W}x{H}:r={FPS:g},trim=end_frame={it['seg']},format=yuv420p,setsar=1[v{k}]")
        else:
            n = add_input('-loop', '1', '-framerate', f'{FPS:g}', '-i', str(it['png']))
            fc.append(f"[{n}:v]scale={W}:{H},format=yuv420p,setsar=1,trim=end_frame={it['seg']},setpts=PTS-STARTPTS,"
                      f"fade=t=in:st=0:d={CARD_FADE},fade=t=out:st={it['len'] - CARD_FADE:.4f}:d={CARD_FADE}[v{k}]")
        vlabels.append(f'[v{k}]')
    fc.append(''.join(vlabels) + f'concat=n={len(vlabels)}:v=1:a=0[vcat]')

    # telefon mesajları
    vcur = 'vcat'
    for j, (cid, (png, s_off, e_off)) in enumerate(MESSAGES.items()):
        it = at.get(cid)
        if not it or it['kind'] != 'clip':
            continue
        s = it['start'] + (s_off if s_off >= 0 else it['len'] + s_off)
        e = it['start'] + (e_off if e_off >= 0 else it['len'] + e_off)
        n = add_input('-loop', '1', '-framerate', f'{FPS:g}', '-t', f'{TOTAL:.3f}', '-i', str(HERE / 'kartlar' / png))
        fc.append(f"[{n}:v]scale={W}:{H},format=rgba,fade=t=in:st={s:.3f}:d={MSG_FADE}:alpha=1,"
                  f"fade=t=out:st={e - MSG_FADE:.3f}:d={MSG_FADE}:alpha=1[m{j}]")
        fc.append(f"[{vcur}][m{j}]overlay=enable='between(t,{s:.3f},{e:.3f})':format=auto[vm{j}]")
        vcur = f'vm{j}'
    fc.append(f'[{vcur}]fps={FPS:g},format=yuv420p[vout]')

    # yağmur katmanı (1–4. sahne)
    rain_end = at[RAIN_UNTIL]['end']
    rain = find_audio('yagmur')
    if rain:
        n = add_input('-stream_loop', '-1', '-i', str(rain))
        afc.append(f"[{n}:a]atrim=0:{rain_end:.3f},asetpts=PTS-STARTPTS,aresample=48000,"
                   f"aformat=channel_layouts=stereo,volume=0.35[rainsrc]")
    else:
        afc.append(f"anoisesrc=c=pink:r=48000:a=0.5:d={rain_end:.3f},highpass=f=500,lowpass=f=7000,"
                   f"tremolo=f=0.23:d=0.18,volume=0.09,aformat=channel_layouts=stereo[r1]")
        afc.append(f"anoisesrc=c=brown:r=48000:a=0.6:d={rain_end:.3f},lowpass=f=280,volume=0.05,"
                   f"aformat=channel_layouts=stereo[r2]")
        afc.append('[r1][r2]amix=inputs=2:normalize=0[rainsrc]')
        warn.append('sesler/yagmur.* yok: yağmur katmanı sentezlendi (gerçek bir kayıt daha iyi olur)')
    afc.append(f"[rainsrc]afade=t=in:st=0:d=3,afade=t=out:st={rain_end - RAIN_FADE_OUT:.3f}:d={RAIN_FADE_OUT}[rain]")
    alabels.append('[rain]')

    # finaldeki piyano
    piano = find_audio('final-piyano')
    if piano:
        p_start = at[END_AFTER]['end'] - 2.0
        n = add_input('-i', str(piano))
        fade_at = max(0.0, TOTAL - p_start - 3.0)
        afc.append(f"[{n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{TOTAL - p_start:.3f},"
                  f"asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.5,afade=t=out:st={fade_at:.3f}:d=3,"
                  f"adelay={int(p_start * 1000)}:all=1,volume=0.8[piano]")
        alabels.append('[piano]')
    else:
        warn.append('sesler/final-piyano.* yok: 8-03 sonrası karanlık ve jenerik sessiz geçiyor')

    afc.append(''.join(alabels) + f'amix=inputs={len(alabels)}:normalize=0:duration=longest,'
               f'apad,atrim=0:{TOTAL:.3f},aresample=48000[amixed]')

    # ses yüksekliği: iki geçiş, doğrusal (tek geçişli dinamik mod diyalogda pompalar)
    print('Ses ölçülüyor…')
    s1 = work / 'ses-olcum.txt'
    s1.write_text(';\n'.join(afc + ['[amixed]loudnorm=I=-16:TP=-1.5:LRA=15:print_format=json[aout]']), encoding='utf-8')
    r = run(['-y', *inputs, '-filter_complex_script', str(s1), '-map', '[aout]', '-f', 'null', '-'], quiet=False)
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr, re.S)
    if not m:
        die('ses ölçümü okunamadı')
    ms = json.loads(m.group(0))
    loud = (f"loudnorm=I=-16:TP=-1.5:LRA=15:measured_I={ms['input_i']}:measured_TP={ms['input_tp']}:"
            f"measured_LRA={ms['input_lra']}:measured_thresh={ms['input_thresh']}:offset={ms['target_offset']}:linear=true")
    afc.append(f'[amixed]{loud},aresample=48000[aout]')

    script = work / 'grafik.txt'
    script.write_text(';\n'.join(fc + afc), encoding='utf-8')
    enc = ['-c:v', 'libx264', '-preset', 'veryfast' if a.hizli else 'medium', '-crf', '20' if a.hizli else '18',
           '-r', f'{FPS:g}', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
    print(f'Kurgu: {len(items)} parça, {fmt(TOTAL)} — kodlanıyor…')
    run(['-y', *inputs, '-filter_complex_script', str(script), '-map', '[vout]', '-map', '[aout]',
         '-t', f'{TOTAL:.3f}', *enc, str(out)], quiet=False)

    # ---- 5. özet
    lines = [f'Son Sefer — kurgu zaman çizelgesi ({fmt(TOTAL)})', '']
    for it in items:
        lines.append(f"{fmt(it['start'])} – {fmt(it['end'])}  {it['id']:<9} {it['kind']}")
    if warn:
        lines += ['', 'Uyarılar:'] + [f'  - {w}' for w in warn]
    (out.parent / 'zaman-cizelgesi.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'\nBitti → {out}  ({fmt(TOTAL)})')
    for w in warn:
        print(f'  uyarı: {w}')


if __name__ == '__main__':
    main()
