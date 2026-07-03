// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => import_electron.ipcRenderer.invoke("window:minimize"),
  maximize: () => import_electron.ipcRenderer.invoke("window:maximize"),
  close: () => import_electron.ipcRenderer.invoke("window:close"),
  isMaximized: () => import_electron.ipcRenderer.invoke("window:isMaximized"),
  getPlatform: () => import_electron.ipcRenderer.invoke("window:getPlatform"),
  saveFile: (filename, base64Data) => import_electron.ipcRenderer.invoke("file:save", { filename, base64Data }),
  openExternal: (url) => import_electron.ipcRenderer.invoke("shell:openExternal", url),
  showDesktopPet: (config) => import_electron.ipcRenderer.invoke("desktop-pet:show", config),
  hideDesktopPet: () => import_electron.ipcRenderer.invoke("desktop-pet:hide"),
  toggleDesktopPet: (config) => import_electron.ipcRenderer.invoke("desktop-pet:toggle", config),
  configureDesktopPet: (config) => import_electron.ipcRenderer.invoke("desktop-pet:configure", config),
  isDesktopPetVisible: () => import_electron.ipcRenderer.invoke("desktop-pet:isVisible"),
  startDesktopPetDrag: (point) => import_electron.ipcRenderer.invoke("desktop-pet:drag-start", point),
  moveDesktopPetDrag: (point) => import_electron.ipcRenderer.invoke("desktop-pet:drag-move", point),
  resizeDesktopPetUi: (expanded) => import_electron.ipcRenderer.invoke("desktop-pet:ui-expanded", expanded),
  autonomyDesktopPetStep: (delta) => import_electron.ipcRenderer.invoke("desktop-pet:autonomy-step", delta),
  listDesktopPetChats: (config) => import_electron.ipcRenderer.invoke("desktop-pet:chats", config),
  createDesktopPetChat: (title, config) => import_electron.ipcRenderer.invoke("desktop-pet:new-chat", title, config),
  selectDesktopPetChat: (chatId, config) => import_electron.ipcRenderer.invoke("desktop-pet:select-chat", chatId, config),
  sendDesktopPetMessage: (message, screenContext) => import_electron.ipcRenderer.invoke("desktop-pet:message", message, screenContext),
  captureDesktopPetScreenContext: () => import_electron.ipcRenderer.invoke("desktop-pet:screen-context"),
  speakDesktopPetText: (text) => import_electron.ipcRenderer.invoke("desktop-pet:tts", text),
  onDesktopPetPeerNear: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("desktop-pet:peer-near", listener);
    return () => import_electron.ipcRenderer.removeListener("desktop-pet:peer-near", listener);
  },
  listManagedBackends: () => import_electron.ipcRenderer.invoke("managed-backends:list"),
  startManagedBackend: (config) => import_electron.ipcRenderer.invoke("managed-backends:start", config),
  stopManagedBackend: (backendId) => import_electron.ipcRenderer.invoke("managed-backends:stop", backendId),
  stopActiveManagedBackend: () => import_electron.ipcRenderer.invoke("managed-backends:stop-active"),
  getManagedBackendLogs: (backendId) => import_electron.ipcRenderer.invoke("managed-backends:logs", backendId),
  restartServer: () => import_electron.ipcRenderer.invoke("server:restart"),
  onMaximizedChange: (callback) => {
    const listener = (_event, maximized) => {
      callback(maximized);
    };
    import_electron.ipcRenderer.on("window:maximized", listener);
    return () => import_electron.ipcRenderer.removeListener("window:maximized", listener);
  },
  onManagedBackendsUpdate: (callback) => {
    const listener = (_event, states) => {
      callback(states);
    };
    import_electron.ipcRenderer.on("managed-backends:update", listener);
    return () => import_electron.ipcRenderer.removeListener("managed-backends:update", listener);
  }
});
