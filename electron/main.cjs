const { app, BrowserWindow, Menu } = require("electron");
const path = require("node:path");

if (require("electron-squirrel-startup")) app.quit();
else {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    function createWindow() {
      const win = new BrowserWindow({
        width: 1440,
        height: 1000,
        minWidth: 800,
        minHeight: 640,
        show:
          !process.argv.includes("--smoke-test") &&
          !process.argv.includes("--test-window"),
        backgroundColor: "#f4f6f8",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.loadFile(path.join(__dirname, "../dist/index.html"));
      // Exercise the packaged renderer without opening a window during build QA.
      if (process.argv.includes("--smoke-test")) {
        win.webContents.once("did-finish-load", async () => {
          try {
            const result = await win.webContents.executeJavaScript(
              `({title: document.title, text: document.body.innerText.slice(0,500), ready: document.querySelector('main')?.dataset.count === '2112', records: document.querySelector('main')?.dataset.count, charts: ['map','scatter','comparison'].every(id => document.querySelector('#'+id+' svg'))})`,
            );
            require("node:fs").writeFileSync(
              process.env.ENSO_SMOKE_RESULT ||
                path.join(app.getPath("temp"), "enso-smoke.json"),
              JSON.stringify(result),
            );
            app.exit(result.ready ? 0 : 1);
          } catch {
            app.exit(2);
          }
        });
      }
      return win;
    }
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
