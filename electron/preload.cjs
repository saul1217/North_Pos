const { contextBridge, ipcRenderer } = require("electron");

// Bridge exposed to the renderer as `window.pos`. Kept intentionally small;
// this is where the local database, ticket printer and barcode helpers will
// be wired in later steps (all running in the main process).
contextBridge.exposeInMainWorld("pos", {
  platform: process.platform,
  isElectron: true,
  // Placeholder round-trip so we can confirm IPC works end to end.
  ping: () => ipcRenderer.invoke("pos:ping"),
  loadAuthSessionSync: () => ipcRenderer.sendSync("pos:loadAuthSessionSync"),
  saveAuthSession: (dataJson) => ipcRenderer.invoke("pos:saveAuthSession", dataJson),
  clearAuthSession: () => ipcRenderer.invoke("pos:clearAuthSession"),
  // Local SQLite persistence. Load is synchronous (blocks briefly, once, at
  // startup — keeps the existing sync hydrate path); save is async.
  loadStateSync: () => ipcRenderer.sendSync("pos:loadStateSync"),
  saveState: (dataJson) => ipcRenderer.invoke("pos:saveState", dataJson),
  dbPath: () => ipcRenderer.invoke("pos:dbPath"),
  exportBackup: () => ipcRenderer.invoke("pos:exportBackup"),
  importBackup: () => ipcRenderer.invoke("pos:importBackup"),
  updates: {
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.invoke("updates:install"),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("updates:status", listener);
      return () => ipcRenderer.removeListener("updates:status", listener);
    },
  },
});
