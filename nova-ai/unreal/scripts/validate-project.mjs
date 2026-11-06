import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "NovaWorld.uproject",
  "Config/DefaultEngine.ini",
  "Config/DefaultInput.ini",
  "Config/DefaultGame.ini",
  "Source/NovaWorld.Target.cs",
  "Source/NovaWorldEditor.Target.cs",
  "Source/NovaWorld/NovaWorld.Build.cs",
  "Source/NovaWorld/Private/NovaWorld.cpp",
  "Source/NovaWorld/Private/NovaWorldCharacter.cpp",
  "Source/NovaWorld/Private/NovaWorldGameMode.cpp",
  "Source/NovaWorld/Private/NovaWorldDefinition.cpp",
  "Source/NovaWorld/Public/NovaWorldCharacter.h",
  "Source/NovaWorld/Public/NovaWorldGameMode.h",
  "Source/NovaWorld/Public/NovaWorldDefinition.h"
];

const project = JSON.parse(await readFile(path.join(root, "NovaWorld.uproject"), "utf8"));
if (project.EngineVersion !== "5.8.4") {
  throw new Error(`Expected Unreal Engine 5.8.4, received ${project.EngineVersion ?? "unset"}`);
}
if (!project.Modules?.some((module) => module.Name === "NovaWorld" && module.Type === "Runtime")) {
  throw new Error("NovaWorld runtime module is missing from the project descriptor.");
}

for (const relativePath of requiredFiles) {
  await readFile(path.join(root, relativePath), "utf8");
}

const character = await readFile(path.join(root, "Source/NovaWorld/Private/NovaWorldCharacter.cpp"), "utf8");
for (const expected of ["MoveForward", "MoveRight", "StartSprint", "StopSprint", "AddControllerYawInput", "AddControllerPitchInput"]) {
  if (!character.includes(expected)) {
    throw new Error(`First-person controller is missing expected binding: ${expected}`);
  }
}

const worldDefinition = await readFile(path.join(root, "Source/NovaWorld/Public/NovaWorldDefinition.h"), "utf8");
for (const expected of ["WorldGenre", "StartupMap", "EnabledSystems", "RequiredAssets"]) {
  if (!worldDefinition.includes(expected)) {
    throw new Error(`Data-driven world definition is missing field: ${expected}`);
  }
}


const gameMode = await readFile(path.join(root, "Source/NovaWorld/Private/NovaWorldGameMode.cpp"), "utf8");
for (const expected of ["BuildStarterWorld", "Plane.Plane", "Cube.Cube", "DirectionalLight"]) {
  if (!gameMode.includes(expected)) {
    throw new Error(`Automatic starter world is missing expected feature: ${expected}`);
  }
}

console.log(`NOVA Unreal scaffold validation passed (${requiredFiles.length} required files, Unreal ${project.EngineVersion}).`);
