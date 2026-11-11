# EYRION AI Desktop

EYRION AI web uygulamasını Windows masaüstü penceresinde çalıştıran Electron istemcisidir. Mevcut Render web/API servisini kullanır; masaüstü sürümünde Türkçe konuşma tanıma Transformers.js + Whisper Small ile cihaz üzerinde yapılır. Daha iyi Türkçe tanıma için Whisper Base yerine Whisper Small kullanılır; ilk kullanımda daha büyük bir model indirilir. Mikrofon sesi bir konuşma tanıma sunucusuna gönderilmez.

## Gereksinimler

- Windows 10/11 x64
- Node.js 22.17.0 veya üzeri
- npm

## Windows özellikleri

- Pencereyi kapatmak EYRION'u sonlandırmaz; sistem tepsisine küçültür.
- Tepsi simgesine çift tıklayarak EYRION'u tekrar aç.
- `Ctrl + Shift + Space`: EYRION penceresini göster/gizle.
- Tepsi menüsünden Windows açılışında otomatik başlatmayı açıp kapat.
- Tepsi menüsünden EYRION'u tamamen kapat.
- Windows bildirimleri güncelleme indirme durumunu bildirir.

## Klavye ve menü

- `Ctrl + R`: EYRION'u yenile
- `Ctrl + +`: Yakınlaştır
- `Ctrl + -`: Uzaklaştır
- `Ctrl + 0`: Yakınlaştırmayı sıfırla
- `Alt`: Gizli menüyü göster (Dosya, Görünüm, Yardım)
- Görünüm menüsünden tam ekranı aç/kapat.
- Yardım > Güncellemeleri denetle bölümünden güncellemeyi elle kontrol et.
- Yardım > EYRION AI Hakkında bölümünden kurulu sürümü gör.

## Bilgisayar Asistanı (Windows masaüstü)

- Dosya > Bilgisayar Asistanı menüsünden açılır.
- Not Defteri, Hesap Makinesi, Dosya Gezgini, Paint, Steam ve Discord sabit uygulama izin listesiyle başlatılır.
- Bilgisayar bilgilerini gösterir ve erişilebilir yerel sürücülerde dosya/klasör arar.
- Kullanıcı tarafından erişilebilen yerel sürücülerde dosya açma, klasör oluşturma, taşıma ve yeniden adlandırma işlemleri desteklenir.
- Windows ve uygulama sistem dizinleri genel aramada atlanır; tam konum belirtilirse erişim izinleri dahilinde aranıp açılabilir, ancak bu alanlarda değişiklik yapılamaz.
- Çalıştırılabilir dosyalar, betikler, kurulum paketleri ve Windows kısayolları genel dosya açma komutuyla çalıştırılamaz.
- Taşıma ve Geri Dönüşüm Kutusu işlemleri Windows onayı ister. Klasör oluşturma için masaüstü penceresindeki yerel onay penceresi kullanılır.
- Arama sınırına ulaşılırsa veya erişim izni olmayan klasörler bulunursa sonuçların kısmi olabileceği kullanıcıya bildirilir.
- Web sitesi bu IPC köprüsüne sahip değildir; özellik yerel Electron penceresi ve doğrulanmış üst-seviye IPC göndericisiyle sınırlıdır.
- Masaüstü sesli girişte tarayıcı SpeechRecognition/Web Speech servisi kullanılmaz; Whisper modeli ilk kullanımda internetten indirilir, konuşma çözümleme cihazda yapılır. Bu, Windows'un yerleşik Dikte motoruyla aynı şey değildir.

## Geliştirme

Bu klasörde:

```bash
npm install
npm start
npm test
```

## Windows kurulum dosyası

```bash
npm run make -- --platform=win32 --arch=x64
```

Kurulum paketi `out/make/squirrel.windows/x64/` altında üretilir.

## Otomatik güncelleme yayınlama

Windows Squirrel güncelleme dosyaları GitHub Releases üzerinden dağıtılır. Masaüstü `package.json` sürümünü artıran her değişiklik `main` dalına alındığında GitHub Actions aynı sürüm için `desktop-v<package-version>` etiketini ve GitHub Release'ini otomatik oluşturur; Windows Setup.exe, `.nupkg` ve `RELEASES` güncelleme manifestini yayımlar. İhtiyaç halinde `desktop-v<package-version>` etiketiyle manuel yayın da yapılabilir. Kurulu uygulama bu yayın kanalını denetler; güncelleme indirildiğinde EYRION'un animasyonlu güncelleme penceresi yeni özellikleri, iyileştirmeleri ve sürüm karşılaştırmasını gösterir; kurulum yalnızca kullanıcı onayıyla başlar.

