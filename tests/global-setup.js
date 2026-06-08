const fs = require("fs");
const path = require("path");

/* Start each test run from a clean database/uploads dir so results are
   deterministic. Runs before the webServer launches. */
module.exports = async function globalSetup() {
  const dir = path.join(__dirname, "..", ".pwtest-data");
  // Best-effort: a stale OS lock shouldn't abort the run. Tests assert on data
  // they create (unique titles/captions), so they tolerate leftover rows.
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.warn("[global-setup] could not remove " + dir + ": " + e.message);
  }
};
