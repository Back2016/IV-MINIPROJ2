module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "enso-weather-explorer",
    ignore: [
      /^\/(src|tests|scripts|data-raw|docs|test-results|playwright-report|out)(\/|$)/,
      /\.git/,
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "enso_weather_explorer",
        setupExe: "ENSO-Weather-Explorer-Setup.exe",
      },
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: { format: "ULFO" },
    },
    { name: "@electron-forge/maker-zip", platforms: ["win32", "darwin"] },
  ],
};
