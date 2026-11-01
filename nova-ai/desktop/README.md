# NOVA AI Desktop

NOVA AI web uygulamasını Windows masaüstü penceresinde çalıştıran Electron istemcisidir. İlk sürüm mevcut Render web/API servisini kullanır; sunucu kodunu veya web arayüzünü kopyalamaz ve API anahtarlarını masaüstü paketine koymaz.

## Gereksinimler

- Windows 10/11 x64
- Node.js 22.17.0 veya üzeri
- npm

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

Kurulum paketi `out/make/squirrel.windows/x64/` altında `Setup.exe` olarak üretilir.

## Güvenlik ve mimari

- Renderer içinde Node.js entegrasyonu kapalıdır.
- Context isolation ve Chromium sandbox açıktır.
- Harici bağlantılar varsayılan tarayıcıda açılır.
- Uygulama yalnızca `https://nova-ai-xxid.onrender.com/` adresindeki NOVA AI servisini yükler.
- API anahtarları EXE içine gömülmez; mevcut sunucu tarafında kalır.
- Uygulama web sürümünün oturum, sohbet, hafıza, araştırma ve ses özelliklerini mevcut web uygulaması desteklediği ölçüde kullanır.

Bu ilk aşama çevrimiçi istemcidir. Çevrimdışı çalışma, otomatik güncelleme, imzalı kurulum ve özel masaüstü özellikleri sonraki aşamalarda ayrıca ele alınacaktır.
