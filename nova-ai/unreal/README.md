# NOVA 3D Dünya Altyapısı — Unreal Engine 5.8.4

Bu klasör, NOVA'nın farklı türlerde 3D oyun dünyalarını aynı ana altyapı üzerinde geliştirebilmesi için hazırlanmış Unreal Engine C++ projesidir.

## Şu an projede bulunanlar

- Unreal Engine 5.8.4 hedefli C++ çalışma zamanı modülü.
- Birinci şahıs karakter: WASD hareket, fareyle bakış, Space ile zıplama, Shift ile koşma.
- Veri odaklı dünya tanımı: oyun türü, başlangıç haritası, etkin sistemler ve gerekli varlık listesi.
- Play'e basıldığında otomatik oluşturulan başlangıç test alanı: zemin, birkaç ölçek referansı küpü ve yönlü ışık.
- Gelecekteki oyun türlerini birbirinden ayırmaya uygun modüler mimari.

## Ege için açma ve test etme

1. ZIP'i yeni bir klasöre çıkart.
2. `nova-ai/unreal/NovaWorld.uproject` dosyasını Unreal Engine 5.8.4 ile aç.
3. Modül yeniden derleme sorusu gelirse **Yes / Evet** seç.
4. Editör açıldıktan sonra boş bir seviye oluşturup kaydetmen yeterlidir; test alanı Play sırasında otomatik oluşturulur.
5. **Play** tuşuna bas. WASD ile hareket et, fareyle etrafa bak, Space ile zıpla, Shift ile koş.

## Türkçe kullanımı

Oyuncuya görünen menü, görev, açıklama ve arayüz metinleri Türkçe hazırlanacaktır. Unreal ve C++ kaynak kodlarının teknik sınıf, dosya ve API adları motor uyumluluğu için İngilizce kalabilir.

## Uzun vadeli mimari

NOVA her oyun isteğinde sıfırdan ayrı bir Unreal projesi üretmemelidir. Bunun yerine:

1. Yapay zekâ, isteği yapılandırılmış bir dünya tanımına dönüştürür.
2. Doğrulayıcı; desteklenen oyun türlerini, varlık kimliklerini, sistemleri, performans bütçelerini ve güvenlik sınırlarını kontrol eder.
3. Çalışma zamanı uygun dünya tanımını, haritayı, varlıkları ve izin verilen oyun sistemlerini yükler.
4. Deprem deneyimi, yarış oyunu veya başka bir tür kendi bağımsız oyun paketi olarak eklenir.
5. Ortak kontroller, kayıt, ses, fizik ve performans altyapısı yeniden kullanılır.

Yapay zekâ, kullanıcı metninden rastgele C++ kodu üretip çalıştırmamalıdır. Üretilen dünya tanımları, yalnızca izin verilen çalışma zamanı sistemleri tarafından yorumlanan veriler olmalıdır.

## Henüz tamamlanmayanlar

- Gerçekçi apartman, daire içi, sokak, çevre ve karakter sanat varlıkları.
- Deprem dalgası, bina hasarı, parçalanma ve gelişmiş fizik.
- İkinci oyunun türüne özel mekanikler.
- NOVA Desktop üzerinden oyun indirme, güncelleme ve başlatma entegrasyonu.
- Paketlenmiş Windows oyunu.

GitHub doğrulamaları dosya yapısını ve bazı kaynak beklentilerini kontrol eder; Unreal Engine'in kendisi GitHub'ın standart çalıştırıcılarında kurulu değildir. Bu nedenle gerçek C++ derlemesi ve Windows paketlemesi, Unreal Engine 5.8.4 bulunan bilgisayarda ayrıca doğrulanmalıdır.
