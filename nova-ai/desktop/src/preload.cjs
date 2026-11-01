"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("novaDesktop", Object.freeze({
  isDesktop: true
}));

contextBridge.exposeInMainWorld("novaUpdate", Object.freeze({
  onInfo(callback) {
    if (typeof callback !== "function") return;
    ipcRenderer.on("nova-update:info", (_event, info) => callback(info));
  },
  install() {
    ipcRenderer.send("nova-update:install");
  },
  dismiss() {
    ipcRenderer.send("nova-update:later");
  }
}));
