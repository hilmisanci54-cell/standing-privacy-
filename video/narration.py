# -*- coding: utf-8 -*-
NARR = [
 ("ext", "Dışarıdan bakınca sıradan bir depo. Penceresi yok; çünkü içeride bakılacak bir manzara değil, "
         "sabit sıcaklıkta tutulması gereken bir makine salonu var. Çatıdaki üniteler soğutma grupları, "
         "yandaki saha trafolar, şu konteynerler ise dizel jeneratörler."),
 ("sec", "Giriş tek kapı değil. Arka arkaya iki kilitli kapı var; buna mantrap deniyor. "
         "Kart okutuluyor, avuç içi damar deseni doğrulanıyor. "
         "Birinci kapı kapanmadan ikincisi açılmıyor, böylece içeri bir seferde tek kişi giriyor."),
 ("aisle", "Kapının ardı salon. Kabinler yüz yüze diziliyor ve aradaki koridorun üstü kapatılıyor. "
           "Yükseltilmiş döşemenin altından gelen yirmi derecelik hava, delikli panellerden bu koridora çıkıp "
           "doğrudan sunucuların önüne giriyor. Tavandaki tavalarda güç ve fiber ayrı katmanlarda ilerliyor."),
 ("rack", "Bir kabine yakından bakalım. Yükseklik U ile ölçülüyor; bir U, kırk dört buçuk milimetre. "
          "Tepede iki ağ anahtarı ve patch panel var; altında sunucular, GPU düğümleri ve disk rafları. "
          "Boş yuvalar kör panelle kapatılıyor, yoksa soğuk hava cihazlara uğramadan kaçıyor. "
          "İki yanda birbirinden bağımsız A ve B güç çubukları."),
 ("net", "Ağ, iki ayrı internet sağlayıcısıyla başlıyor. Kenar yönlendiriciler ve güvenlik duvarlarından sonra "
         "omurga geliyor: her leaf anahtarı, her spine anahtarına bağlı. "
         "Böylece iki kabin arasındaki yol her zaman aynı uzunlukta oluyor ve tek bir cihazın arızası trafiği kesmiyor."),
 ("stor", "Veri üç katmanda duruyor. Sıcak veri NVMe rafında. Büyük hacim disk raflarında, silme kodlamasıyla "
          "altı veri ve iki eşlik parçasına bölünüp farklı düğümlere dağıtılıyor; "
          "bir düğüm tamamen kaybolsa bile veri kalan parçalardan geri kuruluyor. "
          "Arşiv ise robot kollu teyp kütüphanesinde bekliyor."),
 ("cool", "Isının bir yere gitmesi gerekiyor. Klima santralleri soğuk suyla havayı soğutup döşeme altına basıyor. "
          "Cihazlardan on beş derece ısınmış çıkan hava, arkadan tavana yükselip geri dönüyor. "
          "Çatıdaki soğutma grubu ısıyı dışarı atıyor; hava yeterince soğuksa bu grup kapatılıp serbest soğutma yapılıyor."),
 ("pwr", "Şimdi en kritik kısım. Şebeke, trafo, transfer şalteri, kesintisiz güç kaynağı, ve kabin. "
         "Şebekeyi keselim: aküler on milisaniyenin altında devralıyor. "
         "Jeneratör çalışıp devrine ulaşıyor, şalter beslemeyi ona aktarıyor, aküler yeniden doluyor. "
         "Kabinlerdeki cihazlar bunların hiçbirini fark etmiyor."),
 ("noc", "Bütün tesis tek bir duvardan izleniyor. Koridor sıcaklığı, kabin başına güç, omurga trafiği, açık alarmlar. "
         "P U E, tesisin harcadığı toplam enerjinin, yalnızca cihazların harcadığına oranı. "
         "Bir virgül yirmi sekiz demek: her bir watt bilişim için, fazladan sıfır virgül yirmi sekiz watt."),
 ("out", "Geri çekilince tamamı görünüyor. İki bilişim salonu, akü ve kesintisiz güç odası, jeneratör sahası, "
         "soğutma tesisatı, güvenlikli giriş ve kargo kabulü. "
         "İki bin dört yüz metrekare, yüz altmış sekiz kabin, iki megavat. "
         "Bulut dediğimiz şey, sonuçta böyle bir binanın içinde duruyor."),
]
