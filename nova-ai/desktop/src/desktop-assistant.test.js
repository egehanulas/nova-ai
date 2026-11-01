import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  getComputerInfo,
  resolveUserPath,
  searchUserFiles,
  openAllowedApp
} from "./desktop-assistant.js";
import { createUpdateRetryScheduler } from "./update-retry.js";

test("user path resolver accepts only the three approved folders", () => {
  const home = os.homedir();
  for (const name of ["Desktop", "Documents", "Downloads"]) {
    assert.equal(resolveUserPath(path.join(home, name)), path.join(home, name));
    assert.equal(resolveUserPath(path.join(home, name, "sample.txt")), path.join(home, name, "sample.txt"));
  }
  assert.throws(() => resolveUserPath(path.join(home, "Pictures", "private.txt")), /yalnızca Masaüstü/);
  assert.throws(() => resolveUserPath(path.join(home, "Desktop", "..", "..", "Windows", "system.ini")), /yalnızca Masaüstü/);
});

test("user path resolver rejects empty, non-string and oversized input", () => {
  assert.throws(() => resolveUserPath(""), /Geçerli/);
  assert.throws(() => resolveUserPath(null), /Geçerli/);
  assert.throws(() => resolveUserPath("x".repeat(1001)), /Geçerli/);
});

test("computer information includes stable system fields", () => {
  const info = getComputerInfo();
  assert.equal(typeof info.computer, "string");
  assert.equal(typeof info.platform, "string");
  assert.equal(typeof info.processor, "string");
  assert.ok(info.memoryTotal > 0);
  assert.ok(info.memoryFree >= 0);
  assert.ok(info.logicalCores > 0);
});

test("file search validates its query before reading folders", async () => {
  await assert.rejects(searchUserFiles(""), /dosya adı yaz/);
  await assert.rejects(searchUserFiles("x".repeat(121)), /120 karakter/);
});

test("application launcher rejects anything outside the fixed allowlist", async () => {
  await assert.rejects(openAllowedApp("powershell"), /izin verilen uygulamalar listesinde değil/);
  await assert.rejects(openAllowedApp("cmd.exe"), /izin verilen uygulamalar listesinde değil/);
});


test("desktop updater retries transient failures with increasing delays and only one pending retry", () => {
  const timers = [];
  let retryCount = 0;
  const scheduler = createUpdateRetryScheduler({
    onRetry: () => { retryCount += 1; },
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cancelled = true; }
  });

  assert.equal(scheduler.schedule(), 30_000);
  assert.equal(scheduler.schedule(), null);
  assert.equal(scheduler.pending, true);
  timers[0].callback();
  assert.equal(retryCount, 1);
  assert.equal(scheduler.pending, false);

  assert.equal(scheduler.schedule(), 2 * 60 * 1000);
  timers[1].callback();
  assert.equal(scheduler.schedule(), 10 * 60 * 1000);
  timers[2].callback();
  assert.equal(scheduler.schedule(), 30 * 60 * 1000);
  timers[3].callback();
  assert.equal(scheduler.schedule(), 30 * 60 * 1000);
  timers[4].callback();

  scheduler.reset();
  assert.equal(scheduler.schedule(), 30_000);
});

test("desktop updater retry can be cancelled or reset without leaving a pending timer", () => {
  const timers = [];
  const scheduler = createUpdateRetryScheduler({
    onRetry: () => {},
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cancelled = true; }
  });

  assert.equal(scheduler.schedule(), 30_000);
  const first = timers[0];
  scheduler.cancel();
  assert.equal(first.cancelled, true);
  assert.equal(scheduler.pending, false);

  assert.equal(scheduler.schedule(), 2 * 60 * 1000);
  scheduler.reset();
  assert.equal(timers[1].cancelled, true);
  assert.equal(scheduler.pending, false);
  assert.equal(scheduler.schedule(), 30_000);
});
