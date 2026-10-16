# Son Sefer — kaydedici

`../cekim-listesi.json` içindeki 64 klibi FastH3 ile sırayla üretir ve her birini
`clips/1-01.mp4` … `clips/8-03.mp4` olarak kaydeder. **Kendi bilgisayarınızda** çalışır.

## Kurulum (bir kez)

1. **Node 18 veya üstü** ve Chrome/Edge gerekir. `npm install` gerekmez; arayüz derlenmiş halde gelir.
2. Sekiz açılış karesini `frames/` klasörüne koyun. Adlar birebir böyle olmalı:
   `bar.png`, `bar-onu.png`, `sokak.png`, `daire-gece.png`, `daire-sabah.png`, `mutfak.png`, `antre.png`, `sahanlik.png`
3. Bu klasörde `.env` adında bir dosya açıp anahtarınızı yazın:
   ```
   REACTOR_API_KEY=rk_...
   ```
   `.env` git'e girmez. Anahtar yalnızca yerel sunucuda kalır; tarayıcıya kısa ömürlü,
   yalnızca `reactor/fast-h3`'e yetkili bir JWT gider.

## Çalıştırma

```bash
node server.mjs
```

Tarayıcıda **http://localhost:5173** adresini açın.

1. **Test: 1-04 + 1-06.** İki klibi açılış karesi ve zincir olmadan, tek başına üretir:
   `clips/test_1-04.mp4`, `clips/test_1-06.mp4`. Dinleyin: Türkçe anlaşılıyor mu (1-04),
   ekran dışındaki Deniz'in repliği Ece'nin ağzına gitmiş mi (1-06)? Sorun varsa önce onu çözün.
2. **Sahneleri seçip "Seçili sahneleri üret".** Sahne 8'i sahne 7 ile birlikte seçin:
   8-02, 7-05'in son karesinden devam ediyor ve ikisi aynı oturumda olmalı.
3. Beğenmediğiniz klipte **↻ Yeniden**: aynı prompt, yeni seed. Yeni çekim
   `1-04_v2.mp4` olarak ayrı kaydedilir, hiçbir dosyanın üstüne yazılmaz. Kurguya girmesini
   istediğiniz çekimi `1-04.mp4` adıyla bırakın.
4. İşiniz bitince **Oturumu kapat**.

Her klibin seed'i, gerçek süresi ve dosya adı `clips/kayit.json` dosyasına yazılır ve
oturumlar arasında birikir.

## Bilmeniz gerekenler

- **Yeniden üretim yalnızca oturum açıkken mümkün.** `continue_from_clip_id` sadece aynı
  oturumdaki kliplere bağlanabiliyor; oturum kapanınca geçmiş silinir. Kapandıktan sonra
  bir sahneyi düzeltmek için o sahneyi baştan, açılış karesinden üretin.
- **Çekim listesinden bir fark:** liste oturum için `set_autoplay: true` ve
  `set_flush_on_clip_end: false` diyor. Kaydedici kayıt sırasında bunun tersini kullanır:
  klipler arasında siyah, oynatma tek tek. Sebebi şu: kayıt "son N saniye" diye isteniyor ve
  art arda oynayan kliplerde ağ gecikmesi her dosyanın başından birkaç yüz milisaniye
  kesebiliyor, bu da ilk heceyi götürebilir. Böylece her klip başında ve sonunda biraz siyah
  payla temiz kaydedilir; payları kurgu betiği kırpar. Klip içeriği değişmez: zincirleme her
  durumda sunucudaki temiz son kareden yapılır.
- **Sunucu kaydı başarısız olursa** (`RecorderDisabledError` vb.) kaydedici aynı klibi
  tarayıcıda da kaydetmiş olur ve onu `1-04.webm` olarak saklar. Kalitesi daha düşüktür;
  mümkünse o klibi yeniden üretin.
- Prompt sınırı modelin kendi sayımıyla **1024 token**. Aşan istek reddedilir, sessizce
  kesilmez. Çekim listesindeki 64 prompt'un hepsi sınırın çok altında.

## Deneme modu

**http://localhost:5173/?deneme** Reactor'a bağlanmadan tüm akışı 10× hızlı bir sahte
modelle çalıştırır. Dosyalar `deneme_` önekiyle kaydedilir. `?deneme&kayit-yok`
yedek kayıt yolunu dener; `?tani` ise SDK'nın yüklendiğini sınar.

## Sorun giderme

| Görülen | Sebep |
|---|---|
| `REACTOR_API_KEY bulunamadı` | `.env` dosyası yok ya da sunucu anahtarsız başlatıldı |
| `Unauthorized` / 401 | Anahtar yanlış veya iptal edilmiş |
| `frames/… bulunamadı` | Açılış karesinin adı veya yeri yanlış |
| `… klibine bağlı — o sahneyi de seçin` | Sahne 8 sahne 7 olmadan seçildi |
| `source clip is unknown or no longer retained` | Oturum kapanmış; sahneyi baştan üretin |

## Yeniden derleme (yalnızca `src/` değişirse)

```bash
npm install && npm run build
```
