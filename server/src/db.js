"use strict";
/* SQLite storage via Node's built-in node:sqlite (no native deps).
   Tables: posts (blog entries) and assets (uploaded image/video metadata). */

// node:sqlite is stable-but-flagged-experimental; silence its one-time startup warning.
const _emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const msg = typeof warning === "string" ? warning : (warning && warning.message) || "";
  if (msg.includes("SQLite is an experimental")) return;
  return _emitWarning.call(process, warning, ...rest);
};

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "gmvis.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    category      TEXT    NOT NULL DEFAULT 'Member voices',
    author        TEXT    NOT NULL DEFAULT '',
    excerpt       TEXT    NOT NULL DEFAULT '',
    body          TEXT    NOT NULL DEFAULT '',
    cover_asset_id INTEGER,
    published     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    FOREIGN KEY (cover_asset_id) REFERENCES assets(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS assets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT    NOT NULL,            -- 'image' | 'video'
    filename      TEXT    NOT NULL,            -- stored file name on disk
    original_name TEXT    NOT NULL DEFAULT '',
    mime          TEXT    NOT NULL,
    size          INTEGER NOT NULL DEFAULT 0,
    title         TEXT    NOT NULL DEFAULT '',
    caption       TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL
  );
`);

module.exports = { db, DATA_DIR, UPLOAD_DIR };
