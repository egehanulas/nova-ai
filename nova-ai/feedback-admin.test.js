const test = require("node:test");
const assert = require("node:assert/strict");
const { isFeedbackAdmin, normalizeFeedbackStatus } = require("./feedback-admin");

test("only the confirmed developer account is accepted", () => {
  assert.equal(isFeedbackAdmin({ email: "egehanimat21@gmail.com", email_confirmed_at: "2026-01-01T00:00:00Z" }), true);
  assert.equal(isFeedbackAdmin({ email: "other@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" }), false);
  assert.equal(isFeedbackAdmin({ email: "egehanimat21@gmail.com", email_confirmed_at: null }), false);
  assert.equal(isFeedbackAdmin({ email: " EGEHANIMAT21@GMAIL.COM ", confirmed_at: "2026-01-01T00:00:00Z" }), true);
  assert.equal(isFeedbackAdmin(null), false);
});

test("feedback statuses are limited to supported values", () => {
  for (const status of ["new", "reviewing", "fixed", "closed"]) assert.equal(normalizeFeedbackStatus(status), status);
  for (const status of ["admin", "deleted", "pending", "", null]) assert.equal(normalizeFeedbackStatus(status), null);
});
