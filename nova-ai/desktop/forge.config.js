export default {
  packagerConfig: {
    asar: true,
    extraResource: ["src/computer-control.ps1"],
    executableName: "NOVA AI"
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "nova_ai",
        authors: "Ege",
        description: "EYRION AI masaüstü asistanı"
      }
    }
  ]
};
