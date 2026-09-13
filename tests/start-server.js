"use strict";

async function start() {
  await require("./global-setup")();
  require("../server/src/index");
}

start().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
