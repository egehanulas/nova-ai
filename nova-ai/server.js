
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
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// --------------------------------------------------
// AYARLAR
// --------------------------------------------------

const REQUEST_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.REQUEST_TIMEOUT_MS) || 60000
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

const MAX_MESSAGE_LENGTH = 20000;
const MAX_MESSAGES = 60;
const MAX_TTS_LENGTH = 5000;

// --------------------------------------------------
// SUPABASE
// --------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY;

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

// --------------------------------------------------
// GÜVENLİK
// --------------------------------------------------

if (helmet) {
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
}

app.use(express.static(path.join(__dirname, "public")));

app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Çok fazla istek gönderdin. Biraz bekleyip tekrar dene.",
    },
  })
);

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
    console.error(
      "[NOVA AI] Oturum doğrulama hatası:",
      error.message
    );

    return res.status(503).json({
      error: "Oturum şu anda doğrulanamıyor.",
    });
  }
}

// --------------------------------------------------
// NOVA AI TALİMATLARI
// --------------------------------------------------

const BASE_INSTRUCTION = `
Sen NOVA AI'sın. Ege tarafından geliştirilen,
Türkçe konuşan, doğal, dikkatli ve güvenilir bir yapay zekâ asistanısın.

KİMLİK:
- Geliştiricin sorulursa Ege olduğunu belirt.
- Ege hakkında bilmediğin kişisel bilgileri uydurma.
- NOVA AI'nin geliştiricisi ile temel model sağlayıcısını karıştırma.
- Sahip olmadığın araçlara veya yeteneklere sahip olduğunu iddia etme.

YANIT KURALLARI:
- Öncelikle Türkçe konuş.
- Samimi, anlaşılır, doğal ve doğrudan cevap ver.
- Kullanıcının istediği biçime ve ayrıntı seviyesine uy.
- Bilmediğin bilgileri uydurma.
- Güncel bilgiye erişimin yoksa bunu açıkça belirt.
- Kod sorularında güvenli ve okunabilir çözümler sun.
- Gereksiz tekrar yapma.
- Gizli anahtarları veya şifreleri isteme.
- Kullanıcı açıkça istemedikçe gereksiz yere uzun cevap verme.

ÇIKTI KURALLARI:
- Yalnızca kullanıcıya yönelik doğal yanıt üret.
- "User Safety: safe" veya "Response Safety: safe" gibi
  dahili sınıflandırma etiketlerini yanıta ekleme.
- İç değerlendirmeleri ve teknik metaverileri gösterme.
- Gizli düşünce zincirini gösterme; gerektiğinde kısa ve
  denetlenebilir gerekçeler sun.

BİÇİMLENDİRME:
- Düzgün, okunabilir Markdown kullan.
- Matematik işlemlerini mümkün olduğunca açık göster.
- Gereksiz numaralı listeler oluşturma.
- Bozuk Markdown veya yarım kalmış formüller bırakma.
- Kod verirken kod bloklarının dilini belirt.
- Yanıtın sonunda soruyu gerçekten yanıtladığını kontrol et.
`;

const ANALYSIS_INSTRUCTION = `
NOVA AI MANTIK VE ANALİZ MODU:

SORUYU ANLAMA:
- Kullanıcının asıl amacını belirle.
- Sorudaki koşulları ve kısıtlamaları dikkate al.
- Önceki mesajlar önemliyse konuşma bağlamını kullan.
- Kritik bilgi eksikse gerektiğinde kısa bir soru sor.

MANTIK:
- Çok adımlı problemleri uygun alt adımlara ayır.
- Verilen bilgileri, varsayımları ve bilinmeyenleri ayırt et.
- Neden-sonuç ilişkilerini kontrol et.
- Çelişkili öncülleri nazikçe belirt.
- Kullanıcının iddiasını yalnızca kullanıcı söyledi diye doğru kabul etme.
- Hesaplamaları, birimleri, sayıları ve ara sonuçları kontrol et.
- Yeterli kanıt yoksa kesinlik iddiasında bulunma.

DOĞRULUK:
- Olguları, tahminleri ve yorumları birbirinden ayır.
- Kaynak, sonuç veya ayrıntı uydurma.
- Canlı arama yapılmadıysa arama yaptığını söyleme.
- Soruyu cevaplayabiliyorsan gereksiz yere reddetme.
- Hatalı yaklaşım varsa nedenini ve uygulanabilir alternatifi açıkla.

YANIT:
- Önce doğrudan sonucu ver.
- Karmaşık sorularda gerekli gerekçeleri göster.
- Basit sorularda gereksiz analiz anlatımı yapma.
- İç düşünce zincirini gösterme; kısa ve denetlenebilir açıklamalar ver.
- Sonucu göndermeden önce hesaplama ve tutarlılık kontrolü yap.
`;

