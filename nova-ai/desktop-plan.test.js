"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDesktopIntent, enforceNoSend, enforceMessageSend } = require("./desktop-plan");

test("desktop planner accepts the documented flat JSON response", () => {
  const intent = normalizeDesktopIntent({
    intent: "computer-control",
    done: false,
    message: "",
    actions: [{ type: "inspect-screen" }]
  });
  assert.deepEqual(intent, {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [{ type: "inspect-screen" }]
  });
});

test("desktop planner remains compatible with a nested intent response", () => {
  const expected = {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [{ type: "inspect-screen" }]
  };
  assert.deepEqual(normalizeDesktopIntent({ intent: expected }), expected);
});

test("desktop planner rejects unknown or malformed response envelopes", () => {
  assert.equal(normalizeDesktopIntent(null), null);
  assert.equal(normalizeDesktopIntent({ intent: "open-app", actions: [] }), null);
  assert.equal(normalizeDesktopIntent({ intent: [] }), null);
});


test("explicit Discord send requests require exact text, focus and Enter", () => {
  const intent = {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [
      { type: "focus-control", controlType: "Edit", automationId: "composer" },
      { type: "type-text", text: "Merhaba" },
      { type: "press-key", key: "ENTER" },
      { type: "finish" }
    ]
  };
  const result = enforceMessageSend(intent, 'Discord\'da en son konuştuğum kişiye "Merhaba" yaz ve gönder.');
  assert.equal(result.done, true);
  assert.equal(result.message, "Mesaj Discord sohbetine gönderildi.");
  assert.deepEqual(result.actions.map((action) => action.type), ["focus-control", "type-text", "press-key"]);
});

test("explicit Discord send requests reject plans without Enter", () => {
  const intent = {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [
      { type: "focus-control", controlType: "Edit", automationId: "composer" },
      { type: "type-text", text: "Merhaba" }
    ]
  };
  assert.throws(() => enforceMessageSend(intent, 'Discord\'da "Merhaba" yaz ve gönder.'), /gönderim adımını içermiyor/i);
});

test("explicit no-send requests reject Enter", () => {
  const intent = {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [
      { type: "focus-control", controlType: "Edit", automationId: "composer" },
      { type: "type-text", text: "NOVA TEST 123" },
      { type: "press-key", key: "ENTER" }
    ]
  };
  assert.throws(
    () => enforceNoSend(intent, 'Mesajı kesinlikle gönderme. "NOVA TEST 123" yaz.'),
    /cannot include Enter/i
  );
});

test("explicit no-send requests stop immediately after exact text entry", () => {
  const intent = {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [
      { type: "focus-control", controlType: "Edit", automationId: "composer" },
      { type: "type-text", text: "NOVA TEST 123" },
      { type: "finish" }
    ]
  };
  enforceNoSend(intent, 'Mesajı kesinlikle gönderme. "NOVA TEST 123" yaz.');
  assert.deepEqual(intent.actions.map((action) => action.type), ["focus-control", "type-text"]);
  assert.equal(intent.message, "Metin mesaj kutusuna yazıldı; gönderilmedi.");
});

test("a direct Discord DM write command sends the exact message by default", () => {
  const intent = {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [
      { type: "focus-control", controlType: "Edit", automationId: "composer" },
      { type: "type-text", text: "Merhaba" },
      { type: "press-key", key: "ENTER" }
    ]
  };
  const result = enforceMessageSend(intent, "Discord'da en son konuştuğum kişiye Merhaba yaz.");
  assert.equal(result.done, true);
  assert.equal(result.message, "Mesaj Discord sohbetine gönderildi.");
  assert.deepEqual(result.actions.map((action) => action.type), ["focus-control", "type-text", "press-key"]);
});

test("a Discord draft request without a recipient or send instruction does not send", () => {
  const intent = {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [
      { type: "focus-control", controlType: "Edit", automationId: "composer" },
      { type: "type-text", text: "NOVA TEST 123" }
    ]
  };
  enforceMessageSend(intent, 'Discord sohbetini aç ve mesaj kutusuna "NOVA TEST 123" yaz.');
  assert.equal(intent.done, false);
  assert.equal(intent.actions.length, 2);
});
