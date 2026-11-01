import {
  app,
  autoUpdater,
  BrowserWindow,
  Menu,
  Tray,
  Notification,
  globalShortcut,
  nativeImage,
  dialog,
  shell,
  session,
  ipcMain
} from "electron";
import { URL } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import { getComputerInfo, listUserFolders, searchUserFiles, openAllowedApp, openUserPath, resolveUserFileForTrash, createUserFolder, moveUserFile } from "./desktop-assistant.js";

const NOVA_URL = "https://nova-ai-xxid.onrender.com/";
const NOVA_ORIGIN = new URL(NOVA_URL).origin;
const UPDATE_FEED_URL = "https://github.com/egehanulas/nova-ai/releases/latest/download";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let mainWindow;
let tray;
let isQuitting = false;
let retryDialogOpen = false;
let updatePromptOpen = false;
let updateWindow;
let assistantWindow;

function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:") {
      void shell.openExternal(value);
    }
  } catch {
    // Ignore malformed or unsupported external URLs.
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow?.show();
  mainWindow?.focus();
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
    showWindow();
  } else {
    mainWindow.hide();
  }
}

function quitApplication() {
  isQuitting = true;
  app.quit();
}

function createTray() {
  // Embedded PNG keeps the Windows notification-area icon self-contained.
  const trayImage = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnUlEQVR4nO3VwQ2AIAwFUGbw4AIu5LDuV8LBxBApv6W1mNCkN/C/AEJKq2au8yKyaHHwth/k0aHhMCIUUPbLG8CeiTfAfZC0YfVcNUCKaM0TAzQIbrwKIEH0xqkB6Md7yCFAb2/RFTIDtHoBXAEcBJ03DKhDJYh//wWh90DoTRj6FkzxGlo2CyjlDWDDpwB4IqDwZyH3PtLi4FVfVgbpz2l1rjeY+wAAAABJRU5ErkJggg=="
  );
  tray = new Tray(trayImage);
  tray.setToolTip("NOVA AI");

  const contextMenu = Menu.buildFromTemplate([
    { label: "NOVA AI'ı Aç", click: showWindow },
    { label: "Bilgisayar Asistanı", click: showDesktopAssistant },
    { label: "Göster / Gizle  (Ctrl+Shift+Space)", click: toggleWindow },
    { type: "separator" },
    {
      label: "Windows ile başlat",
      type: "checkbox",
      checked: process.platform === "win32" && app.getLoginItemSettings().openAtLogin,
      enabled: process.platform === "win32",
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
      }
    },
    { type: "separator" },
    { label: "Çıkış", click: quitApplication }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", showWindow);
}

