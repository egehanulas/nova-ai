"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildScreenTextFallbackPrompt,
  buildTextOnlyDesktopFallbackInstruction
} = require("./desktop-ai-fallback");

test("screen text fallback uses only bounded accessible UI metadata", () => {
  const prompt = buildScreenTextFallbackPrompt({
    activeWindow: "Not Defteri",
    visibleItems: [{ name: "Dosya", controlType: "MenuItem" }, { name: "Yazı alanı", controlType: "Edit" }]
  });
  assert.match(prompt, /Gemini görsel analiz kotası/);
  assert.match(prompt, /Not Defteri/);
  assert.match(prompt, /Yazı alanı/);
  assert.match(prompt, /görmüş gibi davranma/);
  assert.doesNotMatch(prompt, /base64|data:image/i);
});

test("desktop text fallback forbids inventing visual details or coordinates", () => {
  const prompt = buildTextOnlyDesktopFallbackInstruction("Plan üret.");
  assert.match(prompt, /ekran görüntüsünü analiz edemiyorsun/);
  assert.match(prompt, /konumu tahmin etme/);
  assert.match(prompt, /güvenli biçimde dur/);
});
