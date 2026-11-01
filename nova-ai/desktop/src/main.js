import { app, BrowserWindow, Menu, dialog, shell } from "electron";
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

function createApplicationMenu() {
  const template = [
    {
      label: "Dosya",
      submenu: [
        {
          label: "NOVA'yı Yenile",
          accelerator: "CommandOrControl+R",
          click: () => mainWindow?.webContents.reload()
        },
        { type: "separator" },
        { role: "quit", label: "Çıkış" }
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
  createApplicationMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