const RESEARCH_INSTRUCTION = `
ARAŞTIRMA MODU:

- Soruyu dikkatlice analiz et.
- Önemli ayrıntıları ve alternatifleri açıkla.
- Bilinenleri, belirsizlikleri ve varsayımları ayır.
- Canlı internet araması yapmadıysan yaptığını iddia etme.
- Kaynağını doğrulayamadığın bilgileri kesin gerçek gibi sunma.
- Güncel bilgi gerekiyorsa güncel kaynak olmadan kesin konuşma.
- Gerçek bir kaynağa erişmediysen kaynak veya bağlantı uydurma.
- Araştırma modunda olman tek başına internete eriştiğin anlamına gelmez.
`;

// --------------------------------------------------
// YARDIMCI FONKSİYONLAR
// --------------------------------------------------

function makeHttpError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createAbortController(timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort(new Error("İstek zaman aşımına uğradı."));
  }, timeoutMs);

  timer.unref?.();

  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

function cleanModelAnswer(text) {
  if (typeof text !== "string") return "";

  let result = text.trimStart();

  const labelPattern =
    /^(?:(?:User\s+Safety|Response\s+Safety)\s*:\s*(?:safe|unsafe|unknown)\s*[\r\n ]*)+/i;

  for (let i = 0; i < 5; i++) {
    const cleaned = result.replace(labelPattern, "").trimStart();

    if (cleaned === result) break;

    result = cleaned;
  }

  return result.trim();
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (message) =>
        message &&
        typeof message.content === "string" &&
        ["user", "assistant"].includes(message.role)
    )
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_MESSAGE_LENGTH),
    }));
}

function getLatestUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }

  return "";
}

function isComplexQuestion(text = "") {
  const value = String(text).toLocaleLowerCase("tr-TR");

  const signals = [
    /adım adım/,
    /karşılaştır/,
    /analiz et/,
    /analiz yap/,
    /neden.*sonuç/,
    /mantık/,
    /çelişki/,
    /hata ayıkla/,
    /\bdebug\b/,
    /mimari/,
    /birden fazla/,
    /olasılıkları/,
    /strateji/,
    /plan oluştur/,
    /hesapla/,
    /değerlendir/,
    /avantaj.*dezavantaj/,
    /çözümle/,
    /kök neden/,
    /doğrula/,
    /kontrol et/,
    /hata bul/,
    /kodun tamamı/,
  ];

  const signalCount = signals.filter((pattern) =>
    pattern.test(value)
  ).length;

  return signalCount >= 2 || value.length >= 700;
}

function getAnalysisMode(userMessage = "") {
  if (!isComplexQuestion(userMessage)) return "";

  return `
EK ANALİZ TALİMATI:
Bu soru dikkatli değerlendirme gerektiriyor.
- Koşulları ve kısıtlamaları belirle.
- Gerekli hesaplamaları sırayla yap.
- Sonucu ve ara işlemleri kontrol et.
- Varsayımları ve belirsizlikleri belirt.
- Kullanıcıya yalnızca gerekli gerekçeleri ve sonucu göster.
`;
}

function makeConversation(messages, extraInstruction = "") {
  const safeMessages = normalizeMessages(messages);
  const latestUserMessage = getLatestUserMessage(safeMessages);

  const systemText = [
    BASE_INSTRUCTION,
    ANALYSIS_INSTRUCTION,
    getAnalysisMode(latestUserMessage),
    extraInstruction,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemText,
    conversation: safeMessages,
  };
}

