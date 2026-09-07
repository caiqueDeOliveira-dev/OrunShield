// electron/main.cjs — ponto de entrada do Orun Shield standalone

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell, safeStorage } = require("electron");
const path = require("path");
const { fileURLToPath } = require("url");
const { randomUUID } = require("crypto");
const Store = require("electron-store");
const { initializeShield, shutdownShield, scanPc, refreshClamavDefinitions } = require("./shield.cjs");
const { initializeOptimizer } = require("./optimizer.cjs");
const { CyberAi } = require("./cyber-ai.cjs");
const { AppIpcChannel } = require("./ipc-channels.cjs");
const { ElectronVpnBackend } = require("@orun/vpn-electron");
const { VpnServerConfigSchema, VpnPeerSchema, VpnProfileSchema } = require("@orun/vpn-core");
const { ElectronSecureTokenStore } = require("@orun/identity");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let tray = null;
let quitting = false;

// Identity secure token store (para secrets do VPN, licenças, etc.)
const identityBackend = {
  read: async (key) => {
    try {
      const data = await Store.get(key);
      return data ? Buffer.from(data, 'base64') : null;
    } catch { return null; }
  },
  write: async (key, value) => {
    await Store.set(key, value.toString('base64'));
  },
  delete: async (key) => {
    await Store.delete(key);
  },
  clearAll: async () => {
    await Store.clear();
  },
};

const identityStore = new ElectronSecureTokenStore(
  { isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(), encryptString: (s) => safeStorage.encryptString(s), decryptString: (b) => safeStorage.decryptString(b) },
  identityBackend
);

// VPN store & backends
const vpnStore = new Store({ name: "orun-vpn-config", defaults: { servers: [] } });
const backendInstances = new Map();

function getBackend(serverId) {
  if (!backendInstances.has(serverId)) {
    const secretStore = {
      get: async (ref) => {
        // Busca no identity store (chave: vpn:peer:<peerId>:privateKey)
        const key = `vpn:peer:${ref}:privateKey`;
        return await identityStore.getItem(key);
      },
      set: async (ref, value) => {
        const key = `vpn:peer:${ref}:privateKey`;
        await identityStore.setItem(key, value);
      },
      delete: async (ref) => {
        const key = `vpn:peer:${ref}:privateKey`;
        await identityStore.removeItem(key);
      },
    };
    backendInstances.set(serverId, new ElectronVpnBackend(secretStore));
  }
  return backendInstances.get(serverId);
}

// VPN IPC handlers
ipcMain.handle("vpn:get-config", () => ({
  servers: vpnStore.get("servers"),
}));

ipcMain.handle("vpn:add-server", async (_e, server) => {
  const newServer = {
    id: randomUUID(),
    ...server,
    createdAt: new Date().toISOString(),
    peers: [],
  };
  const servers = vpnStore.get("servers");
  vpnStore.set("servers", [...servers, newServer]);
  return { ok: true, id: newServer.id };
});

ipcMain.handle("vpn:remove-server", async (_e, id) => {
  const servers = vpnStore.get("servers").filter(s => s.id !== id);
  vpnStore.set("servers", servers);
  backendInstances.delete(id);
  return { ok: true };
});

ipcMain.handle("vpn:get-peers", async (_e, serverId) => {
  const server = vpnStore.get("servers").find(s => s.id === serverId);
  return server?.peers || [];
});

ipcMain.handle("vpn:connect", async (_e, serverId, peerId) => {
  try {
    const servers = vpnStore.get("servers");
    const server = servers.find(s => s.id === serverId);
    const peer = server?.peers.find(p => p.id === peerId);
    if (!server || !peer) return { ok: false, error: "Servidor ou peer não encontrado" };

    const backend = getBackend(serverId);

    const serverConfig = VpnServerConfigSchema.parse(server);
    const peerConfig = VpnPeerSchema.parse(peer);
    const profileConfig = VpnProfileSchema.parse({
      id: `profile-${peerId}`,
      serverId: server.id,
      peerId: peer.id,
      privateKeySecretRef: peer.id,
      autoConnect: false,
      killSwitch: false,
    });

    await backend.connect(profileConfig, peerConfig, serverConfig);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("vpn:disconnect", async (_e, serverId) => {
  try {
    const backend = getBackend(serverId);
    await backend.disconnect();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("vpn:get-state", async (_e, serverId) => {
  try {
    const backend = getBackend(serverId);
    return await backend.getState();
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("vpn:set-kill-switch", async (_e, serverId, enabled) => {
  try {
    const backend = getBackend(serverId);
    await backend.setKillSwitch(enabled);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("vpn:provision-peer", async (_e, serverId, name) => {
  try {
    const servers = vpnStore.get("servers");
    const server = servers.find(s => s.id === serverId);
    if (!server) return { ok: false, error: "Servidor não encontrado" };

    const { WgEasyClient } = require("@orun/vpn-core");

    let adminPassword = vpnStore.get("adminPassword");
    if (!adminPassword) {
      return { ok: false, error: "Senha admin do wg-easy não configurada" };
    }

    const client = new WgEasyClient({
      baseUrl: `${server.useTls ? "https" : "http"}://${server.host}:${server.apiPort}`,
    });

    await client.login("admin", adminPassword);
    const peer = await client.createPeer(name, server.id);
    const config = await client.getPeerConfig(peer.id);
    const qr = await client.getPeerQrCodeSvg(peer.id);

    const newPeer = {
      id: peer.id,
      serverId: server.id,
      name: peer.name,
      publicKey: peer.publicKey,
      presharedKey: peer.presharedKey,
      address: peer.address,
      enabled: true,
      createdAt: new Date().toISOString(),
      latestHandshakeAt: null,
      transferRx: 0,
      transferTx: 0,
    };

    // Guardar privateKey no identity store (seguro, criptografado)
    await identityStore.setItem(`vpn:peer:${peer.id}:privateKey`, peer.privateKey);

    const updatedServers = servers.map(s => {
      if (s.id === serverId) return { ...s, peers: [...(s.peers || []), newPeer] };
      return s;
    });
    vpnStore.set("servers", updatedServers);

    return { ok: true, peer: { id: peer.id, name: peer.name, config, qr } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle(AppIpcChannel.PICK_DIRECTORY, async (event, defaultPath) => {
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
