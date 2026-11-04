"use strict";

async function runWithRateLimitRetry(run, {
  provider = "provider",
  maxRetries = 1,
  maxDelayMs = 22000,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  if (typeof run !== "function") throw new TypeError("Provider runner must be a function.");
  let attempt = 0;
  while (true) {
    try {
      return await run();
    } catch (error) {
      const delay = Number(error && error.retryAfterMs);
      if (Number(error && error.status) !== 429 || attempt >= maxRetries ||
          !Number.isFinite(delay) || delay < 1 || delay > maxDelayMs) {
        throw error;
      }
      attempt += 1;
      console.warn("[NOVA AI] " + provider + " rate limit; " + delay +
        "ms beklenip bir kez daha denenecek (" + attempt + "/" + maxRetries + ").");
      await wait(delay);
    }
  }
}

module.exports = { runWithRateLimitRetry };
