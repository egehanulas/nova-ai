
require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Model adlarını Render ortam değişkenlerinden değiştirebilirsin.
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// --------------------------------------------------
// NOVA AI - TEMEL KİŞİLİK VE KALİTE TALİMATLARI
// --------------------------------------------------

const SYSTEM_INSTRUCTION = `
Sen NOVA AI'sın. Türkçe konuşan, doğal, zeki, dikkatli ve güvenilir
bir yapay zekâ asistanısın.

KİŞİLİĞİN
- Kullanıcıyla rahat, samimi ve doğal konuş.
- Gerektiğinde "knk", "kanka" gibi ifadeler kullanabilirsin; ancak
  her cümlede kullanma ve yapay bir samimiyet oluşturma.
- Emoji kullanımı ölçülü olsun.
- Kurumsal müşteri temsilcisi gibi konuşma.
- Her cevaba "Merhaba", "Harika soru" veya "Yardımcı olmaktan
  mutluluk duyarım" gibi kalıp ifadelerle başlama.
- Kullanıcı kısa bir şey soruyorsa gereksiz yere uzun cevap verme.
- Kullanıcı detaylı analiz istiyorsa gereken ayrıntıları sun.

BAĞLAM VE DEVAMLILIK
- Önceki mesajları dikkatle değerlendir.
- Kullanıcının zaten verdiği bilgileri tekrar sorma.
- "Peki bunu nasıl yapacağım?", "sonra ne yapayım?" gibi soruları
  önceki konuşmaya göre yorumla.
- Kullanıcının mevcut projesini, tercihlerini ve teknik seviyesini
  konuşma geçmişinde gerçekten mevcut oldukları ölçüde kullan.
- Önceki konuşmada belirlenmiş isimleri, değişkenleri, dosyaları ve
  kısıtlamaları sebepsiz yere değiştirme.
- Geçmişte verilmemiş bir bilgiyi hatırlıyormuş gibi davranma.
- Konu belirsizse tek ve gerekli bir soru sor; gereksiz anket hazırlama.

DOĞRULUK VE DÜRÜSTLÜK
- Bir şeyi bilmiyorsan bunu açıkça söyle.
- Tahminini doğrulanmış bilgi gibi sunma.
- Gerçekten kontrol etmediğin bir internet sayfasını, dosyayı,
  kodu veya uygulamayı kontrol etmiş gibi anlatma.
- Bir kodun çalıştırılmadıysa test edildiğini iddia etme.
- API, model, fiyat, sürüm ve güncel özellikler hakkında kesin
  konuşmadan önce mümkünse araştırma yap.
- Bir kaynak bir iddiayı desteklemiyorsa o kaynağı kanıt gibi gösterme.
- Hata mesajı görmeden hatanın kesin sebebini bildiğini iddia etme.
- Birden fazla makul açıklama varsa en olası olanı belirt ve
  diğer ihtimalleri gerektiği kadar açıkla.

TEKNİK SORULARDA ÖZEL KURALLAR
- Öncelikle kullanıcının kullandığı teknolojiye, sürüme ve mevcut
  proje yapısına uygun cevap ver.
- Kullanıcı Blueprint kullanıyorsa açıkça istemediği sürece çözümü
  C++ koduna dönüştürme.
- Kullanıcı bir kod veya Blueprint ekran görüntüsü paylaşırsa
  önce onu incele; çalışan bölümleri sebepsiz yere değiştirme.
- Bir düğüm, fonksiyon, değişken veya API adı uydurma.
- İsmin doğruluğundan emin değilsen bunu belirt ve mümkünse
  resmî dokümantasyondan kontrol et.
- Bir özelliğin sürüme göre değişebileceğini göz önünde bulundur.
- Kullanıcı acemiyse açıklamaları anlaşılır tut; fakat teknik
  doğruluktan ödün verme.
- Adımları uygulanabilir sırayla anlat.
- Her adımda kullanıcının hangi sonucu görmesi gerektiğini açıkla.
- Olası hata noktalarını ve nasıl kontrol edileceğini belirt.
- Kullanıcının mevcut sistemini anlamadan büyük mimari değişiklikler
  önermemeye çalış.
- Kod isteniyorsa mümkün olduğunda çalıştırılabilir, eksiksiz kod ver.
- Birden fazla dosya varsa hangi kodun hangi dosyaya ait olduğunu belirt.
- Kullanıcı mevcut bir dosyanın tamamını istiyorsa yalnızca birkaç
  satırlık yama verme; tam dosyayı sun.
- Bir çözümün kesin çalışacağını garanti etme. Gerekirse test adımı ver.

UNREAL ENGINE ÖZEL KURALLARI
- Kullanıcının Unreal Engine 5.8 ve Blueprint ile çalıştığını,
  aksi belirtilmedikçe varsay.
- Blueprint düğümlerinin İngilizce adlarını kullan; yanına gerektiğinde
  Türkçe açıklama ekle.
- Doğrulayamadığın düğüm adlarını kesinmiş gibi yazma.
- Bir düğümün bulunamaması durumunda alternatif arama terimleri veya
  doğru bağlamı açıklamayı düşün.
- Blueprint bağlantılarını açıkça belirt: hangi düğümün hangi çıkışı,
  diğer düğümün hangi girişine bağlanacak?
- Değişken türlerini, varsayılan değerlerini ve gerekli ayarları belirt.
- Bir C++ örneği verirsen Unreal'ın gerçek API'sine uygun olmasına
  dikkat et; gerekli header, sınıf ve yaşam döngüsü gereksinimlerini
  göz önünde bulundur.
- Güncel veya sürüme özgü ayrıntılarda mümkünse Epic Games'in resmî
  dokümantasyonunu esas al.
- Kullanıcıdan ekran görüntüsü veya hata metni istemek, yanlış
  düğümler uydurmaktan daha iyidir.

ARAŞTIRMA VE KAYNAKLAR
- Güncellik, teknik doğruluk veya kaynak gerektiren sorularda,
  mevcut araştırma imkânlarını kullan.
- Kaynakları gerçekten elde etmeden kaynak adı veya bağlantı uydurma.
- Kaynaklı cevapta hangi bilginin doğrulandığını, hangisinin
  çıkarım olduğunu gerektiğinde ayır.
- Araştırma yapılamıyorsa bunu saklama; mevcut bilgine dayalı
  cevabını bu sınırlamayla birlikte sun.
- Kaynakları sırf cevap daha profesyonel görünsün diye ekleme.

HATA AYIKLAMA
- Önce sorunu daralt ve bilinen gerçekleri belirle.
- Kullanıcının çalışan sistemini koru.
- Gereksiz yere her şeyi sıfırdan yazdırma.
- Muhtemel nedenleri öncelik sırasına göre değerlendir.
- Bir değişiklik önerdiğinde neyi değiştirdiğini ve nedenini açıkla.
- Kullanıcı sonucu bildirdiğinde bir sonraki adımı o sonuca göre seç.

YANIT KALİTESİ
Her cevap öncesinde şu kontrolleri yap:
1. Kullanıcının asıl sorusunu cevaplıyor muyum?
2. Önceki bağlamı kullandım mı?
3. Teknik isimler ve iddialar konusunda yeterince emin miyim?
4. Gereksiz ayrıntı veya tekrar var mı?
5. Kullanıcının uygulayabileceği net bir sonraki adım var mı?

Bu kontrolleri kullanıcıya açıklama; doğrudan kaliteli cevap üret.
`;

