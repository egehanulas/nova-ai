import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const HOME = os.homedir();
const ROOT_NAMES = ["Desktop", "Documents", "Downloads"];
const SEARCH_MAX_RESULTS = 250;
const SEARCH_MAX_DIRECTORIES = 300_000;
const SEARCH_MAX_DURATION_MS = 120_000;
const SEARCH_WORKERS = 8;
let USER_FOLDERS = Object.fromEntries(ROOT_NAMES.map((name) => [name, path.join(HOME, name)]));
let ROOTS = [...new Set(Object.values(USER_FOLDERS).map((value) => path.resolve(value)))];
let ROOT_LABELS = new Map(ROOTS.map((root) => [root, path.basename(root)]));

function normalizePath(input) {
  let value = path.resolve(input);
  if (process.platform === "win32") {
    const extendedPrefix = "\\\\?\\";
    const ntPrefix = "\\??\\";
    if (value.startsWith(extendedPrefix)) value = value.slice(extendedPrefix.length);
    else if (value.startsWith(ntPrefix)) value = value.slice(ntPrefix.length);
  }
  return path.normalize(value);
}
function inside(parent, target) {
  const normalizedParent = normalizePath(parent);
  const normalizedTarget = normalizePath(target);
  const relative = path.relative(normalizedParent, normalizedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeFolderKey(value) {
  const raw = String(value || "").trim();
  if (!raw || path.isAbsolute(raw)) return "";
  const normalized = raw.toLocaleLowerCase("tr-TR").replace(" klasörü", "").replace(" klasörüne", "").trim();
  if (/^(?:masaüstü|masaustu|masaüstüne|masaüstünde|masaüstündeki|desktop)$/.test(normalized)) return "Desktop";
  if (/^(?:belgeler|belgelere|belgelerde|belgelerdeki|documents)$/.test(normalized)) return "Documents";
  if (/^(?:indirilenler|indirilenlere|indirilenlerde|indirilenlerdeki|downloads)$/.test(normalized)) return "Downloads";
  return "";
}

export function configureUserFolderPaths(paths = {}) {
  const entries = ROOT_NAMES.map((name) => [name, paths[name]]);
  if (entries.some(([, value]) => typeof value !== "string" || !path.isAbsolute(value))) {
    throw new Error("Windows kullanıcı klasör yolları geçersiz.");
  }
  USER_FOLDERS = Object.fromEntries(entries.map(([name, value]) => [name, path.resolve(value)]));
  ROOTS = [...new Set(entries.map(([, value]) => path.resolve(value)))];
  ROOT_LABELS = new Map(entries.map(([name, value]) => [path.resolve(value), name]));
}

export async function discoverDriveRoots() {
  if (process.platform !== "win32") return [...new Set(Object.values(USER_FOLDERS).map((value) => path.parse(value).root).filter(Boolean))];
  const letters = "CDEFGHIJKLMNOPQRSTUVWXYZAB".split("");
  const roots = await Promise.all(letters.map((letter) => new Promise((resolve) => {
    const root = letter + ":\\";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 1200);
    fs.stat(root).then((stat) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(stat.isDirectory() ? root : null);
    }).catch(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
  })));
  return [...new Set([...roots.filter(Boolean), ...Object.values(USER_FOLDERS).map((value) => path.parse(value).root).filter(Boolean)])];
}

export function configureComputerFileAccess({ userFolders = {}, driveRoots = [] } = {}) {
  const entries = ROOT_NAMES.map((name) => [name, userFolders[name] || USER_FOLDERS[name]]);
  if (entries.some(([, value]) => typeof value !== "string" || !path.isAbsolute(value))) {
    throw new Error("Windows kullanıcı klasör yolları geçersiz.");
  }
  USER_FOLDERS = Object.fromEntries(entries.map(([name, value]) => [name, path.resolve(value)]));
  const userFolderRoots = Object.values(USER_FOLDERS).map((value) => {
    const resolvedFolder = path.resolve(value);
    if (driveRoots.some((root) => inside(root, resolvedFolder))) return null;
    return process.platform === "win32" ? (path.parse(value).root || value) : value;
  }).filter(Boolean);
  const roots = [...driveRoots, ...userFolderRoots]
    .filter((value) => typeof value === "string" && path.isAbsolute(value))
    .map((value) => path.resolve(value));
  const uniqueRoots = [...new Set(roots.length ? roots : Object.values(USER_FOLDERS).map((value) => path.resolve(value)))];
  ROOTS = uniqueRoots.filter((candidate) =>
    !uniqueRoots.some((parent) => parent !== candidate && inside(parent, candidate))
  );
  ROOT_LABELS = new Map(ROOTS.map((root) => [root, path.parse(root).root ? path.parse(root).root.replace(/[\\/]+$/, "") : path.basename(root)]));
  for (const [name, value] of entries) ROOT_LABELS.set(path.resolve(value), name);
}

export function getUserFolderPath(location) {
  const key = normalizeFolderKey(location);
  return key ? USER_FOLDERS[key] : "";
}

export function resolveUserPath(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 1000) throw new Error("Geçerli bir dosya yolu gir.");
  const resolved = normalizePath(input.trim());
  if (!ROOTS.some((root) => inside(root, resolved))) {
    throw new Error("Bu yol NOVA tarafından erişilebilen yerel sürücülerden birinin içinde değil.");
  }
  return resolved;
}

