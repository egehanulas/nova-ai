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

### Embedding modeli ve gerekli Render değişkenleri
- Embedding üretimi, ücretsiz ve açık ağırlıklı `Xenova/all-MiniLM-L6-v2` modeliyle sunucuda yerel olarak yapılır (384 boyut).
- Embedding için `OPENAI_API_KEY` veya ücretli bir embedding API'si gerekmez. Model ilk kullanımda Hugging Face üzerinden indirilir ve Transformers.js önbelleğinde saklanır.
- Mevcut `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY` değişkenleri kullanılır.
- Render'a `SUPABASE_SERVICE_ROLE_KEY` eklemek sorgulama akışı için gerekli değildir.

### Supabase kurulumu
1. Supabase Dashboard > SQL Editor bölümünü aç.
2. `supabase/migrations/001_unreal_knowledge_base.sql` dosyasının tamamını çalıştır.
3. SQL tamamlandığında `knowledge_sources`, `knowledge_documents`, `knowledge_chunks` ve `knowledge_ingestion_jobs` tabloları ile ilk `match_knowledge_chunks` arama fonksiyonu oluşturulur. Ardından `002_local_embeddings_384.sql` dosyasını da çalıştırarak ücretsiz yerel model için `knowledge_chunks_384` ve `match_knowledge_chunks_384` nesnelerini oluştur.
4. Mevcut `conversations` tablosuna ve kullanıcı sohbetlerine dokunulmaz.

### Veri yükleme notu
Bilgi tabanı tabloları oluşturulduğunda henüz otomatik olarak dokümanla dolmaz. İçerik aktarımı ayrı bir toplu içe aktarma adımıdır. Yalnızca kullanım ve lisans koşulları uygun kaynakları ekleyin; resmî Epic dokümanlarını birincil kaynak kabul edin. Topluluk içeriğini daha düşük güven seviyesinde işaretleyin.

### Davranış ve güvenli geri dönüş
- RAG yalnızca Unreal/Blueprint sorularında çalışır.
- Eşleşen yayınlanmış içerik bulunmazsa NOVA mevcut model akışına devam eder.
- Embedding veya vektör araması hata verirse sohbeti durdurmaz; hatayı sunucu loguna yazar ve mevcut yanıta geri döner.
- Kaynak alıntıları model bağlamına başlık ve URL ile eklenir; kaynak metni güvenilmeyen içerik olarak ele alınır.


### İlk resmî dokümanları içe aktarma

İlk aktarım aracı `scripts/ingest-knowledge.js` dosyasındadır. Şimdilik yalnızca küçük ve seçilmiş Epic Developer Community sayfalarını işler; tüm siteyi taramaz.

Gerekli ortam değişkenleri:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — yalnızca güvenilir sunucu/yerel ortamda; tarayıcıya veya GitHub'a asla koyma.
- OpenAI API anahtarı gerekmez; embedding modeli ücretsiz olarak yerel çalışır.

Yerel kullanım:
1. Proje klasöründe `npm install` çalıştır.
2. Gizli değerleri yalnızca yerel `.env` dosyana ekle. `.env` dosyasını GitHub'a yükleme.
3. `npm run ingest:knowledge` çalıştır.
4. Terminalde her sayfa için `OK` veya `ATLANDI` sonucunu kontrol et.

Araç; doküman metnini parçalara ayırır, Transformers.js ile 384 boyutlu yerel embedding'ler üretir ve Supabase bilgi tablolarına yazar. Aynı sayfa ve aynı içerik tekrar çalıştırıldığında aynı dokümanın parçalarını yeniden oluşturur. Başarısız sayfalar atlanır; hiçbir API anahtarı terminale yazdırılmaz.

Not: Bu ilk sürüm, seçilmiş sayfaların metnini indekslemek içindir; Epic'in içerik kullanım koşulları ve atıf gereklilikleri geçerlidir. Kaynak bağlantıları veritabanında korunur. Daha geniş tarama veya topluluk kaynakları eklemeden önce ilgili kullanım koşulları ayrıca incelenmelidir.
