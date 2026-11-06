# NOVA 3D Dünya Altyapısı — Unreal Engine 5.8.4

Bu klasör, NOVA'nın farklı türlerde 3D oyun dünyalarını aynı ana altyapı üzerinde geliştirebilmesi için hazırlanan Unreal Engine C++ projesidir.

## Şu anki test prototipi

- Unreal Engine 5.8.4 hedefli C++ çalışma zamanı modülü.
- Birinci şahıs karakter: WASD hareket, fareyle bakış, Space ile zıplama, Left Shift ile koşma.
- Play başladığında otomatik oluşturulan test zemini ve yönlü ışık.
- Play başladığında otomatik oluşturulan 3×3 tabanlı, 3 katlı, 27 ayrı fizik gövdeli blok bina.
- **E tuşuyla** karakterin çevresindeki fizik etkin Static Mesh aktörlerine deprem prototipi darbesi.
- Deprem darbe gücü ve etki yarıçapı karakter sınıfında düzenlenebilir özelliklerdir.
- Veri odaklı dünya tanımı: oyun türü, başlangıç haritası, etkin sistemler ve gerekli varlık listesi.

## Ege için açma ve test etme

1. ZIP'i yeni bir klasöre çıkart.
2. `nova-ai/unreal/NovaWorld.uproject` dosyasını Unreal Engine 5.8.4 ile aç.
3. Modül yeniden derleme sorusu gelirse **Yes / Evet** seç.
4. Editör açıldığında boş bir seviye oluşturup kaydet; test alanı Play sırasında otomatik oluşturulur.
5. **Play** tuşuna bas.
6. WASD ile hareket et, fareyle bak, Space ile zıpla ve Shift ile koş.
7. Blok binaya yaklaş ve **E** tuşuna bas. Yakındaki fizik etkin bloklara darbe uygulanır.

## Test kapsamı ve sınırlar

Bu aşama bir gri-kutu oynanabilirlik prototipidir. Blokların fizik motoruyla hareket etmesi hedeflenir; gerçekçi beton/çelik davranışı, kolon-kiriş taşıyıcı sistemleri, kat kat hasar, kontrollü parçalanma, enkaz simülasyonu veya mühendislik doğruluğunda deprem modeli değildir. Gerçek davranış Unreal 5.8.4 editöründe Play testiyle doğrulanmalıdır.

GitHub'daki statik doğrulayıcı dosya yapısını ve bazı kaynak kod beklentilerini denetler; Unreal Engine C++ derlemesi veya oyunun çalıştığını kanıtlamaz. Unreal Engine'in kurulu olduğu Windows bilgisayarında derleme ve Play testi ayrıca yapılmalıdır.

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
- Deprem dalgası, bina hasarı, kontrollü parçalanma ve gelişmiş fizik.
- İkinci oyun türünün özel mekanikleri.
- NOVA Desktop üzerinden oyun indirme, güncelleme ve başlatma entegrasyonu.
- Paketlenmiş Windows oyunu.
