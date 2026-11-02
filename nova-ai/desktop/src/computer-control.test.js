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
