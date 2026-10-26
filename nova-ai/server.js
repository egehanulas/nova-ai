
require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Render Environment değişkeni eski değeri içeriyorsa onu da güncelle.
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const REQUEST_TIMEOUT_MS = 30000;

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const SYSTEM_INSTRUCTION = `
Sen NOVA AI'sın. Türkçe konuşan, doğal, zeki ve güvenilir bir asistansın.

- Kullanıcıyla samimi ve doğal konuş; gerektiğinde "knk" diyebilirsin.
- Kısa sorulara kısa, detaylı sorulara yeterince ayrıntılı cevap ver.
- Önceki konuşma bağlamını koru.
- Bilmediğin bilgileri uydurma.
- Kontrol etmediğin şeyleri kontrol etmiş gibi anlatma.
- Kod yardımlarında kullanıcının mevcut projesini koru.
- Gereksiz tekrarlardan ve uzun girişlerden kaçın.
- Kullanıcı beklerken gereksiz yere uzun cevaplar üretme.
- Yanıtı doğrudan soruya yönelik hazırla.
`;

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Çok fazla istek gönderdin. Bir dakika sonra tekrar dene." }
});

const researchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Araştırma sınırına ulaştın. Bir dakika sonra tekrar dene." }
});

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error("Mesajlar bir liste olmalı.");
  }

  return messages
    .filter((m) =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string" &&
      m.content.trim()
    )
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4000)
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
    if (web?.uri && web?.title) {
      unique.set(web.uri, { title: web.title, url: web.uri });
    }
  }

  return [...unique.values()].slice(0, 8);
}

async function fetchJson(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const rawText = await response.text();
    let data = {};

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { rawText };
    }

    if (!response.ok) {
      const error = new Error(
        data?.error?.message ||
        data?.message ||
        `Sağlayıcı HTTP ${response.status} hatası döndürdü.`
      );

      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Sağlayıcı ${timeoutMs / 1000} saniyede yanıt vermedi.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getFriendlyError(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = error?.status;

  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("resource_exhausted")
  ) {
    return "Kullanım kotası dolmuş veya istek sınırına ulaşılmış.";
  }

  if (
    status === 401 ||
    status === 403 ||
    message.includes("api key") ||
    message.includes("permission")
  ) {
    return "API anahtarı veya model erişimi kontrol edilmeli.";
  }

  if (
    message.includes("not found") ||
    message.includes("no longer available") ||
    message.includes("unsupported model")
  ) {
    return "Model bulunamadı veya bu hesapta kullanılamıyor.";
  }

  if (message.includes("saniyede yanıt vermedi")) {
    return "Yanıt zaman aşımına uğradı.";
  }

  return "Sağlayıcı isteği tamamlayamadı.";
}

// ---------------- GEMINI ----------------

async function askGemini(messages, options = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY tanımlı değil.");
  }

  const model = GEMINI_MODEL.replace(/^models\//, "");

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: {
      parts: [{
        text: options.systemInstruction || SYSTEM_INSTRUCTION
      }]
    },
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature: options.temperature ?? 0.5,
      maxOutputTokens: options.maxOutputTokens ?? 1200
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
  }, options.useSearch ? 45000 : REQUEST_TIMEOUT_MS);

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

// ---------------- OPENROUTER ----------------

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
    ...messages.map((m) => ({
      role: m.role,
      content: m.content
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
        max_tokens: options.maxOutputTokens ?? 1200
      })
    },
    options.useSearch ? 45000 : REQUEST_TIMEOUT_MS
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

// ---------------- SAĞLAYICI SEÇİMİ ----------------

async function generateAnswer(messages, options = {}) {
  const errors = [];

  // Önce Gemini, hata olursa OpenRouter denenir.
  if (GEMINI_API_KEY) {
    try {
      return await askGemini(messages, options);
    } catch (error) {
      console.error("Gemini:", error.message);
      errors.push({ provider: "Gemini", error });
    }
  }

  if (OPENROUTER_API_KEY) {
    try {
      return await askOpenRouter(messages, options);
    } catch (error) {
      console.error("OpenRouter:", error.message);
      errors.push({ provider: "OpenRouter", error });
    }
  }

  const error = new Error("Yapay zekâ sağlayıcılarından yanıt alınamadı.");
  error.providerErrors = errors;
  throw error;
}

