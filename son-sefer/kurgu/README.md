# Son Sefer — kurgu

Kaydedicinin ürettiği 64 klibi, çekim listesinin **"Kurgu ve son işlem"** sayfasına göre tek
filme dönüştürür.

```bash
python3 kurgu.py
```

Klipleri `../kaydedici/clips/` klasöründen okur. Çıktılar:
- `cikti/son-sefer.mp4`: H.264 + AAC, −16 LUFS
- `cikti/zaman-cizelgesi.txt`: her parçanın filmdeki yeri, varsa uyarılar

**Gereksinim:** Python 3.9+ ve libx264 içeren bir ffmpeg. ffmpeg kurulu değilse
`pip install imageio-ffmpeg` yeterli.

## Yaptıkları

| Çekim listesinde | Betikte |
|---|---|
| Her kesmede sesi 0,3–0,5 sn bindir | 0,4 sn eşit güçlü çapraz geçiş (aşağıdaki nota bakın) |
| Sahne 1–4 altına sürekli yağmur, 4'ün sonunda azalt | `sesler/yagmur.*` varsa o, yoksa sentez; son 8 sn'de azalır |
| 4-14 sonunda 2–3 sn'de karart, 5-01'i karadan aç | 2,5 sn kararma, 0,7 sn siyah, 1,5 sn açılış |
| 8-01 / 8-02'ye telefon mesajı | 8-01'de giden balon, 8-02'de gelen bildirim (`kartlar/`) |
| 8-03'te kapı kapanınca karart, piyano karanlıkta 5–8 sn | 6 sn karanlık; piyano `sesler/final-piyano.*` dosyasından |
| "SON" ve jenerik | `kartlar/son.png`, `kartlar/jenerik.png` |

Bunlara ek olarak:
- Kaydedicinin her klibin başında ve sonunda bıraktığı **siyah payları kırpar**. Yalnızca saf
  siyaha bakar; gece sahnelerinin karanlığına dokunmaz.
- Boyutu ve kare hızını ilk klipten alır, hepsini ona eşitler.
- `.webm` yedek kayıtları da kabul eder ve kullandığında uyarır.

## Seçenekler

```bash
python3 kurgu.py --taslak          # eksik klipler yerine siyah: üretim sürerken ara kurgu
python3 kurgu.py --hizli           # hızlı, düşük kaliteli kodlama: kontrol için
python3 kurgu.py --klipler /yol    # klipler başka bir klasördeyse
```

Temizlenmiş ara klipler `cikti/.ara/` klasöründe önbelleğe alınır. Tek bir klibi
değiştirdiğinizde yalnızca o yeniden işlenir.

## İsteğe bağlı sesler

`sesler/` klasörüne koyun. Uzantı `.wav`, `.mp3`, `.m4a`, `.flac` ya da `.ogg` olabilir.

- **`yagmur.*`**: 1–4. sahnelerin altındaki sürekli yağmur. Yoksa betik sentezler; işe yarar
  ama gerçek bir kayıt daha iyi durur.
- **`final-piyano.*`**: 8-03'ün son iki saniyesinde girer; karanlık, "SON" ve jenerik boyunca
  sürer. Yoksa o bölüm sessiz geçer. Çekim listesi de 8-03'ün kendi piyanosu zayıf çıkarsa bunu
  öneriyor.

## Ayarlar

`kurgu.py` dosyasının başında. En çok dokunulacak olan **mesaj zamanlaması**:

```python
MESSAGES = {'8-01': ('mesaj-giden.png', -3.8, -0.4),   # klibin sonundan 3,8 → 0,4 sn önce
            '8-02': ('mesaj-gelen.png', 2.5, 7.0)}     # klibin 2,5. → 7. saniyesi
```

Deniz'in "gönder"e bastığı ve Ece'nin telefonu kaldırdığı an üretilen klibe göre değişir. Klipleri
izledikten sonra bu sayıları ayarlayın.

Jenerik metni `jenerik.txt` dosyasında. Değiştirdikten sonra kartları yeniden çizin
(Node ve Chrome gerekir, kaydedicinin istediklerinin aynısı):

```bash
node kartlar.mjs
```

## Ses bindirmesi hakkında

Klipler ayrı ayrı üretildiği için kesme noktasının ötesinde fazladan ses yok. 0,4 sn'lik
bindirme bu yüzden şöyle kuruluyor: her klibin görüntüsünden başta ve sonda 5'er kare
(24 fps'de 0,21 sn) kırpılıyor, sesi ise tam uzunlukta kalıyor. Böylece her kesmede bir önceki
klibin sesi 0,2 sn sarkıyor, sonrakinin sesi 0,2 sn önce giriyor; ikisi eşit güçle geçiş yapıyor.
Ses her klipte kendi görüntüsüne hizalı kaldığı için dudak senkronu bozulmuyor. Bedeli şu:
film 11:04 yerine yaklaşık 10:38 sürüyor, ardından karanlık ve kartlar geliyor.

Zaman çizelgesi kare cinsinden hesaplanıyor. Test kurgusunda 64 klibin hepsinde ses-görüntü
farkı bir karenin altında çıktı ve filmin başından sonuna kayma −1 ms.
