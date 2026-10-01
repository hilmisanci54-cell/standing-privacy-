# Son Sefer

8 sahne, 64 klip, ~11 dakikalık kısa film. Reactor'ın **FastH3** modeliyle üretiliyor.

| Klasör | Ne işe yarar |
|---|---|
| `cekim-listesi.json` | Çekim listesi, makinenin okuyacağı biçimde: 64 prompt, süreler, açılış kareleri, zincirler |
| [`kaydedici/`](kaydedici/README.md) | 64 klibi FastH3 ile sırayla üretip `clips/` klasörüne kaydeder. **Kendi bilgisayarınızda** çalışır. |
| [`kurgu/`](kurgu/README.md) | Klipleri kesme, ses bindirme, yağmur, kararma, mesaj, "SON" ve jenerikle tek filme dönüştürür |

## Sıra

1. Sekiz açılış karesini ayrı bir görsel modelinde üretip `kaydedici/frames/` klasörüne koyun.
2. `kaydedici/` → önce **Test** (1-04 + 1-06), sonra sahneler. Klipler `kaydedici/clips/` klasörüne iner.
3. `kurgu/` → `python3 kurgu.py` → `kurgu/cikti/son-sefer.mp4`.

Üretim sürerken ara kurgu için: `python3 kurgu.py --taslak --hizli`.
