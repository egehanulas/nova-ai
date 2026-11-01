"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("novaDesktop", Object.freeze({
  isDesktop: true
}));
