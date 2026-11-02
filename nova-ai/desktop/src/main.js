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
import { URL, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import { getComputerInfo, listUserFolders, searchUserFiles, openAllowedApp, openUserPath, resolveUserFileForTrash, createUserFolder, moveUserFile, configureComputerFileAccess, discoverDriveRoots, getUserFolderPath, resolveUserFolder, launchSteamGame, searchSpotify, openSpotify, openInstalledApp, launchDownloadedInstaller } from "./desktop-assistant.js";
import { parseDesktopCommand } from "./desktop-command.js";
import { runComputerAction } from "./computer-control.js";
import { createUpdateRetryScheduler } from "./update-retry.js";

const NOVA_URL = "https://nova-ai-xxid.onrender.com/";
const NOVA_ORIGIN = new URL(NOVA_URL).origin;
// Keep the trailing slash: Squirrel resolves RELEASES relative to this feed directory.
const UPDATE_FEED_URL = "https://github.com/egehanulas/nova-ai/releases/latest/download/";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 45_000;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
let mainWindow;
let tray;
let isQuitting = false;
let retryDialogOpen = false;
let updatePromptOpen = false;
let updateWindow;
let assistantWindow;
let updateCheckInProgress = false;
let updateDownloadInProgress = false;
let updateReadyToInstall = false;
let updateCheckTimeout;
let updateDownloadTimeout;
let updateRetryScheduler;
let lastUpdateStatus = "idle";

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
  const assistantFile = path.join(app.getAppPath(), "src", "assistant.html");
  const assistantFileUrl = pathToFileURL(assistantFile).href;
  assistantWindow = new BrowserWindow({
    width: 1040, height: 860, minWidth: 760, minHeight: 650, show: false,
    backgroundColor: "#090b12", title: "NOVA AI — Bilgisayar Asistanı",
    webPreferences: {
      preload: path.join(app.getAppPath(), "src", "preload.cjs"),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true
    }
  });
  assistantWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  assistantWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== assistantFileUrl) event.preventDefault();
  });
  assistantWindow.webContents.on("will-redirect", (event, targetUrl) => {
    if (targetUrl !== assistantFileUrl) event.preventDefault();
  });
  assistantWindow.once("ready-to-show", () => assistantWindow?.show());
  assistantWindow.on("closed", () => { assistantWindow = undefined; });
  void assistantWindow.loadFile(assistantFile);
}

