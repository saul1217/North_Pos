const { app } = require("electron");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

let db = null;

// Opens (creates on first run) the local SQLite database in the app's
// per-user data folder, e.g. %APPDATA%\North Bike POS\pos.db
function getDb() {
  if (!db) {
    db = new Database(dbPath());
    db.pragma("journal_mode = WAL"); // durable + concurrent-friendly
    db.exec(
      `CREATE TABLE IF NOT EXISTS pos_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         data TEXT NOT NULL,
         updated_at TEXT NOT NULL
       );`,
    );
  }
  return db;
}

function dbPath() {
  return path.join(app.getPath("userData"), "pos.db");
}

// The whole POS state is kept as one JSON row for now (a real SQLite file:
// backupable, no browser size cap). Normalized tables can come later; the
// sync outbox will be added as its own table.
function loadState() {
  const row = getDb().prepare("SELECT data FROM pos_state WHERE id = 1").get();
  return row ? row.data : null;
}

function saveState(dataJson) {
  getDb()
    .prepare(
      `INSERT INTO pos_state (id, data, updated_at) VALUES (1, @data, @ts)
       ON CONFLICT(id) DO UPDATE SET data = @data, updated_at = @ts`,
    )
    .run({ data: dataJson, ts: new Date().toISOString() });
}

async function exportBackup(destination) {
  const database = getDb();
  database.pragma("wal_checkpoint(TRUNCATE)");
  await database.backup(destination);
  return destination;
}

function validateBackup(source) {
  if (!fs.existsSync(source)) throw new Error("El archivo de respaldo no existe");
  const backup = new Database(source, { readonly: true, fileMustExist: true });
  try {
    const row = backup.prepare("SELECT data FROM pos_state WHERE id = 1").get();
    if (!row?.data) throw new Error("El archivo no contiene datos del POS");
    const data = JSON.parse(row.data);
    if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
      throw new Error("El archivo de respaldo no es compatible con North Bike POS");
    }
  } finally {
    backup.close();
  }
}

function restoreBackup(source) {
  validateBackup(source);
  const current = dbPath();
  const safetyBackup = `${current}.before-restore-${Date.now()}`;
  if (db) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    db = null;
  }
  if (fs.existsSync(current)) fs.copyFileSync(current, safetyBackup);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${current}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
  }
  fs.copyFileSync(source, current);
  return { path: current, safetyBackup };
}

module.exports = { getDb, dbPath, loadState, saveState, exportBackup, restoreBackup };
