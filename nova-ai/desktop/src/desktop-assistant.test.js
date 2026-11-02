import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getComputerInfo,
  resolveUserPath,
  searchUserFiles,
  openAllowedApp,
  normalizeInstalledAppQuery,
  openUserPath,
  resolveUserItem,
  moveUserFile,
  configureUserFolderPaths,
  configureComputerFileAccess,
  resolveUserFolder,
  isProtectedSystemPath,
  resolveSteamGame
} from "./desktop-assistant.js";
import { createUpdateRetryScheduler } from "./update-retry.js";
import { parseDesktopCommand } from "./desktop-command.js";
import { validateComputerAction, runComputerAction, parseComputerControlOutput } from "./computer-control.js";

test("user path resolver accepts configured user folders and rejects unrelated paths", () => {
  const home = os.homedir();
  for (const name of ["Desktop", "Documents", "Downloads"]) {
    assert.equal(resolveUserPath(path.join(home, name)), path.join(home, name));
    assert.equal(resolveUserPath(path.join(home, name, "sample.txt")), path.join(home, name, "sample.txt"));
  }
  assert.throws(() => resolveUserPath(path.join(home, "Pictures", "private.txt")), /erişilebilen yerel sürücüler/);
  assert.throws(() => resolveUserPath(path.join(home, "Desktop", "..", "..", "Windows", "system.ini")), /erişilebilen yerel sürücüler/);
});

test("user path resolver rejects empty, non-string and oversized input", () => {
  assert.throws(() => resolveUserPath(""), /Geçerli/);
  assert.throws(() => resolveUserPath(null), /Geçerli/);
  assert.throws(() => resolveUserPath("x".repeat(1001)), /Geçerli/);
});

test("computer information includes stable system fields", () => {
  const info = getComputerInfo();
  assert.equal(typeof info.computer, "string");
  assert.equal(typeof info.platform, "string");
  assert.equal(typeof info.processor, "string");
  assert.ok(info.memoryTotal > 0);
  assert.ok(info.memoryFree >= 0);
  assert.ok(info.logicalCores > 0);
});

test("file search validates its query before reading folders", async () => {
  await assert.rejects(searchUserFiles(""), /dosya veya klasör adı yaz/);
  await assert.rejects(searchUserFiles("x".repeat(256)), /255 karakter/);
});

test("application launcher rejects anything outside the fixed allowlist", async () => {
  await assert.rejects(openAllowedApp("powershell"), /izin verilen uygulamalar listesinde değil/);
  await assert.rejects(openAllowedApp("cmd.exe"), /izin verilen uygulamalar listesinde değil/);
});


test("installed application query validation rejects empty, oversized and multiline input", () => {
  assert.equal(normalizeInstalledAppQuery("  WhatsApp  "), "WhatsApp");
  assert.equal(normalizeInstalledAppQuery("Visual   Studio   Code"), "Visual Studio Code");
  assert.throws(() => normalizeInstalledAppQuery(""), /uygulamanın adını/);
  assert.throws(() => normalizeInstalledAppQuery("x".repeat(101)), /uygulamanın adını/);
  assert.throws(() => normalizeInstalledAppQuery("Telegram\\nStart-Process powershell"), /uygulamanın adını/);
});

test("desktop updater retries transient failures with increasing delays and only one pending retry", () => {
  const timers = [];
  let retryCount = 0;
  const scheduler = createUpdateRetryScheduler({
    onRetry: () => { retryCount += 1; },
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cancelled = true; }
  });

  assert.equal(scheduler.schedule(), 30_000);
  assert.equal(scheduler.schedule(), null);
  assert.equal(scheduler.pending, true);
  timers[0].callback();
  assert.equal(retryCount, 1);
  assert.equal(scheduler.pending, false);

  assert.equal(scheduler.schedule(), 2 * 60 * 1000);
  timers[1].callback();
  assert.equal(scheduler.schedule(), 10 * 60 * 1000);
  timers[2].callback();
  assert.equal(scheduler.schedule(), 30 * 60 * 1000);
  timers[3].callback();
  assert.equal(scheduler.schedule(), 30 * 60 * 1000);
  timers[4].callback();

  scheduler.reset();
  assert.equal(scheduler.schedule(), 30_000);
});

