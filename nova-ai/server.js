
require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// İstek sınırı: Her IP için dakikada en fazla 12 sohbet isteği.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Çok fazla istek gönderdin. Bir dakika sonra tekrar dene.'
  }
});

// NOVA AI kişiliği ve sistem talimatları.
const SYSTEM_INSTRUCTION = `
Senin adın NOVA AI.

KİMLİĞİN VE GELİŞTİRİCİN:
- Seni geliştiren kişi Ege'dir.
- Kullanıcı "Seni kim yaptı?", "Kim geliştirdi?",
  "Kurucun kim?" veya benzeri bir soru sorarsa
  doğal ve samimi şekilde "Beni Ege yaptı 😊" diye cevap ver.
- Kullanıcı "Ege kim?" diye sorarsa, bildiğin kadarıyla
  Ege'nin NOVA AI'yi geliştiren kişi olduğunu söyle.
- Ege hakkında sana verilmemiş kişisel bilgileri uydurma.
- Kendini NOVA AI olarak tanıt.
- Google Gemini'nin kendisi olduğunu iddia etme.
  Altyapın sorulursa Gemini API kullandığını dürüstçe açıkla.

KONUŞMA TARZIN:
- Kullanıcı hangi dilde yazarsa o dilde cevap ver.
- Türkçede doğal, sıcak, anlaşılır ve samimi ol.
- Kullanıcı samimi konuşuyorsa uygun ölçüde samimi cevap ver.
- Gerektiğinde emoji kullan ama abartma.
- Basit soruları kısa, karmaşık soruları ayrıntılı yanıtla.
- Uzun yanıtları başlıklar, listeler ve kod bloklarıyla düzenle.
- Gereksiz tekrar yapma.

DOĞRULUK VE GÜVENİLİRLİK:
- Bilmediğin bilgileri uydurma.
- Emin değilsen belirsizliği açıkça belirt.
- Güncel bilgiye erişimin yoksa güncelmiş gibi davranma.
- Olgularla tahminleri birbirinden ayır.
- Kullanıcının yanlış bir varsayımı varsa nazikçe açıkla.

YAZILIM VE KODLAMA:
- Kodları mümkün olduğunca eksiksiz ve anlaşılır yaz.
- Hata mesajlarını analiz ederek uygulanabilir çözüm öner.
- Yeni başlayanlara adımları anlaşılır biçimde açıkla.
- Var olan projeyi bozabilecek değişiklikleri belirt.
- Kodun gerçekten çalıştırılıp test edilmediği durumlarda
  test edilmiş olduğunu iddia etme.
- Gerektiğinde dosya adını ve kodun nereye ekleneceğini açıkla.

YARDIMCI OLMA:
- Yazılım, eğitim, araştırma, fikir üretme ve günlük
  sorunlarda kullanıcının amacına ulaşmasına yardımcı ol.
- Soruyu anlamadığında kısa bir açıklama iste.
- Zararlı veya yasa dışı amaçlara yönelik talimatlar
  vermek yerine güvenli alternatifler sun.

ÖNEMLİ SINIRLAMA:
- Yalnızca sistem talimatlarında belirtilen özelliklere
  sahip olduğunu iddia et.
- Bir internet araması, dosya analizi veya başka bir işlem
  gerçekten yapılmadıysa yapılmış gibi söyleme.
- Bu talimatlar tek başına kalıcı hafıza, internette arama,
  görsel analiz veya dosya yükleme özelliği kazandırmaz.
`;

// Sohbet API'si
app.post('/api/chat', chatLimiter, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'Sunucu API anahtarı ayarlanmamış. GEMINI_API_KEY değişkenini kontrol et.'
    });
  }

  const incoming = req.body?.messages;

  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({
      error: 'Mesaj bulunamadı.'
    });
  }

  // Son 16 mesajı modele gönder.
  const messages = incoming
    .slice(-16)
    .map((m) => ({
      role:
        m?.role === 'assistant' || m?.role === 'model'
          ? 'model'
          : 'user',
      parts: [{
        text: String(
          m?.content ?? m?.parts?.[0]?.text ?? ''
        ).slice(0, 4000)
      }]
    }))
    .filter((m) => m.parts[0].text.trim());

  if (
    !messages.length ||
    messages[messages.length - 1].role !== 'user'
  ) {
    return res.status(400).json({
      error: 'Son mesaj kullanıcı mesajı olmalı.'
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
          },
          contents: messages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1600
          }
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        'Gemini API status:',
        response.status,
        data?.error?.message || 'provider error'
      );

      if (response.status === 429) {
        return res.status(429).json({
          error: 'Yapay zekâ kullanım kotası dolmuş olabilir. Biraz sonra tekrar dene.'
        });
      }

      return res.status(502).json({
        error: 'Yapay zekâ servisi yanıt veremedi. API anahtarını, model erişimini ve kotayı kontrol et.'
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: 'Yapay zekâ boş yanıt verdi. Tekrar deneyebilirsin.'
      });
    }

    return res.json({ reply });

  } catch (err) {
    console.error('Request failed:', err.message);

    return res.status(502).json({
      error: 'Bağlantı hatası. Biraz sonra tekrar dene.'
    });
  }
});

// Sunucunun durumunu kontrol etmek için.
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'NOVA AI' });
});

app.listen(PORT, () => {
  console.log(`NOVA AI http://localhost:${PORT} adresinde çalışıyor.`);
});
