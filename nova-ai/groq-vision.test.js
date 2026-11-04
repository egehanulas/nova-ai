"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildGroqVisionRequest } = require("./groq-vision");

const screenshot = "A".repeat(120);

test("Groq vision request uses configured multimodal model and base64 image data URL", () => {
  const body = buildGroqVisionRequest({
    prompt: "Ekranı açıkla",
    screenshot,
    mimeType: "image/png",
    model: "qwen/qwen3.8-27b"
  });
  assert.equal(body.model, "qwen/qwen3.8-27b");
  assert.equal(body.max_completion_tokens, 900);
  assert.equal(body.messages[0].content[0].text, "Ekranı açıkla");
  assert.equal(
    body.messages[0].content[1].image_url.url,
    "data:image/png;base64," + screenshot
  );
});

test("Groq vision planner can request JSON mode", () => {
  const body = buildGroqVisionRequest({ prompt: "JSON döndür", screenshot, jsonMode: true });
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.max_completion_tokens, 700);
});

test("Groq vision rejects invalid image payloads and MIME types", () => {
  assert.throws(() => buildGroqVisionRequest({ screenshot: "short" }), /geçersiz/);
  assert.throws(
    () => buildGroqVisionRequest({ screenshot, mimeType: "text/plain" }),
    /Desteklenmeyen/
  );
});
