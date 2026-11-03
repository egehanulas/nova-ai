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


test("keeps processor and RAM questions on the local computer-info path", () => {
  assert.deepEqual(parseDesktopCommand("İşlemci modelini ve RAM miktarını söyle"), {
    intent: "computer-info"
  });
});

test("finds JPG files on the desktop without requiring an AI planner", () => {
  assert.deepEqual(parseDesktopCommand("Masaüstümdeki jpg dosyalarını bul ve isimlerini listele"), {
    intent: "search-files", query: ".jpg", location: "Desktop"
  });
});

test("opens Windows Notepad and types the requested text locally", () => {
  assert.deepEqual(parseDesktopCommand("Windows Not Defteri uygulamasını aç ve içine NOVA AI test başarılı yaz"), {
    intent: "computer-control",
    done: true,
    message: "Not Defteri açıldı ve metin yazıldı.",
    actions: [
      { type: "open-app", app: "notepad" },
      { type: "wait", ms: 900 },
      { type: "type-text", text: "NOVA AI test başarılı" },
      { type: "finish" }
    ]
  });
});

test("runs the calculator then Notepad sequence locally", () => {
  assert.deepEqual(parseDesktopCommand("Hesap Makinesi'ni aç, ardından Not Defteri'ni aç"), {
    intent: "computer-control",
    done: true,
    message: "Hesap Makinesi ve Not Defteri açıldı.",
    actions: [
      { type: "open-app", app: "calculator" },
      { type: "wait", ms: 900 },
      { type: "open-app", app: "notepad" },
      { type: "finish" }
    ]
  });
});


test("recognizes Windows Notepad with Turkish suffix and writes the requested text locally", () => {
  assert.deepEqual(parseDesktopCommand("Windows Not Defteri'ni aç ve içine NOVA AI test başarılı yaz"), {
    intent: "computer-control",
    done: true,
    message: "Not Defteri açıldı ve metin yazıldı.",
    actions: [
      { type: "open-app", app: "notepad" },
      { type: "wait", ms: 900 },
      { type: "type-text", text: "NOVA AI test başarılı" },
      { type: "finish" }
    ]
  });
});

test("recognizes local CPU model and RAM amount requests without AI planning", () => {
  assert.deepEqual(parseDesktopCommand("İşlemci modeli ve RAM miktarını söyle"), {
    intent: "computer-info"
  });
});

test("recognizes JPG file searches on the Desktop without AI planning", () => {
  assert.deepEqual(parseDesktopCommand("Masaüstümdeki jpg dosyalarını bul ve isimlerini listele"), {
    intent: "search-files", query: ".jpg", location: "Desktop"
  });
});

test("runs a two-app launch sequence locally in the requested order", () => {
  assert.deepEqual(parseDesktopCommand("Hesap Makinesi'ni aç, ardından Not Defteri'ni aç"), {
    intent: "computer-control",
    done: true,
    message: "Hesap Makinesi ve Not Defteri açıldı.",
    actions: [
      { type: "open-app", app: "calculator" },
      { type: "wait", ms: 900 },
      { type: "open-app", app: "notepad" },
      { type: "finish" }
    ]
  });
});