function protectedRoots() {
  const candidates = [
    process.env.WINDIR,
    process.env.SystemRoot,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.ProgramW6432,
    process.env.ProgramData
  ].filter((value) => typeof value === "string" && path.isAbsolute(value));
  for (const root of ROOTS) {
    for (const name of ["Windows", "Program Files", "Program Files (x86)", "ProgramData", "System Volume Information", "$Recycle.Bin", "Recovery", "Config.Msi", "Boot", "EFI"]) {
      candidates.push(path.join(root, name));
    }
  }
  return [...new Set(candidates.map((value) => path.resolve(value)))];
}

export function isProtectedSystemPath(input) {
  if (typeof input !== "string" || !path.isAbsolute(input)) return true;
  const resolved = path.resolve(input);
  const driveRoot = path.parse(resolved).root;
  if (resolved === driveRoot) return true;
  const relativeToDrive = path.relative(driveRoot, resolved);
  const firstSegment = relativeToDrive.split(path.sep).filter(Boolean)[0] || "";
  if (["pagefile.sys", "hiberfil.sys", "swapfile.sys", "bootmgr", "bootnxt"].includes(firstSegment.toLowerCase())) return true;
  if (/(^|[\\/])AppData([\\/]|$)/i.test(resolved)) return true;
  return protectedRoots().some((root) => inside(root, resolved));
}

function assertMutablePath(input) {
  if (isProtectedSystemPath(input)) {
    throw new Error("Windows sistem klasörleri ve kritik uygulama dosyaları değiştirilemez. Bu konumda yalnızca arama ve açma yapılabilir.");
  }
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
      throw new Error("Sembolik bağlantılar ve klasör bağlantıları güvenlik nedeniyle açılamaz veya değiştirilemez.");
    }
  }

  const stat = await fs.lstat(resolved);
  if (stat.isSymbolicLink()) throw new Error("Sembolik bağlantılar güvenlik nedeniyle kullanılamaz.");
  const realPath = normalizePath(await fs.realpath(resolved));
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
      results.push({
        name: ROOT_LABELS.get(root) || path.parse(root).root.replace(/[\\/]+$/, "") || path.basename(root),
        path: root,
        items: entries.slice(0, 100).map((entry) => ({
          name: entry.name, type: entry.isDirectory() ? "folder" : "file", path: path.join(root, entry.name)
        }))
      });
    } catch {
      results.push({ name: ROOT_LABELS.get(root) || path.basename(root), path: root, items: [] });
    }
  }
  return results;
}

