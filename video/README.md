# Veri Merkezi Turu — sesli video

`veri-merkezi-turu.html` sayfasını Türkçe anlatımlı bir MP4'e çevirir.

```bash
pip install imageio-ffmpeg espeakng-loader
python3 video/build.py                    # espeak-ng sesi (kısıtsız, robotik)
python3 video/build.py --tts gemini       # Gemini TTS (GEMINI_API_KEY gerekir)
```

Çıktı: `video/build/veri-merkezi-turu-sesli.mp4` (+ `.srt` altyazı). 4,5 dakikalık video ≈ 10 dakika sürer.

## Nasıl çalışır

1. **Seslendirme** — `narration.py` içindeki 10 bölüm metni seçilen motorla WAV'a çevrilir.
2. **Zamanlama** — her bölümün süresi kendi anlatımına göre ayarlanır (1 sn giriş + konuşma + 1,4 sn kuyruk).
   Sayfanın kendisine dokunulmaz; yeni süreler yalnızca çekim kopyasına (`build/render_vo.html`) yazılır.
3. **Ses miksi** — anlatım bölüm başlarına yerleşir; altına fan uğultusu döşenir, konuşurken yan zincir
   kompresörüyle kısılır; −16 LUFS'a normalize edilir.
4. **Kare çekimi** — `rec.js`, headless Chromium'u DevTools protokolüyle sürer. Her karede zaman çizgisi ve
   tüm CSS animasyonları (`document.getAnimations()`) aynı ana sabitlenir; kareler doğrudan ffmpeg'e akar.
5. **Birleştirme** — H.264 + AAC, 1280×720, 30 fps.

## Seçenekler

| Bayrak | Açıklama |
|---|---|
| `--tts espeak\|gemini` | Ses motoru |
| `--model`, `--voice`, `--style` | Gemini modeli, hazır ses adı (Charon, Kore, Puck…), okuma tarzı |
| `--list-models` | Hesabınızda TTS destekli Gemini modellerini listeler |
| `--limit N` | Yalnızca ilk N kareyi çeker (hızlı deneme) |
| `--no-render` | Yalnızca ses ve altyazı |

## Lisans notu

Görüntü, kod ve gömülü yazı tipleri (SIL OFL) her kullanıma açıktır. Kısıt yalnızca seste olabilir:
espeak-ng çıktısı kısıtsızdır; Gemini TTS çıktısı Google'ın kullanım şartlarına tabidir.
