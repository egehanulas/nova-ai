"use strict";

const { classifyAiError, createProviderExhaustedError } = require("./ai-errors");

async function runProviderFallback(providers, { onFailure = () => {} } = {}) {
  const enabled = providers.filter((provider) => provider.enabled);
  const failures = [];
  for (const provider of enabled) {
    try {
      const result = await provider.run();
      if (result && typeof result.answer === "string" && result.answer.trim()) return result;
      const error = Object.assign(new Error("Provider returned an empty answer."), { code: "AI_EMPTY" });
      throw error;
    } catch (error) {
      failures.push({ status: error.status || null, code: classifyAiError(error), name: error.name });
      onFailure(provider.name, error);
    }
  }
  throw createProviderExhaustedError(failures, enabled.length);
}

module.exports = { runProviderFallback };
