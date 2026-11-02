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

function enforceNoSend(intent, command) {
  const requested = /mesaj[ıi]\s+(?:(?:kesinlikle|sakın|asla)\s+)?gönderme/iu.test(String(command || ""));
  if (!requested || !intent || !Array.isArray(intent.actions)) return intent;
  if (intent.actions.some((action) => action?.type === "press-key" && String(action.key || "").toUpperCase() === "ENTER")) {
    throw new Error("An explicit no-send request cannot include Enter.");
  }
  const index = intent.actions.findIndex((action) => action?.type === "type-text");
  if (index >= 0) {
    intent.actions = intent.actions.slice(0, index + 1);
    intent.done = true;
    intent.message = "Metin mesaj kutusuna yazıldı; gönderilmedi.";
  }
  return intent;
}

module.exports = { normalizeDesktopIntent, enforceNoSend };
