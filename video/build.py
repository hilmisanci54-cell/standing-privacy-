#!/usr/bin/env python3
"""Veri Merkezi Turu — sesli video üretimi, uçtan uca.

  python3 video/build.py                         # espeak-ng ile (kısıtsız, robotik)
  python3 video/build.py --tts gemini            # Gemini TTS (GEMINI_API_KEY gerekir)
  python3 video/build.py --tts gemini --voice Charon --style "sakin bir belgesel anlatıcısı gibi"
  python3 video/build.py --no-render             # yalnızca ses; mevcut videoyla birleştirmez
  python3 video/build.py --limit 60              # hızlı deneme: ilk 60 kare

Gereksinimler: pip install imageio-ffmpeg espeakng-loader
Çıktı: video/build/veri-merkezi-turu-sesli.mp4
"""
import argparse, base64, io, json, os, re, subprocess, sys, time, urllib.request, urllib.error, wave

HERE  = os.path.dirname(os.path.abspath(__file__))
REPO  = os.path.dirname(HERE)
BUILD = os.environ.get('BUILD_DIR', os.path.join(HERE, 'build'))
PAGE  = os.path.join(REPO, 'veri-merkezi-turu.html')
ORDER = ['ext', 'sec', 'aisle', 'rack', 'net', 'stor', 'cool', 'pwr', 'noc', 'out']
LEAD, TAIL = 1.0, 1.4          # anlatım bölüm başından 1 sn sonra girer, 1,4 sn kuyruk bırakır
FONTS = ('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700'
         '&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

sys.path.insert(0, HERE)
from narration import NARR


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def fetch(url, headers=None, data=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def wav_dur(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def write_wav(path, pcm, rate):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)


# ---------------------------------------------------------------- yazı tipleri
def inline_fonts():
    """Google Fonts'u latin + latin-ext yüzleriyle data URI olarak gömer (çekim kopyası için)."""
    out = os.path.join(BUILD, 'fonts_inline.css')
    if os.path.exists(out):
        return open(out, encoding='utf-8').read()
    css = fetch(FONTS, {'User-Agent': UA}).decode()
    parts, faces = re.split(r'(/\*[^*]+\*/)', css), []
    for i in range(1, len(parts), 2):
        if parts[i].strip('/* ').strip() not in ('latin', 'latin-ext'):
            continue
        body = parts[i + 1]
        m = re.search(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', body)
        if m:
            b64 = base64.b64encode(fetch(m.group(1))).decode()
            faces.append(body.replace(m.group(1), 'data:font/woff2;base64,' + b64).strip())
    css = '\n'.join(faces)
    open(out, 'w', encoding='utf-8').write(css)
    print(f'  yazı tipi: {len(faces)} yüz gömüldü')
    return css


# ---------------------------------------------------------------- seslendirme
def synth_espeak(text, path, a):
    from tts_espeak import say
    say(text, path, voice='tr', wpm=172, pitch=40, gap=8, volume=130)


def synth_gemini(text, path, a):
    """Gemini TTS: ham PCM (s16le, 24 kHz, mono) döner, WAV'a yazılır."""
    key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not key:
        sys.exit('GEMINI_API_KEY ortam değişkeni yok. Ortam ayarlarından ekleyip yeni oturum açın.')
    prompt = f'{a.style}: {text}' if a.style else text
    body = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': a.voice}}},
        },
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent'
    hdr = {'Content-Type': 'application/json', 'x-goog-api-key': key}
    for attempt in range(5):
        try:
            d = json.loads(fetch(url, hdr, json.dumps(body).encode(), timeout=180))
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:300]
            if e.code in (429, 500, 503) and attempt < 4:
                wait = 2 ** (attempt + 2)
                print(f'    {e.code}, {wait} sn sonra yeniden denenecek'); time.sleep(wait); continue
            sys.exit(f'Gemini API hatası {e.code}: {msg}')
    part = d['candidates'][0]['content']['parts'][0]['inlineData']
    rate = int(re.search(r'rate=(\d+)', part.get('mimeType', '')).group(1)) \
        if 'rate=' in part.get('mimeType', '') else 24000
    write_wav(path, base64.b64decode(part['data']), rate)


def gemini_models():
    key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    d = json.loads(fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
                         {'x-goog-api-key': key}))
    return [m['name'].split('/')[-1] for m in d.get('models', []) if 'tts' in m['name']]


# ---------------------------------------------------------------- plan ve çekim kopyası
def make_plan(durs):
    lens = {c: round(durs[c] + LEAD + TAIL, 1) for c in ORDER}
    starts, acc = {}, 0.0
    for c in ORDER:
        starts[c] = round(acc, 3); acc += lens[c]
    return {'dur': round(acc, 3), 'starts': starts, 'lens': lens}


def build_render_page(plan):
    s = open(PAGE, encoding='utf-8').read()
    s = re.sub(r'<link rel="preconnect"[^>]*>\n', '', s)
    s = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>',
               lambda m: '<style>\n' + inline_fonts() + '\n</style>', s, count=1)
    for c in ORDER:
        s, k = re.subn(r"(\{ id:'%s',\s*d:\s*)[\d.]+" % c,
                       lambda m: m.group(1) + str(plan['lens'][c]), s, count=1)
        assert k == 1, f'bölüm bulunamadı: {c}'
    s = s.replace('</body>', '''<style>
  html,body{margin:0;background:#000;overflow:hidden}
  .wrap{max-width:none;margin:0;padding:0}
  .wrap > :not(.player){display:none !important}
  .player{border:0;border-radius:0;box-shadow:none;background:#000}
  .player > :not(.stage){display:none !important}
  .stage{border:0;border-radius:0;width:1280px;height:720px;aspect-ratio:auto;cursor:default}
  .bigplay,.endcard{display:none !important}
</style>
<script>
/* kare kare çekim: zaman çizgisini ve CSS animasyonlarını aynı ana sabitler */
window.__frame = function(T){
  seek(T); render(T);
  for (const a of document.getAnimations()){ try { a.currentTime = T * 1000; } catch(e){} }
  return true;
};
window.__dur = DUR;
</script>
</body>''')
    out = os.path.join(BUILD, 'render_vo.html')
    open(out, 'w', encoding='utf-8').write(s)
    return out