test("desktop updater retry can be cancelled or reset without leaving a pending timer", () => {
  const timers = [];
  const scheduler = createUpdateRetryScheduler({
    onRetry: () => {},
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cancelled = true; }
  });

  assert.equal(scheduler.schedule(), 30_000);
  const first = timers[0];
  scheduler.cancel();
  assert.equal(first.cancelled, true);
  assert.equal(scheduler.pending, false);

  assert.equal(scheduler.schedule(), 2 * 60 * 1000);
  scheduler.reset();
  assert.equal(timers[1].cancelled, true);
  assert.equal(scheduler.pending, false);
  assert.equal(scheduler.schedule(), 30_000);
});


test("Turkish desktop intent parser understands natural file-open phrasing", () => {
  assert.deepEqual(parseDesktopCommand("Masaüstündeki 1.jpg dosyasını aç"), {
    intent: "open-path", target: "1.jpg", location: "Desktop"
  });
  assert.deepEqual(parseDesktopCommand("1.jpg'yi aç"), {
    intent: "open-path", target: "1.jpg"
  });
  assert.deepEqual(parseDesktopCommand("lütfen aç: \"1.jpg\""), {
    intent: "open-path", target: "1.jpg"
  });
  assert.deepEqual(parseDesktopCommand("image.png dosyasını aç"), {
    intent: "open-path", target: "image.png"
  });
  assert.deepEqual(parseDesktopCommand("Masaüstündeki image.png dosyasını aç"), {
    intent: "open-path", target: "image.png", location: "Desktop"
  });
  assert.deepEqual(parseDesktopCommand("Oyunlar klasöründe 121.png dosyasını aç"), {
    intent: "open-path", target: "121.png", location: "Oyunlar"
  });
  assert.deepEqual(parseDesktopCommand("Oyunlar klasöründe 121.png dosyasını bul ve aç"), {
    intent: "open-path", target: "121.png", location: "Oyunlar"
  });
  assert.deepEqual(parseDesktopCommand("Masaüstündeki image.png dosyasını İndirilenler klasörüne taşı"), {
    intent: "move-file", source: "image.png", sourceLocation: "Desktop", destination: "Downloads"
  });
  assert.deepEqual(parseDesktopCommand("Masaüstündeki 121.png dosyasını İndirilenlere tası"), {
    intent: "move-file", source: "121.png", sourceLocation: "Desktop", destination: "Downloads"
  });
  assert.deepEqual(parseDesktopCommand("Masaüstündeki 121.png dosyasını Oyunlara taşı"), {
    intent: "move-file", source: "121.png", sourceLocation: "Desktop", destination: "Oyunlara"
  });
  assert.deepEqual(parseDesktopCommand("Masaüstündeki 121.png dosyasını İndirilenlere aktar"), {
    intent: "move-file", source: "121.png", sourceLocation: "Desktop", destination: "Downloads"
  });
  assert.deepEqual(parseDesktopCommand("D sürücüsündeki rapor.pdf dosyasını aç"), {
    intent: "open-path", target: "rapor.pdf", location: "D:\\"
  });
  assert.deepEqual(parseDesktopCommand("D sürücüsündeki rapor.pdf dosyasını İndirilenler klasörüne taşı"), {
    intent: "move-file", source: "rapor.pdf", sourceLocation: "D:\\", destination: "Downloads"
  });
  assert.deepEqual(parseDesktopCommand("D sürücüsünde rapor.pdf"), {
    intent: "search-files", query: "rapor.pdf", location: "D:\\"
  });
});