Otomatik güncellemeler yalnızca paketlenmiş Windows uygulamasında çalışır. İlk kurulum yine Setup.exe ile yapılır. Actions derleme artefaktı tek başına otomatik güncelleme kaynağı değildir; güncellemenin çalışması için aynı sürümün GitHub Release'inde Setup.exe, `.nupkg` ve `RELEASES` dosyaları bulunmalıdır.

## Alpha 35 masaüstü ajanı

- Sık kullanılan Windows işlemleri için yerel Türkçe komutlar: yerel tarih/saat, açık pencereler, erişilebilir ekran özeti, CPU/RAM ve pil bilgisi.
- Not Defteri gibi izinli uygulamaları açıp tek komutta metin yazma.
- YouTube ana sayfasını açma, arama yapma ve belirli video isteklerinde ekranı inceleyerek devam adımını planlama.
- Fare hareketi hedefe anında sıçramak yerine sınırlı süreli yumuşak hızlanma/yavaşlama animasyonuyla yapılır.
- Yapay zekâ planlayıcısı erişilemezse salt-okunur ekran incelemesinden sonra görev durumu açıklanır; işlem sessizce tamamlandı diye işaretlenmez.
- Masaüstü sesli sohbet, cihaz üzerinde Whisper ile konuşma tanıma ve yerel Türkçe seslendirme akışını korur.
- Ekran özeti Windows UI Automation erişilebilirlik ağacından üretilir; görsel piksel/nesne tanıma olarak sunulmaz.

## Alpha 33 masaüstü ajanı

- Windows Başlat menüsüne kayıtlı uygulamaları güvenli ad eşleştirmesiyle açabilir; birden fazla eşleşmede daha belirgin ad ister.
- Chrome, Edge ve diğer erişilebilir uygulama pencerelerinde UI Automation üzerinden gezinme, tıklama, metin girişi, sekme yönetimi ve form etkileşimi yapabilir.
- Uzun görevler için 8 dakikalık görev sınırı, 60 saniyelik planlama isteği sınırı ve takılan PowerShell masaüstü işlemleri için 45 saniyelik süreç sınırı bulunur.
- Salt-okunur ekran incelemesi başarısız olursa bir kez yeniden denenir; mesaj gönderme veya tıklama gibi yan etkili eylemler körlemesine tekrarlanmaz.
- Görevlerin planlama, çalışma, yeniden deneme ve tamamlanma durumları sohbet penceresinde ayrıntılı gösterilir.
- Satın alma/ödeme, hesap ayarı değiştirme ve program kurma/kaldırma komutlarında yerel onay alınır. Dosya silme işlemleri mevcut ayrı onayını korur.
- Uygulama başlatma için rastgele PowerShell/CMD komutu çalıştırılmaz; yalnızca Windows Başlat menüsündeki kayıtlı uygulamalar aranır.
- Parola ve tek kullanımlık kodlar EYRION'a yazdırılmaz; giriş ekranındaki hassas alanlarda kullanıcı girişi beklenir.

## Güvenlik ve mimari

- Renderer içinde Node.js entegrasyonu kapalıdır.
- Context isolation ve Chromium sandbox açıktır.
- Harici bağlantılar varsayılan tarayıcıda açılır.
- Uygulama yalnızca `https://nova-ai-xxid.onrender.com/` adresindeki EYRION AI servisini yükler.
- API anahtarları EXE içine gömülmez; mevcut sunucu tarafında kalır.
- Windows başlangıçta otomatik açılma kullanıcı tarafından tepsi menüsünden açılıp kapatılır.
- Güncellemeler indirilir ancak kullanıcı onayı olmadan yüklenmez.

Sesli sohbet: Windows masaüstü uygulaması, Chromium SpeechRecognition ağına bağımlı değildir. İlk kullanımda Whisper modeli internetten indirilir ve tarayıcı/Electron önbelleğine alınır; sonraki kullanımlarda konuşma çözümlenmesi cihazda yapılır. EYRION'un yapay zekâ yanıtı için internet bağlantısı gerekir. Web sürümü mevcut tarayıcı konuşma tanıma yöntemini kullanmaya devam eder.

Bu sürüm çevrimiçi istemcidir. Tam çevrimdışı sohbet ve kod imzalama henüz yoktur.
