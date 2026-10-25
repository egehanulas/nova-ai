# NOVA AI — başlangıç projesi

Koyu temalı Türkçe sohbet sitesi. Gerçek model yanıtları için sunucu tarafında Gemini API kullanır; ziyaretçilerden API anahtarı istemez.

## Yayınlamadan önce
- Google AI Studio'dan bir Gemini API anahtarı oluştur.
- GitHub'a bu projeyi yükle. `.env` dosyasını veya API anahtarını GitHub'a kesinlikle koyma.
- Render gibi Node.js destekleyen bir hostta repo'yu bağla. Build command: `npm install`; Start command: `npm start`.
- Host panelindeki Environment Variables bölümüne `GEMINI_API_KEY` değişkenini ekle. İstersen `GEMINI_MODEL` olarak Google AI Studio hesabında erişebildiğin bir model tanımla. Varsayılan `gemini-3.5-flash-lite` modelidir; erişilebilirlik ve ücretsiz kota hesaba göre değişebilir.

## Güvenlik ve ücretsiz kullanım
- Anahtar yalnızca sunucuda tutulur; tarayıcı koduna konmaz.
- İstek başına IP tabanlı rate limit ve mesaj uzunluğu sınırları var. Bu, kötüye kullanımı tamamen engellemez; sağlayıcı panelinde kota/bildirim ayarlarını da kontrol et.
- Ücretsiz host planları uykuya geçebilir, sınırlı kaynak veya kullanım koşulları uygulayabilir. Gemini ücretsiz kullanım koşulları ve kotaları da değişebilir. Herkese açık siteyi “sınırsız ve kesin ücretsiz” sayma.
- Sohbet geçmişi yalnızca kullanıcının tarayıcısında saklanır.

## Yerel test
1. Node.js kurulu olmalı.
2. `npm install`
3. `.env.example` dosyasını `.env` olarak kopyala ve `GEMINI_API_KEY` değerini gir.
4. `npm start` çalıştırıp `http://localhost:3000` adresini aç.
