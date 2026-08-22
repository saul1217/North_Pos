const { contextBridge, ipcRenderer } = require("electron");

// Bridge exposed to the renderer as `window.pos`. Kept intentionally small;
// this is where the local database, ticket printer and barcode helpers will
// be wired in later steps (all running in the main process).
contextBridge.exposeInMainWorld("pos", {
  platform: process.platform,
  isElectron: true,
  // Placeholder round-trip so we can confirm IPC works end to end.
  ping: () => ipcRenderer.invoke("pos:ping"),
  // Local SQLite persistence. Load is synchronous (blocks briefly, once, at
  // startup — keeps the existing sync hydrate path); save is async.
  loadStateSync: () => ipcRenderer.sendSync("pos:loadStateSync"),
  saveState: (dataJson) => ipcRenderer.invoke("pos:saveState", dataJson),
  dbPath: () => ipcRenderer.invoke("pos:dbPath"),
  exportBackup: () => ipcRenderer.invoke("pos:exportBackup"),
  importBackup: () => ipcRenderer.invoke("pos:importBackup"),
});
