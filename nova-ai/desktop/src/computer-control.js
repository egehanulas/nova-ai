import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(new URL("./computer-control.ps1", import.meta.url));
const ALLOWED_TYPES = new Set([
  "inspect-screen", "click-text", "focus-control", "type-text", "press-key",
  "click", "move-mouse", "scroll", "wait"
]);
const ALLOWED_KEYS = new Set([
  "ENTER", "TAB", "ESC", "SPACE", "BACKSPACE", "DELETE", "UP", "DOWN",
  "LEFT", "RIGHT", "HOME", "END", "CTRL+A", "CTRL+L", "CTRL+T", "CTRL+W",
  "CTRL+V", "CTRL+C", "CTRL+X", "CTRL+F", "ALT+F4", "SHIFT+TAB"
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
    if (!absolute && !relative) throw new Error("Mouse hareket koordinatları geçersiz.");
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
  const script = await fs.readFile(SCRIPT_PATH, "utf8");
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return await new Promise((resolve, reject) => {
    const child = spawn(powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-STA", "-EncodedCommand", encodedScript
    ], {
      windowsHide: true,
      env: { ...process.env, NOVA_CONTROL_PAYLOAD: payload },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout = (stdout + chunk).slice(-20000); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.once("error", error => reject(new Error("Windows masaüstü kontrolü başlatılamadı: " + error.message)));
    child.once("close", code => {
      let result;
      try { result = parseComputerControlOutput(stdout); }
      catch (error) {
        reject(new Error(error.message + (stderr.trim() ? " " + stderr.slice(-1000) : "")));
        return;
      }
      if (code !== 0 || !result.success) {
        const details = [
          result.error,
          code !== 0 ? "PowerShell çıkış kodu: " + code : "",
          stderr.trim() ? "PowerShell stderr: " + stderr.trim().slice(-1200) : "",
          !result.error && stdout.trim() ? "PowerShell çıktısı: " + stdout.trim().slice(-1200) : ""
        ].filter(Boolean).join(" | ");
        reject(new Error(details || "Masaüstü kontrolü başarısız."));
      } else resolve(result);
    });
  });
}