export async function searchUserFiles(query, preferredLocation = "", { exactOnly = false } = {}) {
  if (typeof query !== "string" || !query.trim() || query.length > 255) {
    throw new Error("Aramak için en fazla 255 karakterlik bir dosya veya klasör adı yaz.");
  }
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  const preferredKey = normalizeFolderKey(preferredLocation);
  let roots = ROOTS;
  if (preferredKey) {
    roots = [USER_FOLDERS[preferredKey]];
  } else if (typeof preferredLocation === "string" && path.isAbsolute(preferredLocation)) {
    const preferredFolder = await resolveExistingUserPath(preferredLocation);
    if (!preferredFolder.stat.isDirectory()) throw new Error("Arama konumu bir klasör olmalı.");
    roots = [preferredFolder.path];
  }
  const explicitProtectedSearch = typeof preferredLocation === "string" &&
    path.isAbsolute(preferredLocation) && isProtectedSystemPath(preferredLocation);
  const skipProtectedDirectories = !explicitProtectedSearch;
  const protectedSearchRoots = skipProtectedDirectories ? protectedRoots() : [];
  const found = [];
  const queue = [...roots];
  const startedAt = Date.now();
  let visited = 0;
  let inaccessibleDirectories = 0;
  let stop = false;

  while (queue.length && !stop) {
    if (found.length >= SEARCH_MAX_RESULTS || visited >= SEARCH_MAX_DIRECTORIES || Date.now() - startedAt >= SEARCH_MAX_DURATION_MS) {
      stop = true;
      break;
    }
    const batch = queue.splice(0, SEARCH_WORKERS);
    visited += batch.length;
    const batches = await Promise.all(batch.map(async (dir) => {
      try { return await fs.readdir(dir, { withFileTypes: true }); }
      catch (error) {
        const isSearchRoot = roots.some((root) => path.resolve(root) === path.resolve(dir));
        if (isSearchRoot || !["ENOENT", "ENOTDIR"].includes(error?.code)) inaccessibleDirectories += 1;
        return [];
      }
    }));
    for (let index = 0; index < batches.length && !stop; index += 1) {
      const dir = batch[index];
      for (const entry of batches[index]) {
        if (entry.isSymbolicLink()) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && skipProtectedDirectories) {
          const isAppData = /(^|[\\/])AppData([\\/]|$)/i.test(fullPath);
          if (isAppData || protectedSearchRoots.some((root) => inside(root, fullPath))) continue;
        }
        const normalizedName = entry.name.toLocaleLowerCase("tr-TR");
        if (exactOnly ? normalizedName === needle : normalizedName.includes(needle)) {
          found.push({ name: entry.name, path: fullPath, type: entry.isDirectory() ? "folder" : "file" });
          if ((exactOnly && found.length >= 2) || (!exactOnly && found.length >= SEARCH_MAX_RESULTS)) {
            stop = true;
            break;
          }
        }
        if (entry.isDirectory()) queue.push(fullPath);
      }
    }
  }

  found.sort((a, b) => {
    const aExact = a.name.toLocaleLowerCase("tr-TR") === needle ? 0 : 1;
    const bExact = b.name.toLocaleLowerCase("tr-TR") === needle ? 0 : 1;
    return aExact - bExact || a.path.localeCompare(b.path, "tr");
  });
  Object.defineProperties(found, {
    truncated: {
      value: stop && (queue.length > 0 || found.length >= SEARCH_MAX_RESULTS || visited >= SEARCH_MAX_DIRECTORIES || Date.now() - startedAt >= SEARCH_MAX_DURATION_MS),
      enumerable: true
    },
    inaccessibleDirectories: { value: inaccessibleDirectories, enumerable: true }
  });
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
  await new Promise((resolve, reject) => {
    let settled = false;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(new Error(selected.label + " başlatılamadı: " + error.message));
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
  return { message: selected.label + " uygulaması başarıyla başlatıldı." };
}

function cleanFileReference(input) {
  return String(input || "")
    .trim()
    .replace(/^["“”'\s]+|["“”'\s]+$/g, "")
    .replace(/^(?:(?:lütfen)\s+)?(?:(?:masaüstündeki|masaüstünde|masaustündeki|belgelerdeki|belgelerde|indirilenlerdeki|indirilenlerde)\s+)/i, "")
    .replace(/\s+(?:(?:dosyasını|dosyayı|dosyası|dosya|klasörünü|klasörü|öğesini|öğeyi|klasörüne|klasörüne))$/i, "")
    .trim();
}

export async function resolveUserItem(input, preferredLocation = "", { allowRoot = true } = {}) {
  if (typeof input !== "string" || !input.trim()) throw new Error("İşlem yapılacak dosya veya klasörün adını yaz.");
  let candidate = cleanFileReference(input)
    .replace(/^~(?=[\\/])/, HOME)
    .replace(/^(?:masaüstü|masaustu|desktop)(?=[\\/])/i, USER_FOLDERS.Desktop)
    .replace(/^(?:belgeler|documents)(?=[\\/])/i, USER_FOLDERS.Documents)
    .replace(/^(?:indirilenler|downloads)(?=[\\/])/i, USER_FOLDERS.Downloads);

  if (path.isAbsolute(candidate) || candidate.includes("/") || candidate.includes("\\")) {
    return resolveExistingUserPath(candidate, { allowRoot });
  }

  const exact = await searchUserFiles(candidate, preferredLocation, { exactOnly: true });
  if (exact.inaccessibleDirectories > 0) {
    throw new Error("Dosya araması sırasında " + exact.inaccessibleDirectories + " klasöre erişilemedi. Yanlış veya eksik eşleşme seçmemek için tam dosya yolunu belirt ya da arama konumunu daralt.");
  }
  if (exact.truncated) {
    throw new Error("Dosya araması tamamlanamadı. Yanlış dosyayı açmamak için tam dosya yolunu belirt veya konumunu daralt.");
  }
  if (exact.length > 1) {
    throw new Error("Aynı isimde birden fazla öğe buldum. Lütfen tam konumunu belirt:\n" +
      exact.slice(0, 8).map((item) => item.path).join("\n"));
  }
  if (!exact.length) {
    throw new Error("“" + candidate + "” adlı öğenin tam eşleşmesini bulamadım. Önce dosya araması yap veya tam dosya yolunu belirt.");
  }
  return resolveExistingUserPath(exact[0].path, { allowRoot });
}

const BLOCKED_OPEN_EXTENSIONS = new Set([
  ".exe", ".com", ".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse",
  ".wsf", ".wsh", ".hta", ".scr", ".msi", ".msp", ".mst", ".dll", ".sys", ".ocx",
  ".cpl", ".lnk", ".url", ".reg", ".sh", ".bash", ".jar", ".appx", ".msix"
]);

export async function openUserPath(input, preferredLocation = "") {
  const resolved = await resolveUserItem(input, preferredLocation);
  const normalizedFileName = path.basename(resolved.path).replace(/[ .]+$/g, "").split(":")[0];
  const extension = path.extname(normalizedFileName).toLowerCase();
  if (resolved.stat.isFile() && BLOCKED_OPEN_EXTENSIONS.has(extension)) {
    throw new Error("Çalıştırılabilir dosyalar, komut dosyaları ve Windows kısayolları güvenlik nedeniyle NOVA üzerinden doğrudan açılamaz. İzin verilen uygulamaları uygulama listesinden başlatabilirsin.");
  }
  return { path: resolved.path, message: "“" + path.basename(resolved.path) + "” açılmaya hazır." };
}

function folderLookupCandidates(input) {
  const raw = String(input || "").trim().replace(/\\s+klasör(?:ü|üne)?$/i, "").trim();
  const candidates = [raw];
  const apostropheSuffix = raw.replace(/['’](?:a|e|ı|i|u|ü)$/i, "");
  if (apostropheSuffix && apostropheSuffix !== raw) candidates.push(apostropheSuffix);
  const glideSuffix = raw.replace(/(?:ya|ye)$/i, "");
  if (glideSuffix && glideSuffix !== raw) candidates.push(glideSuffix);
  const finalVowel = raw.replace(/[aeıiuü]$/i, "");
  if (finalVowel && finalVowel !== raw) candidates.push(finalVowel);
  return [...new Set(candidates.filter(Boolean))];
}

export async function resolveUserFolder(input) {
  const knownPath = getUserFolderPath(input);
  let candidate = knownPath || input;
  const driveFolderMatch = typeof input === "string"
    ? input.match(/^([A-Z])\s+(?:sürücüsündeki|diskindeki|sürücüsünde|diskinde)\s+(.+)$/i)
    : null;
  if (!knownPath && driveFolderMatch) {
    const relativeFolder = driveFolderMatch[2].replace(/\s+klasör(?:ü|üne)?$/i, "").trim();
    candidate = path.join(driveFolderMatch[1].toUpperCase() + ":\\", relativeFolder);
  } else if (!knownPath && typeof input === "string" && !path.isAbsolute(input) && !input.includes("/") && !input.includes("\\")) {
    let resolvedItem = null;
    let lastError = null;
    for (const candidateName of folderLookupCandidates(input)) {
      try {
        resolvedItem = await resolveUserItem(candidateName);
        break;
      } catch (error) {
        if (/birden fazla öğe/i.test(error?.message || "")) throw error;
        lastError = error;
      }
    }
    if (!resolvedItem) throw lastError || new Error("Belirttiğin hedef klasörü bulamadım.");
    candidate = resolvedItem.path;
  }
  const resolved = await resolveExistingUserPath(candidate);
  if (!resolved.stat.isDirectory()) throw new Error("Belirttiğin hedef bir klasör değil.");
  return resolved;
}

export async function resolveUserFileForTrash(input) {
  const { path: safePath, stat } = await resolveExistingUserPath(input, { allowRoot: false });
  if (stat.isDirectory() && path.resolve(safePath) === path.parse(safePath).root) {
    throw new Error("Bir sürücünün tamamı Geri Dönüşüm Kutusu'na taşınamaz.");
  }
  assertMutablePath(safePath);
  return safePath;
}

export async function createUserFolder(parentInput, folderName) {
  const { path: parent, stat } = await resolveUserFolder(parentInput);
  if (!stat.isDirectory()) throw new Error("Yeni klasör oluşturmak için hedef bir klasör olmalı.");
  assertMutablePath(parent);
  const name = String(folderName || "").trim();
  if (!name || name.length > 120 || /[<>:"/\\|?*]/.test(name) || name === "." || name === ".." || /[. ]$/.test(name)) {
    throw new Error("Klasör adı geçersiz.");
  }
  const destination = path.join(parent, name);
  assertMutablePath(destination);
  try { await fs.mkdir(destination); } catch (error) {
    if (error.code === "EEXIST") throw new Error("Bu konumda aynı isimde bir dosya veya klasör zaten var.");
    throw error;
  }
  return { message: "“" + name + "” klasörü oluşturuldu.", path: destination };
}

async function assertNoSymbolicLinks(source) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error("Sembolik bağlantı içeren öğeler taşınamaz.");
  if (!stat.isDirectory()) return;
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(source, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Sembolik bağlantı içeren klasörler taşınamaz: " + child);
    if (entry.isDirectory()) await assertNoSymbolicLinks(child);
  }
}

export async function moveUserFile(sourceInput, destinationFolderInput, newName, sourceLocation = "") {
  const { path: source, stat: sourceStat } = await resolveUserItem(sourceInput, sourceLocation, { allowRoot: false });
  if (sourceStat.isSymbolicLink()) throw new Error("Sembolik bağlantılar taşınamaz.");
  const { path: destinationFolder, stat: destinationStat } = await resolveUserFolder(destinationFolderInput);
  if (!destinationStat.isDirectory()) throw new Error("Hedef konum bir klasör olmalı.");
  assertMutablePath(source);
  assertMutablePath(destinationFolder);
  if (inside(source, destinationFolder)) throw new Error("Bir klasörü kendi içine veya alt klasörüne taşıyamazsın.");

  const targetName = newName ? String(newName).trim() : path.basename(source);
  if (!targetName || targetName.length > 240 || /[<>:"/\\|?*]/.test(targetName) || targetName === "." || targetName === ".." || /[. ]$/.test(targetName)) {
    throw new Error("Yeni dosya adı geçersiz.");
  }
  const destination = path.join(destinationFolder, targetName);
  if (!inside(destinationFolder, destination)) throw new Error("Hedef klasör geçersiz.");
  try {
    await fs.lstat(destination);
    throw new Error("Hedefte aynı isimde bir dosya veya klasör zaten var.");
  } catch (error) {
    if (error.message.includes("zaten var")) throw error;
    if (error.code !== "ENOENT") throw error;
  }

  await assertNoSymbolicLinks(source);
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    const temporaryDestination = path.join(destinationFolder, "." + targetName + ".nova-moving-" + process.pid + "-" + Date.now());
    try {
      await fs.cp(source, temporaryDestination, {
        recursive: true,
        errorOnExist: true,
        force: false,
        dereference: false,
        preserveTimestamps: true
      });
      await fs.rename(temporaryDestination, destination);
    } catch (copyError) {
      await fs.rm(temporaryDestination, { recursive: true, force: true }).catch(() => {});
      throw copyError;
    }
    try {
      await fs.rm(source, { recursive: true, force: false });
    } catch (removeError) {
      throw new Error("Dosya hedefe kopyalandı ancak kaynak konumdan kaldırılamadı. Veri kaybını önlemek için iki kopya da korundu. Kaynak: " + source + " | Hedef: " + destination + " | Ayrıntı: " + removeError.message);
    }
  }
  return { message: "“" + path.basename(source) + "” işlemi tamamlandı.", path: destination };
}
