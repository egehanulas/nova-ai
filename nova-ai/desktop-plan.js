"use strict";

function normalizeDesktopIntent(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (parsed.intent && typeof parsed.intent === "object" && !Array.isArray(parsed.intent)) {
    return parsed.intent;
  }
  if (parsed.intent === "computer-control") {
    return {
      intent: parsed.intent,
      done: parsed.done,
      message: parsed.message,
      actions: parsed.actions
    };
  }
  return null;
}

module.exports = { normalizeDesktopIntent };
