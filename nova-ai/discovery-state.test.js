"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const discovery = require("./public/discovery-state.js");

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

test("local discovery progress is private metadata and survives reloads", () => {
  const store = memoryStorage();
  const before = discovery.record(store, "riddle", new Date(2026, 10, 1, 12));
  const after = discovery.read(store);
  assert.equal(after.total, 1);
  assert.equal(after.counts.riddle, 1);
  assert.deepEqual(after.history, before.history);
  assert.ok(after.badges.includes("first"));
  assert.doesNotMatch(store.getItem(discovery.KEY), /answer|message|prompt|conversation/i);
});

test("daily streak increments once per day and resets after a missed day", () => {
  const store = memoryStorage();
  discovery.record(store, "riddle", new Date(2026, 10, 1, 12));
  discovery.record(store, "quiz", new Date(2026, 10, 1, 18));
  assert.equal(discovery.read(store).streak, 1);
  discovery.record(store, "story", new Date(2026, 10, 2, 12));
  assert.equal(discovery.read(store).streak, 2);
  const dayThree = discovery.record(store, "story", new Date(2026, 10, 3, 12));
  assert.equal(dayThree.streak, 3);
  assert.ok(dayThree.badges.includes("streak3"));
  const afterGap = discovery.record(store, "guess", new Date(2026, 10, 5, 12));
  assert.equal(afterGap.streak, 1);
});

test("daily challenge is stable within a day and rotates across activities", () => {
  const today = new Date(2026, 10, 11, 12);
  assert.equal(discovery.dailyChallenge(today), discovery.dailyChallenge(new Date(2026, 10, 11, 23)));
  const days = new Set(Array.from({ length: 8 }, (_, n) => discovery.dailyChallenge(new Date(2026, 10, 1 + n, 12))));
  assert.equal(days.size, 4);
});

test("recommendation favors least-played activity and ignores unknown IDs", () => {
  const state = { counts: { riddle: 4, quiz: 0, memory: 1 } };
  assert.equal(discovery.recommend(state, ["riddle", "quiz", "memory", "not-real"]), "quiz");
  assert.equal(discovery.recommend(state, []), null);
});