test("Turkish desktop intent parser understands folder creation in different word orders", () => {
  assert.deepEqual(parseDesktopCommand("Masaüstüne Oyunlar adında klasör oluştur"), {
    intent: "create-folder", name: "Oyunlar", location: "Desktop"
  });
  assert.deepEqual(parseDesktopCommand("klasör oluştur Projeler belgelerde"), {
    intent: "create-folder", name: "Projeler", location: "Documents"
  });
  assert.deepEqual(parseDesktopCommand("İndirilenlere Arşiv klasörü oluştur"), {
    intent: "create-folder", name: "Arşiv", location: "Downloads"
  });
});

test("Turkish desktop intent parser recognizes apps, search and destructive actions separately", () => {
  assert.equal(parseDesktopCommand("Steam'i aç").intent, "open-app");
  assert.equal(parseDesktopCommand("Discord'u başlat").app, "discord");
  assert.deepEqual(parseDesktopCommand("masaüstünde 1.jpg"), {
    intent: "search-files", query: "1.jpg", location: "Desktop"
  });
  assert.deepEqual(parseDesktopCommand("belgelerdeki rapor.pdf"), {
    intent: "search-files", query: "rapor.pdf", location: "Documents"
  });
  assert.deepEqual(parseDesktopCommand("1.jpg dosyasını sil"), {
    intent: "trash-file", target: "1.jpg"
  });
  assert.equal(parseDesktopCommand("sil 1.jpg").intent, "trash-file");
});

test("Discord recent-conversation requests route to computer control, not file search", () => {
  const first = parseDesktopCommand("Discord'da en son konuştuğum kişiyi bul ve sohbetini aç.");
  const second = parseDesktopCommand(`Discord'da en son konuştuğum kişinin sohbetini aç. Mesaj yazma alanını bul ve içine "NOVA TEST 123" yaz. Mesajı kesinlikle gönderme. Yazdıktan sonra işlemin tamamlandığını bildir.`);
  const third = parseDesktopCommand(`Discord'da en son konuştuğum kişiye "Merhaba" yaz ve gönder.`);
  for (const intent of [first, second, third]) {
    assert.equal(intent.intent, "computer-control");
    assert.deepEqual(intent.actions, [
      { type: "open-app", app: "discord" },
      { type: "wait", ms: 1400 },
      { type: "inspect-screen" }
    ]);
  }
});

test("Turkish desktop parser recognizes explicit user-folder phrases and nested destinations", () => {
  assert.deepEqual(parseDesktopCommand("İndirilenler klasöründeki 121.png dosyasını aç"), {
    intent: "open-path", target: "121.png", location: "Downloads"
  });
  assert.deepEqual(parseDesktopCommand("İndirilenler klasöründeki 121.png dosyasını masaüstündeki Oyunlar klasörüne taşı"), {
    intent: "move-file", source: "121.png", sourceLocation: "Downloads", destination: "Desktop/Oyunlar"
  });
  assert.equal(parseDesktopCommand("İndirilenler klasöründeki 121.png dosyasını masaüstündeki Oyunlar'a taşı").destination, "Desktop/Oyunlar");
  assert.deepEqual(parseDesktopCommand("İndirilenler klasöründeki 121.png"), {
    intent: "search-files", query: "121.png", location: "Downloads"
  });
  assert.deepEqual(parseDesktopCommand("Belgeler klasöründeki rapor.pdf dosyasını aç"), {
    intent: "open-path", target: "rapor.pdf", location: "Documents"
  });
  assert.deepEqual(parseDesktopCommand("Oyunlar klasöründe 121.png dosyasını bul"), {
    intent: "search-files", query: "121.png", location: "Oyunlar"
  });
});



