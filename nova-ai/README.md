# NOVA AI — başlangıç projesi

Koyu temalı Türkçe sohbet sitesi. Gerçek model yanıtları için sunucu tarafında Gemini API kullanır; ziyaretçilerden API anahtarı istemez.

## Yayınlamadan önce
- Google AI Studio'dan bir Gemini API anahtarı oluştur.
- GitHub'a bu projeyi yükle. `.env` dosyasını veya API anahtarını GitHub'a kesinlikle koyma.
- Render gibi Node.js destekleyen bir hostta repo'yu bağla. Build command: `npm install`; Start command: `npm start`.
- Host panelindeki Environment Variables bölümüne `GEMINI_API_KEY` değişkenini ekle. İstersen `GEMINI_MODEL` olarak Google AI Studio hesabında erişebildiğin bir model tanımla. Varsayılan sohbet modeli `gemini-2.5-flash`, resim modeli ise `gemini-2.5-flash-image` modelidir; erişilebilirlik ve ücretsiz kota hesaba göre değişebilir.

## Güvenlik ve ücretsiz kullanım
- Anahtar yalnızca sunucuda tutulur; tarayıcı koduna konmaz.
- İstek başına IP tabanlı rate limit ve mesaj uzunluğu sınırları var. Bu, kötüye kullanımı tamamen engellemez; sağlayıcı panelinde kota/bildirim ayarlarını da kontrol et.
- Ücretsiz host planları uykuya geçebilir, sınırlı kaynak veya kullanım koşulları uygulayabilir. Gemini ücretsiz kullanım koşulları ve kotaları da değişebilir. Herkese açık siteyi “sınırsız ve kesin ücretsiz” sayma.
- Giriş yapan kullanıcının sohbet geçmişi Supabase `conversations` tablosuna kaydedilir; SQL şemasını Supabase SQL Editor'da çalıştır.
- Resim oluşturma düğmesi Gemini Image modelini kullanır. `GEMINI_API_KEY` ve model erişimi/kota gerekir; sağlayıcı ücretleri değişebilir.
- Araştırma modu şu an canlı web araması yapmaz; yalnızca modelin araştırma yönergesiyle yanıt üretir.

## Yerel test
1. Node.js kurulu olmalı.
2. `npm install`
3. `.env.example` dosyasını `.env` olarak kopyala ve `GEMINI_API_KEY` değerini gir.
4. `npm start` çalıştırıp `http://localhost:3000` adresini aç.


## Unreal Engine 5.8 bilgi tabanı (RAG) — ilk aşama

Bu dal, NOVA'nın Blueprint/Unreal Engine sorularında Supabase'teki yayınlanmış bilgi parçalarını arayıp yanıt sağlayıcılarına bağlam ekler.

### Gerekli Render değişkeni
- `OPENAI_API_KEY`: yalnızca sunucuda tutulur; `text-embedding-3-small` ile soru embedding'i üretir.
- Mevcut `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY` değişkenleri kullanılır.
- Render'a `SUPABASE_SERVICE_ROLE_KEY` eklemek bu ilk sorgulama akışı için gerekli değildir.

### Supabase kurulumu
1. Supabase Dashboard > SQL Editor bölümünü aç.
2. `supabase/migrations/001_unreal_knowledge_base.sql` dosyasının tamamını çalıştır.
3. SQL tamamlandığında `knowledge_sources`, `knowledge_documents`, `knowledge_chunks` ve `knowledge_ingestion_jobs` tabloları ile `match_knowledge_chunks` arama fonksiyonu oluşturulur.
4. Mevcut `conversations` tablosuna ve kullanıcı sohbetlerine dokunulmaz.

### Veri yükleme notu
Bilgi tabanı tabloları oluşturulduğunda henüz otomatik olarak dokümanla dolmaz. İçerik aktarımı ayrı bir toplu içe aktarma adımıdır. Yalnızca kullanım ve lisans koşulları uygun kaynakları ekleyin; resmî Epic dokümanlarını birincil kaynak kabul edin. Topluluk içeriğini daha düşük güven seviyesinde işaretleyin.

### Davranış ve güvenli geri dönüş
- RAG yalnızca Unreal/Blueprint sorularında çalışır.
- Eşleşen yayınlanmış içerik bulunmazsa NOVA mevcut model akışına devam eder.
- Embedding veya vektör araması hata verirse sohbeti durdurmaz; hatayı sunucu loguna yazar ve mevcut yanıta geri döner.
- Kaynak alıntıları model bağlamına başlık ve URL ile eklenir; kaynak metni güvenilmeyen içerik olarak ele alınır.
