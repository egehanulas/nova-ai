"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runWithRateLimitRetry } = require("./provider-retry");

test("retries a 429 provider response once after the exact retry delay", async () => {
  let attempts = 0;
  const waits = [];
  const result = await runWithRateLimitRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("rate limited");
      error.status = 429;
      error.retryAfterMs = 1200;
      throw error;
    }
    return "ok";
  }, { wait: async (ms) => waits.push(ms) });
  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [1200]);
});

test("does not retry non-rate-limit errors", async () => {
  let attempts = 0;
  await assert.rejects(runWithRateLimitRetry(async () => {
    attempts += 1;
    const error = new Error("bad request");
    error.status = 400;
    throw error;
  }, { wait: async () => {} }), /bad request/);
  assert.equal(attempts, 1);
});

test("does not wait beyond the configured provider retry budget", async () => {
  let attempts = 0;
  await assert.rejects(runWithRateLimitRetry(async () => {
    attempts += 1;
    const error = new Error("long rate limit");
    error.status = 429;
    error.retryAfterMs = 30000;
    throw error;
  }, { wait: async () => {}, maxDelayMs: 22000 }), /long rate limit/);
  assert.equal(attempts, 1);
});
