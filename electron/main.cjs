const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const db = require("./db.cjs");
const { buildEscPos } = require("./escpos.cjs");

function authPath() {
  return path.join(app.getPath("userData"), "auth.bin");
}

function authPlainPath() {
  return path.join(app.getPath("userData"), "auth.plain.json");
}

ipcMain.on("pos:loadAuthSessionSync", (event) => {
  try {
    if (safeStorage.isEncryptionAvailable() && fs.existsSync(authPath())) {
      const encrypted = fs.readFileSync(authPath(), "utf8");
      event.returnValue = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      return;
    }
    if (fs.existsSync(authPlainPath())) {
      event.returnValue = fs.readFileSync(authPlainPath(), "utf8");
      return;
    }
    event.returnValue = null;
  } catch (err) {
    console.error("pos:loadAuthSessionSync error:", err);
    event.returnValue = null;
  }
});

ipcMain.handle("pos:saveAuthSession", (_event, dataJson) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(dataJson).toString("base64");
    fs.writeFileSync(authPath(), encrypted, { encoding: "utf8", mode: 0o600 });
    if (fs.existsSync(authPlainPath())) fs.rmSync(authPlainPath());
    return { ok: true, encrypted: true };
  }
  console.warn("pos:saveAuthSession: safeStorage unavailable, using plaintext auth.plain.json");
  fs.writeFileSync(authPlainPath(), dataJson, { encoding: "utf8", mode: 0o600 });
  return { ok: true, encrypted: false };
});

ipcMain.handle("pos:clearAuthSession", () => {
  if (fs.existsSync(authPath())) fs.rmSync(authPath());
  if (fs.existsSync(authPlainPath())) fs.rmSync(authPlainPath());
  return true;
});

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
ipcMain.handle("pos:loadOnboardingProgress", (_event, userId) => db.loadOnboardingProgress(userId));
ipcMain.handle("pos:saveOnboardingProgress", (_event, userId, dataJson) => db.saveOnboardingProgress(userId, dataJson));
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
const RECEIPT_PRINTER_RE = /ec-?pm|ec-?58|5850|58110|drv58|pos-?58|gp-?58|gprinter|thermal|ticket|receipt|miniprint/i;
let cachedReceiptPrinter = null;
let rawPrintExePromise = null;

function pickReceiptPrinter(names) {
  return names.find((name) => RECEIPT_PRINTER_RE.test(name)) ?? null;
}