function createApplicationMenu() {
  const template = [
    {
      label: "Dosya",
      submenu: [
        { label: "NOVA'yı Göster", click: showWindow },
        { label: "Bilgisayar Asistanı", click: showDesktopAssistant },
        {
          label: "NOVA'yı Yenile",
          accelerator: "CommandOrControl+R",
          click: () => mainWindow?.webContents.reload()
        },
        { type: "separator" },
        { role: "quit", label: "Çıkış", click: quitApplication }
      ]
    },
    {
      label: "Görünüm",
      submenu: [
        {
          label: "Yakınlaştır",
          accelerator: "CommandOrControl+=",
          click: () => mainWindow?.webContents.setZoomLevel(
            Math.min(mainWindow.webContents.getZoomLevel() + 1, 5)
          )
        },
        {
          label: "Uzaklaştır",
          accelerator: "CommandOrControl+-",
          click: () => mainWindow?.webContents.setZoomLevel(
            Math.max(mainWindow.webContents.getZoomLevel() - 1, -5)
          )
        },
        {
          label: "Yakınlaştırmayı Sıfırla",
          accelerator: "CommandOrControl+0",
          click: () => mainWindow?.webContents.setZoomLevel(0)
        },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tam Ekran" }
      ]
    },
    {
      label: "Yardım",
      submenu: [
        {
          label: "Güncellemeleri denetle",
          click: checkForUpdates
        },
        {
          label: "NOVA AI Hakkında",
          click: () => {
            void dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "NOVA AI Hakkında",
              message: "NOVA AI",
              detail: `Sürüm: ${app.getVersion()}\nAlpha sürümü — geri bildirimlerin geliştirmeye yardımcı olur.`,
              buttons: ["Tamam"]
            });
          }
        },
        {
          label: "NOVA AI Web Sitesini Aç",
          click: () => openExternal(NOVA_URL)
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function configureMicrophonePermissions() {
  const defaultSession = session.defaultSession;

  // The desktop app loads only the NOVA origin. Allow its explicit microphone
  // request so Chromium can surface the Windows privacy permission prompt.
  defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let requestingOrigin = "";
    try {
      requestingOrigin = new URL(details?.requestingUrl || webContents.getURL()).origin;
    } catch {
      callback(false);
      return;
    }

    const isNovaOrigin = requestingOrigin === NOVA_ORIGIN;
    const isMicrophoneRequest =
      permission === "media" &&
      (!details?.mediaTypes || details.mediaTypes.includes("audio"));

    callback(isNovaOrigin && isMicrophoneRequest);
  });

  defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission !== "media") return false;
    try {
      return new URL(requestingOrigin).origin === NOVA_ORIGIN &&
        (!details?.mediaTypes || details.mediaTypes.includes("audio"));
    } catch {
      return false;
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#090b12",
    title: "NOVA AI",
    webPreferences: {
      preload: path.join(app.getAppPath(), "src", "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin !== NOVA_ORIGIN) {
        event.preventDefault();
        openExternal(targetUrl);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("did-fail-load", async (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || retryDialogOpen || !mainWindow) return;
    retryDialogOpen = true;
    const result = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "NOVA AI bağlantı sorunu",
      message: "NOVA AI sunucusuna bağlanılamadı.",
      detail: `${errorDescription} (Kod: ${errorCode})\n\nİnternet bağlantını kontrol edip tekrar deneyebilirsin.`,
      buttons: ["Tekrar dene", "Kapat"],
      defaultId: 0,
      cancelId: 1
    });
    retryDialogOpen = false;
    if (result.response === 0 && mainWindow && !mainWindow.isDestroyed()) {
      void mainWindow.loadURL(NOVA_URL);
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  void mainWindow.loadURL(NOVA_URL);
}


function showDesktopAssistant() {
  if (assistantWindow && !assistantWindow.isDestroyed()) {
    assistantWindow.show();
    assistantWindow.focus();
    return;
  }
  assistantWindow = new BrowserWindow({
    width: 1040, height: 860, minWidth: 760, minHeight: 650, show: false,
    backgroundColor: "#090b12", title: "NOVA AI — Bilgisayar Asistanı",
    webPreferences: {
      preload: path.join(app.getAppPath(), "src", "preload.cjs"),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true
    }
  });
  assistantWindow.once("ready-to-show", () => assistantWindow?.show());
  assistantWindow.on("closed", () => { assistantWindow = undefined; });
  void assistantWindow.loadFile(path.join(app.getAppPath(), "src", "assistant.html"));
}

function registerDesktopAssistantIpc() {
  const isTrustedSender = (event) => {
    if (assistantWindow && !assistantWindow.isDestroyed() && event.sender === assistantWindow.webContents) return true;
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
    try {
      const frame = event.senderFrame;
      return Boolean(frame && !frame.parent && new URL(frame.url).origin === NOVA_ORIGIN);
    } catch { return false; }
  };
  const requireTrustedWindows = (event) => {
    if (!isTrustedSender(event)) throw new Error("Yetkisiz istek.");
    if (process.platform !== "win32") throw new Error("Bu özellik yalnızca Windows masaüstünde kullanılabilir.");
  };
  const getDialogParent = (event) => assistantWindow && !assistantWindow.isDestroyed() &&
    event.sender === assistantWindow.webContents ? assistantWindow : mainWindow;

  ipcMain.handle("nova-desktop:computer-info", (event) => { requireTrustedWindows(event); return getComputerInfo(); });
  ipcMain.handle("nova-desktop:list-folders", (event) => { requireTrustedWindows(event); return listUserFolders(); });
  ipcMain.handle("nova-desktop:search-files", (event, query) => { requireTrustedWindows(event); return searchUserFiles(query); });
  ipcMain.handle("nova-desktop:open-app", (event, name) => { requireTrustedWindows(event); return openAllowedApp(name); });
  ipcMain.handle("nova-desktop:open-path", async (event, input) => {
    requireTrustedWindows(event);
    const result = await openUserPath(input);
    const error = await shell.openPath(result.path);
    if (error) throw new Error("Öğe açılamadı: " + error);
    return { message: "“" + path.basename(result.path) + "” açıldı.", path: result.path };
  });
  ipcMain.handle("nova-desktop:create-folder", async (event, payload = {}) => {
    requireTrustedWindows(event);
    const answer = await dialog.showMessageBox(getDialogParent(event), {
      type: "question", title: "Klasör oluşturma onayı", message: "Yeni klasör oluşturulsun mu?",
      detail: String(payload.name || ""), buttons: ["Oluştur", "Vazgeç"], defaultId: 1, cancelId: 1
    });
    if (answer.response !== 0) return { message: "İşlem iptal edildi." };
    return createUserFolder(payload.parent, payload.name);
  });
  ipcMain.handle("nova-desktop:move-file", async (event, payload = {}) => {
    requireTrustedWindows(event);
    const answer = await dialog.showMessageBox(getDialogParent(event), {
      type: "warning", title: "Dosya taşıma onayı", message: "Dosya veya klasör taşınsın mı?",
      detail: String(payload.source || "") + "\n→ " + String(payload.destination || "") +
        (payload.newName ? "\nYeni ad: " + String(payload.newName) : ""),
      buttons: ["Taşı", "Vazgeç"], defaultId: 1, cancelId: 1
    });
    if (answer.response !== 0) return { message: "İşlem iptal edildi." };
    return moveUserFile(payload.source, payload.destination, payload.newName);
  });
  ipcMain.handle("nova-desktop:trash-file", async (event, input) => {
    requireTrustedWindows(event);
    const safePath = await resolveUserFileForTrash(input);
    const answer = await dialog.showMessageBox(getDialogParent(event), {
      type: "warning", title: "Geri Dönüşüm Kutusu", message: "Bu öğe Geri Dönüşüm Kutusu'na taşınsın mı?",
      detail: safePath, buttons: ["Geri dönüşüm kutusuna taşı", "Vazgeç"], defaultId: 1, cancelId: 1
    });
    if (answer.response !== 0) return { message: "Silme işlemi iptal edildi." };
    await shell.trashItem(safePath);
    return { message: "Öğe Geri Dönüşüm Kutusu'na taşındı." };
  });
}
function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("nova-update:status", status);
  }
}

function checkForUpdates() {
  if (!app.isPackaged || process.platform !== "win32") {
    sendUpdateStatus("error");
    if (mainWindow && !mainWindow.isDestroyed()) {
      void dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "NOVA AI Güncelleme",
        message: "Güncelleme denetimi yalnızca kurulu Windows sürümünde kullanılabilir.",
        buttons: ["Tamam"]
      });
    }
    return;
  }

  sendUpdateStatus("checking");
  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("NOVA update check failed:", error);
    sendUpdateStatus("error");
  }
}


