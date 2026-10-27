require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

let helmet;

try {
  helmet = require("helmet");
} catch {
  helmet = null;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

// Render proxy ayarı
app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));

// Ön yüz dosyaları
app.use(express.static(path.join(__dirname, "public")));

// Güvenlik başlıkları
if (helmet) {
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
}

// API istek sınırı
app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// API anahtarları
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Modeller
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// ElevenLabs
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// NOVA AI ana talimatları
const BASE_INSTRUCTION = `
Sen NOVA AI'sın. Ege tarafından geliştirilen,
Türkçe konuşan, doğal, zeki, dikkatli ve güvenilir
bir yapay zekâ asistanısın.

Geliştiricin Ege'dir. Kullanıcı "Seni kim yaptı?",
"Kim tarafından geliştirildin?" veya benzer bir soru
sorduğunda şu şekilde cevap ver:

"Ben NOVA AI'yım. Ege tarafından geliştirildim.
Ege, NOVA AI projesini tasarlayan ve geliştiren kişidir. ❤️"

Kimliğinle ilgili kurallar:
- NOVA AI'nin geliştiricisi sorulursa Ege olduğunu belirt.
- OpenAI'nin seni geliştirdiğini söyleyerek NOVA AI projesinin
  geliştiricisini karıştırma.
- NOVA AI projesini Ege geliştirmiştir; kullandığın temel
  yapay zekâ modelleri farklı şirketlere ait olabilir.
- Ege'nin bilmediğin kişisel bilgilerini uydurma.
- Kullanıcıyla öncelikle Türkçe konuş.
- Samimi, anlaşılır ve doğal cevaplar ver.
- Sorulara doğrudan cevap ver.
- Bilmediğin bilgileri uydurma.
- Güncel bilgiye erişimin yoksa bunu açıkça belirt.
- Kod sorularında çalışan, okunabilir ve güvenli örnekler sun.
- Gizli anahtarları, şifreleri veya özel bilgileri isteme.
- Gereksiz yere aynı bilgiyi tekrar etme.
`;

// Mesajları doğrula
function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        message &&
        typeof message.content === "string" &&
        ["system", "user", "assistant"].includes(message.role)
    )
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 20000),
    }));
}

// Son kullanıcı mesajını bul
function getLatestUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }

  return "";
}

// Konuşmayı hazırla
function makeConversation(messages, extraInstruction = "") {
  const safeMessages = normalizeMessages(messages);

  const systemText = [
    BASE_INSTRUCTION,
    extraInstruction,
    ...safeMessages
      .filter((message) => message.role === "system")
      .map((message) => message.content),
  ]
    .filter(Boolean)
    .join("\n\n");

  const conversation = safeMessages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  return {
    systemText,
    conversation,
  };
}

// Gemini API
async function callGemini(messages, extraInstruction = "") {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY tanımlanmamış.");
  }

  const { systemText, conversation } = makeConversation(
    messages,
    extraInstruction
  );

  const contents = conversation.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemText }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `Gemini HTTP ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }

  return {
    answer,
    provider: "gemini",
    model: GEMINI_MODEL,
  };
}

// OpenRouter API
async function callOpenRouter(messages, extraInstruction = "") {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY tanımlanmamış.");
  }

  const { systemText, conversation } = makeConversation(
    messages,
    extraInstruction
  );

  const apiMessages = [
    {
      role: "system",
      content: systemText,
    },
    ...conversation,
  ];

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.APP_URL ||
          "https://nova-ai-xxid.onrender.com",
        "X-Title": "NOVA AI",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `OpenRouter HTTP ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  const answer = data?.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("OpenRouter boş yanıt döndürdü.");
  }

  return {
    answer: answer.trim(),
    provider: "openrouter",
    model: data?.model || OPENROUTER_MODEL,
  };
}