function registerDesktopAssistantIpc() {
  const assistantFileUrl = pathToFileURL(path.join(app.getAppPath(), "src", "assistant.html")).href;
  const isTrustedSender = (event) => {
    const frame = event.senderFrame;
    if (!frame || frame.parent) return false;
    if (assistantWindow && !assistantWindow.isDestroyed() && event.sender === assistantWindow.webContents) {
      return frame.url === assistantFileUrl;
    }
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
    try {
      return new URL(frame.url).origin === NOVA_ORIGIN;
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
  ipcMain.handle("nova-desktop:search-files", async (event, query) => { requireTrustedWindows(event); const items = await searchUserFiles(query); return { items, truncated: Boolean(items.truncated), inaccessibleDirectories: items.inaccessibleDirectories || 0 }; });
  ipcMain.handle("nova-desktop:execute-command", async (event, payload = {}) => {
    requireTrustedWindows(event);
    const rawCommand = typeof payload.command === "string" ? payload.command : "";
    let intent = parseDesktopCommand(rawCommand);
    const accessToken = typeof payload.accessToken === "string" ? payload.accessToken : "";
    const observations = [];
    const parent = getDialogParent(event);
    const taskDeadline = Date.now() + 8 * 60 * 1000;
    const reportProgress = (phase, message, step = 0, total = 0) => {
      try {
        if (!event.sender.isDestroyed()) event.sender.send("nova-desktop:task-progress", {
          phase, message: String(message || "").slice(0, 240), step, total, timestamp: Date.now()
        });
      } catch {}
    };
    const sensitiveCommand = rawCommand.toLocaleLowerCase("tr-TR");
    const approvalReason =
      /(?:hesap.{0,35}ayar|ayar.{0,35}hesap|hesab.{0,35}ayar|ayar.{0,35}hesab|account.{0,35}settings|settings.{0,35}account|güvenlik.{0,25}ayar|gizlilik.{0,25}ayar|şifre(?:mi|yi)?\s+değiştir|e.?posta\s+adresini\s+değiştir)/iu.test(sensitiveCommand) ? "Hesap ayarlarını değiştirme" :
      "";
    const sensitiveActionReason = (action) => {
      const label = [action?.text, action?.name, action?.automationId].filter(Boolean).join(" ");
      const purchasePattern = /(?:satın\s*al|sipariş\s*ver|öde|checkout|\bbuy\b|place\s+order|complete\s+purchase|confirm\s+purchase|\bpay\b)/iu;
      const deletePattern = /(?:sil|delete|remove|move\s+to\s+trash|çöp\s+kutusu)/iu;
      if (action?.type === "launch-installer" || /(?:install|yükle|kur)/iu.test(label)) return "Program kurulumu";
      if (action?.type === "press-key" && String(action.key || "").toUpperCase() === "DELETE") return "Dosya silme";
      if (purchasePattern.test(label)) return "Satın alma veya ödeme";
      if (deletePattern.test(label) || /(?:uninstall|kaldır)/iu.test(label)) return "Dosya veya program kaldırma";
      const latest = observations[observations.length - 1];
      const items = Array.isArray(latest?.items) ? latest.items : [];
      const matches = items.filter(item => {
        const name = String(item?.name || "");
        if (!purchasePattern.test(name) && !deletePattern.test(name)) return false;
        if (action?.type === "click" && action.x != null && action.y != null) {
          const b = item.bounds;
          return b && action.x >= b.x && action.x <= b.x + b.width && action.y >= b.y && action.y <= b.y + b.height;
        }
        return action?.type === "press-key" && String(action.key || "").toUpperCase() === "ENTER" && Boolean(item.focusable);
      });
      if (matches.some(item => purchasePattern.test(String(item.name || "")))) return "Satın alma veya ödeme";
      if (matches.length) return "Dosya silme veya kaldırma";
      return "";
    };
    if (approvalReason) {
      const approval = await dialog.showMessageBox(parent, {
        type: "warning",
        title: "NOVA işlem onayı",
        message: approvalReason + " işlemi başlatılmak üzere.",
        detail: "NOVA yalnızca sen onaylarsan devam edecek. İşlem sırasında ödeme bilgilerini veya parolanı sohbete yazma.",
        buttons: ["Onayla ve devam et", "Vazgeç"],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      });
      if (approval.response !== 0) {
        reportProgress("cancelled", "İşlem için onay verilmedi.");
        return { message: "İşlem onay verilmediği için başlatılmadı." };
      }
    }
    reportProgress("started", "Komut analiz ediliyor.");
    const requestInterpretation = async () => {
      if (Date.now() > taskDeadline) throw new Error("Görev 8 dakikalık güvenli çalışma sınırına ulaştı.");
      if (!accessToken || accessToken.length >= 5000) return null;
      reportProgress("planning", "NOVA sonraki adımı planlıyor.");
      const response = await fetch(new URL("/api/desktop/interpret", NOVA_URL), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + accessToken
        },
        body: JSON.stringify({ command: rawCommand, observations: observations.slice(-6) }),
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) throw new Error("NOVA komut yorumlama servisi HTTP " + response.status);
      const interpreted = await response.json();
      return interpreted?.intent && typeof interpreted.intent === "object" ? interpreted.intent : null;
    };
    if (intent.intent === "unknown" && accessToken && accessToken.length < 5000) {
      try {
        intent = await requestInterpretation() || intent;
      } catch (error) {
        console.warn("NOVA AI intent interpretation failed; local parser remains available:", error.message);
      }
    }
    const folders = () => listUserFolders();
    const findFolder = async (name) => {
      const knownFolder = getUserFolderPath(name);
      if (knownFolder) return knownFolder;
      const resolved = await resolveUserFolder(name);
      return resolved.path;
    };

    switch (intent.intent) {
      case "help":
        return { message: "Windows Başlat menüsüne kayıtlı uygulamaları açabilir, Chrome ve Edge üzerinde web sitelerinde gezinebilir, arama yapabilir, formları doldurabilir, sekmeleri yönetebilir, Spotify’da müzik arayabilir, Steam’de kurulu oyunları başlatabilir; ekrandaki erişilebilir öğelere tıklayıp mouse ve klavyeyi kullanabilirim. Dosya ve klasör arama, açma, taşıma ve düzenleme işlemlerini de desteklerim. Örnek: “Discord’u aç”, “Chrome’da YouTube aç”, “Steam’de Dying Light: The Beast aç”, “Spotify’da Blinding Lights çal”, “Oyunlar klasöründe 121.png dosyasını aç”." };
      case "computer-info":
        return { message: JSON.stringify(getComputerInfo(), null, 2) };
      case "list-folders": {
        const all = await folders();
        return { message: all.map((folder) => folder.name + " (" + folder.items.length + " öğe)\\n" +
          folder.items.slice(0, 20).map((item) => (item.type === "folder" ? "📁 " : "📄 ") + item.name).join("\\n")).join("\\n\\n") };
      }
      case "open-app": {
        reportProgress("running", intent.app + " uygulaması açılıyor.");
        const result = intent.app === "spotify" ? await openSpotify() : await openAllowedApp(intent.app);
        reportProgress("completed", result.message || "Uygulama açıldı.", 1, 1);
        return result;
      }
      case "open-installed-app": {
        reportProgress("running", intent.app + " uygulaması aranıyor ve açılıyor.");
        const result = await openInstalledApp(intent.app);
        reportProgress("completed", result.message, 1, 1);
        return result;
      }
      case "open-url": {
        let targetUrl = typeof intent.url === "string" ? intent.url : "";
        if (!targetUrl && typeof intent.query === "string" && intent.query.trim()) {
          targetUrl = "https://www.google.com/search?q=" + encodeURIComponent(intent.query.trim());
        }
        let parsedUrl;
        try { parsedUrl = new URL(targetUrl); } catch { throw new Error("Açılacak internet adresi geçersiz."); }
        if (!["https:", "http:"].includes(parsedUrl.protocol)) throw new Error("Yalnızca güvenli web adresleri açılabilir.");
        if (intent.app === "chrome") {
          await openAllowedApp("chrome", [parsedUrl.href]);
          return { message: "Google Chrome'da " + parsedUrl.hostname + " açılıyor." };
        }
        openExternal(parsedUrl.href);
        return { message: parsedUrl.hostname + " varsayılan tarayıcıda açılıyor." };
      }
      case "spotify-search": {
        reportProgress("running", "Spotify'da müzik aranıyor.");
        const result = await searchSpotify(intent.query);
        reportProgress("completed", result.message, 1, 1);
        return result;
      }
      case "launch-steam-game": {
        reportProgress("running", intent.game + " oyunu başlatılıyor.");
        const result = await launchSteamGame(intent.game);
        reportProgress("completed", result.message, 1, 1);
        return result;
      }
      case "computer-control": {
        let currentIntent = intent;
        let completed = 0;
        for (let round = 0; round < 12; round += 1) {
          if (Date.now() > taskDeadline) throw new Error("Görev 8 dakikalık güvenli çalışma sınırına ulaştı; kalan adımlar durduruldu.");
          if (!Array.isArray(currentIntent.actions) || currentIntent.actions.length > 8) {
            throw new Error("Masaüstü kontrol planı geçersiz veya çok uzun.");
          }
          let needsReplan = false;
          for (const action of currentIntent.actions) {
            if (!action || typeof action !== "object") throw new Error("Masaüstü kontrol adımı geçersiz.");
            if (action.type === "finish") {
              const message = currentIntent.message || (completed ? "İstenen masaüstü işlemleri tamamlandı." : "Komutu güvenli biçimde tamamlayamadım; biraz daha açık anlatır mısın?");
              reportProgress("completed", message, completed, completed);
              return { message, steps: completed };
            }
            const actionLabel = action.type === "open-installed-app" ? (action.app + " uygulaması açılıyor.") :
              action.type === "open-app" ? (action.app + " açılıyor.") :
              action.type === "open-url" ? "Tarayıcıda web adresi açılıyor." :
              action.type === "launch-steam-game" ? (action.game + " oyunu başlatılıyor.") :
              action.type === "spotify-search" ? (action.query + " Spotify'da aranıyor.") :
              action.type === "research-web" ? "Web kaynakları araştırılıyor ve yanıt hazırlanıyor." :
              action.type === "inspect-screen" ? "Etkin pencere inceleniyor." :
              action.type === "click-text" ? "Ekrandaki hedef öğeye tıklanıyor." :
              action.type === "focus-control" ? "İlgili giriş alanına odaklanılıyor." :
              action.type === "type-text" ? "İstenen metin giriliyor." :
              action.type === "press-key" ? "Klavye işlemi uygulanıyor." :
              action.type === "wait" ? "Uygulamanın yanıt vermesi bekleniyor." : "Masaüstü işlemi uygulanıyor.";
            reportProgress("running", actionLabel, completed + 1, 0);
            const actionApprovalReason = sensitiveActionReason(action);
            if (actionApprovalReason) {
              const approval = await dialog.showMessageBox(parent, {
                type: "warning",
                title: "NOVA işlem onayı",
                message: actionApprovalReason + " işlemi yapılmak üzere.",
                detail: "Komut: " + rawCommand + "\\nHedef: " + (action.text || action.name || action.type),
                buttons: ["Onayla", "Vazgeç"],
                defaultId: 1,
                cancelId: 1,
                noLink: true
              });
              if (approval.response !== 0) {
                reportProgress("cancelled", actionApprovalReason + " işlemi onaylanmadı.", completed, 0);
                return { message: actionApprovalReason + " işlemi onay verilmediği için yapılmadı.", steps: completed };
              }
            }
            if (action.type === "inspect-screen") {
              let result;
              try {
                result = await runComputerAction(action);
              } catch {
                reportProgress("retrying", "Ekran okuma başarısız oldu; güvenli okuma işlemi bir kez yeniden deneniyor.", completed + 1, 0);
                result = await runComputerAction(action);
              }
              observations.push({ activeWindow: result.activeWindow || "", items: result.items || [] });
              reportProgress("planning", "Ekran okundu; NOVA sonraki adımı belirliyor.", completed, 0);
              currentIntent = await requestInterpretation();
              if (!currentIntent || currentIntent.intent !== "computer-control" || !Array.isArray(currentIntent.actions)) {
                throw new Error("NOVA ekrandaki durumu yorumlayamadı; güvenli olması için işlem durduruldu.");
              }
              needsReplan = true;
              break;
            }
            if (action.type === "open-app") {
              if (action.app === "spotify") await openSpotify();
              else await openAllowedApp(action.app);
            } else if (action.type === "open-installed-app") {
              await openInstalledApp(action.app);
            } else if (action.type === "launch-installer") {
              await launchDownloadedInstaller(action.path);
            } else if (action.type === "open-url") {
              let parsedUrl;
              try { parsedUrl = new URL(String(action.url || "")); } catch { throw new Error("Açılacak internet adresi geçersiz."); }
              if (!["https:", "http:"].includes(parsedUrl.protocol)) throw new Error("Yalnızca HTTP ve HTTPS adresleri açılabilir.");
              if (action.app === "chrome") await openAllowedApp("chrome", [parsedUrl.href]);
              else if (action.app === "edge") await openAllowedApp("edge", [parsedUrl.href]);
              else if (action.app === "firefox") await openAllowedApp("firefox", [parsedUrl.href]);
              else openExternal(parsedUrl.href);
            } else if (action.type === "launch-steam-game") {
              await launchSteamGame(action.game);
            } else if (action.type === "spotify-search") {
              await searchSpotify(action.query);
            } else if (action.type === "research-web") {
              const response = await fetch(new URL("/api/research", NOVA_URL), {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": "Bearer " + accessToken
                },
                body: JSON.stringify({ messages: [{ role: "user", content: String(action.query || "").slice(0, 1200) }] }),
                signal: AbortSignal.timeout(90000)
              });
              const research = await response.json().catch(() => ({}));
              if (!response.ok || !research.success || typeof research.answer !== "string" || !research.answer.trim()) {
                throw new Error(research.error || "NOVA web araştırmasını tamamlayamadı.");
              }
              reportProgress("completed", "Araştırma yanıtı hazır.", completed + 1, completed + 1);
              return { message: research.answer, steps: completed + 1, sources: research.sources || [] };
            } else {
              await runComputerAction(action);
            }
            completed += 1;
            reportProgress("running", "Tamamlandı: " + actionLabel, completed, 0);
          }
          if (!needsReplan) {
            if (currentIntent.done === true) {
              const message = currentIntent.message || "İstenen masaüstü işlemleri tamamlandı.";
              reportProgress("completed", message, completed, completed);
              return { message, steps: completed };
            }
            reportProgress("waiting", "Bu bölüm tamamlandı; görev için ek bilgi gerekebilir.", completed, 0);
            return { message: "Masaüstü adımları uygulandı; devam etmek için komutun kalan kısmını belirt.", steps: completed };
          }
        }
        reportProgress("failed", "Görev güvenli adım sınırına ulaştı; kalan işlemler durduruldu.", completed, 0);
        throw new Error("Masaüstü görevi güvenlik sınırına ulaştı; tamamlanmamış adımlar durduruldu.");
      }
      case "search-files": {
        const found = await searchUserFiles(intent.query, intent.location || "");
        if (!found.length) {
          const reasons = [];
          if (found.truncated) reasons.push("arama sınırına ulaşıldı");
          if (found.inaccessibleDirectories) reasons.push(found.inaccessibleDirectories + " klasöre erişilemedi");
          if (reasons.length) {
            return { message: "“" + intent.query + "” için erişilebilen alanlarda eşleşme bulamadım; ancak " + reasons.join(" ve ") + ". Arama eksik kalmış olabilir." };
          }
          return { message: "“" + intent.query + "” için erişilebilir sürücülerde eşleşme bulamadım." };
        }
        const warnings = [];
        if (found.truncated) warnings.push("arama sınırına ulaşıldı");
        if (found.inaccessibleDirectories) warnings.push(found.inaccessibleDirectories + " klasöre erişilemedi");
        return { message: "Bulduğum öğeler:" + (warnings.length ? " (arama kısmi olabilir: " + warnings.join(", ") + ")" : "") + "\n" + found.slice(0, 30).map((item, index) =>
          (index + 1) + ". " + (item.type === "folder" ? "📁 " : "📄 ") + item.name + "\n" + item.path).join("\n") };
      }
      case "open-path": {
        const resolved = await openUserPath(intent.target, intent.location || "");
        const error = await shell.openPath(resolved.path);
        if (error) throw new Error("Öğe açılamadı: " + error);
        return { message: "“" + path.basename(resolved.path) + "” açıldı.", path: resolved.path };
      }
      case "create-folder": {
        const destination = await findFolder(intent.location);
        const answer = await dialog.showMessageBox(parent, {
          type: "question", title: "Klasör oluşturma onayı",
          message: "Yeni klasör oluşturulsun mu?",
          detail: path.join(destination, String(intent.name || "")),
          buttons: ["Oluştur", "Vazgeç"], defaultId: 1, cancelId: 1
        });
        if (answer.response !== 0) return { message: "İşlem iptal edildi." };
        return await createUserFolder(destination, intent.name);
      }
      case "move-file":
      case "rename-file": {
        const sourcePath = (await openUserPath(intent.source, intent.sourceLocation || "")).path;
        const destinationText = intent.destination || "";
        const destination = intent.intent === "rename-file"
          ? path.dirname(sourcePath)
          : (path.isAbsolute(destinationText) || destinationText.includes("/") || destinationText.includes("\\")
            ? destinationText
            : await findFolder(destinationText));
        const answer = await dialog.showMessageBox(parent, {
          type: "warning", title: "Dosya işlemi onayı",
          message: intent.intent === "rename-file" ? "Öğe yeniden adlandırılsın mı?" : "Öğe taşınsın mı?",
          detail: sourcePath + "\n→ " + destination +
            (intent.newName ? "\nYeni ad: " + intent.newName : ""),
          buttons: ["Devam et", "Vazgeç"], defaultId: 1, cancelId: 1
        });
        if (answer.response !== 0) return { message: "İşlem iptal edildi." };
        return await moveUserFile(sourcePath, destination, intent.newName || "", intent.sourceLocation || "");
      }
      case "trash-file": {
        const resolvedTarget = path.isAbsolute(intent.target)
          ? intent.target
          : (await openUserPath(intent.target, intent.location || "")).path;
        const safePath = await resolveUserFileForTrash(resolvedTarget);
        const answer = await dialog.showMessageBox(parent, {
          type: "warning", title: "Geri Dönüşüm Kutusu",
          message: "Bu öğe Geri Dönüşüm Kutusu'na taşınsın mı?",
          detail: safePath, buttons: ["Geri dönüşüm kutusuna taşı", "Vazgeç"], defaultId: 1, cancelId: 1
        });
        if (answer.response !== 0) return { message: "Silme işlemi iptal edildi." };
        await shell.trashItem(safePath);
        return { message: "Öğe Geri Dönüşüm Kutusu'na taşındı." };
      }
      default:
        throw new Error("Komutu tam anlayamadım. Örneğin “Masaüstündeki 1.jpg dosyasını aç” veya “Masaüstüne Oyunlar klasörü oluştur” diyebilirsin. “Yardım” yazarak örnekleri görebilirsin.");
    }
  });
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
    return moveUserFile(payload.source, payload.destination, payload.newName, payload.sourceLocation || "");
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
  lastUpdateStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("nova-update:status", status);
  }
}

