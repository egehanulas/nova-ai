import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const HOME = os.homedir();
const ROOTS = ["Desktop", "Documents", "Downloads"].map((name) => path.join(HOME, name));
function inside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function resolveUserPath(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 1000) throw new Error("Geçerli bir dosya yolu gir.");
  const resolved = path.resolve(input);
  if (!ROOTS.some((root) => inside(root, resolved))) throw new Error("NOVA yalnızca Masaüstü, Belgeler ve İndirilenler klasörlerinde işlem yapabilir.");
  return resolved;
}
export function getComputerInfo() {
  return { computer: os.hostname(), platform: os.type() + " " + os.release(), architecture: os.arch(), memoryTotal: os.totalmem(), memoryFree: os.freemem() };
}
export async function listUserFolders() {
  const results = [];
  for (const root of ROOTS) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      results.push({ name: path.basename(root), path: root, items: entries.slice(0, 100).map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "folder" : "file", path: path.join(root, entry.name) })) });
    } catch { results.push({ name: path.basename(root), path: root, items: [] }); }
  }
  return results;
}
export async function searchUserFiles(query) {
  if (typeof query !== "string" || !query.trim() || query.length > 120) throw new Error("Aramak için bir dosya adı yaz.");
  const needle = query.toLocaleLowerCase("tr-TR");
  const found = [];
  async function walk(dir, depth) {
    if (depth < 0 || found.length >= 100) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= 100) break;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.name.toLocaleLowerCase("tr-TR").includes(needle)) found.push({ name: entry.name, path: fullPath, type: entry.isDirectory() ? "folder" : "file" });
      if (entry.isDirectory() && depth > 0) await walk(fullPath, depth - 1);
    }
  }
  for (const root of ROOTS) await walk(root, 2);
  return found;
}
export async function openAllowedApp(appName) {
  const apps = {
    notepad: { label: "Not Defteri", command: "notepad.exe", args: [] },
    calculator: { label: "Hesap Makinesi", command: "calc.exe", args: [] },
    explorer: { label: "Dosya Gezgini", command: "explorer.exe", args: [HOME] },
    steam: { label: "Steam", command: path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam", "steam.exe"), args: [] }
  };
  const selected = apps[appName];
  if (!selected) throw new Error("Bu uygulama güvenlik nedeniyle izin verilen uygulamalar listesinde değil.");
  if (appName === "steam") {
    try { await fs.access(selected.command); } catch { throw new Error("Steam varsayılan kurulum konumunda bulunamadı."); }
  }
  const child = spawn(selected.command, selected.args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", (error) => console.error("NOVA app launch failed:", error));
  child.unref();
  return { message: selected.label + " açılıyor." };
}
export async function createUserFolder(parentInput, folderName) {
  const parent = resolveUserPath(parentInput);
  const name = String(folderName || "").trim();
  if (!name || name.length > 80 || /[<>:"/\\|?*]/.test(name) || name === "." || name === "..") throw new Error("Klasör adı geçersiz.");
  const realParent = await fs.realpath(parent);
  if (!ROOTS.some((root) => inside(root, realParent))) throw new Error("Bu klasöre erişilemiyor.");
  const destination = path.join(realParent, name);
  await fs.mkdir(destination);
  return { message: "“" + name + "” klasörü oluşturuldu.", path: destination };
}
export async function moveUserFile(sourceInput, destinationFolderInput, newName) {
  const source = resolveUserPath(sourceInput);
  const destinationFolder = resolveUserPath(destinationFolderInput);
  const [realSource, realDestination] = await Promise.all([fs.realpath(source), fs.realpath(destinationFolder)]);
  if (!ROOTS.some((root) => inside(root, realSource) && realSource !== root) || !ROOTS.some((root) => inside(root, realDestination))) throw new Error("Bu dosya veya klasör için işlem yapılamıyor.");
  if (inside(realSource, realDestination)) throw new Error("Bir klasörü kendi içine veya alt klasörüne taşıyamazsın.");
  const stat = await fs.lstat(realSource);
  if (stat.isSymbolicLink()) throw new Error("Kısayol ve sembolik bağlantılar taşınamaz.");
  const targetName = newName ? String(newName).trim() : path.basename(realSource);
  if (!targetName || targetName.length > 180 || /[<>:"/\\|?*]/.test(targetName) || targetName === "." || targetName === "..") throw new Error("Yeni dosya adı geçersiz.");
  const destination = path.join(realDestination, targetName);
  if (!inside(realDestination, destination)) throw new Error("Hedef klasör geçersiz.");
  try { await fs.access(destination); throw new Error("Hedefte aynı isimde bir dosya zaten var."); } catch (error) { if (error.message.includes("zaten var")) throw error; }
  await fs.rename(realSource, destination);
  return { message: "“" + path.basename(realSource) + "” işlemi tamamlandı.", path: destination };
}
