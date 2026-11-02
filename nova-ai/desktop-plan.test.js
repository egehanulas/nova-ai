"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDesktopIntent, enforceNoSend } = require("./desktop-plan");

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

test("no-send plans stop immediately after text entry", () => {
  const intent = {
    intent: "computer-control",
    done: false,
    message: "",
    actions: [{ type: "type-text", text: "draft" }, { type: "finish" }]
  };
  const result = enforceNoSend(intent, "Mesajı gönderme.");
  assert.equal(result.done, true);
  assert.deepEqual(result.actions, [{ type: "type-text", text: "draft" }]);
});
