// scripts/_electron_mock.cjs — mock do Electron usado pelos smoke tests
// (só para Node puro; não entra no build do instalador).

const os = require("node:os");
const path = require("node:path");

const handlers = new Map();
const userDataDir = path.join(os.tmpdir(), "orun-shield-smoke-userdata");

class FakeBrowserWindow {
  constructor(opts) {
    this.opts = opts;
    this._listeners = {};
  }
  once(event, cb) {
    this._listeners[event] = cb;
  }
  loadURL() {
    return Promise.resolve();
  }
  loadFile() {
    return Promise.resolve();
  }
  show() {}
}

FakeBrowserWindow.fromWebContents = () => null;

module.exports = {
  handlers,
  userDataDir,
  FakeBrowserWindow,
  app: {
    getPath: (name) => {
      switch (name) {
        case "userData":
          return userDataDir;
        case "home":
          return os.homedir();
        case "temp":
          return os.tmpdir();
        case "documents":
        case "desktop":
        case "pictures":
          return path.join(os.tmpdir(), "orun-smoke-fake-docs");
        default:
          return name;
      }
    },
    getAppPath: () => path.resolve(__dirname, ".."),
    getVersion: () => "0.0.0-smoke",
    getName: () => "Orun Shield",
    on: () => {},
    whenReady: () => Promise.resolve(),
    exit: () => {},
    quit: () => {},
  },
  ipcMain: {
    handle: (channel, fn) => handlers.set(channel, fn),
  },
  BrowserWindow: FakeBrowserWindow,
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
};
