import test from "node:test";
import assert from "node:assert/strict";
import { parseDesktopCommand } from "./desktop-command.js";

test("recognizes Windows Notepad as the explicit local Notepad app", () => {
  assert.deepEqual(parseDesktopCommand("Windows Not Defteri uygulamasını başlat"), {
    intent: "open-app", app: "notepad", label: "Not Defteri"
  });
  assert.deepEqual(parseDesktopCommand("Not Defteri uygulamasını başlat"), {
    intent: "open-app", app: "notepad", label: "Not Defteri"
  });
});

test("recognizes common Turkish system information requests locally", () => {
  assert.deepEqual(parseDesktopCommand("Bilgisayarımın CPU, RAM ve pil durumunu göster"), {
    intent: "computer-info"
  });
});

test("recognizes explicit open-window and accessibility inspection requests locally", () => {
  assert.deepEqual(parseDesktopCommand("Windows'ta şu anda açık olan uygulama pencerelerinin listesini getir"), {
    intent: "list-windows"
  });
  assert.deepEqual(parseDesktopCommand("Ekrandaki erişilebilir arayüz öğelerini listele"), {
    intent: "screen-summary"
  });
});