async function readProviderError(response, providerName) {
  const data = await response.json().catch(() => ({}));

  const message =
    data?.error?.message ||
    data?.error?.metadata?.raw ||
    `${providerName} HTTP ${response.status}`;

  const safeMessage = String(message).slice(0, 1000);

  return makeHttpError(
    safeMessage,
    response.status || 502
  );
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function getValidatedMessages(req, res, customError) {
  const { messages, message } = req.body || {};

  let conversation = normalizeMessages(messages);

  if (!conversation.length && typeof message === "string") {
    conversation = [
      {
        role: "user",
        content: message.slice(0, MAX_MESSAGE_LENGTH),
      },
    ];
  }

  if (
    !conversation.length ||
    !getLatestUserMessage(conversation).trim()
  ) {
    res.status(400).json({ error: customError });
    return null;
  }

  return conversation;
}

// --------------------------------------------------
// GEMINI
// --------------------------------------------------

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

  const { controller, clear } = createAbortController();

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
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
          temperature: 0.4,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      throw await readProviderError(response, "Gemini");
    }

    const data = await response.json();

    const rawAnswer = (
      data?.candidates?.[0]?.content?.parts || []
    )
      .map((part) => part.text || "")
      .join("");

    const answer = cleanModelAnswer(rawAnswer);

    if (!answer) {
      throw new Error("Gemini boş yanıt döndürdü.");
    }

    return {
      answer,
      provider: "gemini",
      model: GEMINI_MODEL,
    };
  } finally {
    clear();
  }
}

// --------------------------------------------------
// OPENROUTER
// --------------------------------------------------

async function callOpenRouter(messages, extraInstruction = "") {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY tanımlanmamış.");
  }

  const { systemText, conversation } = makeConversation(
    messages,
    extraInstruction
  );

  const { controller, clear } = createAbortController();

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.APP_URL || "https://nova-ai-xxid.onrender.com",
          "X-Title": "NOVA AI",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: systemText },
            ...conversation,
          ],
          temperature: 0.4,
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

    const answer = cleanModelAnswer(rawAnswer);

    if (!answer) {
      throw new Error("OpenRouter boş yanıt döndürdü.");
    }

    return {
      answer,
      provider: "openrouter",
      model: data?.model || OPENROUTER_MODEL,
    };
  } finally {
    clear();
  }
}

// --------------------------------------------------
// GROQ
// --------------------------------------------------

async function callGroq(messages, extraInstruction = "") {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY tanımlanmamış.");
  }

  const { systemText, conversation } = makeConversation(
    messages,
    extraInstruction
  );

  const { controller, clear } = createAbortController();

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemText },
            ...conversation,
          ],
          temperature: 0.4,
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

    const answer = cleanModelAnswer(rawAnswer);

    if (!answer) {
      throw new Error("Groq boş yanıt döndürdü.");
    }

    return {
      answer,
      provider: "groq",
      model: data?.model || GROQ_MODEL,
    };
  } finally {
    clear();
  }
}

// --------------------------------------------------
// NORMAL YANIT İÇİN SAĞLAYICI YEDEKLEMESİ
// --------------------------------------------------

async function generateAnswer(messages, extraInstruction = "") {
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

  const failures = [];

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

// --------------------------------------------------
// STREAMING METİN TEMİZLEYİCİSİ
// --------------------------------------------------

function createStreamingTextCleaner(onText) {
  let pending = "";
  let decided = false;

  const labels =
    /^(?:(?:User\s+Safety|Response\s+Safety)\s*:\s*(?:safe|unsafe|unknown)\s*[\r\n ]*)+/i;

  function flush(force = false) {
    if (decided) return;

    const trimmed = pending.trimStart();

    const labelPrefix =
      /^\s*(?:(?:User\s+Safety|Response\s+Safety)\s*:\s*(?:safe|unsafe|unknown)?\s*)*$/i;

    if (!force && pending.length < 120 && labelPrefix.test(pending)) {
      return;
    }

    pending = trimmed.replace(labels, "").trimStart();
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

// --------------------------------------------------
// OPENAI UYUMLU STREAMING
// --------------------------------------------------

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
      messages: [
        { role: "system", content: systemText },
        ...conversation,
      ],
      temperature: 0.4,
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
        if (await processLine(line)) {
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

// --------------------------------------------------
// GEMINI STREAMING
// --------------------------------------------------

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
      systemInstruction: {
        parts: [{ text: systemText }],
      },
      contents,
      generationConfig: {
        temperature: 0.4,
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

// --------------------------------------------------
// SSE YANIT YÖNETİMİ
// --------------------------------------------------

function sendSSE(res, payload) {
  if (res.writableEnded || res.destroyed) return;

  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function registerStreamingEndpoint(route, extraInstruction, customError) {
  app.post(
    route,
    requireAuth,
    asyncRoute(async (req, res) => {
      const messages = getValidatedMessages(req, res, customError);
      if (!messages) return;

      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      timeout.unref?.();

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
        res.setHeader(
          "Content-Type",
          "text/event-stream; charset=utf-8"
        );
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

          if (controller.signal.aborted || clientDisconnected) {
            return;
          }

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

            // Akış başladıysa aynı yanıtı ikinci bir sağlayıcıdan
            // başlatmak kullanıcıya yinelenen metin gösterebilir.
            if (answer.length > 0 || firstChunkSent) {
              const partialError = new Error(
                "Yanıt akışı kesildi."
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

        console.error(
          `[NOVA AI] ${route} hatası:`,
          error.message
        );

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
      } finally {
        clearTimeout(timeout);
      }
    })
  );
}

// --------------------------------------------------
// SAYFALAR VE SAĞLIK KONTROLÜ
// --------------------------------------------------

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"), (error) => {
    if (error && !res.headersSent) {
      res.status(200).send("NOVA AI sunucusu çalışıyor.");
    }
  });
});

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

// --------------------------------------------------
// NORMAL SOHBET
// --------------------------------------------------

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

// --------------------------------------------------
// ARAŞTIRMA
// --------------------------------------------------

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
        error:
          "Araştırma yanıtı oluşturulamadı. API ayarlarını kontrol et.",
      });
    }
  })
);

