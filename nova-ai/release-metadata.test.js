"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const backend = require("./package.json");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const desktop = JSON.parse(fs.readFileSync(path.join(root, "desktop", "package.json"), "utf8"));

test("backend package and lockfile versions stay synchronized", () => {
  assert.equal(lock.version, backend.version);
  assert.equal(lock.packages[""].version, backend.version);
});

test("NOVA Desktop and backend share the same release version", () => {
  assert.equal(desktop.version, backend.version);
});

test("alpha release uses an explicit prerelease version", () => {
  assert.match(backend.version, /^\d+\.\d+\.\d+-alpha\.\d+$/);
});
