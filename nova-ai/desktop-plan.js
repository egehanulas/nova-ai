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
    const focused = intent.actions.slice(0, index)
      .some((action) => action?.type === "focus-control" || action?.type === "click");
    if (!focused) throw new Error("The message field must be focused before text entry.");
    const quotedText = String(command || "").match(/["“]([^"”]+)["”]/u);
    if (quotedText && intent.actions[index].text !== quotedText[1]) {
      throw new Error("The planned text does not match the quoted user text.");
    }
    intent.actions = intent.actions.slice(0, index + 1);
    intent.done = true;
    intent.message = "Metin mesaj kutusuna yazıldı; gönderilmedi.";
  }
  return intent;
}

function enforceMessageSend(intent, command) {
  const text = String(command || "");
  const noSend = /mesaj[ıi]\\s+(?:(?:kesinlikle|sakın|asla)\\s+)?gönderme/iu.test(text);
  const sendRequested = !noSend && /(?:yaz(?:ıp|ıp)?\\s+ve\\s+)?(?:gönder|yolla)|mesaj\\s+at/iu.test(text);
  if (!sendRequested || !intent || !Array.isArray(intent.actions)) return intent;

  const textIndex = intent.actions.findIndex((action) => action?.type === "type-text");
  if (textIndex < 0) return intent;

  const focused = intent.actions.slice(0, textIndex)
    .some((action) => action?.type === "focus-control" || action?.type === "click");
  if (!focused) throw new Error("Mesaj gönderilmeden önce mesaj kutusu odaklanmalı.");

  const quotedText = text.match(/["“]([^"”]+)["”]/u);
  if (quotedText && intent.actions[textIndex].text !== quotedText[1]) {
    throw new Error("Gönderilecek metin kullanıcı isteğindeki metinle eşleşmiyor.");
  }

  const enterIndex = intent.actions.findIndex((action, index) =>
    index > textIndex && action?.type === "press-key" &&
    String(action.key || "").toUpperCase() === "ENTER"
  );
  if (enterIndex < 0) {
    throw new Error("Kullanıcı mesajın gönderilmesini istedi ancak plan güvenli gönderim adımını içermiyor.");
  }

  intent.actions = intent.actions.slice(0, enterIndex + 1);
  intent.done = true;
  intent.message = "Mesaj Discord sohbetine gönderildi.";
  return intent;
}

module.exports = { normalizeDesktopIntent, enforceNoSend, enforceMessageSend };
