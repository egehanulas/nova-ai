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

export function resolveUserPath(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 1000) throw new Error("Geçerli bir dosya yolu gir.");
  const resolved = path.resolve(input.trim());
  if (!ROOTS.some((root) => inside(root, resolved))) throw new Error("NOVA yalnızca Masaüstü, Belgeler ve İndirilenler klasörlerinde işlem yapabilir.");
  return resolved;
}

async function resolveExistingUserPath(input, { allowRoot = true } = {}) {
  const resolved = resolveUserPath(input);
  const lexicalRoot = ROOTS.find((root) => inside(root, resolved));
  if (!lexicalRoot) throw new Error("Bu konum için işlem yapılamıyor.");

  const relativePath = path.relative(lexicalRoot, resolved);
  let currentPath = lexicalRoot;
  for (const segment of relativePath.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, segment);
    const segmentStat = await fs.lstat(currentPath);
    if (segmentStat.isSymbolicLink()) {
      throw new Error("Kısayol ve sembolik bağlantılar güvenlik nedeniyle açılamaz veya değiştirilemez.");
    }
  }

  const stat = await fs.lstat(resolved);
  const realPath = await fs.realpath(resolved);
  const canonicalRoots = await Promise.all(ROOTS.map(async (root) => {
    try { return await fs.realpath(root); } catch { return null; }
  }));
  const approvedRoot = canonicalRoots.find((root) => root && inside(root, realPath));
  if (!approvedRoot || (!allowRoot && realPath === approvedRoot)) throw new Error("Bu konum için işlem yapılamıyor.");
  return { path: realPath, stat };
}

export function getComputerInfo() {
  const cpus = os.cpus();
  return {
    computer: os.hostname(), platform: os.type() + " " + os.release(), architecture: os.arch(),
    processor: cpus[0]?.model || "Bilinmiyor", logicalCores: cpus.length,
    memoryTotal: os.totalmem(), memoryFree: os.freemem(), uptimeSeconds: os.uptime(), home: HOME
  };
}

export async function listUserFolders() {
  const results = [];
  for (const root of ROOTS) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      results.push({ name: path.basename(root), path: root, items: entries.slice(0, 100).map((entry) => ({
        name: entry.name, type: entry.isDirectory() ? "folder" : "file", path: path.join(root, entry.name)
      })) });
    } catch { results.push({ name: path.basename(root), path: root, items: [] }); }
  }
  return results;
}

export async function searchUserFiles(query) {
  if (typeof query !== "string" || !query.trim() || query.length > 120) throw new Error("Aramak için en fazla 120 karakterlik bir dosya adı yaz.");
  const needle = query.trim().toLocaleLowerCase("tr-TR"), found = [];
  async function walk(dir, depth) {
    if (depth < 0 || found.length >= 100) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= 100) break;
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.name.toLocaleLowerCase("tr-TR").includes(needle)) found.push({
        name: entry.name, path: fullPath, type: entry.isDirectory() ? "folder" : "file"
      });
      if (entry.isDirectory() && depth > 0) await walk(fullPath, depth - 1);
    }
  }
  for (const root of ROOTS) await walk(root, 3);
  return found;
}

export async function openAllowedApp(appName) {
  const apps = {
    notepad: { label: "Not Defteri", command: "notepad.exe", args: [] },
    calculator: { label: "Hesap Makinesi", command: "calc.exe", args: [] },
    explorer: { label: "Dosya Gezgini", command: "explorer.exe", args: [HOME] },
    paint: { label: "Paint", command: "mspaint.exe", args: [] },
    steam: { label: "Steam", command: path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam", "steam.exe"), args: [] },
    discord: { label: "Discord", command: path.join(process.env.LOCALAPPDATA || path.join(HOME, "AppData", "Local"), "Discord", "Update.exe"), args: ["--processStart", "Discord.exe"] }
  };
  const selected = apps[appName];
  if (!selected) throw new Error("Bu uygulama güvenlik nedeniyle izin verilen uygulamalar listesinde değil.");
  if (appName === "steam" || appName === "discord") {
    try { await fs.access(selected.command); } catch { throw new Error(selected.label + " bu bilgisayarda bulunamadı veya varsayılan konumunda kurulu değil."); }
  }
  const child = spawn(selected.command, selected.args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", (error) => console.error("NOVA app launch failed:", error));
  child.unref();
  return { message: selected.label + " açılıyor." };
}

export async function openUserPath(input) {
  const { path: safePath } = await resolveExistingUserPath(input);
  return { path: safePath, message: "Öğe açılmaya hazır." };
}

export async function resolveUserFileForTrash(input) {
  const { path: safePath } = await resolveExistingUserPath(input, { allowRoot: false });
  return safePath;
}

export async function createUserFolder(parentInput, folderName) {
  const { path: parent, stat } = await resolveExistingUserPath(parentInput);
  if (!stat.isDirectory()) throw new Error("Yeni klasör oluşturmak için hedef bir klasör olmalı.");
  const name = String(folderName || "").trim();
  if (!name || name.length > 80 || /[<>:"/\\|?*]/.test(name) || name === "." || name === ".." || /[. ]$/.test(name)) throw new Error("Klasör adı geçersiz.");
  const destination = path.join(parent, name);
  try { await fs.mkdir(destination); } catch (error) {
    if (error.code === "EEXIST") throw new Error("Bu konumda aynı isimde bir dosya veya klasör zaten var.");
    throw error;
  }
  return { message: "“" + name + "” klasörü oluşturuldu.", path: destination };
}

export async function moveUserFile(sourceInput, destinationFolderInput, newName) {
  const { path: source, stat: sourceStat } = await resolveExistingUserPath(sourceInput, { allowRoot: false });
  if (sourceStat.isSymbolicLink()) throw new Error("Kısayol ve sembolik bağlantılar taşınamaz.");
  const { path: destinationFolder, stat: destinationStat } = await resolveExistingUserPath(destinationFolderInput);
  if (!destinationStat.isDirectory()) throw new Error("Hedef konum bir klasör olmalı.");
  if (inside(source, destinationFolder)) throw new Error("Bir klasörü kendi içine veya alt klasörüne taşıyamazsın.");
  const targetName = newName ? String(newName).trim() : path.basename(source);
  if (!targetName || targetName.length > 180 || /[<>:"/\\|?*]/.test(targetName) || targetName === "." || targetName === ".." || /[. ]$/.test(targetName)) throw new Error("Yeni dosya adı geçersiz.");
  const destination = path.join(destinationFolder, targetName);
  if (!inside(destinationFolder, destination)) throw new Error("Hedef klasör geçersiz.");
  try { await fs.access(destination); throw new Error("Hedefte aynı isimde bir dosya zaten var."); } catch (error) {
    if (error.message.includes("zaten var")) throw error;
    if (error.code !== "ENOENT") throw error;
  }
  await fs.rename(source, destination);
  return { message: "“" + path.basename(source) + "” işlemi tamamlandı.", path: destination };
}