// --------------------------------------------------
// STREAMING ENDPOINT'LERİ
// --------------------------------------------------

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

// --------------------------------------------------
// ELEVENLABS TTS
// --------------------------------------------------

app.post(
  "/api/tts",
  requireAuth,
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

    if (text.length > MAX_TTS_LENGTH) {
      return res.status(400).json({
        error: `Metin en fazla ${MAX_TTS_LENGTH} karakter olabilir.`,
      });
    }

    const { controller, clear } = createAbortController();

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
          ELEVENLABS_VOICE_ID
        )}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: cleanModelAnswer(text),
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
    } catch (error) {
      if (error.name === "AbortError") {
        return res.status(504).json({
          error: "Ses oluşturma işlemi zaman aşımına uğradı.",
        });
      }

      throw error;
    } finally {
      clear();
    }
  })
);


/* --------------------------------------------------
   CLOUDFLARE WORKERS AI IMAGE GENERATION
-------------------------------------------------- */

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

app.post(
  "/api/image",
  requireAuth,
  asyncRoute(async (req, res) => {
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
      return res.status(503).json({
        error: "Cloudflare API ayarları eksik. Render Environment bölümünü kontrol et.",
      });
    }

    const prompt =
      typeof req.body?.prompt === "string"
        ? req.body.prompt.trim()
        : "";

    if (!prompt) {
      return res.status(400).json({
        error: "Oluşturmak istediğin resmi tarif et.",
      });
    }

    if (prompt.length > 2000) {
      return res.status(400).json({
        error: "Resim açıklaması en fazla 2000 karakter olabilir.",
      });
    }

    const { controller, clear } = createAbortController(120000);

    try {
      const model =
        process.env.CLOUDFLARE_IMAGE_MODEL ||
        "@cf/black-forest-labs/flux-1-schnell";

      // Flux modelleri İngilizce görsel tariflerini genellikle daha tutarlı izler.
      // Bilinen hayvan adlarını önce sabitle; çeviri modelinin türü insana çevirmesini engelle.
      const normalizedPrompt = prompt.toLocaleLowerCase("tr-TR");
      const monkeyRequest = /\\bmaymun\\b/i.test(normalizedPrompt);
      const requestedCountMatch = normalizedPrompt.match(/\\b(\\d{1,2})\\s*(?:tane|adet)?\\s*maymun\\b|\\biki\\s+(?:tane|adet\\s+)?maymun\\b/);
      const requestedMonkeyCount = requestedCountMatch
        ? (requestedCountMatch[0].includes("iki") ? 2 : Number(requestedCountMatch[1]) || 1)
        : 1;

      // Basit maymun çizim isteğini deterministik olarak kur; Gemini çevirisine bağlı bırakma.
      let imagePrompt = monkeyRequest
        ? `A clear illustration showing exactly ${requestedMonkeyCount} ${requestedMonkeyCount === 1 ? "monkey" : "monkeys"}, non-human primates with recognizable monkey faces, fur, limbs and natural animal anatomy. The monkeys are the main subjects and clearly visible. Do not depict any human, man, woman, person, statue, toy, or generic human-shaped figure. No text, letters, words, captions, watermarks, or logos anywhere in the image. User's original request was in Turkish; do not write it in the image.`
        : prompt;

      if (GEMINI_API_KEY && !monkeyRequest) {
        try {
          const translationController = new AbortController();
          const translationTimeout = setTimeout(
            () => translationController.abort(),
            12000
          );
          try {
            const translationResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
              {
                method: "POST",
                signal: translationController.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{
                    parts: [{
                      text:
                        "You are a precise translator for image-generation prompts. Translate the user's prompt into clear English. " +
                        "Semantic accuracy is more important than style. Preserve the exact subject, animal species, number, action, and setting; never replace an animal with a person or a similar-sounding word. " +
                        "Examples: 'maymun' means 'monkey' (the non-human primate), never 'man'; 'iki maymun çiz' means 'draw two monkeys'; 'kedi' means 'cat'; 'köpek' means 'dog'. " +
                        "Do not invent extra subjects or change singular/plural. Do not include the user's command as visible writing in the image. " +
                        "Append this instruction to the translated prompt: 'The image must depict the requested subject accurately. No text, letters, words, captions, watermarks, or logos anywhere in the image.' " +
                        "Return only the final English image prompt, with no explanation.\nUser prompt: " + prompt
                    }]
                  }],
                  generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
                })
              }
            );
            if (translationResponse.ok) {
              const translationData = await translationResponse.json();
              const translated = translationData?.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();
              if (translated) imagePrompt = translated;
            } else {
              console.warn("[NOVA AI] Görsel istemi çevirisi başarısız; orijinal istem kullanılacak.");
            }
          } finally {
            clearTimeout(translationTimeout);
          }
        } catch (translationError) {
          console.warn("[NOVA AI] Görsel istemi çevrilemedi; orijinal istem kullanılacak.");
        }
      }

      const url =
        `https://api.cloudflare.com/client/v4/accounts/` +
        `${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/ai/run/${model}`;

      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: imagePrompt,
          steps: 4,
        }),
      });

      if (!response.ok) {
        const details = await response.text().catch(() => "");

        console.error(
          "[NOVA AI] Cloudflare görsel API hatası:",
          response.status,
          details.slice(0, 700)
        );

        return res.status(502).json({
          error:
            response.status === 429
              ? "Cloudflare kullanım sınırına ulaşıldı. Daha sonra tekrar dene."
              : "Resim oluşturulamadı. Cloudflare API izinlerini ve limitlerini kontrol et.",
        });
      }

      const contentType = response.headers.get("content-type") || "";
      let image;
      let mimeType = "image/png";

      if (contentType.includes("application/json")) {
        const data = await response.json();
        image = data?.result?.image;
      } else if (contentType.startsWith("image/")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        image = buffer.toString("base64");
        mimeType = contentType.split(";")[0] || mimeType;
      }

      if (typeof image !== "string" || !image) {
        return res.status(502).json({
          error: "Cloudflare geçerli bir görsel döndürmedi.",
        });
      }

      return res.json({
        success: true,
        mimeType,
        image,
        model,
      });
    } catch (error) {
      if (error.name === "AbortError") {
        return res.status(504).json({
          error: "Resim oluşturma zaman aşımına uğradı.",
        });
      }

      throw error;
    } finally {
      clear();
    }
  })
);

// --------------------------------------------------
// BULUNAMAYAN API YOLLARI
// --------------------------------------------------

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint bulunamadı.",
  });
});

// --------------------------------------------------
// GENEL HATA YAKALAMA
// --------------------------------------------------

app.use((error, req, res, next) => {
  console.error(
    "[NOVA AI] Sunucu hatası:",
    error.message || error
  );

  if (res.headersSent) {
    return next(error);
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: "Gönderilen istek çok büyük.",
    });
  }

  return res.status(500).json({
    error: "Sunucuda beklenmeyen bir hata oluştu.",
  });
});

// --------------------------------------------------
// SUNUCUYU BAŞLAT
// --------------------------------------------------

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
