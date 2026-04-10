import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('kwcDesktop', {
  history: {
    getBundle: () => ipcRenderer.invoke('kwc:history:get-bundle'),
    saveRecord: (record) => ipcRenderer.invoke('kwc:history:save-record', record),
    deleteRecord: (id) => ipcRenderer.invoke('kwc:history:delete-record', id),
    clear: () => ipcRenderer.invoke('kwc:history:clear'),
    getRecordById: (id) => ipcRenderer.invoke('kwc:history:get-record', id),
  },
  providerState: {
    get: () => ipcRenderer.invoke('kwc:provider-state:get'),
    save: (state) => ipcRenderer.invoke('kwc:provider-state:save', state),
  },
  secureStore: {
    getStatus: () => ipcRenderer.invoke('kwc:secure-store:status'),
    setSecret: (provider, secret, retention) =>
      ipcRenderer.invoke('kwc:secure-store:set-secret', provider, secret, retention),
    deleteSecret: (provider) => ipcRenderer.invoke('kwc:secure-store:delete-secret', provider),
    validateSecret: (provider) => ipcRenderer.invoke('kwc:secure-store:validate-secret', provider),
  },
  providerBridge: {
    invoke: (provider, operation, payload) =>
      ipcRenderer.invoke('kwc:provider-bridge:invoke', provider, operation, payload),
  },
  codex: {
    getStatus: () => ipcRenderer.invoke('kwc:codex:get-status'),
    startBridge: (force) => ipcRenderer.invoke('kwc:codex:start-bridge', force),
    startLogin: () => ipcRenderer.invoke('kwc:codex:start-login'),
  },
  system: {
    readClipboardText: () => ipcRenderer.invoke('kwc:system:read-clipboard-text'),
    captureScreenRegion: () => ipcRenderer.invoke('kwc:system:capture-screen-region'),
    getScreenCapturePermissionStatus: () => ipcRenderer.invoke('kwc:system:get-screen-capture-permission-status'),
    requestScreenCapturePermission: () => ipcRenderer.invoke('kwc:system:request-screen-capture-permission'),
    openExternal: (url) => ipcRenderer.invoke('kwc:system:open-external', url),
  },
})

contextBridge.exposeInMainWorld('kwcCaptureOverlay', {
  completeSelection: (rect) => ipcRenderer.invoke('kwc:capture-overlay:complete', rect),
  cancelSelection: () => ipcRenderer.invoke('kwc:capture-overlay:cancel'),
})
