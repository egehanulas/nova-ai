
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

// Supabase
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

// Oturum doğrulama
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

// Ana talimatlar
const BASE_INSTRUCTION = `
Sen NOVA AI'sın. Ege tarafından geliştirilen,
Türkçe konuşan, doğal, zeki, dikkatli ve güvenilir
bir yapay zekâ asistanısın.

KİMLİK:
- Geliştiricin sorulursa Ege olduğunu belirt.
- Şöyle cevap verebilirsin:
  "Ben NOVA AI'yım. Ege tarafından geliştirildim.
  Ege, NOVA AI projesini tasarlayan ve geliştiren kişidir. ❤️"
- NOVA AI'nin geliştiricisi ile temel model sağlayıcısını karıştırma.
- Ege hakkında bilmediğin kişisel bilgileri uydurma.

YANIT KURALLARI:
- Öncelikle Türkçe konuş.
- Samimi, anlaşılır, doğal ve doğrudan cevap ver.
- Bilmediğin bilgileri uydurma.
- Güncel bilgiye erişimin yoksa bunu açıkça belirt.
- Kod sorularında güvenli ve okunabilir örnekler sun.
- Gereksiz tekrar yapma.
- Gizli anahtarları veya şifreleri isteme.

ÇIKTI KURALLARI:
- Yalnızca kullanıcıya yönelik doğal yanıtı üret.
- "User Safety: safe" veya "Response Safety: safe"
  gibi dahili sınıflandırma etiketlerini yanıta ekleme.
- Güvenlik etiketlerini, iç değerlendirmeleri ve teknik
  metaverileri kullanıcıya gösterme.
- Yanıtı güvenlik etiketleriyle başlatma.
`;

// Araştırma talimatları
const RESEARCH_INSTRUCTION = `
Araştırma modundasın.
Soruyu dikkatlice analiz et ve başlıklar altında açıkla.
Önemli ayrıntıları ve belirsizlikleri belirt.
Canlı internet araması yapmadıysan arama yaptığını iddia etme.
Kaynağını doğrulayamadığın bilgileri kesin gerçek gibi sunma.
`;

// Model yanıtındaki istenmeyen başlangıç etiketlerini temizle.
// Yalnızca yanıtın başındaki etiketleri kaldırır.
function cleanModelAnswer(text) {
  if (typeof text !== "string") return "";

  let result = text.trimStart();

  const labelPattern =
    /^(?:(?:User\s+Safety|Response\s+Safety)\s*:\s*(?:safe|unsafe|unknown)\s*[\r\n ]*)+/i;

  // Etiketlerden sonra başka bir etiket gelebileceği için
  // başlangıçtaki etiketleri birden fazla kez temizle.
  for (let i = 0; i < 5; i++) {
    const cleaned = result.replace(labelPattern, "").trimStart();

    if (cleaned === result) break;

    result = cleaned;
  }

  return result.trim();
}

// Akışta başlangıç etiketlerini temizlemek için tampon.
// Başlangıç kesinleşene kadar metin ön yüze gönderilmez.
function createStreamingTextCleaner(onText) {
  let pending = "";
  let decided = false;

  const labelStart =
    /^\s*(?:(?:User\s+Safety|Response\s+Safety)\s*:\s*(?:safe|unsafe|unknown)\b[\s\r\n]*)+/i;

  function flush(force = false) {
    if (decided) return;

    const trimmed = pending.trimStart();

    // Henüz etiketin tamamı gelmediyse bekle.
    const possibleLabel =
      /^\s*(?:(?:User\s+Safety|Response\s+Safety)\s*:\s*(?:safe|unsafe|unknown)?\s*)*$/i;

    if (!force && pending.length < 120 && possibleLabel.test(pending)) {
      return;
    }

    pending = pending.replace(labelStart, "").trimStart();
    decided = true;

    if (pending) onText(pending);

    pending = "";
  }

  return {
    push(text) {
      if (!text) return;

      if (decided) {
        onText(text);
        return;
      }

      pending += text;

      // İlk metin bir etiketle başlıyorsa ikinci etiketi de
      // temizleyebilmek için kısa süre daha bekle.
      const beginsWithLabel =
        /^\s*(?:User\s+Safety|Response\s+Safety)\s*:/i.test(pending);

      if (
        pending.length >= 120 ||
        pending.includes("\n") ||
        !beginsWithLabel
      ) {
        flush(false);
      }
    },

    finish() {
      flush(true);
    },
  };
}

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

  return { systemText, conversation };
}

// HTTP hatası oluştur
function makeHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Sağlayıcı hata mesajını oku
async function readProviderError(response, providerName) {
  const data = await response.json().catch(() => ({}));
  const message =
    data?.error?.message ||
    data?.error?.metadata?.raw ||
    `${providerName} HTTP ${response.status}`;

  return makeHttpError(message, response.status);
}

