"use strict";
/* Greater Manchester Vis — production server (single image)
   Serves: REST API (/api/*), uploaded media (/media/*, with range support),
   and the static site. Express is the production static server — no nginx layer. */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");

const { db, UPLOAD_DIR } = require("./db");
const auth = require("./auth");

const PORT = parseInt(process.env.PORT || "3001", 10);
const SITE_DIR = process.env.SITE_DIR || path.join(__dirname, "..", "..");

/* ---------- Upload handling ---------- */
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"];
const VIDEO_MIMES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
const EXT_BY_MIME = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/avif": "avif", "image/svg+xml": "svg",
  "video/mp4": "mp4", "video/webm": "webm", "video/ogg": "ogv", "video/quicktime": "mov",
};
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB (videos)

function kindForMime(mime) {
  if (IMAGE_MIMES.includes(mime)) return "image";
  if (VIDEO_MIMES.includes(mime)) return "video";
  return null;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) {
    const ext = EXT_BY_MIME[file.mimetype] || "bin";
    const name = Date.now() + "-" + crypto.randomBytes(8).toString("hex") + "." + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: function (req, file, cb) {
    if (kindForMime(file.mimetype)) return cb(null, true);
    cb(new Error("Unsupported file type. Allowed: images (jpg, png, webp, gif, avif, svg) and video (mp4, webm, ogg, mov)."));
  },
});

/* ---------- Serializers ---------- */
function assetUrl(filename) { return "/media/" + filename; }

function serializeAsset(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    url: assetUrl(row.filename),
    filename: row.filename,
    originalName: row.original_name,
    mime: row.mime,
    size: row.size,
    title: row.title,
    caption: row.caption,
    createdAt: row.created_at,
  };
}

