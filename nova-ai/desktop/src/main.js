import { app, BrowserWindow, dialog, shell } from "electron";
import { URL } from "node:url";

const NOVA_URL = "https://nova-ai-xxid.onrender.com/";
const NOVA_ORIGIN = new URL(NOVA_URL).origin;
let mainWindow;
let retryDialogOpen = false;

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

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  void mainWindow.loadURL(NOVA_URL);
}

app.setName("NOVA AI");
if (process.platform === "win32") app.setAppUserModelId("com.egehanulas.novaai");

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
