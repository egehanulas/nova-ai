"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyAiError, getAiErrorMessage, createProviderExhaustedError, safeProviderDiagnostic } = require("./ai-errors");
const { assertProviderStreamComplete, assertNonStreamingComplete } = require("./ai-stream-completion");
const { runProviderFallback } = require("./ai-provider-fallback");

test("classifies provider overload, timeout, incomplete stream and unavailable service separately", () => {
  assert.equal(classifyAiError({ status: 429 }), "AI_RATE_LIMIT");
  assert.equal(classifyAiError({ status: 401 }), "AI_AUTH");
  assert.equal(classifyAiError(new TypeError("fetch failed")), "NETWORK");
  assert.equal(classifyAiError(Object.assign(new Error("deadline"), { code: "AI_TIMEOUT" })), "AI_TIMEOUT");
  assert.equal(classifyAiError(Object.assign(new Error("connection ended"), { code: "AI_INCOMPLETE" })), "AI_INCOMPLETE");
  assert.equal(classifyAiError(new Error("provider internals")), "AI_UNAVAILABLE");
  assert.match(getAiErrorMessage(Object.assign(new Error("secret provider details"), { code: "AI_UNAVAILABLE" })), /daha sonra yeniden deneyebilirsin/i);
  assert.doesNotMatch(getAiErrorMessage(new Error("secret provider details")), /secret|provider internals/i);
});

test("fallback exhaustion keeps only safe diagnostic fields and reports configuration distinctly", () => {
  assert.equal(createProviderExhaustedError([{ status: 429 }], 1).code, "AI_RATE_LIMIT");
  assert.equal(createProviderExhaustedError([{ code: "AI_TIMEOUT" }], 1).code, "AI_TIMEOUT");
  assert.equal(createProviderExhaustedError([{ code: "AI_TIMEOUT" }, { name: "AbortError" }], 2).code, "AI_TIMEOUT");
  assert.equal(createProviderExhaustedError([{ code: "AI_OUTPUT_LIMIT" }, { code: "AI_OUTPUT_LIMIT" }], 2).code, "AI_OUTPUT_LIMIT");
  assert.equal(createProviderExhaustedError([{ code: "AI_INCOMPLETE" }], 1).code, "AI_INCOMPLETE");
  assert.equal(createProviderExhaustedError([], 0).code, "AI_CONFIGURATION");
  const diagnostic = safeProviderDiagnostic("groq", Object.assign(new Error("Bearer secret and private prompt"), { status: 503 }));
  assert.deepEqual(diagnostic, { provider: "groq", code: "AI_UNAVAILABLE", status: 503, name: "Error" });
  assert.equal(JSON.stringify(diagnostic).includes("secret"), false);
});

test("provider fallback retries the same context in order and stops at the first complete answer", async () => {
  const context = [{ role: "user", content: "Önceki mesaj" }, { role: "assistant", content: "Önceki yanıt" }, { role: "user", content: "Devam et" }];
  const calls = [];
  const result = await runProviderFallback([
    { name: "primary", enabled: true, async run() { calls.push(["primary", context]); throw Object.assign(new Error("rate limited"), { status: 429 }); } },
    { name: "fallback", enabled: true, async run() { calls.push(["fallback", context]); return { answer: "Bağlamı koruyan yanıt", provider: "fallback" }; } },
  ]);
  assert.equal(result.answer, "Bağlamı koruyan yanıt");
  assert.deepEqual(calls.map(([name]) => name), ["primary", "fallback"]);
  assert.equal(calls[0][1], calls[1][1]);
  await assert.rejects(runProviderFallback([{ name: "off", enabled: false, run: async () => ({ answer: "" }) }]), { code: "AI_CONFIGURATION" });
});

test("only a terminal provider signal marks a streamed answer complete", () => {
  assert.equal(assertProviderStreamComplete({ provider: "openai", doneMarker: true, answer: "ok" }), false);
  assert.equal(assertProviderStreamComplete({ provider: "openai", finishReason: "stop", answer: "ok" }), false);
  assert.equal(assertProviderStreamComplete({ provider: "gemini", finishReason: "STOP", answer: "ok" }), false);
  assert.equal(assertProviderStreamComplete({ provider: "gemini", finishReason: "MAX_TOKENS", answer: "partial" }), true);
  assert.throws(() => assertProviderStreamComplete({ provider: "openai", answer: "partial" }), { code: "AI_INCOMPLETE" });
  assert.throws(() => assertProviderStreamComplete({ provider: "gemini", answer: "partial" }), { code: "AI_INCOMPLETE" });
  assert.throws(() => assertProviderStreamComplete({ provider: "openai", doneMarker: true, answer: "" }), { code: "AI_EMPTY" });
});

test("non-stream responses reject missing terminal reasons and token-limited output", () => {
  assert.doesNotThrow(() => assertNonStreamingComplete({ provider: "openai", finishReason: "stop", answer: "Tamam" }));
  assert.throws(() => assertNonStreamingComplete({ provider: "openai", finishReason: "length", answer: "Yarım" }), { code: "AI_OUTPUT_LIMIT" });
  assert.throws(() => assertNonStreamingComplete({ provider: "gemini", finishReason: "MAX_TOKENS", answer: "Yarım" }), { code: "AI_OUTPUT_LIMIT" });
  assert.throws(() => assertNonStreamingComplete({ provider: "gemini", answer: "Yanıt" }), { code: "AI_INCOMPLETE" });
});
