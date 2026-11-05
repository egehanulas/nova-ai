const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFeedbackEmailText,
  buildFeedbackTicketCode,
  normalizeFeedbackPayload,
  redactDiagnosticText
} = require("./feedback");

test("accepts valid feedback without diagnostics and never retains unselected diagnostics", () => {
  const result = normalizeFeedbackPayload({
    feedbackType: "bug",
    description: "Uygulama açılırken hata veriyor.",
    includeDiagnostics: false,
    diagnostics: { logs: "private log" }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.diagnostics, {});
  assert.equal(result.value.includeDiagnostics, false);
});

test("rejects invalid type and too-short description", () => {
  assert.equal(normalizeFeedbackPayload({ feedbackType: "other", description: "Yeterli açıklama." }).ok, false);
  assert.equal(normalizeFeedbackPayload({ feedbackType: "bug", description: "kısa" }).ok, false);
});

test("includes only bounded, redacted diagnostics when explicitly selected", () => {
  const result = normalizeFeedbackPayload({
    feedbackType: "general",
    description: "NOVA için bir önerim var.",
    includeDiagnostics: true,
    diagnostics: {
      appVersion: "0.2.0-alpha.70",
      platform: "Win32",
      userAgent: "NOVA Test",
      logs: "Bearer abcdefghijklmnop api_key=sk-abcdefghijklmnop user@example.com"
    }
  });
  assert.equal(result.ok, true);
  assert.match(result.value.diagnostics.logs, /REDACTED/);
  assert.doesNotMatch(result.value.diagnostics.logs, /user@example.com|abcdefghijklmnop/);
});

test("creates a stable ticket code from a UUID", () => {
  assert.equal(buildFeedbackTicketCode("12345678-abcd-4def-9876-123456789abc"), "NOVA-12345678AB");
});

test("email content omits diagnostics unless consent is recorded", () => {
  const plain = buildFeedbackEmailText({
    ticketCode: "NOVA-12345678AB",
    feedbackType: "bug",
    description: "Bir hata oluşuyor.",
    includeDiagnostics: false,
    diagnostics: { logs: "must not appear" }
  });
  assert.doesNotMatch(plain, /must not appear/);
  const withLogs = buildFeedbackEmailText({
    ticketCode: "NOVA-12345678AB",
    feedbackType: "bug",
    description: "Bir hata oluşuyor.",
    includeDiagnostics: true,
    diagnostics: { appVersion: "1.0", platform: "Win32", userAgent: "test", logs: "safe log" }
  });
  assert.match(withLogs, /safe log/);
});
