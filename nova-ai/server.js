
require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

let helmet;

try {
  helmet = require("helmet");
} catch {
  helmet = null;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// Supabase: oturum doğrulama
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

// Giriş yapan kullanıcıyı doğrula
async function requireAuth(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      error: "Supabase sunucu ayarları eksik.",
    });
  }

  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      error: "Devam etmek için giriş yapmalısın.",
    });
  }

  try {
    const { data, error } = await supabase.auth.getUser(match[1]);

    if (error || !data?.user) {
      return res.status(401).json({
        error: "Oturum geçersiz veya süresi dolmuş. Tekrar giriş yap.",
      });
    }

    req.user = data.user;
    return next();
  } catch (error) {
    console.error("[NOVA AI] Oturum doğrulama hatası:", error.message);

    return res.status(503).json({
      error: "Oturum şu anda doğrulanamıyor.",
    });
  }
}

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
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

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

// Araştırma modu talimatı
const RESEARCH_INSTRUCTION = `
Araştırma modundasın.
Soruyu dikkatlice analiz et, konuyu başlıklar altında açıkla,
önemli ayrıntıları ve belirsizlikleri belirt.
Canlı internet araması yapmadıysan internette arama yaptığını iddia etme.
Kaynağını doğrulayamadığın bilgileri kesin gerçek gibi sunma.
`;

// Mesajları doğrula
function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

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
    if (messages[i].role === "user") return messages[i].content;
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

  return { systemText, conversation };
}

// Ortak hata oluşturucu
function makeHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Sağlayıcıların hata mesajlarını güvenli biçimde oku
async function readProviderError(response, providerName) {
  const data = await response.json().catch(() => ({}));
  const message =
    data?.error?.message ||
    data?.error?.metadata?.raw ||
    `${providerName} HTTP ${response.status}`;

  return makeHttpError(message, response.status);
}

// Gemini API — normal yanıt
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
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!response.ok) {
    throw await readProviderError(response, "Gemini");
  }

  const data = await response.json();

  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();

  if (!answer) throw new Error("Gemini boş yanıt döndürdü.");

  return { answer, provider: "gemini", model: GEMINI_MODEL };
}

// OpenRouter API — normal yanıt
async function callOpenRouter(messages, extraInstruction = "") {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY tanımlanmamış.");
  }

  const { systemText, conversation } = makeConversation(
    messages,
    extraInstruction
  );

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.APP_URL || "https://nova-ai-xxid.onrender.com",
        "X-Title": "NOVA AI",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "system", content: systemText }, ...conversation],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    }
  );

  if (!response.ok) {
    throw await readProviderError(response, "OpenRouter");
  }

  const data = await response.json();
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

// Groq API — normal yanıt
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
        messages: [{ role: "system", content: systemText }, ...conversation],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    }
  );

  if (!response.ok) {
    throw await readProviderError(response, "Groq");
  }

  const data = await response.json();
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

