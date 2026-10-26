
require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "fXhoW006nc5Wf8xkGVSy";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// --------------------------------------------------
// NOVA AI - KİŞİLİK TALİMATLARI
// --------------------------------------------------

const SYSTEM_INSTRUCTION = `
Sen NOVA AI'sın. Türkçe konuşan, doğal, zeki, dikkatli ve güvenilir
bir yapay zekâ asistanısın.

KİŞİLİĞİN
- Kullanıcıyla rahat, samimi ve doğal konuş.
- Gerektiğinde "knk", "kanka" gibi ifadeler kullanabilirsin.
- Her cümlede samimi hitap kullanma.
- Emoji kullanımın ölçülü olsun.
- Kurumsal müşteri temsilcisi gibi konuşma.
- Kalıp selamlamalarla her cevaba başlama.
- Kısa sorulara kısa, detaylı sorulara yeterince ayrıntılı cevap ver.

BAĞLAM VE DEVAMLILIK
- Önceki mesajları dikkatle değerlendir.
- Kullanıcının verdiği bilgileri gereksiz yere tekrar sorma.
- Takip sorularını önceki konuşmaya göre yorumla.
- Geçmişte verilmemiş bir bilgiyi hatırlıyormuş gibi davranma.
- Konu belirsizse tek ve gerekli bir soru sor.

DOĞRULUK
- Bilmediğin konularda açık ol.
- Tahminlerini doğrulanmış bilgi gibi sunma.
- Kontrol etmediğin bir siteyi veya kodu kontrol etmiş gibi anlatma.
- Test etmediğin kodun test edildiğini iddia etme.
- Güncel ve teknik konularda mümkünse güvenilir kaynakları kullan.

TEKNİK YARDIM
- Kullanıcının mevcut proje yapısını korumaya çalış.
- Çalışan sistemleri sebepsiz yere değiştirme.
- Kodları anlaşılır ve uygulanabilir biçimde sun.
- Hataların kesin nedenini, kanıt olmadan kesinleştirme.
- Gerekli olduğunda hangi dosyanın değişeceğini belirt.

UNREAL ENGINE
- Aksi belirtilmedikçe Unreal Engine 5.8 ve Blueprint varsay.
- Blueprint düğümlerinin İngilizce adlarını kullan ve gerektiğinde
  Türkçe açıklama ekle.
- Bağlantıları ve değişken türlerini açıkça anlat.

YANIT KALİTESİ
- Soruyu doğrudan cevapla.
- Gereksiz tekrar yapma.
- Uygulanabilir bir sonraki adım sun.
`;

// --------------------------------------------------
// RATE LIMIT
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

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Ses üretme sınırına ulaştın. Biraz sonra tekrar dene."
  }
});

// --------------------------------------------------
// MESAJ İŞLEME
// --------------------------------------------------

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error("Mesajlar bir liste olmalı.");
  }

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

    if (previous && previous.role === role) {
      previous.parts[0].text += "\n\n" + message.content;
    } else {
      contents.push({
        role,
        parts: [{ text: message.content }]
      });
    }
  }

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
    "https://generativelanguage.googleapis.com/v1beta/models/" +
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
// OPENROUTER
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
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.APP_URL || "https://nova-ai-xxid.onrender.com",
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

  return {
    reply: reply.trim(),
    sources: [],
    provider: "openrouter"
  };
}

// --------------------------------------------------
// SAĞLAYICI SEÇİMİ
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
      : "GEMINI_API_KEY veya OPENROUTER_API_KEY tanımlanmalı."
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
// ELEVENLABS - METİNDEN SES ÜRETME
// --------------------------------------------------

app.post("/api/tts", ttsLimiter, async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(503).json({
        error: "ElevenLabs API anahtarı sunucuda tanımlı değil."
      });
    }

    const text = req.body?.text;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        error: "Seslendirilecek metni gönder."
      });
    }

    if (text.length > 2500) {
      return res.status(400).json({
        error: "Metin en fazla 2500 karakter olabilir."
      });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: "eleven_flash_v2_5",
          language_code: "tr",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        }),
        signal: AbortSignal.timeout(45000)
      }
    );

    if (!response.ok) {
      const details = await response.text();

      console.error(
        "ElevenLabs TTS hatası:",
        response.status,
        details.slice(0, 500)
      );

      return res.status(502).json({
        error:
          "ElevenLabs ses üretemedi. API anahtarını, erişim izinlerini " +
          "ve kredi limitini kontrol et."
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    return res.send(audio);
  } catch (error) {
    console.error("TTS hatası:", error.message);

    return res.status(502).json({
      error: "Ses oluşturulamadı. Biraz sonra tekrar dene."
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
- Mümkünse web arama aracını kullan.
- Öncelikle resmî dokümantasyon ve güvenilir kaynakları değerlendir.
- Güncel bilgilerle genel bilgileri birbirinden ayır.
- Kaynaklarda bulunmayan ayrıntıları kaynaklardan alınmış gibi gösterme.
- Doğrulanamayan bilgileri açıkça belirt.
- Cevabı Türkçe ve anlaşılır hazırla.
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
        "Araştırma tamamlanamadı. API modelini, anahtarını ve " +
        "sağlayıcının araştırma desteğini kontrol et."
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
