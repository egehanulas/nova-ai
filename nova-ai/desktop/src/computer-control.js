import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(new URL("./computer-control.ps1", import.meta.url));
const ALLOWED_TYPES = new Set([
  "inspect-screen", "list-windows", "system-info", "click-text", "focus-control", "type-text", "press-key",
  "click", "move-mouse", "scroll", "wait"
]);
const ALLOWED_KEYS = new Set([
  "ENTER", "TAB", "ESC", "SPACE", "BACKSPACE", "DELETE", "UP", "DOWN",
  "LEFT", "RIGHT", "HOME", "END", "CTRL+A", "CTRL+L", "CTRL+T", "CTRL+W",
  "CTRL+V", "CTRL+C", "CTRL+X", "CTRL+F", "ALT+F4", "SHIFT+TAB",
  "CTRL+SHIFT+T", "CTRL+SHIFT+TAB", "CTRL+SHIFT+N", "CTRL+SHIFT+O", "CTRL+PAGEUP", "CTRL+PAGEDOWN", "CTRL+S",
  "CTRL+P", "CTRL+R", "CTRL+Z", "CTRL+Y", "CTRL+N", "CTRL+H", "CTRL+J", "CTRL+U", "CTRL+0", "CTRL+PLUS", "CTRL+MINUS", "ALT+LEFT", "ALT+RIGHT", "ALT+TAB", "ALT+HOME", "F5", "F11"
]);

export function validateComputerAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("Masaüstü kontrol adımı geçersiz.");
  }
  if (!ALLOWED_TYPES.has(action.type)) {
    throw new Error("Desteklenmeyen masaüstü kontrol adımı: " + String(action.type || ""));
  }
  if (action.type === "type-text" && (typeof action.text !== "string" || action.text.length > 4000)) {
    throw new Error("Yazılacak metin geçersiz veya çok uzun.");
  }
  if (action.type === "type-text" && action.processName != null &&
      !["notepad"].includes(String(action.processName).toLowerCase())) {
    throw new Error("Metin yazılacak pencere için izin verilmeyen uygulama.");
  }
  if (action.type === "click-text" && (typeof action.text !== "string" || !action.text.trim() || action.text.length > 180)) {
    throw new Error("Tıklanacak metin geçersiz.");
  }
  if (action.type === "focus-control" &&
      (!["Edit", "Button", "List", "ComboBox", "Document"].includes(action.controlType) ||
       (action.name != null && (typeof action.name !== "string" || action.name.length > 180)) ||
       (action.automationId != null && (typeof action.automationId !== "string" || action.automationId.length > 100)))) {
    throw new Error("Odaklanılacak denetim geçersiz.");
  }
  if (action.type === "press-key" && !ALLOWED_KEYS.has(String(action.key || "").toUpperCase())) {
    throw new Error("İzin verilmeyen klavye kısayolu.");
  }
  if (action.type === "click" &&
      (![action.x, action.y].every(Number.isInteger) || action.x < 0 || action.y < 0 || action.x > 10000 || action.y > 10000)) {
    throw new Error("Mouse koordinatları geçersiz.");
  }
  if (action.type === "move-mouse") {
    const absolute = [action.x, action.y].every(Number.isInteger) &&
      action.x >= 0 && action.y >= 0 && action.x <= 10000 && action.y <= 10000;
    const relative = [action.dx, action.dy].every(Number.isInteger) &&
      Math.abs(action.dx) <= 10000 && Math.abs(action.dy) <= 10000;
    const corner = ["top-left", "top-right", "bottom-left", "bottom-right", "center"].includes(action.corner);
    if (!absolute && !relative && !corner) throw new Error("Mouse hareket koordinatları geçersiz.");
    if (action.durationMs != null && (!Number.isInteger(action.durationMs) || action.durationMs < 100 || action.durationMs > 5000)) {
      throw new Error("Fare animasyon süresi 100-5000 ms arasında olmalı.");
    }
    if (action.steps != null && (!Number.isInteger(action.steps) || action.steps < 4 || action.steps > 120)) {
      throw new Error("Fare animasyon adım sayısı 4-120 arasında olmalı.");
    }
  }
  if (action.type === "scroll" && (!Number.isInteger(action.amount) || action.amount < -1200 || action.amount > 1200)) {
    throw new Error("Kaydırma miktarı geçersiz.");
  }
  if (action.type === "wait" && (!Number.isInteger(action.ms) || action.ms < 0 || action.ms > 10000)) {
    throw new Error("Bekleme süresi geçersiz.");
  }
  return action;
}

