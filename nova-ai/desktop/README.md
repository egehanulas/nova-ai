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

## Geliştirme

Bu klasörde:

```bash
npm install
npm start
```

## Windows kurulum dosyası

```bash
npm run make -- --platform=win32 --arch=x64
```

Kurulum paketi `out/make/squirrel.windows/x64/` altında üretilir.

## Otomatik güncelleme yayınlama

Windows Squirrel güncelleme dosyaları GitHub Releases üzerinden dağıtılır. Yeni bir masaüstü sürümü yayınlamak için `desktop-v<package-version>` biçiminde bir Git etiketi oluştur. Örneğin `desktop-v0.2.0-alpha.2`. GitHub Actions Windows kurulumunu ve Squirrel paketlerini üretip ilgili GitHub Release'e yükler. Kurulu uygulama bu yayın kanalını denetler; güncelleme indirildiğinde kurulum için yeniden başlatma onayı ister.

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