function showUpdateWindow(releaseName = "", releaseNotes = "") {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  const versionMatch = String(releaseName || "").match(/\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?/);
  const nextVersion = versionMatch?.[0] || "Yeni sürüm";
  const releaseHighlights = {
    "0.2.0-alpha.7": [
      "NOVA'ya özel, animasyonlu güncelleme penceresi",
      "Her sürümde yenilikleri ve iyileştirmeleri gösteren sürüm notları",
      "Daha anlaşılır sürüm karşılaştırması ve yeniden başlatma akışı"
    ],
    "0.2.0-alpha.10": [
      "Windows için NOVA Bilgisayar Asistanı eklendi",
      "Bilgisayar bilgilerini görüntüleme ve kişisel klasörlerde dosya arama",
      "Not Defteri, Hesap Makinesi, Dosya Gezgini ve Steam'i açma",
      "Klasör oluşturma, dosya taşıma ve yeniden adlandırma işlemleri için güvenlik onayları"
    ]
  };
  const suppliedNotes = Array.isArray(releaseNotes)
    ? releaseNotes.map((entry) => typeof entry === "string" ? entry : entry?.note || "").join("\n")
    : String(releaseNotes || "");
  const parsedNotes = suppliedNotes
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*+]\s*/, "").replace(/^#+\s*/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim())
    .filter((line) => line && !/^what's changed/i.test(line) && !/^full changelog/i.test(line) && !/^compare view/i.test(line))
    .slice(0, 7);
  const items = releaseHighlights[nextVersion] || (parsedNotes.length ? parsedNotes : [
    "NOVA AI için yeni iyileştirmeler ve hata düzeltmeleri",
    "Daha iyi ve kararlı bir kullanım deneyimi"
  ]);

  updateWindow = new BrowserWindow({
    width: 760,
    height: 690,
    minWidth: 680,
    minHeight: 620,
    maxWidth: 760,
    maxHeight: 690,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    modal: Boolean(mainWindow && !mainWindow.isDestroyed()),
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    backgroundColor: "#0b0b14",
    title: "NOVA AI — Güncelleme hazır",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), "src", "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  updateWindow.once("ready-to-show", () => updateWindow?.show());
  updateWindow.webContents.once("did-finish-load", () => {
    updateWindow?.webContents.send("nova-update:info", {
      currentVersion: app.getVersion(),
      nextVersion,
      items
    });
  });
  updateWindow.on("closed", () => {
    updateWindow = undefined;
    updatePromptOpen = false;
  });
  void updateWindow.loadFile(path.join(app.getAppPath(), "src", "update.html"));
}

function configureAutoUpdates() {
  if (!app.isPackaged || process.platform !== "win32") return;

  autoUpdater.setFeedURL({ url: UPDATE_FEED_URL });
  autoUpdater.on("error", (error) => {
    console.error("NOVA auto-update error:", error);
    sendUpdateStatus("error");
  });
  autoUpdater.on("update-available", () => {
    sendUpdateStatus("available");
    if (Notification.isSupported()) {
      new Notification({
        title: "NOVA AI güncellemesi",
        body: "Yeni sürüm indiriliyor. İndirme tamamlandığında haber vereceğiz."
      }).show();
    }
  });
  autoUpdater.on("update-not-available", () => {
    console.info("NOVA is up to date.");
    sendUpdateStatus("not-available");
  });
  autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
    sendUpdateStatus("downloaded");
    if (updatePromptOpen) return;
    updatePromptOpen = true;
    showUpdateWindow(releaseName, releaseNotes);
  });

  setTimeout(checkForUpdates, 12_000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

function handleSquirrelEvent() {
  if (process.platform !== "win32") return false;

  const event = process.argv[1];
  const handledEvents = [
    "--squirrel-install",
    "--squirrel-updated",
    "--squirrel-uninstall",
    "--squirrel-obsolete"
  ];
  if (!handledEvents.includes(event)) return false;

  const appFolder = path.resolve(process.execPath, "..");
  const rootFolder = path.resolve(appFolder, "..");
  const updateExe = path.join(rootFolder, "Update.exe");
  const executableName = path.basename(process.execPath);

  const runUpdate = (args) => {
    try {
      const child = spawn(updateExe, args, {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
    } catch (error) {
      console.error("NOVA shortcut setup failed:", error);
    }
  };

  if (event === "--squirrel-install" || event === "--squirrel-updated") {
    // Reuse the same shortcut on install/update; never create a second desktop icon.
    runUpdate(["--createShortcut", executableName]);
    setTimeout(() => app.quit(), 1000);
    return true;
  }

  if (event === "--squirrel-uninstall") {
    runUpdate(["--removeShortcut", executableName]);
    setTimeout(() => app.quit(), 1000);
    return true;
  }

  app.quit();
  return true;
}

if (!handleSquirrelEvent()) {
  app.setName("NOVA AI");
  if (process.platform === "win32") app.setAppUserModelId("com.squirrel.nova_ai.nova_ai");

  ipcMain.handle("nova-desktop:app-info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged
  }));
  ipcMain.on("nova-update:check", checkForUpdates);
  ipcMain.on("nova-update:later", () => {
    if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
  });
  ipcMain.on("nova-update:install", () => {
    if (!updateWindow || updateWindow.isDestroyed()) return;
    updateWindow.close();
    isQuitting = true;
    autoUpdater.quitAndInstall();
  });

  app.whenReady().then(() => {
    configureMicrophonePermissions();
    registerDesktopAssistantIpc();
    createApplicationMenu();
    createTray();
    createWindow();
    if (process.platform === "win32") {
      globalShortcut.register("CommandOrControl+Shift+Space", toggleWindow);
    }
    configureAutoUpdates();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) showWindow();
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("window-all-closed", () => {
    // NOVA stays in the Windows notification area until the user chooses Exit.
    if (process.platform !== "win32") quitApplication();
  });
}
