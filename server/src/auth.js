"use strict";
/* Single shared-password admin auth.
   - Password is checked in constant time against ADMIN_PASSWORD.
   - On success an HMAC-signed, time-limited token is issued and stored in an
     httpOnly cookie. No server-side session state is needed. */

const crypto = require("crypto");

const COOKIE_NAME = "gmvis_admin";
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

if (!process.env.ADMIN_PASSWORD) {
  console.warn("[auth] ADMIN_PASSWORD is not set — using default 'admin'. Set it before deploying.");
}
if (!process.env.SESSION_SECRET) {
  console.warn("[auth] SESSION_SECRET is not set — using an insecure default. Set it before deploying.");
}

function constantTimeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function checkPassword(pw) {
  return typeof pw === "string" && constantTimeEqual(pw, ADMIN_PASSWORD);
}

function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}

function verify(token) {
  if (!token || typeof token !== "string" || token.indexOf(".") === -1) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!obj || typeof obj.exp !== "number" || Date.now() > obj.exp) return null;
    return obj;
  } catch (e) {
    return null;
  }
}

function issueToken() {
  return sign({ exp: Date.now() + TTL_MS });
}

/* Parse a Cookie header into a { name: value } map. */
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach(function (part) {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function isAuthed(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verify(cookies[COOKIE_NAME]) !== null;
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

const cookieSecure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

function setAuthCookie(res) {
  const parts = [
    COOKIE_NAME + "=" + issueToken(),
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=" + Math.floor(TTL_MS / 1000),
  ];
  if (cookieSecure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function clearAuthCookie(res) {
  const parts = [COOKIE_NAME + "=", "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (cookieSecure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

module.exports = {
  COOKIE_NAME,
  checkPassword,
  isAuthed,
  requireAuth,
  setAuthCookie,
  clearAuthCookie,
};
