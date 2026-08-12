// electron/main.cjs — ponto de entrada do Orun Shield standalone

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const { initializeShield, shutdownShield, scanPc, refreshClamavDefinitions } = require("./shield.cjs");
const { initializeOptimizer } = require("./optimizer.cjs");
const { CyberAi } = require("./cyber-ai.cjs");
const { AppIpcChannel } = require("./ipc-channels.cjs");

let mainWindow = null;
let tray = null;
let quitting = false;

function getWindowIcon() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "logo", "logo.png")
    : path.join(__dirname, "..", "renderer", "public", "logo.png");
  return iconPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "Orun Shield",
    backgroundColor: "#0b0d10",
    icon: getWindowIcon(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Fechar (X) minimiza para a bandeja em vez de encerrar — o Shield segue
  // monitorando em segundo plano. "Sair" pelo menu da bandeja encerra de vez.
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "dist", "index.html"));
  }
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  let icon;
  try {
    icon = nativeImage.createFromPath(getWindowIcon());
    if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip("Orun Shield — proteção ativa");
  tray.on("click", showMainWindow);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Orun Shield", click: showMainWindow },
      { type: "separator" },
      {
        label: "Escanear todo o PC",
        click: () => {
          scanPc().catch((err) => console.warn("[tray] Scan falhou:", err));
        },
      },
      {
        label: "Atualizar definições ClamAV",
        click: () => {
          refreshClamavDefinitions()
            .then((res) => console.log("[tray] freshclam:", res.updated ? "ok" : res.log))
            .catch((err) => console.warn("[tray] Atualização de definições falhou:", err));
        },
      },
      { type: "separator" },
      {
        label: "Sair",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
}

ipcMain.handle(AppIpcChannel.PICK_DIRECTORY, async (event, defaultPath) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  const cleanPath =
    typeof defaultPath === "string" && defaultPath.length <= 4096 && !defaultPath.includes("\0") ? defaultPath : undefined;
  const result = await dialog.showOpenDialog(win, {
    title: "Selecionar pasta",
    defaultPath: cleanPath,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle(AppIpcChannel.GET_APP_INFO, () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron ?? "",
  node: process.versions.node ?? "",
}));

app.on("before-quit", async (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  await shutdownShield();
  app.exit(0);
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  const cyber = new CyberAi(app.getPath("userData"));
  initializeShield(mainWindow, { cyber });
  initializeOptimizer("shield-quarantine");
});

app.on("window-all-closed", () => {
  if (!quitting) app.quit();
});
