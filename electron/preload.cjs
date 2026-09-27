'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisDesktop', {
  platform: process.platform,
  capabilities: { recordedStt:false, remoteTts:false, gmailOAuth:false, cloudSync:false },
  invokeFunction: (name, payload) => ipcRenderer.invoke('jarvis:function:invoke', name, payload),
  getSystemContext: () => ipcRenderer.invoke('jarvis:system:context'),
  getRules: () => ipcRenderer.invoke('jarvis:policy:rules'),
  evaluateAction: (action) => ipcRenderer.invoke('jarvis:policy:evaluate', action),
  ownerOverride: (request) => ipcRenderer.invoke('jarvis:policy:override', request),
  getOwnerPinStatus: () => ipcRenderer.invoke('jarvis:policy:pin:status'),
  setOwnerPin: (request) => ipcRenderer.invoke('jarvis:policy:pin:set', request),
  getSettings: () => ipcRenderer.invoke('jarvis:settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('jarvis:settings:save', settings),
  listModels: () => ipcRenderer.invoke('jarvis:ai:list-models'),
  testAiConnection: () => ipcRenderer.invoke('jarvis:ai:test-connection'),
  selectFiles: (options) => ipcRenderer.invoke('jarvis:file:select', options),
  oneClickUpdate: () => ipcRenderer.invoke('jarvis:update:one-click'),
  localDeviceRequest: (request) => ipcRenderer.invoke('jarvis:device:request', request),
  data: {
    filter: (entity, query, sort, limit) => ipcRenderer.invoke('jarvis:data:filter', { entity, query, sort, limit }),
    create: (entity, data) => ipcRenderer.invoke('jarvis:data:create', { entity, data }),
    update: (entity, id, patch) => ipcRenderer.invoke('jarvis:data:update', { entity, id, patch }),
    delete: (entity, id) => ipcRenderer.invoke('jarvis:data:delete', { entity, id }),
    importLegacy: (snapshot) => ipcRenderer.invoke('jarvis:data:import-legacy', snapshot),
    stats: () => ipcRenderer.invoke('jarvis:data:stats'),
    getUser: () => ipcRenderer.invoke('jarvis:data:user:get'),
    updateUser: (patch) => ipcRenderer.invoke('jarvis:data:user:update', patch),
  },
  backup: {
    create: (passphrase) => ipcRenderer.invoke('jarvis:backup:create', { passphrase }),
    restore: (passphrase) => ipcRenderer.invoke('jarvis:backup:restore', { passphrase }),
  },
  runSystemCheck: () => ipcRenderer.invoke('jarvis:system:check'),
  repair: {
    plan: (report) => ipcRenderer.invoke('jarvis:repair:plan', report),
    apply: (repairId) => ipcRenderer.invoke('jarvis:repair:apply', { repairId }),
  },
  obd: {
    listPorts: () => ipcRenderer.invoke('jarvis:obd:list-ports'),
    connect: (options) => ipcRenderer.invoke('jarvis:obd:connect', options),
    send: (command, timeout) => ipcRenderer.invoke('jarvis:obd:send', { command, timeout }),
    status: () => ipcRenderer.invoke('jarvis:obd:status'),
    disconnect: () => ipcRenderer.invoke('jarvis:obd:disconnect'),
  },
});
