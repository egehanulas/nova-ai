import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

async function readConfig(configPath) {
  try {
    const value = JSON.parse(await fs.readFile(configPath, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}

async function writeConfig(configPath, value) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const temporary = configPath + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporary, configPath);
}

export async function getNovaSimStatus(configPath) {
  const config = await readConfig(configPath);
  const projectPath = typeof config.projectPath === "string" ? config.projectPath : "";
  const editorPath = typeof config.editorPath === "string" ? config.editorPath : "";
  const projectExists = Boolean(projectPath && path.extname(projectPath).toLowerCase() === ".uproject" && await exists(projectPath));
  const editorExists = Boolean(editorPath && path.basename(editorPath).toLowerCase() === "unrealeditor.exe" && await exists(editorPath));
  return {
    configured: projectExists && editorExists,
    projectPath: projectExists ? projectPath : "",
    editorPath: editorExists ? editorPath : "",
    projectExists,
    editorExists,
    message: !projectExists ? "Önce NOVA Sim Unreal projesini seç." : !editorExists ? "UnrealEditor.exe konumunu seç." : "NOVA Sim projesi başlatılmaya hazır."
  };
}

async function exists(filePath) {
  try { const stat = await fs.stat(filePath); return stat.isFile(); } catch { return false; }
}

export async function configureNovaSimProject(configPath, projectPath, editorPath) {
  if (typeof projectPath !== "string" || path.extname(projectPath).toLowerCase() !== ".uproject" || !await exists(projectPath)) {
    throw new Error("Geçerli bir Unreal .uproject dosyası seçmelisin.");
  }
  if (typeof editorPath !== "string" || path.basename(editorPath).toLowerCase() !== "unrealeditor.exe" || !await exists(editorPath)) {
    throw new Error("Unreal Engine kurulumundaki UnrealEditor.exe dosyasını seçmelisin.");
  }
  await writeConfig(configPath, { projectPath: path.resolve(projectPath), editorPath: path.resolve(editorPath) });
  return getNovaSimStatus(configPath);
}

export async function launchNovaSim(configPath) {
  const status = await getNovaSimStatus(configPath);
  if (!status.configured) throw new Error(status.message);
  return await new Promise((resolve, reject) => {
    const child = spawn(status.editorPath, [status.projectPath], {
      detached: true, stdio: "ignore", windowsHide: false, shell: false
    });
    child.once("error", error => reject(new Error("Unreal Engine başlatılamadı: " + error.message)));
    child.once("spawn", () => {
      child.unref();
      resolve({ message: "Unreal Engine, NOVA Sim projesiyle başlatıldı.", projectPath: status.projectPath });
    });
  });
}
