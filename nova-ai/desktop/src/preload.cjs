"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("novaDesktop", Object.freeze({
  isDesktop: true,
  assistant: Object.freeze({
    computerInfo: () => ipcRenderer.invoke("nova-desktop:computer-info"),
    listFolders: () => ipcRenderer.invoke("nova-desktop:list-folders"),
    searchFiles: (query) => ipcRenderer.invoke("nova-desktop:search-files", query),
    openApp: (name) => ipcRenderer.invoke("nova-desktop:open-app", name),
    createFolder: (parent, name) => ipcRenderer.invoke("nova-desktop:create-folder", { parent, name }),
    moveFile: (source, destination, newName) => ipcRenderer.invoke("nova-desktop:move-file", { source, destination, newName })
  })
}));
contextBridge.exposeInMainWorld("novaUpdate", Object.freeze({
  onInfo(callback) { if (typeof callback === "function") ipcRenderer.on("nova-update:info", (_event, info) => callback(info)); },
  install() { ipcRenderer.send("nova-update:install"); },
  dismiss() { ipcRenderer.send("nova-update:later"); }
}));