// Sağlayıcıları sırayla dene — normal yanıtlar için
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
    if (!provider.enabled) continue;

    try {
      return await provider.run();
    } catch (error) {
      failures.push({
        provider: provider.name,
        status: error.status || null,
        message: error.message,
      });

      console.error(`[NOVA AI] ${provider.name} hatası:`, error.message);
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

// OpenAI uyumlu sağlayıcıdan SSE akışını oku
async function streamOpenAIProvider({
  url,
  apiKey,
  model,
  messages,
  extraInstruction,
  providerName,
  headers = {},
  signal,
  onText,
}) {
  const { systemText, conversation } = makeConversation(
    messages,
    extraInstruction
  );

  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemText }, ...conversation],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw await readProviderError(response, providerName);
  }

  if (!response.body) {
    throw new Error(`${providerName} akış yanıtı alınamadı.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  async function processLine(line) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("data:")) return false;

    const dataText = trimmed.slice(5).trim();

    if (!dataText || dataText === "[DONE]") return dataText === "[DONE]";

    let data;

    try {
      data = JSON.parse(dataText);
    } catch {
      return false;
    }

    if (data?.error) {
      throw new Error(
        data.error.message || `${providerName} akış hatası oluştu.`
      );
    }

    const text = data?.choices?.[0]?.delta?.content;

    if (typeof text === "string" && text.length > 0) {
      answer += text;
      onText(text);
    }

    return false;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const finished = await processLine(line);
        if (finished) {
          await reader.cancel().catch(() => {});
          return {
            answer,
            provider: providerName,
            model,
          };
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      await processLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (!answer.trim()) {
    throw new Error(`${providerName} boş yanıt döndürdü.`);
  }

  return {
    answer: answer.trim(),
    provider: providerName,
    model,
  };
}

// Gemini SSE akışını oku
async function streamGemini({
  messages,
  extraInstruction,
  signal,
  onText,
}) {
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
    `${encodeURIComponent(GEMINI_MODEL)}:streamGenerateContent?alt=sse`;

  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!response.ok) {
    throw await readProviderError(response, "Gemini");
  }

  if (!response.body) {
    throw new Error("Gemini akış yanıtı alınamadı.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  async function processLine(line) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("data:")) return false;

    const dataText = trimmed.slice(5).trim();
    if (!dataText) return false;

    let data;

    try {
      data = JSON.parse(dataText);
    } catch {
      return false;
    }

    if (data?.error) {
      throw new Error(data.error.message || "Gemini akış hatası.");
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (typeof part.text === "string" && part.text.length > 0) {
        answer += part.text;
        onText(part.text);
      }
    }

    return false;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        await processLine(line);
      }

      if (done) break;
    }

    if (buffer.trim()) {
      await processLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (!answer.trim()) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }

  return {
    answer: answer.trim(),
    provider: "gemini",
    model: GEMINI_MODEL,
  };
}

// Sağlayıcıdan gerçek zamanlı yanıt al
async function generateStreamingAnswer({
  messages,
  extraInstruction = "",
  signal,
  onText,
}) {
  const providers = [
    {
      name: "gemini",
      enabled: Boolean(GEMINI_API_KEY),
      run: () =>
        streamGemini({
          messages,
          extraInstruction,
          signal,
          onText,
        }),
    },
    {
      name: "openrouter",
      enabled: Boolean(OPENROUTER_API_KEY),
      run: () =>
        streamOpenAIProvider({
          url: "https://openrouter.ai/api/v1/chat/completions",
          apiKey: OPENROUTER_API_KEY,
          model: OPENROUTER_MODEL,
          messages,
          extraInstruction,
          providerName: "openrouter",
          headers: {
            "HTTP-Referer":
              process.env.APP_URL || "https://nova-ai-xxid.onrender.com",
            "X-Title": "NOVA AI",
          },
          signal,
          onText,
        }),
    },
    {
      name: "groq",
      enabled: Boolean(GROQ_API_KEY),
      run: () =>
        streamOpenAIProvider({
          url: "https://api.groq.com/openai/v1/chat/completions",
          apiKey: GROQ_API_KEY,
          model: GROQ_MODEL,
          messages,
          extraInstruction,
          providerName: "groq",
          signal,
          onText,
        }),
    },
  ];

  const failures = [];

  for (const provider of providers) {
    if (!provider.enabled) continue;

    let providerSentText = false;

    try {
      const result = await provider.runWithTextTracking?.();

      if (result) return result;
    } catch (error) {
      failures.push({
        provider: provider.name,
        message: error.message,
      });
    }

    // Akışın her sağlayıcı için ayrı takip edilmesi aşağıdaki
    // deneme fonksiyonuyla yapılır.
    try {
      const result = await tryStreamingProvider(
        provider,
        messages,
        extraInstruction,
        signal,
        (text) => {
          providerSentText = true;
          onText(text);
        }
      );

      return result;
    } catch (error) {
      failures.push({
        provider: provider.name,
        message: error.message,
      });

      console.error(
        `[NOVA AI] ${provider.name} akış hatası:`,
        error.message
      );

      if (providerSentText) {
        const partialError = new Error(
          "Yanıt akışı kesildi. Lütfen yeniden dene."
        );
        partialError.partial = true;
        throw partialError;
      }
    }
  }

  const error = new Error(
    failures.length
      ? "Kullanılabilir sağlayıcılardan akış yanıtı alınamadı."
      : "Sunucuda hiçbir yapay zekâ API anahtarı tanımlanmamış."
  );

  error.failures = failures;
  throw error;
}

// Bir sağlayıcı için akış başlat
async function tryStreamingProvider(
  provider,
  messages,
  extraInstruction,
  signal,
  onText
) {
  if (provider.name === "gemini") {
    return streamGemini({
      messages,
      extraInstruction,
      signal,
      onText,
    });
  }

  if (provider.name === "openrouter") {
    return streamOpenAIProvider({
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: OPENROUTER_API_KEY,
      model: OPENROUTER_MODEL,
      messages,
      extraInstruction,
      providerName: "openrouter",
      headers: {
        "HTTP-Referer":
          process.env.APP_URL || "https://nova-ai-xxid.onrender.com",
        "X-Title": "NOVA AI",
      },
      signal,
      onText,
    });
  }

  if (provider.name === "groq") {
    return streamOpenAIProvider({
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: GROQ_API_KEY,
      model: GROQ_MODEL,
      messages,
      extraInstruction,
      providerName: "groq",
      signal,
      onText,
    });
  }

  throw new Error("Bilinmeyen yapay zekâ sağlayıcısı.");
}

// Asenkron hata yakalama
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// İstek mesajlarını doğrula
function getValidatedMessages(req, res, customError) {
  const { messages, message } = req.body || {};
  let conversation = normalizeMessages(messages);

  if (!conversation.length && typeof message === "string") {
    conversation = [{ role: "user", content: message.slice(0, 20000) }];
  }

  if (!conversation.length || !getLatestUserMessage(conversation)) {
    res.status(400).json({ error: customError });
    return null;
  }

  return conversation;
}

// SSE yanıtı için yardımcı
function sendSSE(res, payload) {
  if (res.writableEnded || res.destroyed) return;

  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// Gerçek zamanlı sohbet ve araştırma endpoint'i
function registerStreamingEndpoint(route, extraInstruction, customError) {
  app.post(
    route,
    requireAuth,
    asyncRoute(async (req, res) => {
      const messages = getValidatedMessages(req, res, customError);
      if (!messages) return;

      const controller = new AbortController();
      let clientDisconnected = false;
      let hasSentHeaders = false;
      let answer = "";

      res.on("close", () => {
        if (!res.writableEnded) {
          clientDisconnected = true;
          controller.abort();
        }
      });

      try {
        // Sağlayıcı seçimi başlamadan önce SSE başlıklarını gönderme.
        // İlk sağlayıcı HTTP hatası verirse diğer sağlayıcı denenebilir.
        let firstChunkSent = false;
        let providerInfo = null;

        const onText = (text) => {
          if (clientDisconnected || res.destroyed) return;

          if (!hasSentHeaders) {
            res.status(200);
            res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("X-Accel-Buffering", "no");
            res.flushHeaders?.();
            hasSentHeaders = true;
          }

          if (!firstChunkSent) {
            firstChunkSent = true;
            sendSSE(res, {
              type: "start",
              provider: providerInfo?.provider || null,
              model: providerInfo?.model || null,
            });
          }

          answer += text;
          sendSSE(res, { type: "chunk", text });
        };

        // Sağlayıcı metaverisi, sağlayıcı seçildiğinde ayarlanır.
        // İlk içerik gelmeden önce başarısız olursa diğer sağlayıcı denenir.
        const providers = [
          {
            name: "gemini",
            enabled: Boolean(GEMINI_API_KEY),
            run: async () => {
              providerInfo = { provider: "gemini", model: GEMINI_MODEL };
              return streamGemini({
                messages,
                extraInstruction,
                signal: controller.signal,
                onText,
              });
            },
          },
          {
            name: "openrouter",
            enabled: Boolean(OPENROUTER_API_KEY),
            run: async () => {
              providerInfo = {
                provider: "openrouter",
                model: OPENROUTER_MODEL,
              };
              return streamOpenAIProvider({
                url: "https://openrouter.ai/api/v1/chat/completions",
                apiKey: OPENROUTER_API_KEY,
                model: OPENROUTER_MODEL,
                messages,
                extraInstruction,
                providerName: "openrouter",
                headers: {
                  "HTTP-Referer":
                    process.env.APP_URL ||
                    "https://nova-ai-xxid.onrender.com",
                  "X-Title": "NOVA AI",
                },
                signal: controller.signal,
                onText,
              });
            },
          },
          {
            name: "groq",
            enabled: Boolean(GROQ_API_KEY),
            run: async () => {
              providerInfo = { provider: "groq", model: GROQ_MODEL };
              return streamOpenAIProvider({
                url: "https://api.groq.com/openai/v1/chat/completions",
                apiKey: GROQ_API_KEY,
                model: GROQ_MODEL,
                messages,
                extraInstruction,
                providerName: "groq",
                signal: controller.signal,
                onText,
              });
            },
          },
        ];

        const failures = [];
        let result = null;

        for (const provider of providers) {
          if (!provider.enabled) continue;

          try {
            result = await provider.run();
            break;
          } catch (error) {
            failures.push({
              provider: provider.name,
              message: error.message,
            });

            console.error(
              `[NOVA AI] ${provider.name} akış hatası:`,
              error.message
            );

            // İlk metin henüz gönderilmediyse diğer sağlayıcıyı dene.
            if (answer.length > 0 || firstChunkSent) {
              const partialError = new Error(
                "Yanıt akışı kesildi. Lütfen yeniden dene."
              );
              partialError.partial = true;
              throw partialError;
            }

            if (controller.signal.aborted || clientDisconnected) {
              return;
            }
          }
        }

        if (!result) {
          throw new Error(
            failures.length
              ? "Kullanılabilir sağlayıcılardan yanıt alınamadı."
              : "Sunucuda hiçbir yapay zekâ API anahtarı tanımlanmamış."
          );
        }

        if (clientDisconnected || res.destroyed) return;

        if (!hasSentHeaders) {
          res.status(200);
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          res.flushHeaders?.();
          hasSentHeaders = true;
        }

        sendSSE(res, {
          type: "done",
          success: true,
          provider: result.provider,
          model: result.model,
        });

        return res.end();
      } catch (error) {
        if (clientDisconnected || res.destroyed) return;

        console.error(`[NOVA AI] ${route} hatası:`, error.message);

        if (!hasSentHeaders) {
          return res.status(503).json({
            success: false,
            error:
              "Şu anda yanıt oluşturulamıyor. Lütfen daha sonra tekrar dene.",
          });
        }

        sendSSE(res, {
          type: "error",
          error:
            "Yanıt oluşturulurken bir hata oluştu. Lütfen yeniden dene.",
          partial: Boolean(error.partial),
        });

        return res.end();
      }
    })
  );
}

// Ana sayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"), (error) => {
    if (error && !res.headersSent) {
      res.status(200).send("NOVA AI sunucusu çalışıyor.");
    }
  });
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
      supabase: Boolean(supabase),
    },
  });
});

// Mevcut sohbet API'si — geriye dönük uyumlu
app.post(
  "/api/chat",
  requireAuth,
  asyncRoute(async (req, res) => {
    const conversation = getValidatedMessages(
      req,
      res,
      "Lütfen bir mesaj gönder."
    );
    if (!conversation) return;

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
        error: "Şu anda yanıt oluşturulamıyor. Lütfen daha sonra tekrar dene.",
      });
    }
  })
);

// Mevcut araştırma API'si — geriye dönük uyumlu
app.post(
  "/api/research",
  requireAuth,
  asyncRoute(async (req, res) => {
    const conversation = getValidatedMessages(
      req,
      res,
      "Lütfen araştırmak istediğin konuyu yaz."
    );
    if (!conversation) return;

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
        note: "Bu yanıt canlı internet araması yapıldığı anlamına gelmez.",
      });
    } catch (error) {
      console.error("[NOVA AI] Araştırma hatası:", error.message);

      return res.status(503).json({
        success: false,
        error: "Araştırma yanıtı oluşturulamadı. API ayarlarını kontrol et.",
      });
    }
  })
);

// Yeni gerçek zamanlı endpoint'ler
registerStreamingEndpoint(
  "/api/chat/stream",
  "",
  "Lütfen bir mesaj gönder."
);

registerStreamingEndpoint(
  "/api/research/stream",
  RESEARCH_INSTRUCTION,
  "Lütfen araştırmak istediğin konuyu yaz."
);

// Metinden sese — giriş zorunlu
app.post(
  "/api/tts",
  requireAuth,
  asyncRoute(async (req, res) => {
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return res.status(503).json({
        error: "ElevenLabs API anahtarı veya Voice ID tanımlanmamış.",
      });
    }

    const text = req.body?.text;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Seslendirilecek metni gönder." });
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
            process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
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
        error: "Ses oluşturulamadı. ElevenLabs ayarlarını kontrol et.",
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
  res.status(404).json({ error: "API endpoint bulunamadı." });
});

// Genel hata yakalama
app.use((error, req, res, next) => {
  console.error("[NOVA AI] Sunucu hatası:", error);

  if (res.headersSent) return next(error);

  return res.status(500).json({
    error: "Sunucuda beklenmeyen bir hata oluştu.",
  });
});

// Sunucuyu başlat
app.listen(PORT, "0.0.0.0", () => {
  console.log(`NOVA AI sunucusu ${PORT} portunda çalışıyor.`);
  console.log("Supabase:", supabase ? "Ayarlı" : "Ayarlı değil");
  console.log("Gemini:", GEMINI_API_KEY ? "Ayarlı" : "Ayarlı değil");
  console.log("OpenRouter:", OPENROUTER_API_KEY ? "Ayarlı" : "Ayarlı değil");
  console.log("Groq:", GROQ_API_KEY ? "Ayarlı" : "Ayarlı değil");
  console.log(
    "ElevenLabs:",
    ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID ? "Ayarlı" : "Ayarlı değil"
  );
});