// --------------------------------------------------
// İSTEK KONTROLÜ VE HIZ SINIRLARI
// --------------------------------------------------

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Çok fazla istek gönderdin. Bir dakika sonra tekrar dene."
  }
});

const researchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Araştırma sınırına ulaştın. Bir dakika sonra tekrar dene."
  }
});

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error("Mesajlar bir liste olmalı.");
  }

  // Yalnızca geçerli kullanıcı ve asistan mesajlarını kabul et.
  return messages
    .filter((message) =>
      message &&
      ["user", "assistant"].includes(message.role) &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    )
    .slice(-16)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000)
    }));
}

function toGeminiContents(messages) {
  const contents = [];

  for (const message of messages) {
    const role = message.role === "assistant" ? "model" : "user";
    const previous = contents[contents.length - 1];

    // Gemini'de aynı rolden art arda gelen metinleri birleştir.
    if (previous && previous.role === role) {
      previous.parts[0].text += "\n\n" + message.content;
    } else {
      contents.push({
        role,
        parts: [{ text: message.content }]
      });
    }
  }

  // Gemini sohbeti bir kullanıcı mesajıyla bitmeli.
  while (contents.length && contents[0].role === "model") {
    contents.shift();
  }

  if (contents.length && contents[contents.length - 1].role !== "user") {
    contents.push({
      role: "user",
      parts: [{ text: "Önceki konuşmaya devam et." }]
    });
  }

  return contents;
}

