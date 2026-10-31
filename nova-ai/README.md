# NOVA AI

NOVA AI; Türkçe sohbet, kalıcı kullanıcı hafızası, canlı web araştırması, yapılandırılmış hava durumu/futbol sorguları ve Unreal Engine 5.8 bilgi tabanı için geliştirilmiş kişisel asistandır.

## Çalışma yapısı

- **Sohbet sağlayıcıları:** Groq, Gemini ve OpenRouter sırasıyla denenir. Bir sağlayıcı hata verirse, yanıt akışı henüz başlamadıysa sonraki sağlayıcıya geçilir.
- **Araştırma:** Google News RSS, Bing ve DuckDuckGo kaynakları kullanılır. Haber aramalarında Google News önceliklidir; diğer güncel/faktüel sorgularda önce Bing ve DuckDuckGo denenir. Arama sonucu, kaynağın tamamının okunduğu veya bilginin bağımsız doğrulandığı anlamına gelmez.
- **Hava durumu:** Open-Meteo birincil, wttr.in yedek kaynaktır. Bugün/yarın, haftalık görünüm, hafta sonu ve uygun gün adları için tarih aralığı seçilir. Saatlik tahmin istenirse günlük özetin saatlik kesinlik sağlamadığı belirtilmelidir.
- **Futbol:** API-Football anahtarı tanımlanırsa yapılandırılmış fikstür/son maç verisi kullanılır. Anahtar yoksa web araştırmasına geri dönülür; web sonuçları doğrulanmış fikstür veya skor olarak kabul edilmemelidir.
- **Hafıza:** Supabase RLS ile kullanıcıya özel kayıtlar saklanır. Hassas bilgiler otomatik hafızaya alınmamalıdır.
- **Unreal Engine bilgi tabanı:** Blueprint sorularında Supabase vektör araması ve yerel `Xenova/all-MiniLM-L6-v2` embedding modeli kullanılır.
- **Görsel üretimi:** Pollinations anahtarı varsa Pollinations, yoksa Cloudflare Workers AI kullanılır. Gemini/metin sağlayıcıları Türkçe istemi görsel modeli için düzenlemeye yardımcı olabilir.
- **Ses:** Tarayıcıdaki Web Speech API ile sesli sohbet kullanılabilir. ElevenLabs endpoint'i ayrıca isteğe bağlıdır.

## Kurulum

1. Node.js 20 veya üzeri kur.
2. Bu klasörde `npm install` çalıştır.
3. `.env.example` dosyasını `.env` olarak kopyala.
4. En az bir sohbet sağlayıcısının API anahtarını ve Supabase bağlantı bilgilerini yerel `.env` dosyasına ekle.
5. `npm start` çalıştır ve `http://localhost:3000` adresini aç.

Render'da servis kök dizini `nova-ai/`, build komutu `npm install`, start komutu `npm start` olmalıdır. Gerçek API anahtarlarını GitHub'a veya istemci koduna koyma.

## Ortam değişkenleri

- `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`: sohbet sağlayıcıları; en az biri gerekli.
- `GEMINI_MODEL`, `GROQ_MODEL`, `OPENROUTER_MODEL`: isteğe bağlı model seçimi.
- `API_FOOTBALL_KEY`: yapılandırılmış futbol verisi için isteğe bağlı API anahtarı.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`: oturum, sohbet ve hafıza.
- `SUPABASE_SERVICE_ROLE_KEY`: yalnızca güvenilir ortamda bilgi tabanı içe aktarımı için; uygulama istemcisine ekleme.
- `POLLINATIONS_API_KEY` veya `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`: görsel üretimi.
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`: isteğe bağlı TTS endpoint'i.
- `REQUEST_TIMEOUT_MS`, `PROVIDER_TIMEOUT_MS`: istek ve sağlayıcı zaman aşımı.

## Supabase

- `supabase-schema.sql`: sohbet geçmişi tablosu ve RLS politikaları.
- `supabase/migrations/003_nova_memories.sql` ve `004_nova_memory_sources.sql`: kalıcı hafıza tabloları/alanları.
- `supabase/migrations/001_unreal_knowledge_base.sql` ve `002_local_embeddings_384.sql`: Unreal Engine bilgi tabanı ve vektör araması.

Unreal dokümanlarını içe aktarmak için `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` tanımlı güvenilir ortamda `npm run ingest:knowledge` çalıştır. GitHub Actions iş akışı da manuel olarak başlatılabilir.

## Güvenilirlik notları

- Arama motoru sonuçları özet/snippet olabilir; NOVA kaynakta açıkça bulunmayan skor, tarih veya tahmin değerlerini uydurmamalıdır.
- Hava durumu önerileri hedef günün tahminine dayanmalı; anlık gözlemle gelecek gün karıştırılmamalıdır.
- API anahtarı, kota veya sağlayıcı erişimi yoksa ilgili özellik çalışmayabilir. Ücretsiz servislerin kota, hız ve kullanılabilirlik koşulları değişebilir.
- `/health` endpoint'i servis durumunu ve anahtarların yalnızca ayarlı olup olmadığını gösterir; anahtar değerlerini döndürmez.