const coverStmt = db.prepare("SELECT filename FROM assets WHERE id = ?");
function serializePost(row) {
  if (!row) return null;
  let coverUrl = null;
  if (row.cover_asset_id) {
    const a = coverStmt.get(row.cover_asset_id);
    if (a) coverUrl = assetUrl(a.filename);
  }
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    author: row.author,
    excerpt: row.excerpt,
    body: row.body,
    coverAssetId: row.cover_asset_id,
    coverUrl: coverUrl,
    published: !!row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ---------- Validation helpers ---------- */
function str(v, max) {
  if (v === undefined || v === null) return "";
  return String(v).slice(0, max == null ? 100000 : max).trim();
}

/* ---------- App ---------- */
const app = express();
app.disable("x-powered-by");
// Behind ingress-nginx, req.ip must come from X-Forwarded-For or the login
// throttle keys every visitor to the controller pod's IP (one shared bucket).
// Direct connections (local dev/tests) are unaffected: no XFF header, same IP.
app.set("trust proxy", 1);

/* ---- Security headers (previously sent by nginx/default.conf) ---- */
app.use(function (req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

app.use(express.json({ limit: "1mb" }));

/* ---- Auth ---- */
const loginAttempts = new Map(); // ip -> { count, first }
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX = 10;

function loginThrottled(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > LOGIN_MAX;
}

app.get("/api/health", function (req, res) { res.json({ ok: true }); });

app.get("/api/session", function (req, res) {
  res.json({ authenticated: auth.isAuthed(req) });
});

app.post("/api/login", function (req, res) {
  const ip = req.ip || "unknown";
  if (loginThrottled(ip)) {
    return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
  }
  const pw = req.body && req.body.password;
  if (!auth.checkPassword(pw)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  loginAttempts.delete(ip);
  auth.setAuthCookie(res);
  res.json({ ok: true });
});

app.post("/api/logout", function (req, res) {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

/* ---- Posts ---- */
const listPublishedStmt = db.prepare("SELECT * FROM posts WHERE published = 1 ORDER BY datetime(created_at) DESC, id DESC");
const listAllStmt = db.prepare("SELECT * FROM posts ORDER BY datetime(created_at) DESC, id DESC");
const getPostStmt = db.prepare("SELECT * FROM posts WHERE id = ?");

app.get("/api/posts", function (req, res) {
  const includeDrafts = req.query.all === "1" && auth.isAuthed(req);
  const rows = (includeDrafts ? listAllStmt : listPublishedStmt).all();
  res.json(rows.map(serializePost));
});

app.get("/api/posts/:id", function (req, res) {
  const row = getPostStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: "Post not found." });
  if (!row.published && !auth.isAuthed(req)) return res.status(404).json({ error: "Post not found." });
  res.json(serializePost(row));
});

const insertPostStmt = db.prepare(`
  INSERT INTO posts (title, category, author, excerpt, body, cover_asset_id, published, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

app.post("/api/posts", auth.requireAuth, function (req, res) {
  const b = req.body || {};
  const title = str(b.title, 200);
  if (!title) return res.status(400).json({ error: "Title is required." });
  const now = new Date().toISOString();
  const coverId = b.coverAssetId ? parseInt(b.coverAssetId, 10) || null : null;
  const info = insertPostStmt.run(
    title,
    str(b.category, 60) || "Member voices",
    str(b.author, 120),
    str(b.excerpt, 500),
    str(b.body, 50000),
    coverId,
    b.published === false ? 0 : 1,
    now, now
  );
  res.status(201).json(serializePost(getPostStmt.get(info.lastInsertRowid)));
});

const updatePostStmt = db.prepare(`
  UPDATE posts SET title = ?, category = ?, author = ?, excerpt = ?, body = ?,
    cover_asset_id = ?, published = ?, updated_at = ? WHERE id = ?`);

app.put("/api/posts/:id", auth.requireAuth, function (req, res) {
  const existing = getPostStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Post not found." });
  const b = req.body || {};
  const title = b.title !== undefined ? str(b.title, 200) : existing.title;
  if (!title) return res.status(400).json({ error: "Title is required." });
  const coverId = b.coverAssetId !== undefined
    ? (b.coverAssetId ? parseInt(b.coverAssetId, 10) || null : null)
    : existing.cover_asset_id;
  updatePostStmt.run(
    title,
    b.category !== undefined ? str(b.category, 60) || "Member voices" : existing.category,
    b.author !== undefined ? str(b.author, 120) : existing.author,
    b.excerpt !== undefined ? str(b.excerpt, 500) : existing.excerpt,
    b.body !== undefined ? str(b.body, 50000) : existing.body,
    coverId,
    b.published !== undefined ? (b.published ? 1 : 0) : existing.published,
    new Date().toISOString(),
    existing.id
  );
  res.json(serializePost(getPostStmt.get(existing.id)));
});

const deletePostStmt = db.prepare("DELETE FROM posts WHERE id = ?");
app.delete("/api/posts/:id", auth.requireAuth, function (req, res) {
  const existing = getPostStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Post not found." });
  deletePostStmt.run(existing.id);
  res.json({ ok: true });
});

/* ---- Assets ---- */
const listAssetsStmt = db.prepare("SELECT * FROM assets ORDER BY datetime(created_at) DESC, id DESC");
const listAssetsByKindStmt = db.prepare("SELECT * FROM assets WHERE kind = ? ORDER BY datetime(created_at) DESC, id DESC");
const getAssetStmt = db.prepare("SELECT * FROM assets WHERE id = ?");

app.get("/api/assets", function (req, res) {
  const kind = req.query.kind;
  const rows = (kind === "image" || kind === "video")
    ? listAssetsByKindStmt.all(kind)
    : listAssetsStmt.all();
  res.json(rows.map(serializeAsset));
});

const insertAssetStmt = db.prepare(`
  INSERT INTO assets (kind, filename, original_name, mime, size, title, caption, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

// Multer errors (e.g. file too large / wrong type) need a handler that returns JSON.
function uploadSingle(req, res, next) {
  upload.single("file")(req, res, function (err) {
    if (err) {
      // Clean up partial file if any
      if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "File is too large (max 200 MB)."
        : err.message || "Upload failed.";
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

app.post("/api/assets", auth.requireAuth, uploadSingle, function (req, res) {
  if (!req.file) return res.status(400).json({ error: "No file was uploaded." });
  const kind = kindForMime(req.file.mimetype);
  if (!kind) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: "Unsupported file type." });
  }
  const b = req.body || {};
  const now = new Date().toISOString();
  const info = insertAssetStmt.run(
    kind,
    req.file.filename,
    str(req.file.originalname, 255),
    req.file.mimetype,
    req.file.size,
    str(b.title, 200),
    str(b.caption, 500),
    now
  );
  res.status(201).json(serializeAsset(getAssetStmt.get(info.lastInsertRowid)));
});

const updateAssetStmt = db.prepare("UPDATE assets SET title = ?, caption = ? WHERE id = ?");
app.put("/api/assets/:id", auth.requireAuth, function (req, res) {
  const existing = getAssetStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Asset not found." });
  const b = req.body || {};
  updateAssetStmt.run(
    b.title !== undefined ? str(b.title, 200) : existing.title,
    b.caption !== undefined ? str(b.caption, 500) : existing.caption,
    existing.id
  );
  res.json(serializeAsset(getAssetStmt.get(existing.id)));
});

const deleteAssetStmt = db.prepare("DELETE FROM assets WHERE id = ?");
const clearCoverStmt = db.prepare("UPDATE posts SET cover_asset_id = NULL WHERE cover_asset_id = ?");
app.delete("/api/assets/:id", auth.requireAuth, function (req, res) {
  const existing = getAssetStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Asset not found." });
  clearCoverStmt.run(existing.id);
  deleteAssetStmt.run(existing.id);
  // Remove the file from disk (best effort).
  const filePath = path.join(UPLOAD_DIR, existing.filename);
  if (filePath.startsWith(UPLOAD_DIR)) {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
  res.json({ ok: true });
});

/* ---- Media (uploaded files); express.static supports Range requests for video ---- */
app.use("/media", express.static(UPLOAD_DIR, {
  index: false,
  maxAge: "30d",
  setHeaders: function (res) { res.setHeader("X-Content-Type-Options", "nosniff"); },
}));

/* ---- API 404 (so unknown /api paths don't fall through to static) ---- */
app.use("/api", function (req, res) { res.status(404).json({ error: "Not found." }); });

/* ---- Static site (Express is the production server — single image, no nginx) ---- */
app.use(express.static(SITE_DIR, {
  extensions: ["html"],
  setHeaders: function (res, filePath) {
    if (filePath.includes("/assets/") || filePath.includes("/uploads/")) {
      // Long-lived caching for static assets, mirroring nginx's `expires 30d`
      res.setHeader("Cache-Control", "public, max-age=2592000");
    } else if (filePath.endsWith(".html")) {
      // Revalidate HTML every request, mirroring nginx's `expires -1`
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));

/* ---- Branded 404 for everything else (nginx used to serve this) ---- */
app.use(function (req, res) {
  res.status(404).sendFile(path.join(SITE_DIR, "404.html"));
});

app.listen(PORT, function () {
  console.log("GMVIS API listening on http://localhost:" + PORT);
});
