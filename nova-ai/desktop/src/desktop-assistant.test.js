import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getComputerInfo,
  resolveUserPath,
  searchUserFiles,
  openAllowedApp,
  openUserPath,
  resolveUserItem,
  moveUserFile,
  configureUserFolderPaths,
  configureComputerFileAccess,
  isProtectedSystemPath
} from "./desktop-assistant.js";
import { createUpdateRetryScheduler } from "./update-retry.js";
import { parseDesktopCommand } from "./desktop-command.js";

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
  await assert.rejects(searchUserFiles("x".repeat(241)), /240 karakter/);
});

test("application launcher rejects anything outside the fixed allowlist", async () => {
  await assert.rejects(openAllowedApp("powershell"), /izin verilen uygulamalar listesinde değil/);
  await assert.rejects(openAllowedApp("cmd.exe"), /izin verilen uygulamalar listesinde değil/);
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
  assert.deepEqual(parseDesktopCommand("Masaüstündeki image.png dosyasını İndirilenler klasörüne taşı"), {
    intent: "move-file", source: "image.png", sourceLocation: "Desktop", destination: "Downloads"
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


test("opening a file by its bare filename resolves the exact item in known folders", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "nova-desktop-path-test-"));
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


test("moving a file by natural-language source name resolves its explicitly named folder", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "nova-desktop-move-test-"));
  const desktop = path.join(base, "desktop");
  const documents = path.join(base, "documents");
  const downloads = path.join(base, "downloads");
  await Promise.all([desktop, documents, downloads].map((folder) => fs.mkdir(folder)));
  await fs.writeFile(path.join(desktop, "1.jpg"), "desktop-image");
  await fs.mkdir(path.join(documents, "Euro Truck Simulator 2"), { recursive: true });
  await fs.writeFile(path.join(documents, "Euro Truck Simulator 2", "1.jpg"), "other-image");
  configureUserFolderPaths({ Desktop: desktop, Documents: documents, Downloads: downloads });

  try {
    const scopedResults = await searchUserFiles("1.jpg", "Desktop");
    assert.deepEqual(scopedResults.map((item) => item.path), [path.join(desktop, "1.jpg")]);
    const result = await resolveUserItem("1.jpg dosyasını", "Desktop");
    assert.equal(result.path, await fs.realpath(path.join(desktop, "1.jpg")));
    const moved = await moveUserFile("1.jpg dosyasını", downloads, "", "Desktop");
    assert.equal(moved.path, await fs.realpath(path.join(downloads, "1.jpg")));
    assert.equal(await fs.readFile(path.join(downloads, "1.jpg"), "utf8"), "desktop-image");
    await assert.rejects(resolveUserItem("1.jpg"), /birden fazla öğe/);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});


test("full computer access searches deeply and handles arbitrary file extensions", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "nova-computer-access-test-"));
  const desktop = path.join(base, "Desktop");
  const documents = path.join(base, "Documents");
  const downloads = path.join(base, "Downloads");
  const deepFolder = path.join(base, "OtherDrive", "Projects", "Nested", "Level4", "Level5", "Level6");
  await Promise.all([desktop, documents, downloads, deepFolder].map((folder) => fs.mkdir(folder, { recursive: true })));
  const source = path.join(deepFolder, "archive.custom-extension");
  await fs.writeFile(source, "arbitrary-file-content");
  configureComputerFileAccess({
    userFolders: { Desktop: desktop, Documents: documents, Downloads: downloads },
    driveRoots: [base]
  });

  try {
    assert.equal(resolveUserPath(source), source);
    const matches = await searchUserFiles("archive.custom-extension");
    assert.deepEqual(matches.map((item) => item.path), [source]);
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
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "nova-protected-path-test-"));
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
