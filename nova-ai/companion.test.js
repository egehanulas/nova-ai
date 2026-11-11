"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "public");
const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const script = fs.readFileSync(path.join(publicDir, "companion.js"), "utf8");
const styles = fs.readFileSync(path.join(publicDir, "companion.css"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

test("Companion replaces the NOVA Sim entry in the main application", () => {
  assert.match(html, /id="openCompanion"/);
  assert.match(html, /id="companionView"/);
  assert.match(html, /src="\/companion\.js/);
  assert.doesNotMatch(html, /id="novaSimView"|id="novaSimFrame"|src="\/nova-sim-tab\.js/);
});

test("Companion prompts continue through the real NOVA chat function", () => {
  for (const state of ["idle", "listening", "thinking", "speaking", "working", "success", "error"]) {
    assert.ok(script.includes(`${state}:`), `missing ${state} state`);
  }
  assert.match(script, /window\.NOVA\.sendMessage\(prompt\)/);
  assert.match(script, /nova:companion-state/);
});

test("EYRION discovery entries open functional local activities or real chat prompts", () => {
  for (const id of ["riddle", "quiz", "memory", "word", "story"]) {
    assert.match(html, new RegExp(`data-activity="${id}"`));
    assert.match(script, new RegExp(`${id}: start${id[0].toUpperCase()}${id.slice(1)}`));
  }
  for (const category of ["Mantık bulmacası", "Genel kültür", "Günlük görev", "Bilim ve uzay", "Dedektiflik", "Kendini keşfet", "Yaratıcı yazma"]) {
    assert.ok(html.includes(category), `missing discovery entry ${category}`);
  }
  assert.match(html, /EYRION AI · BİRLİKTE KEŞFET/);
});

test("Beta 1 discovery adds a daily number game, local progress, and the requested captions", () => {
  assert.match(html, /Yakında bir sürü seçenek ve tamamen sizin isteğinize bağlı özellikler olacak!/);
  assert.match(html, /Daha BETA'da: Ses tamamen doğal bir ses ile değişecek\./);
  assert.match(html, /data-activity="guess"/);
  assert.match(html, /data-activity="daily"/);
  assert.match(script, /function startGuess\(\)/);
  assert.match(script, /window\.EyrionDiscoveryState\?\.dailyChallenge/);
  assert.match(script, /window\.EyrionDiscoveryState\.recommend/);
  assert.match(script, /window\.EyrionDiscoveryState\?\.record/);
  for (const story of ["Sisli istasyon", "Fenerdeki ışık", "Bahçedeki kapı"]) assert.ok(script.includes(story));
});

test("Beta 1 preserves the three existing themes and adds exactly six selectable themes", () => {
  const choices = [...html.matchAll(/data-theme-choice="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(choices, ["original", "dark", "aurora", "ocean", "forest", "sunset", "paper", "copper", "mono"]);
  assert.match(html, /9 görünüm/);
  assert.match(fs.readFileSync(path.join(publicDir, "app.js"), "utf8"), /"original", "dark", "aurora", "ocean", "forest", "sunset", "paper", "copper", "mono"/);
  assert.match(fs.readFileSync(path.join(publicDir, "app.js"), "utf8"), /nova-ai-theme/);
});

test("EYRION updater retains the Electron bridge contract and Squirrel compatibility identity", () => {
  const updateHtml = fs.readFileSync(path.join(__dirname, "desktop", "src", "update.html"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "desktop", "src", "main.js"), "utf8");
  const forge = fs.readFileSync(path.join(__dirname, "desktop", "forge.config.js"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "desktop", "package.json"), "utf8"));
  for (const id of ["close", "later", "install", "current", "next", "count", "items"]) assert.match(updateHtml, new RegExp(`id="${id}"`));
  assert.match(updateHtml, /novaUpdate\?\.install\(\)/);
  assert.equal(pkg.productName, "EYRION AI");
  assert.match(pkg.version, /beta\.1$/);
  assert.match(forge, /name: "nova_ai"/);
  assert.match(forge, /executableName: "NOVA AI"/);
  assert.match(main, /setAppUserModelId\("com\.squirrel\.nova_ai\.nova_ai"\)/);
});

test("Companion layout supports narrow screens and reduced motion", () => {
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("simulation source is retained while the main application no longer loads it", () => {
  for (const file of ["sim.html", "sim.js", "sim3d.js"]) {
    assert.ok(fs.existsSync(path.join(publicDir, file)), `${file} should remain available for recovery`);
  }
  assert.match(server, /app\.use\(\["\/sim\.html", "\/sim\.js", "\/sim3d\.js"\]/);
});