// Groq API
async function callGroq(messages, extraInstruction = "") {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY tanımlanmamış.");
  }

  const { systemText, conversation } = makeConversation(
    messages,
    extraInstruction
  );

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: systemText,
          },
          ...conversation,
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `Groq HTTP ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  const answer = data?.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("Groq boş yanıt döndürdü.");
  }

  return {
    answer: answer.trim(),
    provider: "groq",
    model: data?.model || GROQ_MODEL,
  };
}

// Sağlayıcıları sırayla dene
async function generateAnswer(messages, extraInstruction = "") {
  const failures = [];

  const providers = [
    {
      name: "gemini",
      enabled: Boolean(GEMINI_API_KEY),
      run: () => callGemini(messages, extraInstruction),
    },
    {
      name: "openrouter",
      enabled: Boolean(OPENROUTER_API_KEY),
      run: () => callOpenRouter(messages, extraInstruction),
    },
    {
      name: "groq",
      enabled: Boolean(GROQ_API_KEY),
      run: () => callGroq(messages, extraInstruction),
    },
  ];

  for (const provider of providers) {
    if (!provider.enabled) {
      continue;
    }

    try {
      return await provider.run();
    } catch (error) {
      failures.push({
        provider: provider.name,
        status: error.status || null,
        message: error.message,
      });

      console.error(
        `[NOVA AI] ${provider.name} hatası:`,
        error.message
      );
    }
  }

  const error = new Error(
    failures.length
      ? "Kullanılabilir yapay zekâ sağlayıcılarından yanıt alınamadı."
      : "Sunucuda hiçbir yapay zekâ API anahtarı tanımlanmamış."
  );

  error.failures = failures;
  throw error;
}

// Asenkron hata yakalama
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Ana sayfa
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html"),
    (error) => {
      if (error && !res.headersSent) {
        res.status(200).send("NOVA AI sunucusu çalışıyor.");
      }
    }
  );
});

// Sağlık kontrolü
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    name: "NOVA AI",
    timestamp: new Date().toISOString(),
    providers: {
      gemini: Boolean(GEMINI_API_KEY),
      openrouter: Boolean(OPENROUTER_API_KEY),
      groq: Boolean(GROQ_API_KEY),
      elevenlabs: Boolean(ELEVENLABS_API_KEY),
    },
  });
});

// Sohbet API'si
app.post(
  "/api/chat",
  asyncRoute(async (req, res) => {
    const { messages, message } = req.body || {};
    let conversation = normalizeMessages(messages);

    if (!conversation.length && typeof message === "string") {
      conversation = [
        {
          role: "user",
          content: message.slice(0, 20000),
        },
      ];
    }

    if (!conversation.length || !getLatestUserMessage(conversation)) {
      return res.status(400).json({
        error: "Lütfen bir mesaj gönder.",
      });
    }

    try {
      const result = await generateAnswer(conversation);

      return res.json({
        success: true,
        answer: result.answer,
        provider: result.provider,
        model: result.model,
      });
    } catch (error) {
      console.error("[NOVA AI] Sohbet hatası:", error.message);

      return res.status(503).json({
        success: false,
        error:
          "Şu anda yanıt oluşturulamıyor. Lütfen daha sonra tekrar dene.",
      });
    }
  })
);

// Araştırma modu API'si
app.post(
  "/api/research",
  asyncRoute(async (req, res) => {
    const { messages, message } = req.body || {};
    let conversation = normalizeMessages(messages);

    if (!conversation.length && typeof message === "string") {
      conversation = [
        {
          role: "user",
          content: message.slice(0, 20000),
        },
      ];
    }

    if (!conversation.length || !getLatestUserMessage(conversation)) {
      return res.status(400).json({
        error: "Lütfen araştırmak istediğin konuyu yaz.",
      });
    }

    try {
      const result = await generateAnswer(
        conversation,
        RESEARCH_INSTRUCTION
      );

      return res.json({
        success: true,
        answer: result.answer,
        provider: result.provider,
        model: result.model,
        searched: false,
        note:
          "Bu yanıt canlı internet araması yapıldığı anlamına gelmez.",
      });
    } catch (error) {
      console.error("[NOVA AI] Araştırma hatası:", error.message);

      return res.status(503).json({
        success: false,
        error:
          "Araştırma yanıtı oluşturulamadı. API ayarlarını kontrol et.",
      });
    }
  })
);

// Metinden sese dönüştürme
app.post(
  "/api/tts",
  asyncRoute(async (req, res) => {
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return res.status(503).json({
        error:
          "ElevenLabs API anahtarı veya Voice ID tanımlanmamış.",
      });
    }

    const text = req.body?.text;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        error: "Seslendirilecek metni gönder.",
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        error: "Metin en fazla 5000 karakter olabilir.",
      });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        ELEVENLABS_VOICE_ID
      )}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id:
            process.env.ELEVENLABS_MODEL_ID ||
            "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");

      console.error(
        "[NOVA AI] ElevenLabs hatası:",
        response.status,
        errorText.slice(0, 500)
      );

      return res.status(502).json({
        error:
          "Ses oluşturulamadı. ElevenLabs ayarlarını kontrol et.",
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audio.length);
    res.setHeader("Cache-Control", "no-store");

    return res.send(audio);
  })
);

// Bulunamayan API yolları
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint bulunamadı.",
  });
});

// Genel hata yakalama
app.use((error, req, res, next) => {
  console.error("[NOVA AI] Sunucu hatası:", error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    error: "Sunucuda beklenmeyen bir hata oluştu.",
  });
});

// Sunucuyu başlat
app.listen(PORT, "0.0.0.0", () => {
  console.log(`NOVA AI sunucusu ${PORT} portunda çalışıyor.`);
  console.log("Gemini:", GEMINI_API_KEY ? "Ayarlı" : "Ayarlı değil");
  console.log(
    "OpenRouter:",
    OPENROUTER_API_KEY ? "Ayarlı" : "Ayarlı değil"
  );
  console.log("Groq:", GROQ_API_KEY ? "Ayarlı" : "Ayarlı değil");

  console.log(
    "ElevenLabs:",
    ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID
      ? "Ayarlı"
      : "Ayarlı değil"
  );
});
