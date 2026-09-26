'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisDesktop', {
  platform: process.platform,
  invokeFunction: (name, payload) => ipcRenderer.invoke('jarvis:function:invoke', name, payload),
  getSystemContext: () => ipcRenderer.invoke('jarvis:system:context'),
  getRules: () => ipcRenderer.invoke('jarvis:policy:rules'),
  evaluateAction: (action) => ipcRenderer.invoke('jarvis:policy:evaluate', action),
  ownerOverride: (request) => ipcRenderer.invoke('jarvis:policy:override', request),
  getSettings: () => ipcRenderer.invoke('jarvis:settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('jarvis:settings:save', settings),
  listModels: () => ipcRenderer.invoke('jarvis:ai:list-models'),
  selectFiles: (options) => ipcRenderer.invoke('jarvis:file:select', options),
  oneClickUpdate: () => ipcRenderer.invoke('jarvis:update:one-click'),
  obd: {
    listPorts: () => ipcRenderer.invoke('jarvis:obd:list-ports'),
    connect: (options) => ipcRenderer.invoke('jarvis:obd:connect', options),
    send: (command, timeout) => ipcRenderer.invoke('jarvis:obd:send', { command, timeout }),
    status: () => ipcRenderer.invoke('jarvis:obd:status'),
    disconnect: () => ipcRenderer.invoke('jarvis:obd:disconnect'),
  },
});
