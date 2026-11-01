export default {
  packagerConfig: {
    asar: true,
    executableName: "NOVA AI"
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "nova_ai",
        authors: "Ege",
        description: "NOVA AI masaüstü asistanı"
      }
    }
  ]
};
