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

test("normalizes sentence punctuation and closing quotes before local command matching", () => {
  for (const command of [
    "Windows Not Defteri uygulamasını aç ve içine NOVA AI test başarılı yaz.”",
    "Windows Not Defteri uygulamasını aç ve içine NOVA AI test başarılı yaz.”.",
    "Windows Not Defteri uygulamasını aç ve içine NOVA AI test başarılı yaz"
  ]) {
    const intent = parseDesktopCommand(command);
    assert.equal(intent.intent, "computer-control");
    assert.deepEqual(intent.actions, [
      { type: "open-app", app: "notepad" },
      { type: "wait", ms: 900 },
      { type: "type-text", text: "NOVA AI test başarılı", processName: "notepad" },
      { type: "finish" }
    ]);
  }
});

test("opens Windows Notepad and types the requested text locally", () => {
  assert.deepEqual(parseDesktopCommand("Windows Not Defteri uygulamasını aç ve içine NOVA AI test başarılı yaz"), {
    intent: "computer-control",
    done: true,
    message: "Not Defteri açıldı ve metin yazıldı.",
    actions: [
      { type: "open-app", app: "notepad" },
      { type: "wait", ms: 900 },
      { type: "type-text", text: "NOVA AI test başarılı", processName: "notepad" },
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
      { type: "type-text", text: "NOVA AI test başarılı", processName: "notepad" },
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

test("runs two- and three-app launch sequences locally in the requested order", () => {
  const expectedTwo = {
    intent: "computer-control",
    done: true,
    message: "Hesap Makinesi ve Not Defteri açıldı.",
    actions: [
      { type: "open-app", app: "calculator" },
      { type: "wait", ms: 900 },
      { type: "open-app", app: "notepad" },
      { type: "finish" }
    ]
  };
  for (const command of [
    "Hesap Makinesi'ni aç, ardından Not Defteri'ni aç",
    "Önce Hesap Makinesi'ni aç, ardından Not Defteri'ni aç",
    "Lütfen Hesap Makinesi'ni aç sonra Not Defteri'ni aç"
  ]) assert.deepEqual(parseDesktopCommand(command), expectedTwo);

  assert.deepEqual(parseDesktopCommand("Önce Hesap Makinesi'ni aç, sonra Not Defteri'ni aç, ardından Paint'i aç"), {
    intent: "computer-control",
    done: true,
    message: "Hesap Makinesi, Not Defteri, Paint açıldı.",
    actions: [
      { type: "open-app", app: "calculator" },
      { type: "wait", ms: 900 },
      { type: "open-app", app: "notepad" },
      { type: "wait", ms: 900 },
      { type: "open-app", app: "paint" },
      { type: "finish" }
    ]
  });
});

test("searches common file extensions in Desktop, Documents, Downloads or all accessible drives", () => {
  assert.deepEqual(parseDesktopCommand("Belgelerimdeki PDF dosyalarını bul"), {
    intent: "search-files", query: ".pdf", location: "Documents"
  });
  assert.deepEqual(parseDesktopCommand("İndirilenlerimdeki ZIP dosyalarını listele"), {
    intent: "search-files", query: ".zip", location: "Downloads"
  });
  assert.deepEqual(parseDesktopCommand("Bilgisayarımdaki tüm JPG dosyalarını bul ve isimlerini listele"), {
    intent: "search-files", query: ".jpg"
  });
  assert.deepEqual(parseDesktopCommand("Masaüstümdeki HEIC dosyalarını bul"), {
    intent: "search-files", query: ".heic", location: "Desktop"
  });
});

test("recognizes common everyday keyboard and browser actions", () => {
  const cases = [
    ["Hepsini seç", "CTRL+A"],
    ["Kopyala", "CTRL+C"],
    ["Kes", "CTRL+X"],
    ["Yapıştır", "CTRL+V"],
    ["Kaydet", "CTRL+S"],
    ["Yazdır", "CTRL+P"],
    ["Geri al", "CTRL+Z"],
    ["Yinele", "CTRL+Y"],
    ["Sayfada ara", "CTRL+F"],
    ["Adres çubuğuna git", "CTRL+L"],
    ["Yeni sekme aç", "CTRL+T"],
    ["Bu sekmeyi kapat", "CTRL+W"],
    ["Kapattığım sekmeyi geri aç", "CTRL+SHIFT+T"],
    ["Sonraki sekmeye geç", "CTRL+PAGEDOWN"],
    ["Önceki sekmeye geç", "CTRL+PAGEUP"],
    ["Önceki sayfaya git", "ALT+LEFT"],
    ["Sonraki sayfaya git", "ALT+RIGHT"],
    ["Sayfayı yenile", "CTRL+R"],
    ["Tam ekrana geç", "F11"],
    ["Etkin pencereyi kapat", "ALT+F4"],
    ["Ekranı yenile", "F5"]
  ];
  for (const [command, key] of cases) {
    const result = parseDesktopCommand(command);
    assert.equal(result.intent, "computer-control", command);
    assert.equal(result.actions[0].type, "press-key", command);
    assert.equal(result.actions[0].key, key, command);
  }
});

test("recognizes natural scrolling commands with safe bounded amounts", () => {
  assert.deepEqual(parseDesktopCommand("Aşağı kaydır"), {
    intent: "computer-control", done: true, message: "Sayfa kaydırılıyor.",
    actions: [{ type: "scroll", amount: 600 }, { type: "finish" }]
  });
  assert.equal(parseDesktopCommand("Yukarı 300 kaydır").actions[0].amount, -300);
});

test("routes ordinary browser and scrolling requests to desktop execution", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const helperUrl = new URL("../../public/desktop-command-routing.js", import.meta.url);
  const helper = await readFile(helperUrl, "utf8");
  const window = {};
  vm.runInNewContext(helper, { window, globalThis: window });
  const route = window.NovaDesktopRouting.isLikelyDesktopCommand;

  for (const command of [
    "Yeni sekme aç",
    "YouTube'da Fenerbahçe ara",
    "Sayfada ara",
    "Sayfayı aşağı kaydır",
    "Aşağı 300 kaydır",
    "Tam ekrana geç",
    "Önceki sayfaya git"
  ]) assert.equal(route(command), true, command);

  for (const message of [
    "Yeni sekme açmak için Ctrl+T tuşlarına basabilirsin.",
    "Chrome nedir?",
    "YouTube'da Fenerbahçe videoları neden popüler?"
  ]) assert.equal(route(message), false, message);
});

test("recognizes YouTube search and natural page scrolling locally", () => {
  assert.deepEqual(parseDesktopCommand("YouTube'da “Fenerbahçe” ara"), {
    intent: "open-url",
    url: "https://www.youtube.com/results?search_query=Fenerbah%C3%A7e"
  });
  assert.deepEqual(parseDesktopCommand("Yeni sekme aç"), {
    intent: "computer-control", done: true, message: "Yeni sekme açılıyor.",
    actions: [{ type: "press-key", key: "CTRL+T" }, { type: "finish" }]
  });
  assert.equal(parseDesktopCommand("Sayfayı aşağı kaydır").actions[0].amount, 600);
  assert.equal(parseDesktopCommand("Aşağı 300 kaydır").actions[0].amount, 300);
});


test("supports additional browser navigation and search commands", () => {
  const cases = [
    ["Yeni pencere aç", "CTRL+N"],
    ["Gizli pencere aç", "CTRL+SHIFT+N"],
    ["Tarayıcı geçmişini aç", "CTRL+H"],
    ["İndirilenleri aç", "CTRL+J"],
    ["Yer imlerini aç", "CTRL+SHIFT+O"],
    ["Sayfanın kaynak kodunu göster", "CTRL+U"],
    ["Yakınlaştırmayı sıfırla", "CTRL+0"],
    ["Uygulamalar arasında geçiş yap", "ALT+TAB"],
    ["Ana sayfaya git", "ALT+HOME"]
  ];
  for (const [command, key] of cases) {
    const result = parseDesktopCommand(command);
    assert.equal(result.intent, "computer-control", command);
    assert.equal(result.actions[0].type, "press-key", command);
    assert.equal(result.actions[0].key, key, command);
  }
  assert.equal(parseDesktopCommand("Google'da Fenerbahçe ara").url,
    "https://www.google.com/search?q=Fenerbah%C3%A7e");
  assert.equal(parseDesktopCommand("Chrome'da Fenerbahçe ara").actions[0].app, "chrome");
});

test("routes newly supported browser commands through desktop execution", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const helperUrl = new URL("../../public/desktop-command-routing.js", import.meta.url);
  const helper = await readFile(helperUrl, "utf8");
  const window = {};
  vm.runInNewContext(helper, { window, globalThis: window });
  const route = window.NovaDesktopRouting.isLikelyDesktopCommand;
  for (const command of [
    "Yeni pencere aç", "Gizli pencere aç", "Tarayıcı geçmişini aç", "Google'da Fenerbahçe ara", "Chrome'da Fenerbahçe ara",
    "İndirilenleri aç", "Yer imlerini aç", "Sayfanın kaynak kodunu göster",
    "Yakınlaştırmayı sıfırla", "Uygulamalar arasında geçiş yap"
  ]) assert.equal(route(command), true, command);
  for (const message of ["Chrome nedir?", "Google'da arama nasıl yapılır?", "Tarayıcı geçmişi neden tutulur?"])
    assert.equal(route(message), false, message);
});


test("opens Google directly in a new Chrome tab instead of searching the command text", () => {
  for (const command of [
    "Yeni sekme aç ve Google'ı",
    "Yeni sekme aç ve Google'ı aç",
    "Yeni sekme aç ve Google'ı internete",
    "Yeni sekme aç sonra Google ana sayfasını aç",
    "Chrome'da yeni sekme aç ve Google'ı aç",
    "Google'ı aç",
    "Google ana sayfasına git",
    "Chrome'da Google'ı aç",
    "Yeni sekme oluştur ve Google ana sayfasına git",
    "Google sitesini aç",
    "Google'a git",
    "Yeni sekme aç Google'ı aç"
  ]) {
    assert.deepEqual(parseDesktopCommand(command), {
      intent: "computer-control",
      done: true,
      message: "Google yeni sekmede açılıyor.",
      actions: [
        { type: "open-url", app: "chrome", url: "https://www.google.com/" },
        { type: "finish" }
      ]
    }, command);
  }
});

test("routes combined new-tab and Google navigation to desktop execution", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const helperUrl = new URL("../../public/desktop-command-routing.js", import.meta.url);
  const helper = await readFile(helperUrl, "utf8");
  const window = {};
  vm.runInNewContext(helper, { window, globalThis: window });
  const route = window.NovaDesktopRouting.isLikelyDesktopCommand;
  assert.equal(route("Yeni sekme aç ve Google'ı aç"), true);
  assert.equal(route("Yeni sekme aç ve Google'ı internete"), true);
});


test("supports natural two- and three-app sequences joined with and", () => {
  for (const [command, expected] of [
    ["Chrome aç ve Not Defteri aç", ["chrome", "notepad"]],
    ["Hesap Makinesi aç ve Paint aç", ["calculator", "paint"]],
    ["Steam aç ve Discord aç ve Spotify aç", ["steam", "discord", "spotify"]]
  ]) {
    const parsed = parseDesktopCommand(command);
    assert.equal(parsed.intent, "computer-control", command);
    assert.deepEqual(parsed.actions.filter(action => action.type === "open-app").map(action => action.app), expected, command);
    assert.equal(parsed.actions.at(-1).type, "finish", command);
  }
});


test("opens explicit website domains in the browser named by the user", () => {
  for (const [command, app, url] of [
    ["Chrome'da github.com aç", "chrome", "https://github.com"],
    ["Edge'de openai.com'a git", "edge", "https://openai.com"],
    ["Firefox'ta example.com aç", "firefox", "https://example.com"]
  ]) {
    const parsed = parseDesktopCommand(command);
    assert.equal(parsed.intent, "computer-control", command);
    assert.deepEqual(parsed.actions[0], { type: "open-url", app, url }, command);
    assert.equal(parsed.actions.at(-1).type, "finish", command);
  }
});


test("routes new browser navigation phrases through desktop command execution", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const helperUrl = new URL("../../public/desktop-command-routing.js", import.meta.url);
  const helper = await readFile(helperUrl, "utf8");
  const window = {};
  vm.runInNewContext(helper, { window, globalThis: window });
  const route = window.NovaDesktopRouting.isLikelyDesktopCommand;
  for (const command of [
    "Yeni sekme aç Google'ı aç",
    "Google'a git",
    "Chrome'da github.com aç",
    "Edge'de openai.com'a git",
    "Firefox'ta example.com aç",
    "Chrome aç ve Not Defteri aç"
  ]) assert.equal(route(command), true, command);
});

test("routes explicit screen analysis requests through desktop execution", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const helperUrl = new URL("../../public/desktop-command-routing.js", import.meta.url);
  const helper = await readFile(helperUrl, "utf8");
  const window = {};
  vm.runInNewContext(helper, { window, globalThis: window });
  assert.equal(window.NovaDesktopRouting.isLikelyDesktopCommand("Ekranımı analiz et"), true);
  assert.equal(parseDesktopCommand("Ekranımı analiz et").intent, "screen-summary");
});
