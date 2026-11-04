import test from "node:test";
import assert from "node:assert/strict";
import { isAntivirusScriptBlock, parseComputerControlOutput, resolveComputerControlScriptPath, validateComputerAction } from "./computer-control.js";

test("validates absolute and relative mouse movement actions", () => {
  assert.doesNotThrow(() => validateComputerAction({ type: "move-mouse", x: 300, y: 250 }));
  assert.doesNotThrow(() => validateComputerAction({ type: "move-mouse", dx: -140, dy: 60 }));
  assert.doesNotThrow(() => validateComputerAction({ type: "move-mouse", dx: 20, dy: 30, durationMs: 650, steps: 32 }));
  assert.throws(() => validateComputerAction({ type: "move-mouse", dx: 20, dy: 30, durationMs: 99 }), /animasyon süresi/);
  assert.throws(() => validateComputerAction({ type: "move-mouse", dx: 20, dy: 30, steps: 121 }), /adım sayısı/);
  assert.doesNotThrow(() => validateComputerAction({ type: "system-info" }));
  assert.doesNotThrow(() => validateComputerAction({ type: "list-windows" }));
  assert.doesNotThrow(() => validateComputerAction({ type: "type-text", text: "NOVA test", processName: "notepad" }));
  assert.throws(() => validateComputerAction({ type: "type-text", text: "NOVA test", processName: "powershell" }), /izin verilmeyen uygulama/);
  assert.throws(() => validateComputerAction({ type: "move-mouse", x: -1, y: 20 }), /Mouse hareket koordinatları/);
  assert.throws(() => validateComputerAction({ type: "move-mouse", dx: 10001, dy: 0 }), /Mouse hareket koordinatları/);
});

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

test("preserves compressed screenshot payloads in structured desktop results", () => {
  const screenshot = Buffer.from("NOVA visual screen snapshot").toString("base64");
  const parsed = parseComputerControlOutput(JSON.stringify({
    success: true,
    activeWindow: "Chrome",
    screenshot,
    screenshotMimeType: "image/jpeg",
    screenshotWidth: 1280,
    screenshotHeight: 720
  }));
  assert.equal(parsed.success, true);
  assert.equal(parsed.screenshot, screenshot);
  assert.equal(parsed.screenshotMimeType, "image/jpeg");
  assert.equal(parsed.screenshotWidth, 1280);
});


test("uses a stable packaged resource path instead of a temporary PowerShell script", () => {
  const resourcesPath = "C:\\Program Files\\NOVA AI\\resources";
  assert.equal(resolveComputerControlScriptPath(resourcesPath).endsWith("\\computer-control.ps1"), true);
  assert.equal(resolveComputerControlScriptPath(""), resolveComputerControlScriptPath(undefined));
});

test("recognizes antivirus script blocking without treating it as a successful desktop action", () => {
  assert.equal(isAntivirusScriptBlock("This script contains malicious content and has been blocked by your antivirus software."), true);
  assert.equal(isAntivirusScriptBlock("UI Automation access denied"), false);
});
