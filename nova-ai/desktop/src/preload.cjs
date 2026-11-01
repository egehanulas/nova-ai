"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("novaDesktop", Object.freeze({
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke("nova-desktop:app-info"),
  assistant: Object.freeze({
    computerInfo: () => ipcRenderer.invoke("nova-desktop:computer-info"),
    listFolders: () => ipcRenderer.invoke("nova-desktop:list-folders"),
    searchFiles: (query) => ipcRenderer.invoke("nova-desktop:search-files", query),
    openApp: (name) => ipcRenderer.invoke("nova-desktop:open-app", name),
    openPath: (targetPath) => ipcRenderer.invoke("nova-desktop:open-path", targetPath),
    createFolder: (parent, name) => ipcRenderer.invoke("nova-desktop:create-folder", { parent, name }),
    moveFile: (source, destination, newName) => ipcRenderer.invoke("nova-desktop:move-file", { source, destination, newName }),
    trashFile: (targetPath) => ipcRenderer.invoke("nova-desktop:trash-file", targetPath)
  })
}));
contextBridge.exposeInMainWorld("novaUpdate", Object.freeze({
  onInfo(callback) { if (typeof callback === "function") ipcRenderer.on("nova-update:info", (_event, info) => callback(info)); },
  onStatus(callback) { if (typeof callback === "function") ipcRenderer.on("nova-update:status", (_event, status) => callback(status)); },
  check() { ipcRenderer.send("nova-update:check"); },
  install() { ipcRenderer.send("nova-update:install"); },
  dismiss() { ipcRenderer.send("nova-update:later"); }
}));