test("opening a file by its bare filename resolves the exact item in known folders", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-desktop-path-test-"));
  const desktop = path.join(base, "desktop");
  const documents = path.join(base, "documents");
  const downloads = path.join(base, "downloads");
  await Promise.all([desktop, documents, downloads].map((folder) => fs.mkdir(folder)));
  await fs.writeFile(path.join(desktop, "1.jpg"), "test-image-placeholder");
  configureUserFolderPaths({ Desktop: desktop, Documents: documents, Downloads: downloads });

  try {
    const result = await openUserPath("1.jpg");
    assert.equal(result.path, await fs.realpath(path.join(desktop, "1.jpg")));
    await fs.writeFile(path.join(documents, "1.jpg"), "duplicate");
    await assert.rejects(openUserPath("1.jpg"), /birden fazla öğe/);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});


test("exact files directly inside a named user folder are not blocked by inaccessible child folders", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-direct-folder-file-test-"));
  const desktop = path.join(base, "desktop");
  const documents = path.join(base, "documents");
  const downloads = path.join(base, "downloads");
  const deniedOne = path.join(downloads, "protected-child-one");
  const deniedTwo = path.join(downloads, "protected-child-two");
  await Promise.all([desktop, documents, deniedOne, deniedTwo].map((folder) => fs.mkdir(folder, { recursive: true })));
  const target = path.join(downloads, "121.png");
  await fs.writeFile(target, "direct-download-file");
  configureComputerFileAccess({
    userFolders: { Desktop: desktop, Documents: documents, Downloads: downloads },
    driveRoots: [base]
  });

  const originalReaddir = fs.readdir;
  fs.readdir = async (directory, ...args) => {
    const resolved = path.resolve(String(directory));
    if ([path.resolve(deniedOne), path.resolve(deniedTwo)].includes(resolved)) {
      throw Object.assign(new Error("Access denied by test"), { code: "EACCES" });
    }
    return originalReaddir.call(fs, directory, ...args);
  };

  try {
    const opened = await openUserPath("121.png", "Downloads");
    assert.equal(opened.path, await fs.realpath(target));
  } finally {
    fs.readdir = originalReaddir;
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("searching a named folder ignores inaccessible unrelated folders outside the search scope", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-scoped-folder-search-test-"));
  const desktop = path.join(base, "desktop");
  const documents = path.join(base, "documents");
  const downloads = path.join(base, "downloads");
  const games = path.join(desktop, "Oyunlar");
  const deniedOne = path.join(documents, "protected-child-one");
  const deniedTwo = path.join(downloads, "protected-child-two");
  await Promise.all([games, deniedOne, deniedTwo].map((folder) => fs.mkdir(folder, { recursive: true })));
  const target = path.join(games, "121.png");
  await fs.writeFile(target, "scoped-search-target");
  configureUserFolderPaths({ Desktop: desktop, Documents: documents, Downloads: downloads });

  const originalReaddir = fs.readdir;
  fs.readdir = async (directory, ...args) => {
    const resolved = path.resolve(String(directory));
    if ([path.resolve(deniedOne), path.resolve(deniedTwo)].includes(resolved)) {
      throw Object.assign(new Error("Access denied by test"), { code: "EACCES" });
    }
    return originalReaddir.call(fs, directory, ...args);
  };

  try {
    const results = await searchUserFiles("121.png", "Oyunlar");
    assert.deepEqual(results.map((item) => item.path), [target]);
    assert.equal(results.inaccessibleDirectories, 0);
    const opened = await openUserPath("121.png", "Oyunlar");
    assert.equal(opened.path, await fs.realpath(target));
  } finally {
    fs.readdir = originalReaddir;
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("moving a file by natural-language source name resolves its explicitly named folder", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-desktop-move-test-"));
  const desktop = path.join(base, "desktop");
  const documents = path.join(base, "documents");
  const downloads = path.join(base, "downloads");
  await Promise.all([desktop, documents, downloads].map((folder) => fs.mkdir(folder)));
  await fs.writeFile(path.join(desktop, "1.jpg"), "desktop-image");
  await fs.mkdir(path.join(documents, "Euro Truck Simulator 2"), { recursive: true });
  await fs.writeFile(path.join(documents, "Euro Truck Simulator 2", "1.jpg"), "other-image");
  await fs.mkdir(path.join(desktop, "Oyunlar"), { recursive: true });
  await fs.writeFile(path.join(desktop, "Oyunlar", "121.png"), "nested-folder-search-target");
  await fs.writeFile(path.join(desktop, "to-move.txt"), "custom-folder-target");
  configureUserFolderPaths({ Desktop: desktop, Documents: documents, Downloads: downloads });

  try {
    const scopedResults = await searchUserFiles("1.jpg", "Desktop");
    assert.deepEqual(scopedResults.map((item) => item.path), [path.join(desktop, "1.jpg")]);
    const nestedFolderResults = await searchUserFiles("121.png", "Oyunlar");
    assert.deepEqual(nestedFolderResults.map((item) => item.path), [path.join(desktop, "Oyunlar", "121.png")]);
    const result = await resolveUserItem("1.jpg dosyasını", "Desktop");
    assert.equal(result.path, await fs.realpath(path.join(desktop, "1.jpg")));
    const moved = await moveUserFile("1.jpg dosyasını", downloads, "", "Desktop");
    assert.equal(moved.path, await fs.realpath(path.join(downloads, "1.jpg")));
    assert.equal(await fs.readFile(path.join(downloads, "1.jpg"), "utf8"), "desktop-image");
    const customFolderMove = await moveUserFile("to-move.txt", "Oyunlara", "", "Desktop");
    assert.equal(customFolderMove.path, path.join(desktop, "Oyunlar", "to-move.txt"));
    assert.equal(await fs.readFile(customFolderMove.path, "utf8"), "custom-folder-target");
    const qualifiedDestination = await resolveUserFolder("Desktop/Oyunlar");
    assert.equal(qualifiedDestination.path, await fs.realpath(path.join(desktop, "Oyunlar")));
    await assert.rejects(resolveUserItem("1.jpg"), /birden fazla öğe/);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});


test("full computer access searches deeply and handles arbitrary file extensions", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-computer-access-test-"));
  const desktop = path.join(base, "Desktop");
  const documents = path.join(base, "Documents");
  const downloads = path.join(base, "Downloads");
  const deepFolder = path.join(base, "OtherDrive", "Projects", "Nested", "Level4", "Level5", "Level6");
  const desktopNested = path.join(desktop, "Nested");
  await Promise.all([desktop, documents, downloads, deepFolder, desktopNested].map((folder) => fs.mkdir(folder, { recursive: true })));
  const source = path.join(deepFolder, "archive.custom-extension");
  const desktopSource = path.join(desktopNested, "desktop-scope.custom-extension");
  await Promise.all([
    fs.writeFile(source, "arbitrary-file-content"),
    fs.writeFile(desktopSource, "desktop-scoped-content")
  ]);
  configureComputerFileAccess({
    userFolders: { Desktop: desktop, Documents: documents, Downloads: downloads },
    driveRoots: [base]
  });

  try {
    assert.equal(resolveUserPath(source), source);
    const matches = await searchUserFiles("archive.custom-extension");
    assert.deepEqual(matches.map((item) => item.path), [source]);
    const scopedMatches = await searchUserFiles("archive.custom-extension", path.join(base, "OtherDrive", "Projects"));
    assert.deepEqual(scopedMatches.map((item) => item.path), [source]);
    const desktopScopedMatches = await searchUserFiles("desktop-scope.custom-extension", desktopNested);
    assert.deepEqual(desktopScopedMatches.map((item) => item.path), [desktopSource]);
    const resolvedFolder = await resolveUserFolder(path.join(base, "OtherDrive", "Projects"));
    assert.equal(resolvedFolder.path, await fs.realpath(path.join(base, "OtherDrive", "Projects")));
    const opened = await openUserPath("archive.custom-extension");
    assert.equal(opened.path, await fs.realpath(source));
    const moved = await moveUserFile(source, downloads, "");
    assert.equal(moved.path, path.join(downloads, "archive.custom-extension"));
    assert.equal(await fs.readFile(moved.path, "utf8"), "arbitrary-file-content");
    assert.equal(isProtectedSystemPath(path.join(base, "AppData", "Local", "critical.dat")), true);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("computer file mutations reject protected system locations", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-protected-path-test-"));
  const desktop = path.join(base, "Desktop");
  const documents = path.join(base, "Documents");
  const downloads = path.join(base, "Downloads");
  const protectedFolder = path.join(base, "Windows", "System32");
  await Promise.all([desktop, documents, downloads, protectedFolder].map((folder) => fs.mkdir(folder, { recursive: true })));
  const source = path.join(protectedFolder, "critical.dll");
  await fs.writeFile(source, "do-not-modify");
  const previousWindir = process.env.WINDIR;
  configureComputerFileAccess({
    userFolders: { Desktop: desktop, Documents: documents, Downloads: downloads },
    driveRoots: [base]
  });
  process.env.WINDIR = path.join(base, "Windows");

  try {
    await assert.rejects(moveUserFile(source, downloads, ""), /sistem klasörleri/);
    assert.equal(await fs.readFile(source, "utf8"), "do-not-modify");
  } finally {
    if (previousWindir === undefined) delete process.env.WINDIR;
    else process.env.WINDIR = previousWindir;
    await fs.rm(base, { recursive: true, force: true });
  }
});


test("opening files never executes programs, scripts, installers, or Windows shortcuts", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-safe-open-test-"));
  const desktop = path.join(base, "Desktop");
  const documents = path.join(base, "Documents");
  const downloads = path.join(base, "Downloads");
  await Promise.all([desktop, documents, downloads].map((folder) => fs.mkdir(folder, { recursive: true })));
  for (const name of ["payload.exe", "script.ps1", "shortcut.lnk", "installer.msi", "module.dll"]) {
    await fs.writeFile(path.join(desktop, name), "test-placeholder");
  }
  await fs.writeFile(path.join(desktop, "notes.pdf"), "test-document");
  configureComputerFileAccess({
    userFolders: { Desktop: desktop, Documents: documents, Downloads: downloads },
    driveRoots: [base]
  });

  try {
    for (const name of ["payload.exe", "script.ps1", "shortcut.lnk", "installer.msi", "module.dll"]) {
      await assert.rejects(openUserPath(path.join(desktop, name)), /güvenlik nedeniyle NOVA üzerinden doğrudan açılamaz/);
    }
    const document = await openUserPath(path.join(desktop, "notes.pdf"));
    assert.equal(document.path, await fs.realpath(path.join(desktop, "notes.pdf")));
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});


test("file search reports inaccessible folders and refuses incomplete exact resolution", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-inaccessible-search-test-"));
  const desktop = path.join(base, "Desktop");
  const documents = path.join(base, "Documents");
  const downloads = path.join(base, "Downloads");
  const denied = path.join(base, "Denied");
  await Promise.all([desktop, documents, downloads, denied].map((folder) => fs.mkdir(folder, { recursive: true })));
  await fs.writeFile(path.join(denied, "hidden-needle.txt"), "hidden");
  configureComputerFileAccess({
    userFolders: { Desktop: desktop, Documents: documents, Downloads: downloads },
    driveRoots: [base]
  });
  const originalReaddir = fs.readdir;
  fs.readdir = async (target, ...args) => {
    if (path.resolve(String(target)) === path.resolve(denied)) {
      throw Object.assign(new Error("Access denied by test"), { code: "EACCES" });
    }
    return originalReaddir.call(fs, target, ...args);
  };

  try {
    const results = await searchUserFiles("hidden-needle.txt");
    assert.equal(results.length, 0);
    assert.equal(results.inaccessibleDirectories, 1);
    await assert.rejects(resolveUserItem("hidden-needle.txt"), /klasöre erişilemedi/);
  } finally {
    fs.readdir = originalReaddir;
    await fs.rm(base, { recursive: true, force: true });
  }
});


test("broad searches skip protected system trees but explicit scoped searches can inspect them", async () => {
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || process.cwd(), "nova-protected-search-test-"));
  const desktop = path.join(base, "Desktop");
  const documents = path.join(base, "Documents");
  const downloads = path.join(base, "Downloads");
  const windows = path.join(base, "Windows");
  await Promise.all([desktop, documents, downloads, windows].map((folder) => fs.mkdir(folder, { recursive: true })));
  await fs.writeFile(path.join(windows, "scoped-needle.txt"), "test");
  configureComputerFileAccess({
    userFolders: { Desktop: desktop, Documents: documents, Downloads: downloads },
    driveRoots: [base]
  });

  try {
    const broad = await searchUserFiles("scoped-needle.txt");
    assert.equal(broad.length, 0);
    const scoped = await searchUserFiles("scoped-needle.txt", windows);
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].path, await fs.realpath(path.join(windows, "scoped-needle.txt")));
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});


test("desktop assistant HTML inline scripts remain syntactically valid", async () => {
  const html = await fs.readFile(new URL("./assistant.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  assert.ok(scripts.length > 0, "expected at least one inline assistant script");
  for (const [index, script] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(script, { filename: "assistant.html:inline-" + index }));
  }
});

test("desktop command parser supports browser, Spotify and installed Steam game requests", () => {
  assert.deepEqual(parseDesktopCommand("Chrome'da YouTube aç"), {
    intent: "open-url", app: "chrome", url: "https://www.youtube.com"
  });
  assert.deepEqual(parseDesktopCommand("YouTube aç"), {
    intent: "open-url", url: "https://www.youtube.com"
  });
  assert.deepEqual(parseDesktopCommand("Spotify'da Blinding Lights çal"), {
    intent: "computer-control", done: false,
    actions: [
      { type: "spotify-search", query: "Blinding Lights" },
      { type: "wait", ms: 1800 },
      { type: "inspect-screen" }
    ]
  });
  assert.deepEqual(parseDesktopCommand("Chrome'dan YouTube aç"), {
    intent: "open-url", app: "chrome", url: "https://www.youtube.com"
  });
  assert.deepEqual(parseDesktopCommand("Steam'de Dying Light: The Beast aç"), {
    intent: "launch-steam-game", game: "Dying Light: The Beast"
  });
  assert.equal(parseDesktopCommand("Spotify'ı aç").app, "spotify");
});

test("computer control validates supported actions and rejects unsafe or malformed inputs", () => {
  assert.equal(validateComputerAction({ type: "inspect-screen" }).type, "inspect-screen");
  assert.equal(validateComputerAction({ type: "type-text", text: "Ben Nova" }).text, "Ben Nova");
  assert.deepEqual(validateComputerAction({
    type: "focus-control", controlType: "Edit", automationId: "ChannelTextArea"
  }), { type: "focus-control", controlType: "Edit", automationId: "ChannelTextArea" });
  assert.throws(() => validateComputerAction({
    type: "focus-control", controlType: "Edit", automationId: "x".repeat(101)
  }), /Odaklanılacak/);
  assert.throws(() => validateComputerAction({ type: "run-command", command: "whoami" }), /Desteklenmeyen/);
  assert.throws(() => validateComputerAction({ type: "press-key", key: "WIN+R" }), /İzin verilmeyen/);
  assert.throws(() => validateComputerAction({ type: "click", x: -1, y: 30 }), /koordinat/);
  assert.deepEqual(validateComputerAction({ type: "move-mouse", dx: 40, dy: -20 }), { type: "move-mouse", dx: 40, dy: -20 });
  assert.throws(() => validateComputerAction({ type: "move-mouse", dx: 40000, dy: 0 }), /hareket koordinatları/);
});

test("Steam game resolver finds a uniquely installed title in a library manifest", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "nova-steam-library-test-"));
  const steamRoot = path.join(base, "Steam");
  const steamApps = path.join(steamRoot, "steamapps");
  await fs.mkdir(steamApps, { recursive: true });
  await fs.writeFile(path.join(steamRoot, "steam.exe"), "");
  await fs.writeFile(path.join(steamApps, "libraryfolders.vdf"), '"libraryfolders" { "0" { "path" "' + steamRoot.replace(/\\/g, "\\\\") + '" } }');
  await fs.writeFile(path.join(steamApps, "appmanifest_123456.acf"), '"AppState" { "appid" "123456" "name" "NOVA Test Game" }');
  const previousX86 = process.env["ProgramFiles(x86)"];
  const previousProgramFiles = process.env.ProgramFiles;
  process.env["ProgramFiles(x86)"] = base;
  process.env.ProgramFiles = base;
  try {
    const game = await resolveSteamGame("NOVA Test Game");
    assert.equal(game.name, "NOVA Test Game");
    assert.equal(game.appId, "123456");
    await assert.rejects(resolveSteamGame("missing game"), /kurulu bir oyun bulamadım/);
  } finally {
    if (previousX86 === undefined) delete process.env["ProgramFiles(x86)"];
    else process.env["ProgramFiles(x86)"] = previousX86;
    if (previousProgramFiles === undefined) delete process.env.ProgramFiles;
    else process.env.ProgramFiles = previousProgramFiles;
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("PowerShell startup CLIXML progress does not corrupt desktop action results", () => {
  const startupProgress = '<Objs Version="1.1.0.1"><Obj S="progress"><AV>Preparing modules for first use.</AV></Obj></Objs>';
  const output = startupProgress + '\r\n{"success":true,"message":"Metin yazıldı."}\r\n';
  assert.deepEqual(parseComputerControlOutput(output), { success: true, message: "Metin yazıldı." });
  assert.deepEqual(parseComputerControlOutput('#< CLIXML <Objs/>{"success":true,"items":[{"name":"Mesaj","bounds":{"x":1,"y":2}}]}'), { success: true, items: [{ name: "Mesaj", bounds: { x: 1, y: 2 } }] });
  assert.deepEqual(parseComputerControlOutput('NOVA_RESULT:{"success":false,"error":"test"}'), { success: false, error: "test" });
  assert.throws(() => parseComputerControlOutput(startupProgress), /geçerli sonuç/);
});

test("desktop screen inspection prioritizes editable controls and supports AutomationId targeting", async () => {
  const script = await fs.readFile(new URL("./computer-control.ps1", import.meta.url), "utf8");
  assert.match(script, /\$inputControls\s*=\s*@\(\)/);
  assert.match(script, /\$items\s*=\s*@\(\$inputControls\s*\+\s*\$controls\s*\+\s*\$texts/);
  assert.match(script, /\$current\.AutomationId\s*-eq\s*\[string\]\$action\.automationId/);
});

test("Windows PowerShell desktop automation script parses without syntax errors", { skip: process.platform !== "win32" }, () => {
  const scriptPath = fileURLToPath(new URL("./computer-control.ps1", import.meta.url));
  const command = "$tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('" +
    scriptPath.replace(/'/g, "''") +
    "', [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count -gt 0) { $errors | Out-String; exit 1 }";
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", command], { encoding: "utf8" });
  assert.equal(result.status, 0, (result.stdout || "") + (result.stderr || ""));
});

test("Windows desktop controller can load its automation runtime", { skip: process.platform !== "win32" }, async () => {
  const result = await runComputerAction({ type: "wait", ms: 0 });
  assert.equal(result.success, true);
});
