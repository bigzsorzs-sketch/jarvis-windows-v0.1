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
  getStabilityStatus: () => ipcRenderer.invoke('jarvis:stability:status'),
  runStabilitySelfTest: () => ipcRenderer.invoke('jarvis:stability:self-test'),
  openStabilityLogs: () => ipcRenderer.invoke('jarvis:stability:open-logs'),
  restartApp: () => ipcRenderer.invoke('jarvis:app:restart'),
  reportRuntimeError: (report) => ipcRenderer.invoke('jarvis:self-repair:report', report),
  listSelfRepairs: () => ipcRenderer.invoke('jarvis:self-repair:list'),
  approveSelfRepair: (id) => ipcRenderer.invoke('jarvis:self-repair:approve', id),
  rejectSelfRepair: (id) => ipcRenderer.invoke('jarvis:self-repair:reject', id),
});
