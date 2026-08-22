const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const db = require("./db.cjs");

// Minimal IPC so the renderer can confirm it's talking to the main process.
ipcMain.handle("pos:ping", () => `pong @ ${new Date().toISOString()}`);

// Local SQLite persistence. Load is synchronous (one-time hydrate at startup);
// saves are async (fire-and-forget on each state change).
ipcMain.on("pos:loadStateSync", (event) => {
  try {
    event.returnValue = db.loadState();
  } catch (err) {
    console.error("pos:loadStateSync error:", err);
    event.returnValue = null;
  }
});
ipcMain.handle("pos:saveState", (_event, dataJson) => {
  db.saveState(dataJson);
  return true;
});
ipcMain.handle("pos:dbPath", () => db.dbPath());
ipcMain.handle("pos:exportBackup", async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const result = await dialog.showSaveDialog({
    title: "Exportar respaldo del POS",
    defaultPath: path.join(app.getPath("documents"), `northbike-pos-backup-${stamp}.nbpos`),
    filters: [{ name: "Respaldo North Bike POS", extensions: ["nbpos"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await db.exportBackup(result.filePath);
  return { canceled: false, path: result.filePath };
});
ipcMain.handle("pos:importBackup", async () => {
  const result = await dialog.showOpenDialog({
    title: "Restaurar respaldo del POS",
    properties: ["openFile"],
    filters: [{ name: "Respaldo North Bike POS", extensions: ["nbpos", "db"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const restored = db.restoreBackup(result.filePaths[0]);
  return { canceled: false, ...restored };
});

// Dev: load the Vite dev server. Packaged: load the built renderer over file://
// Match Vite's explicit IPv4 bind. On Windows, `localhost` may resolve to
// IPv6 first while Vite is listening only on 127.0.0.1, leaving Electron blank.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5180";
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#081319",
    autoHideMenuBar: true,
    title: "North Bike POS",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
    // Open DevTools only when explicitly requested (POS_DEVTOOLS=1),
    // so day-to-day there's a single window.
    if (process.env.POS_DEVTOOLS) win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  try {
    db.getDb();
    console.log("SQLite lista en:", db.dbPath());
  } catch (err) {
    console.error("No se pudo abrir SQLite:", err);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
