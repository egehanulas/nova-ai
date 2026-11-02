import test from "node:test";
import assert from "node:assert/strict";
import { parseComputerControlOutput } from "./computer-control.js";

test("prefers the explicit PowerShell failure payload over CLIXML JSON fragments", () => {
  const output = '<Objs><S S="Error">noise {"message":"wrong"}</S></Objs>\nNOVA_RESULT:{"success":false,"error":"UI Automation access denied"}';
  assert.deepEqual(parseComputerControlOutput(output), {
    success: false,
    error: "UI Automation access denied"
  });
});

test("uses the final JSON result after PowerShell startup noise", () => {
  const output = 'Preparing modules for first use.\n{"success":false}\n{"success":true,"message":"ok"}';
  assert.deepEqual(parseComputerControlOutput(output), {
    success: true,
    message: "ok"
  });
});

test("rejects output without a valid result", () => {
  assert.throws(() => parseComputerControlOutput("PowerShell failed"), /geçerli sonuç alınamadı/);
});

test("keeps the complete outer result when nested objects contain braces", () => {
  const output = '#< CLIXML <Objs/>{"success":true,"items":[{"name":"Mesaj","bounds":{"x":1,"y":2}}]}';
  assert.deepEqual(parseComputerControlOutput(output), {
    success: true,
    items: [{ name: "Mesaj", bounds: { x: 1, y: 2 } }]
  });
});

test("parses a large successful UI Automation result without losing the success flag", () => {
  const items = Array.from({ length: 100 }, (_, index) => ({
    controlType: "Button",
    name: "Denetim " + index + " ".repeat(140),
    focusable: true,
    className: "discord-control",
    automationId: "",
    bounds: { x: index, y: index + 1, width: 80, height: 28 }
  }));
  const output = JSON.stringify({ activeWindow: "Discord", items, success: true });
  assert.equal(output.length > 20000, true);
  const parsed = parseComputerControlOutput(output);
  assert.equal(parsed.success, true);
  assert.equal(parsed.items.length, 100);
});
