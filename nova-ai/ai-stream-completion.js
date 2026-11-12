"use strict";

function assertProviderStreamComplete({ provider, finishReason, doneMarker, answer }) {
  if (!String(answer || "").trim()) {
    const error = new Error("Provider returned no answer text.");
    error.code = "AI_EMPTY";
    throw error;
  }

  const reason = String(finishReason || "").toUpperCase();
  const complete = provider === "gemini"
    ? ["STOP", "MAX_TOKENS"].includes(reason)
    : Boolean(doneMarker) || ["STOP", "LENGTH"].includes(reason);
  if (!complete) {
    const error = new Error("Provider stream ended before a terminal completion signal.");
    error.code = "AI_INCOMPLETE";
    throw error;
  }
  return reason === "MAX_TOKENS" || reason === "LENGTH";
}

function assertNonStreamingComplete({ provider, finishReason, answer }) {
  if (!String(answer || "").trim()) {
    const error = new Error("Provider returned no answer text.");
    error.code = "AI_EMPTY";
    throw error;
  }
  const reason = String(finishReason || "").toUpperCase();
  if (["MAX_TOKENS", "LENGTH"].includes(reason)) {
    const error = new Error("Provider reached its output token limit.");
    error.code = "AI_OUTPUT_LIMIT";
    throw error;
  }
  if (reason !== "STOP") {
    const error = new Error("Provider returned without a complete finish reason.");
    error.code = "AI_INCOMPLETE";
    throw error;
  }
}

module.exports = { assertProviderStreamComplete, assertNonStreamingComplete };