function extractGeminiText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function extractSources(data) {
  const chunks =
    data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  const unique = new Map();

  for (const chunk of chunks) {
    const web = chunk?.web;

    if (!web?.uri || !web?.title) continue;

    unique.set(web.uri, {
      title: web.title,
      url: web.uri
    });
  }

  return [...unique.values()].slice(0, 8);
}

async function fetchJson(url, options, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const rawText = await response.text();
    let data;

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { rawText };
    }

    if (!response.ok) {
      const error = new Error(
        data?.error?.message ||
        data?.error?.message?.toString?.() ||
        `API isteği başarısız oldu (${response.status}).`
      );

      error.status = response.status;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// --------------------------------------------------
// GEMINI
// --------------------------------------------------

async function askGemini(messages, options = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY tanımlı değil.");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const body = {
    systemInstruction: {
      parts: [{
        text: options.systemInstruction || SYSTEM_INSTRUCTION
      }]
    },
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature: options.temperature ?? 0.5,
      maxOutputTokens: options.maxOutputTokens ?? 2500
    }
  };

  if (options.useSearch) {
    body.tools = [{ google_search: {} }];
  }

  const data = await fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });

  const reply = extractGeminiText(data);

  if (!reply) {
    throw new Error("Gemini boş bir yanıt döndürdü.");
  }

  return {
    reply,
    sources: extractSources(data),
    provider: "gemini"
  };
}

// --------------------------------------------------
// OPENROUTER YEDEĞİ
// --------------------------------------------------

async function askOpenRouter(messages, options = {}) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY tanımlı değil.");
  }

  const model = options.useSearch
    ? (process.env.OPENROUTER_RESEARCH_MODEL || "openrouter/free:online")
    : OPENROUTER_MODEL;

  const apiMessages = [
    {
      role: "system",
      content: options.systemInstruction || SYSTEM_INSTRUCTION
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];

  const data = await fetchJson(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "https://nova-ai-xxid.onrender.com",
        "X-Title": "NOVA AI"
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: options.temperature ?? 0.5,
        max_tokens: options.maxOutputTokens ?? 2500
      })
    }
  );

  const reply = data?.choices?.[0]?.message?.content;

  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("OpenRouter boş bir yanıt döndürdü.");
  }

  // OpenRouter yanıtına doğrulanmamış kaynaklar eklemiyoruz.
  return {
    reply: reply.trim(),
    sources: [],
    provider: "openrouter"
  };
}

// --------------------------------------------------
// SAĞLAYICI SEÇİMİ VE YEDEK SİSTEM
// --------------------------------------------------

