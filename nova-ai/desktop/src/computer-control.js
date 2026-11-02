import { spawn } from "node:child_process";
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
       (action.name != null && (typeof action.name !== "string" || action.name.length > 180)))) {
    throw new Error("Odaklanılacak denetim geçersiz.");
  }
  if (action.type === "press-key" && !ALLOWED_KEYS.has(String(action.key || "").toUpperCase())) {
    throw new Error("İzin verilmeyen klavye kısayolu.");
  }
  if (["click", "move-mouse"].includes(action.type) &&
      (![action.x, action.y].every(Number.isInteger) || action.x < 0 || action.y < 0 || action.x > 10000 || action.y > 10000)) {
    throw new Error("Mouse koordinatları geçersiz.");
  }
  if (action.type === "scroll" && (!Number.isInteger(action.amount) || action.amount < -1200 || action.amount > 1200)) {
    throw new Error("Kaydırma miktarı geçersiz.");
  }
  if (action.type === "wait" && (!Number.isInteger(action.ms) || action.ms < 0 || action.ms > 10000)) {
    throw new Error("Bekleme süresi geçersiz.");
  }
  return action;
}

export async function runComputerAction(action) {
  validateComputerAction(action);
  if (process.platform !== "win32") throw new Error("Masaüstü kontrolü yalnızca Windows'ta kullanılabilir.");
  const payload = Buffer.from(JSON.stringify(action), "utf8").toString("base64");
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return await new Promise((resolve, reject) => {
    const child = spawn(powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-STA", "-File", SCRIPT_PATH, "-Payload", payload
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout = (stdout + chunk).slice(-20000); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.once("error", error => reject(new Error("Windows masaüstü kontrolü başlatılamadı: " + error.message)));
    child.once("close", code => {
      let result;
      try { result = JSON.parse(stdout.trim()); }
      catch { reject(new Error("Windows masaüstü kontrolünden geçerli sonuç alınamadı. " + stderr.slice(-1000))); return; }
      if (code !== 0 || !result.success) reject(new Error(result.error || "Masaüstü kontrolü başarısız."));
      else resolve(result);
    });
  });
}
