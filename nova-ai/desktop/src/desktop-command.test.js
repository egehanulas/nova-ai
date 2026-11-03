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

test("turns a Turkish screen-corner mouse request into a deterministic local action", () => {
  assert.deepEqual(parseDesktopCommand("Fare imlecini ekranın sol üst köşesine yavaşça hareket ettir"), {
    intent: "computer-control",
    done: true,
    message: "Fare imleci istenen konuma yumuşak biçimde taşındı.",
    actions: [
      { type: "move-mouse", corner: "top-left", durationMs: 900, steps: 40 },
      { type: "finish" }
    ]
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


test("recognizes processor model questions and desktop PDF discovery locally", () => {
  assert.deepEqual(parseDesktopCommand("İşlemcimin modelini söyle"), { intent: "computer-info" });
  assert.deepEqual(parseDesktopCommand("Bilgisayarımın işlemcisini söyle"), { intent: "computer-info" });
  assert.deepEqual(parseDesktopCommand("Masaüstümdeki dosyaları listele ve varsa PDF dosyalarını bul"), {
    intent: "search-files", query: ".pdf", location: "Desktop"
  });
});