// Gemini normal yanıt
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

  const rawAnswer = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("");

  const answer = cleanModelAnswer(rawAnswer);

  if (!answer) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }

  return { answer, provider: "gemini", model: GEMINI_MODEL };
}

// OpenRouter normal yanıt
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
  const rawAnswer = data?.choices?.[0]?.message?.content;

  if (typeof rawAnswer !== "string" || !rawAnswer.trim()) {
    throw new Error("OpenRouter boş yanıt döndürdü.");
  }

  return {
    answer: cleanModelAnswer(rawAnswer),
    provider: "openrouter",
    model: data?.model || OPENROUTER_MODEL,
  };
}

// Groq normal yanıt
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
  const rawAnswer = data?.choices?.[0]?.message?.content;

  if (typeof rawAnswer !== "string" || !rawAnswer.trim()) {
    throw new Error("Groq boş yanıt döndürdü.");
  }

  return {
    answer: cleanModelAnswer(rawAnswer),
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

// OpenAI uyumlu sağlayıcının SSE akışını oku
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

  const cleaner = createStreamingTextCleaner(onText);

  async function processLine(line) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("data:")) return false;

    const dataText = trimmed.slice(5).trim();

    if (!dataText) return false;
    if (dataText === "[DONE]") return true;

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
      cleaner.push(text);
    }

    return false;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      buffer += decoder.decode(value || new Uint8Array(), {
        stream: !done,
      });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const finished = await processLine(line);

        if (finished) {
          cleaner.finish();
          await reader.cancel().catch(() => {});

          return {
            answer: cleanModelAnswer(answer),
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
    cleaner.finish();
    reader.releaseLock();
  }

  if (!answer.trim()) {
    throw new Error(`${providerName} boş yanıt döndürdü.`);
  }

  return {
    answer: cleanModelAnswer(answer),
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

  const cleaner = createStreamingTextCleaner(onText);

  async function processLine(line) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("data:")) return;

    const dataText = trimmed.slice(5).trim();
    if (!dataText) return;

    let data;

    try {
      data = JSON.parse(dataText);
    } catch {
      return;
    }

    if (data?.error) {
      throw new Error(data.error.message || "Gemini akış hatası.");
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (typeof part.text === "string" && part.text.length > 0) {
        answer += part.text;
        cleaner.push(part.text);
      }
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      buffer += decoder.decode(value || new Uint8Array(), {
        stream: !done,
      });

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
    cleaner.finish();
    reader.releaseLock();
  }

  if (!answer.trim()) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }

  return {
    answer: cleanModelAnswer(answer),
    provider: "gemini",
    model: GEMINI_MODEL,
  };
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
    conversation = [
      {
        role: "user",
        content: message.slice(0, 20000),
      },
    ];
  }

  if (!conversation.length || !getLatestUserMessage(conversation)) {
    res.status(400).json({ error: customError });
    return null;
  }

  return conversation;
}

// SSE yanıtı gönder
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
      let firstChunkSent = false;
      let providerInfo = null;

      res.on("close", () => {
        if (!res.writableEnded) {
          clientDisconnected = true;
          controller.abort();
        }
      });

      function startSSE() {
        if (hasSentHeaders) return;

        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        res.flushHeaders?.();
        hasSentHeaders = true;
      }

      const onText = (text) => {
        if (clientDisconnected || res.destroyed) return;

        startSSE();

        if (!firstChunkSent) {
          firstChunkSent = true;

          sendSSE(res, {
            type: "start",
            provider: providerInfo?.provider || null,
            model: providerInfo?.model || null,
          });
        }

        answer += text;

        sendSSE(res, {
          type: "chunk",
          text,
        });
      };

      const providers = [
        {
          name: "gemini",
          enabled: Boolean(GEMINI_API_KEY),
          run: () => {
            providerInfo = {
              provider: "gemini",
              model: GEMINI_MODEL,
            };

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
          run: () => {
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
          run: () => {
            providerInfo = {
              provider: "groq",
              model: GROQ_MODEL,
            };

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

      try {
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

            // Metin gönderildikten sonra başka sağlayıcıya geçmek
            // aynı yanıtın iki kez görünmesine neden olabilir.
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

        startSSE();

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

// Normal sohbet API'si
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
        answer: cleanModelAnswer(result.answer),
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

// Normal araştırma API'si
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
        answer: cleanModelAnswer(result.answer),
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

// Gerçek zamanlı endpoint'ler
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

// ElevenLabs metinden sese
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
          text: cleanModelAnswer(text),
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
  res.status(404).json({
    error: "API endpoint bulunamadı.",
  });
});

// Genel hata yakalama
app.use((error, req, res, next) => {
  console.error("[NOVA AI] Sunucu hatası:", error.message || error);

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
    ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID
      ? "Ayarlı"
      : "Ayarlı değil"
  );
});