export function parseComputerControlOutput(stdout) {
  const output = String(stdout || "").replace(/^\uFEFF/, "");
  // Prefer the explicit PowerShell error sentinel over incidental JSON in CLIXML.
  const sentinel = output.lastIndexOf("NOVA_RESULT:");
  if (sentinel >= 0) {
    const payload = output.slice(sentinel + "NOVA_RESULT:".length).trim();
    try { return JSON.parse(payload); } catch {}
  }
  let lastValidResult = null;
  let cursor = 0;
  while (cursor < output.length) {
    const start = output.indexOf("{", cursor);
    if (start < 0) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let complete = false;
    for (let index = start; index < output.length; index++) {
      const character = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth++;
      else if (character === "}") {
        depth--;
        if (depth === 0) {
          try {
            const candidate = JSON.parse(output.slice(start, index + 1));
            if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
              lastValidResult = candidate;
            }
          } catch {}
          // Skip the entire parsed object, including nested bounds/items objects.
          cursor = index + 1;
          complete = true;
          break;
        }
      }
    }
    if (!complete) cursor = start + 1;
  }
  if (lastValidResult) return lastValidResult;
  throw new Error("Windows masaüstü kontrolünden geçerli sonuç alınamadı.");
}

export async function runComputerAction(action) {
  validateComputerAction(action);
  if (process.platform !== "win32") throw new Error("Masaüstü kontrolü yalnızca Windows'ta kullanılabilir.");
  const payload = Buffer.from(JSON.stringify(action), "utf8").toString("base64");
  // Electron ASAR paths are readable through Node, but PowerShell cannot open a
  // script inside app.asar. Copy the bundled, trusted script to a private temp
  // directory and invoke it by file path to avoid Windows command-line limits.
  const script = await fs.readFile(SCRIPT_PATH, "utf8");
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "nova-desktop-control-"));
  const tempScriptPath = path.join(tempDirectory, "computer-control.ps1");
  try {
    // Windows PowerShell 5.1 otherwise treats UTF-8 without a BOM as the active ANSI code page.
    await fs.writeFile(tempScriptPath, "\uFEFF" + script, { encoding: "utf8", mode: 0o600 });
    const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return await new Promise((resolve, reject) => {
    const child = spawn(powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-STA", "-File", tempScriptPath
    ], {
      windowsHide: true,
      env: { ...process.env, NOVA_CONTROL_PAYLOAD: payload },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout = (stdout + chunk).slice(-250000); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-8000); });
    let settled = false;
    let timeout;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      callback(value);
    };
    child.once("error", error => finish(reject, new Error("Windows masaüstü kontrolü başlatılamadı: " + error.message)));
    child.once("close", code => {
      if (settled) return;
      let result;
      try { result = parseComputerControlOutput(stdout); }
      catch (error) {
        const diagnostic = [
          stderr.trim() ? "PowerShell stderr: " + stderr.trim().slice(-1200) : "",
          stdout.trim() ? "PowerShell stdout: " + stdout.trim().slice(-1200) : "",
          "PowerShell çıkış kodu: " + code
        ].filter(Boolean).join(" | ");
        finish(reject, new Error(error.message + (diagnostic ? " | " + diagnostic : "")));
        return;
      }
      if (!result.success) {
        const details = [
          result.error,
          code !== 0 ? "PowerShell çıkış kodu: " + code : "",
          stderr.trim() ? "PowerShell stderr: " + stderr.trim().slice(-1200) : "",
          !result.error && stdout.trim() ? "PowerShell çıktısı: " + stdout.trim().slice(-500) : ""
        ].filter(Boolean).join(" | ");
        finish(reject, new Error(details || "Masaüstü kontrolü başarısız."));
      } else finish(resolve, result);
    });
    timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(reject, new Error("Windows masaüstü işlemi 45 saniyede tamamlanamadı; takılan işlem sonlandırıldı."));
    }, 45_000);
    timeout.unref?.();
    });
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
  }
}