"use strict";

function buildGroqVisionRequest({
  prompt,
  screenshot,
  mimeType = "image/jpeg",
  model = "qwen/qwen3.8-27b",
  jsonMode = false
}) {
  if (typeof screenshot !== "string" || screenshot.length < 100 ||
      screenshot.length > 1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(screenshot)) {
    throw new Error("Ekran görüntüsü biçimi geçersiz veya boyut sınırını aşıyor.");
  }
  if (!["image/jpeg", "image/png"].includes(mimeType)) {
    throw new Error("Desteklenmeyen ekran görüntüsü biçimi.");
  }
  if (typeof model !== "string" || !model.trim()) {
    throw new Error("Groq görsel modeli ayarlı değil.");
  }

  const body = {
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: String(prompt || "Ekranda ne görüyorsun?") },
        {
          type: "image_url",
          image_url: { url: "data:" + mimeType + ";base64," + screenshot }
        }
      ]
    }],
    temperature: 0.2,
    max_completion_tokens: jsonMode ? 700 : 900
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  return body;
}

module.exports = { buildGroqVisionRequest };