function findCsc() {
  const roots = [
    process.env.WINDIR && path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    process.env.WINDIR && path.join(process.env.WINDIR, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ].filter(Boolean);
  return roots.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function resolveRawPrintCsSource() {
  const candidates = [
    path.join(process.resourcesPath, "raw-print.cs"),
    path.join(process.resourcesPath, "app.asar.unpacked", "electron", "raw-print.cs"),
    path.join(__dirname.replace(/app\.asar(?!\.unpacked)/, "app.asar.unpacked"), "raw-print.cs"),
    path.join(__dirname, "raw-print.cs"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return { missing: true, candidates };
}

function ensureRawPrintExe() {
  if (rawPrintExePromise) return rawPrintExePromise;
  rawPrintExePromise = new Promise((resolve, reject) => {
    const exe = path.join(app.getPath("userData"), "raw-print.exe");
    if (fs.existsSync(exe)) {
      resolve(exe);
      return;
    }
    const csc = findCsc();
    const sourceOrMissing = resolveRawPrintCsSource();
    if (sourceOrMissing && sourceOrMissing.missing) {
      reject(new Error(
        "No se encontró raw-print.cs en disco. Candidatos: " + sourceOrMissing.candidates.join(" | ")
      ));
      return;
    }
    const source = sourceOrMissing;
    if (!csc) {
      reject(new Error("No se pudo preparar el helper de impresión RAW: csc.exe no encontrado"));
      return;
    }
    const compiled = spawnSync(csc, ["/nologo", "/optimize+", `/out:${exe}`, source], {
      windowsHide: true,
      encoding: "utf8",
    });
    if (compiled.status !== 0 || !fs.existsSync(exe)) {
      reject(new Error((compiled.stderr || compiled.stdout || "csc failed").trim()));
      return;
    }
    resolve(exe);
  }).catch((err) => {
    rawPrintExePromise = null;
    throw err;
  });
  return rawPrintExePromise;
}

async function listPrinterNames() {
  const win = (typeof mainWindow !== "undefined" && mainWindow && !mainWindow.isDestroyed())
    ? mainWindow
    : BrowserWindow.getFocusedWindow();
  if (win && !win.isDestroyed()) {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((printer) => printer.name);
  }
  return [];
}

function sendRawToPrinter(printerName, buffer) {
  const tmp = path.join(app.getPath("temp"), `northbike-ticket-${Date.now()}.bin`);
  fs.writeFileSync(tmp, buffer);
  return ensureRawPrintExe().then((exe) => new Promise((resolve, reject) => {
    const child = spawn(exe, [printerName, tmp], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (err) => {
      try { fs.unlinkSync(tmp); } catch { /* already gone */ }
      reject(err);
    });
    child.on("close", (code) => {
      try { fs.unlinkSync(tmp); } catch { /* already gone */ }
      if (code === 0) resolve({ ok: true, stdout });
      else reject(new Error((stderr || stdout || `raw-print exit ${code}`).trim()));
    });
  }));
}

async function printEscPosTicket(lines) {
  let deviceName = cachedReceiptPrinter;
  if (!deviceName) {
    const names = await listPrinterNames();
    deviceName = pickReceiptPrinter(names);
    if (deviceName) cachedReceiptPrinter = deviceName;
  }
  if (!deviceName) {
    return {
      ok: false,
      deviceName: null,
      error: "No se encontró la impresora térmica EC-PM-58110",
    };
  }
  const payload = buildEscPos(lines);
  if (!payload.length) {
    return { ok: false, deviceName, error: "ticket-vacio" };
  }
  try {
    await sendRawToPrinter(deviceName, payload);
    return { ok: true, deviceName };
  } catch (err) {
    cachedReceiptPrinter = null;
    throw err;
  }
}

function linesFromPayload(payload) {
  if (payload && Array.isArray(payload.lines) && payload.lines.length > 0) {
    return payload.lines;
  }
  const html = typeof payload === "string" ? payload : payload?.html;
  if (typeof html !== "string" || !html.trim()) return null;
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table|thead|tbody|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

ipcMain.handle("pos:printTicket", async (_event, payload) => {
  const lines = linesFromPayload(payload);
  if (!lines || lines.length === 0) {
    return { ok: false, deviceName: null, error: "El ticket no tiene contenido para imprimir" };
  }
  try {
    return await printEscPosTicket(lines);
  } catch (err) {
    return { ok: false, deviceName: null, error: err instanceof Error ? err.message : String(err) };
  }
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
let mainWindow = null;

function sendUpdateStatus(status, extra = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updates:status", { status, ...extra });
  }
}

function setupAutoUpdater() {
  if (isDev) return;

  // Descarga y prepara las actualizaciones automáticamente. Cuando termina,
  // se instala al reiniciar sin mostrar el asistente de NSIS.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Las instalaciones del cliente solo reciben versiones estables.
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => sendUpdateStatus("checking"));
  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus("available", { version: info.version });
  });
  autoUpdater.on("update-not-available", (info) => {
    sendUpdateStatus("up-to-date", { version: info.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus("downloading", { percent: Math.round(progress.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus("downloaded", { version: info.version });
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 500);
  });
  autoUpdater.on("error", (error) => {
    console.error("Auto-update error:", error);
    sendUpdateStatus("error", { message: error.message });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("Auto-update check error:", error);
      sendUpdateStatus("error", { message: error.message });
    });
  }, 5000);
}

ipcMain.handle("updates:check", async () => {
  if (isDev) return { status: "disabled-in-development" };
  const result = await autoUpdater.checkForUpdates();
  return { status: result?.updateInfo ? "checked" : "unknown", version: result?.updateInfo?.version };
});
ipcMain.handle("updates:download", async () => {
  if (isDev) return false;
  try {
    await autoUpdater.downloadUpdate();
    sendUpdateStatus("downloaded");
  } catch (error) {
    console.error("Auto-update download error:", error);
    sendUpdateStatus("error", { message: error.message });
    throw error;
  }
  return true;
});
ipcMain.handle("updates:install", () => {
  // Ejecuta el instalador NSIS sin mostrar su ventana durante la actualización.
  if (!isDev) autoUpdater.quitAndInstall(true, true);
  return true;
});

function createWindow() {
  const appIcon = app.isPackaged
    ? path.join(__dirname, "..", "dist", "public", "brand", "logo.png")
    : path.join(__dirname, "..", "public", "public", "brand", "logo.png");
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#081319",
    autoHideMenuBar: true,
    title: "North Bike POS",
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;

  const allowedOrigin = isDev ? new URL(DEV_SERVER_URL).origin : null;
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev
      ? new URL(url).origin === allowedOrigin
      : url.startsWith("file://");
    if (!allowed) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

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
  setupAutoUpdater();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