# ---------------------------------------------------------------- ses miksi
def mix(plan, out):
    """Anlatım klipleri + fan uğultusu; uğultu konuşurken yan zincirle kısılır, −16 LUFS."""
    D = plan['dur']
    cmd = [ffmpeg(), '-y', '-hide_banner', '-loglevel', 'error']
    for c in ORDER:
        cmd += ['-i', os.path.join(BUILD, f'vo_{c}.wav')]
    cmd += ['-f', 'lavfi', '-i', f'anoisesrc=c=brown:r=48000:a=0.6:d={D}',
            '-f', 'lavfi', '-i', f'sine=f=117:r=48000:d={D}',
            '-f', 'lavfi', '-i', f'sine=f=233:r=48000:d={D}']
    f = []
    for i, c in enumerate(ORDER):
        ms = int(round((plan['starts'][c] + LEAD) * 1000))
        f.append(f'[{i}]aresample=48000,aformat=channel_layouts=mono,adelay={ms}[v{i}]')
    f.append(''.join(f'[v{i}]' for i in range(10)) +
             'amix=inputs=10:normalize=0,volume=2.6,asplit=2[voA][voB]')
    f += ['[10]lowpass=f=430,volume=0.34[b0]', '[11]volume=0.022[b1]', '[12]volume=0.013[b2]',
          '[b0][b1][b2]amix=inputs=3:normalize=0[bed0]',
          '[bed0][voB]sidechaincompress=threshold=0.025:ratio=9:attack=25:release=500[bed]',
          '[voA][bed]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,'
          'aresample=48000,aformat=channel_layouts=stereo[out]']
    cmd += ['-filter_complex', ';'.join(f), '-map', '[out]', '-t', str(D), out]
    subprocess.run(cmd, check=True)


def srt(plan, durs, out):
    ts = lambda x: ('%02d:%02d:%06.3f' % (x // 3600, (x % 3600) // 60, x % 60)).replace('.', ',')
    lines = []
    for i, (c, text) in enumerate(NARR, 1):
        t = plan['starts'][c] + LEAD
        lines += [str(i), f'{ts(t)} --> {ts(t + durs[c])}', text, '']
    open(out, 'w', encoding='utf-8').write('\n'.join(lines))


# ---------------------------------------------------------------- ana akış
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--tts', choices=['espeak', 'gemini'], default='espeak')
    ap.add_argument('--model', default='gemini-2.5-flash-preview-tts')
    ap.add_argument('--voice', default='Charon', help='Gemini hazır ses adı (ör. Charon, Kore, Puck)')
    ap.add_argument('--style', default='Sakin, net ve sıcak bir belgesel anlatıcısı gibi Türkçe oku')
    ap.add_argument('--list-models', action='store_true', help='TTS destekli Gemini modellerini listele')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--limit', type=int, default=0, help='yalnızca ilk N kareyi çek (deneme)')
    ap.add_argument('--no-render', action='store_true')
    a = ap.parse_args()
    os.makedirs(BUILD, exist_ok=True)

    if a.list_models:
        print('\n'.join(gemini_models()) or '(TTS modeli bulunamadı)'); return

    print(f'1/5 seslendirme · motor: {a.tts}' + (f' · {a.model} · {a.voice}' if a.tts == 'gemini' else ''))
    synth = synth_gemini if a.tts == 'gemini' else synth_espeak
    durs = {}
    for c, text in NARR:
        p = os.path.join(BUILD, f'vo_{c}.wav')
        synth(text, p, a)
        durs[c] = wav_dur(p)
        print(f'    {c:<6} {durs[c]:5.1f} sn')

    plan = make_plan(durs)
    json.dump({'plan': plan, 'durs': durs, 'tts': a.tts}, open(os.path.join(BUILD, 'plan.json'), 'w'), indent=1)
    print(f'2/5 zamanlama · toplam {plan["dur"]:.1f} sn ({int(plan["dur"] // 60)}:{int(plan["dur"] % 60):02d})')

    audio = os.path.join(BUILD, 'tour_audio.wav')
    mix(plan, audio)
    srt(plan, durs, os.path.join(BUILD, 'veri-merkezi-turu.srt'))
    print('3/5 ses miksi + altyazı hazır')
    if a.no_render:
        return

    page = build_render_page(plan)
    video = os.path.join(BUILD, 'tour_video.mp4')
    print('4/5 kare çekimi (uzun sürer)')
    env = dict(os.environ, FFMPEG=ffmpeg())
    cmd = ['node', os.path.join(HERE, 'rec.js'), '--page', page, '--out', video, '--fps', str(a.fps)]
    if a.limit:
        cmd += ['--limit', str(a.limit)]
    subprocess.run(cmd, check=True, env=env)

    final = os.path.join(BUILD, 'veri-merkezi-turu-sesli.mp4')
    subprocess.run([ffmpeg(), '-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-i', audio,
                    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
                    '-shortest', '-movflags', '+faststart', final], check=True)
    print(f'5/5 bitti → {final}')


if __name__ == '__main__':
    main()
