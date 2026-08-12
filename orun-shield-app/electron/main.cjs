// electron/main.cjs — ponto de entrada do Orun Shield standalone

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { initializeShield, shutdownShield } = require("./shield.cjs");
const { initializeOptimizer } = require("./optimizer.cjs");
const { CyberAi } = require("./cyber-ai.cjs");
const { AppIpcChannel } = require("./ipc-channels.cjs");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "Orun Shield",
    backgroundColor: "#09090b",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "dist", "index.html"));
  }
}

ipcMain.handle(AppIpcChannel.PICK_DIRECTORY, async (event, defaultPath) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  const result = await dialog.showOpenDialog(win, {
    title: "Selecionar pasta",
    defaultPath: defaultPath || undefined,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

let quitting = false;
app.on("before-quit", async (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  await shutdownShield();
  app.exit(0);
});

app.whenReady().then(() => {
  createWindow();
  const cyber = new CyberAi(app.getPath("userData"));
  initializeShield(mainWindow, { cyber });
  initializeOptimizer("shield-quarantine");
});

app.on("window-all-closed", () => {
  app.quit();
});