function clearUpdateTimeouts() {
  if (updateCheckTimeout) {
    clearTimeout(updateCheckTimeout);
    updateCheckTimeout = undefined;
  }
  if (updateDownloadTimeout) {
    clearTimeout(updateDownloadTimeout);
    updateDownloadTimeout = undefined;
  }
}

function scheduleUpdateRetry() {
  const delay = updateRetryScheduler?.schedule();
  if (!delay) return;
  sendUpdateStatus("retrying");
  console.warn(`NOVA update retry scheduled in ${Math.round(delay / 1000)} seconds.`);
}

function handleUpdateError(error) {
  clearUpdateTimeouts();
  updateCheckInProgress = false;
  updateDownloadInProgress = false;
  console.error("NOVA auto-update error:", error);
  sendUpdateStatus("error");
  scheduleUpdateRetry();
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

  if (updateCheckInProgress || updateDownloadInProgress || updateReadyToInstall) return;

  updateRetryScheduler?.cancel();
  updateCheckInProgress = true;
  sendUpdateStatus("checking");
  updateCheckTimeout = setTimeout(() => {
    updateCheckTimeout = undefined;
    updateCheckInProgress = false;
    console.warn("NOVA update check timed out.");
    sendUpdateStatus("error");
    scheduleUpdateRetry();
  }, UPDATE_CHECK_TIMEOUT_MS);
  updateCheckTimeout.unref?.();

  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    handleUpdateError(error);
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
    ],
    "0.2.0-alpha.28": [
      "NOVA artık Windows masaüstünde mouse ve klavyeyi kullanabiliyor",
      "Discord, Chrome, Spotify ve diğer desteklenen uygulamalar arasında işlem yapabiliyor",
      "Steam kütüphanesindeki kurulu oyunları adlarıyla başlatabiliyor",
      "Ekrandaki erişilebilir öğeleri okuyup adım adım tıklama ve metin yazma",
      "Rastgele terminal komutları yerine izinli ve doğrulanan masaüstü eylemleri"
    ],
    "0.2.0-alpha.33": [
      "Windows Başlat menüsüne kayıtlı uygulamaları adlarıyla bulup açma",
      "Chrome ve Edge dahil uygulamalarda daha fazla sekme ve gezinme kısayolu",
      "Uzun masaüstü görevleri için daha geniş çalışma süresi ve takılan işlemleri durdurma",
      "Ekran okuma başarısız olduğunda güvenli otomatik yeniden deneme",
      "Görev adımlarını sohbet ekranında ayrıntılı olarak gösterme",
      "Satın alma, hesap ayarı ve program yönetiminde yerel onay kontrolleri"
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

  updateRetryScheduler = createUpdateRetryScheduler({
    onRetry: () => {
      sendUpdateStatus("checking");
      checkForUpdates();
    }
  });

  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus("checking");
  });
  autoUpdater.on("error", handleUpdateError);
  autoUpdater.on("update-available", () => {
    if (updateCheckTimeout) {
      clearTimeout(updateCheckTimeout);
      updateCheckTimeout = undefined;
    }
    updateCheckInProgress = false;
    updateDownloadInProgress = true;
    updateRetryScheduler.cancel();

    updateDownloadTimeout = setTimeout(() => {
      updateDownloadTimeout = undefined;
      updateDownloadInProgress = false;
      console.warn("NOVA update download timed out.");
      sendUpdateStatus("error");
      scheduleUpdateRetry();
    }, UPDATE_DOWNLOAD_TIMEOUT_MS);
    updateDownloadTimeout.unref?.();

    sendUpdateStatus("available");
    if (Notification.isSupported()) {
      new Notification({
        title: "NOVA AI güncellemesi",
        body: "Yeni sürüm indiriliyor. İndirme tamamlandığında haber vereceğiz."
      }).show();
    }
  });
  autoUpdater.on("update-not-available", () => {
    clearUpdateTimeouts();
    updateCheckInProgress = false;
    updateDownloadInProgress = false;
    updateRetryScheduler.reset();
    console.info("NOVA is up to date.");
    sendUpdateStatus("not-available");
  });
  autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
    clearUpdateTimeouts();
    updateCheckInProgress = false;
    updateDownloadInProgress = false;
    updateReadyToInstall = true;
    updateRetryScheduler.reset();
    sendUpdateStatus("downloaded");
    if (updatePromptOpen) return;
    updatePromptOpen = true;
    showUpdateWindow(releaseName, releaseNotes);
  });

  try {
    autoUpdater.setFeedURL({ url: UPDATE_FEED_URL });
  } catch (error) {
    handleUpdateError(error);
  }

  const startupCheck = setTimeout(checkForUpdates, 12_000);
  startupCheck.unref?.();
  const periodicCheck = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
  periodicCheck.unref?.();
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
  ipcMain.handle("nova-update:get-status", () => lastUpdateStatus);
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

  app.whenReady().then(async () => {
    const userFolders = {
      Desktop: app.getPath("desktop"),
      Documents: app.getPath("documents"),
      Downloads: app.getPath("downloads")
    };
    const driveRoots = await discoverDriveRoots();
    configureComputerFileAccess({ userFolders, driveRoots });
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
    updateRetryScheduler?.reset();
    clearUpdateTimeouts();
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("window-all-closed", () => {
    // NOVA stays in the Windows notification area until the user chooses Exit.
    if (process.platform !== "win32") quitApplication();
  });
}