function sendProviderError(res, error) {
  const details = error.providerErrors || [];

  const messages = details.map(({ provider, error: e }) => ({
    provider,
    message: getFriendlyError(e)
  }));

  const allQuota = details.length > 0 &&
    details.every(({ error: e }) => {
      const m = String(e.message || "").toLowerCase();
      return e.status === 429 ||
        m.includes("rate limit") ||
        m.includes("quota") ||
        m.includes("resource_exhausted");
    });

  return res.status(allQuota ? 429 : 502).json({
    error: allQuota
      ? "NOVA'nın kullanılabilir yapay zekâ kotası şu anda dolu."
      : "NOVA şu anda yanıt üretemedi. Sağlayıcı ayarlarını kontrol et.",
    providers: messages
  });
}

// ---------------- NORMAL SOHBET ----------------

app.post("/api/chat", chatLimiter, async (req, res) => {
  const startedAt = Date.now();

  try {
    const messages = normalizeMessages(req.body?.messages);

    if (!messages.length) {
      return res.status(400).json({
        error: "Geçerli bir mesaj göndermelisin."
      });
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");

    if (!latestUserMessage) {
      return res.status(400).json({
        error: "Sohbette bir kullanıcı mesajı bulunmalı."
      });
    }

    if (latestUserMessage.content.length > 2000) {
      return res.status(400).json({
        error: "Son mesaj en fazla 2000 karakter olabilir."
      });
    }

    const result = await generateAnswer(messages, {
      temperature: 0.5,
      maxOutputTokens: 1200
    });

    console.log(
      `Sohbet tamamlandı: ${result.provider}, ${Date.now() - startedAt}ms`
    );

    return res.json({
      reply: result.reply,
      provider: result.provider
    });
  } catch (error) {
    console.error("Sohbet hatası:", error.message);
    return sendProviderError(res, error);
  }
});

// ---------------- TTS UYUMLULUK ----------------
// Ücretli ElevenLabs servisine istek gönderilmez.
// Eski istemci bu endpoint'i çağırırsa anlaşılır cevap alır.

app.post("/api/tts", (req, res) => {
  return res.status(410).json({
    error: "Sunucu TTS kapalı. Tarayıcıdaki yerleşik seslendirmeyi kullan."
  });
});

// ---------------- WEB ARAŞTIRMASI ----------------

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
- Resmî dokümantasyonu ve güvenilir kaynakları önceliklendir.
- Güncel bilgileri genel bilgilerden ayır.
- Erişmediğin kaynakları erişmiş gibi gösterme.
- Belirsizliği açıkça belirt.
- Cevabı Türkçe hazırla.
`;

    const result = await generateAnswer(messages, {
      systemInstruction: researchInstruction,
      useSearch: true,
      temperature: 0.3,
      maxOutputTokens: 2200
    });

    return res.json({
      reply: result.reply,
      sources: result.sources,
      provider: result.provider
    });
  } catch (error) {
    console.error("Araştırma hatası:", error.message);
    return sendProviderError(res, error);
  }
});

// ---------------- SAĞLIK KONTROLÜ ----------------

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "NOVA AI",
    model: GEMINI_MODEL,
    geminiConfigured: Boolean(GEMINI_API_KEY),
    openrouterConfigured: Boolean(OPENROUTER_API_KEY)
  });
});

// ---------------- HATA YÖNETİMİ ----------------

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
  console.log(`Gemini model: ${GEMINI_MODEL}`);
  console.log(`Gemini API: ${GEMINI_API_KEY ? "ayarlı" : "eksik"}`);
  console.log(`OpenRouter API: ${OPENROUTER_API_KEY ? "ayarlı" : "eksik"}`);
});