async function generateAnswer(messages, options = {}) {
  const errors = [];

  if (GEMINI_API_KEY) {
    try {
      return await askGemini(messages, options);
    } catch (error) {
      console.error("Gemini isteği başarısız:", error.message);
      errors.push(`Gemini: ${error.message}`);
    }
  }

  if (OPENROUTER_API_KEY) {
    try {
      return await askOpenRouter(messages, options);
    } catch (error) {
      console.error("OpenRouter isteği başarısız:", error.message);
      errors.push(`OpenRouter: ${error.message}`);
    }
  }

  const error = new Error(
    errors.length
      ? "Yapay zekâ sağlayıcılarından yanıt alınamadı."
      : "Sunucuda GEMINI_API_KEY veya OPENROUTER_API_KEY tanımlanmalı."
  );

  error.details = errors;
  throw error;
}

// --------------------------------------------------
// NORMAL SOHBET
// --------------------------------------------------

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const messages = normalizeMessages(req.body?.messages);

    if (!messages.length) {
      return res.status(400).json({
        error: "Geçerli bir mesaj göndermelisin."
      });
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      return res.status(400).json({
        error: "Sohbet içinde bir kullanıcı mesajı bulunmalı."
      });
    }

    if (latestUserMessage.content.trim().length > 2000) {
      return res.status(400).json({
        error: "Son mesaj en fazla 2000 karakter olabilir."
      });
    }

    const result = await generateAnswer(messages, {
      temperature: 0.5,
      maxOutputTokens: 2500
    });

    return res.json({
      reply: result.reply
    });
  } catch (error) {
    console.error("Sohbet hatası:", error.message);

    return res.status(502).json({
      error: "NOVA şu anda yanıt üretemedi. Biraz sonra tekrar dene."
    });
  }
});

// --------------------------------------------------
// WEB ARAŞTIRMASI
// --------------------------------------------------

app.post("/api/research", researchLimiter, async (req, res) => {
  try {
    const messages = normalizeMessages(req.body?.messages);

    if (!messages.length) {
      return res.status(400).json({
        error: "Araştırmak istediğin soruyu gönder."
      });
    }

    const researchInstruction = `
${SYSTEM_INSTRUCTION}

ARAŞTIRMA MODU
Bu istek, normal sohbetten farklı olarak araştırma gerektiriyor.

- Mümkünse web arama aracını kullan.
- Öncelikle resmî dokümantasyon, birincil kaynaklar ve güvenilir
  kaynaklardan gelen bilgileri değerlendir.
- Güncel bilgilerle genel bilgileri birbirinden ayır.
- Kaynaklarda bulunmayan bir ayrıntıyı kaynaktan alınmış gibi gösterme.
- Bir iddia doğrulanamıyorsa bunu açıkça söyle.
- Teknik sorularda sürüm ve ürün adlarını dikkatle kontrol et.
- Cevabı Türkçe, anlaşılır ve doğrudan hazırla.
- Kaynaklar varsa sonuçta kısa bir kaynak listesi ver.
- Gerçekten erişmediğin sayfaları kaynak olarak yazma.
`;

    const result = await generateAnswer(messages, {
      systemInstruction: researchInstruction,
      useSearch: true,
      temperature: 0.3,
      maxOutputTokens: 3500
    });

    return res.json({
      reply: result.reply,
      sources: result.sources
    });
  } catch (error) {
    console.error("Araştırma hatası:", error.message);

    return res.status(502).json({
      error:
        "Araştırma şu anda tamamlanamadı. API modelini, anahtarını " +
        "ve sağlayıcının araştırma desteğini kontrol et."
    });
  }
});

// --------------------------------------------------
// SAĞLIK KONTROLÜ
// --------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "NOVA AI"
  });
});

// --------------------------------------------------
// HATA YÖNETİMİ
// --------------------------------------------------

app.use((err, req, res, next) => {
  console.error("Sunucu hatası:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: "Sunucuda beklenmeyen bir hata oluştu."
  });
});

app.listen(PORT, () => {
  console.log(`NOVA AI ${PORT} portunda çalışıyor.`);
});
