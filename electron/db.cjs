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
       );
       CREATE TABLE IF NOT EXISTS onboarding_progress (
         user_id TEXT NOT NULL,
         tutorial_id TEXT NOT NULL,
         data TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         PRIMARY KEY (user_id, tutorial_id)
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

// Keep learning progress separate from operational sales and inventory state.
function loadOnboardingProgress(userId) {
  const rows = getDb()
    .prepare("SELECT tutorial_id, data FROM onboarding_progress WHERE user_id = ?")
    .all(userId);
  if (!rows.length) return null;

  const profile = rows.find((row) => row.tutorial_id === "__profile__");
  if (!profile) return null;
  try {
    const data = JSON.parse(profile.data);
    const tutorials = {};
    for (const row of rows) {
      if (row.tutorial_id === "__profile__") continue;
      tutorials[row.tutorial_id] = JSON.parse(row.data);
    }
    return JSON.stringify({ ...data, tutorials });
  } catch {
    return null;
  }
}

function saveOnboardingProgress(userId, dataJson) {
  const progress = JSON.parse(dataJson);
  const now = new Date().toISOString();
  const save = getDb().transaction(() => {
    const database = getDb();
    database.prepare("DELETE FROM onboarding_progress WHERE user_id = ?").run(userId);
    database
      .prepare("INSERT INTO onboarding_progress (user_id, tutorial_id, data, updated_at) VALUES (?, ?, ?, ?)")
      .run(userId, "__profile__", JSON.stringify({ ...progress, tutorials: undefined }), now);
    const tutorials = progress.tutorials || {};
    for (const [tutorialId, tutorial] of Object.entries(tutorials)) {
      database
        .prepare("INSERT INTO onboarding_progress (user_id, tutorial_id, data, updated_at) VALUES (?, ?, ?, ?)")
        .run(userId, tutorialId, JSON.stringify(tutorial), now);
    }
  });
  save();
  return true;
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

module.exports = { getDb, dbPath, loadState, saveState, loadOnboardingProgress, saveOnboardingProgress, exportBackup, restoreBackup };
