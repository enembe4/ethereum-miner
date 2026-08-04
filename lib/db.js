'use strict';
/* SQLite storage via Node's built-in node:sqlite (no native build needed). */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* DATA_DIR env points at the host's persistent disk in production
   (e.g. /var/data on Render); defaults to ./data for local dev. */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS leads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    source        TEXT DEFAULT 'website_quote',
    stage         TEXT NOT NULL DEFAULT 'New Lead',
    name          TEXT, phone TEXT, email TEXT, address TEXT, contact_pref TEXT,
    project_type  TEXT, areas TEXT, sqft INTEGER, stories TEXT,
    bedrooms      TEXT, bathrooms TEXT, ceiling TEXT, condition TEXT,
    timing        TEXT, paint_provided TEXT, notes TEXT, colors TEXT,
    est_price     REAL,
    rate          REAL, coats INTEGER, crew INTEGER, days REAL, hrs_day REAL,
    labor_rate    REAL, gallons INTEGER, gal_price REAL, supplies REAL, other REAL,
    overhead_pct  REAL, lead_safe INTEGER DEFAULT 0, override_price REAL,
    appt_type     TEXT, appt_date TEXT, appt_time TEXT,
    token         TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id    INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    kind       TEXT,
    text       TEXT
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at   TEXT NOT NULL,
    name         TEXT, town TEXT, email TEXT, rating INTEGER,
    project_type TEXT, body TEXT, status TEXT DEFAULT 'pending',
    reply        TEXT, flagged INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS portal_codes (
    email      TEXT PRIMARY KEY,
    code       TEXT,
    expires_at TEXT,
    attempts   INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS automation_log (
    lead_id    INTEGER NOT NULL,
    kind       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (lead_id, kind)
  );
`);

/* additive migrations for databases created before these columns existed */
const leadCols = db.prepare('PRAGMA table_info(leads)').all().map((c) => c.name);
if (!leadCols.includes('gcal_event_id')) db.exec('ALTER TABLE leads ADD COLUMN gcal_event_id TEXT');

const now = () => new Date().toISOString();
const token = () => crypto.randomBytes(16).toString('hex');
const code6 = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

/* thin helpers */
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

module.exports = { db, all, get, run, now, token, code6, DATA_DIR };
