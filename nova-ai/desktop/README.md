# NOVA AI Desktop

NOVA AI web uygulamasını Windows masaüstü penceresinde çalıştıran Electron istemcisidir. Mevcut Render web/API servisini kullanır; masaüstü sürümünde Türkçe konuşma tanıma Transformers.js + Whisper Small ile cihaz üzerinde yapılır. Daha iyi Türkçe tanıma için Whisper Base yerine Whisper Small kullanılır; ilk kullanımda daha büyük bir model indirilir. Mikrofon sesi bir konuşma tanıma sunucusuna gönderilmez.

## Gereksinimler

- Windows 10/11 x64
- Node.js 22.17.0 veya üzeri
- npm

## Windows özellikleri

- Pencereyi kapatmak NOVA'yı sonlandırmaz; sistem tepsisine küçültür.
- Tepsi simgesine çift tıklayarak NOVA'yı tekrar aç.
- `Ctrl + Shift + Space`: NOVA penceresini göster/gizle.
- Tepsi menüsünden Windows açılışında otomatik başlatmayı açıp kapat.
- Tepsi menüsünden NOVA'yı tamamen kapat.
- Windows bildirimleri güncelleme indirme durumunu bildirir.

## Klavye ve menü

- `Ctrl + R`: NOVA'yı yenile
- `Ctrl + +`: Yakınlaştır
- `Ctrl + -`: Uzaklaştır
- `Ctrl + 0`: Yakınlaştırmayı sıfırla
- `Alt`: Gizli menüyü göster (Dosya, Görünüm, Yardım)
- Görünüm menüsünden tam ekranı aç/kapat.
- Yardım > Güncellemeleri denetle bölümünden güncellemeyi elle kontrol et.
- Yardım > NOVA AI Hakkında bölümünden kurulu sürümü gör.

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

Windows Squirrel güncelleme dosyaları GitHub Releases üzerinden dağıtılır. Yeni bir masaüstü sürümü yayınlamak için `desktop-v<package-version>` biçiminde bir Git etiketi oluştur. Örneğin `desktop-v0.2.0-alpha.2`. GitHub Actions Windows kurulumunu ve Squirrel paketlerini üretip ilgili GitHub Release'e yükler. Kurulu uygulama bu yayın kanalını denetler; güncelleme indirildiğinde NOVA'nın animasyonlu güncelleme penceresi yeni özellikleri, iyileştirmeleri ve sürüm karşılaştırmasını gösterir; kurulum yalnızca kullanıcı onayıyla başlar.

Otomatik güncellemeler yalnızca paketlenmiş Windows uygulamasında çalışır. İlk kurulum yine Setup.exe ile yapılır. Yayınlanmış bir GitHub Release yoksa uygulama güncelleme bulamaz.

## Güvenlik ve mimari

- Renderer içinde Node.js entegrasyonu kapalıdır.
- Context isolation ve Chromium sandbox açıktır.
- Harici bağlantılar varsayılan tarayıcıda açılır.
- Uygulama yalnızca `https://nova-ai-xxid.onrender.com/` adresindeki NOVA AI servisini yükler.
- API anahtarları EXE içine gömülmez; mevcut sunucu tarafında kalır.
- Windows başlangıçta otomatik açılma kullanıcı tarafından tepsi menüsünden açılıp kapatılır.
- Güncellemeler indirilir ancak kullanıcı onayı olmadan yüklenmez.

Sesli sohbet: Windows masaüstü uygulaması, Chromium SpeechRecognition ağına bağımlı değildir. İlk kullanımda Whisper modeli internetten indirilir ve tarayıcı/Electron önbelleğine alınır; sonraki kullanımlarda konuşma çözümlenmesi cihazda yapılır. NOVA'nın yapay zekâ yanıtı için internet bağlantısı gerekir. Web sürümü mevcut tarayıcı konuşma tanıma yöntemini kullanmaya devam eder.

Bu sürüm çevrimiçi istemcidir. Tam çevrimdışı sohbet ve kod imzalama henüz yoktur.
