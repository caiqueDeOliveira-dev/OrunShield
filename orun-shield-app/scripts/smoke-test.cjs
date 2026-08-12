// scripts/smoke-test.cjs — testes de sanidade do produto Orun Shield
// Roda em Node puro (sem Electron GUI). Cobre:
//   · cyber-ai.cjs      — config, persistência, fallbacks determinísticos, testConnection
//   · windows-apps.cjs  — resolução de exe, último uso, drives (PS real)
//   · shield.cjs        — inicialização do motor + registro de canais IPC
//   · optimizer.cjs     — inicialização do motor + registro de canais IPC
//   · contratos IPC     — invoca handlers-chave e valida o shape da resposta
// Uso: npm test

const assert = require("node:assert");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

// ---- intercepta require("electron") ANTES de carregar shield/optimizer ----
const electronMockPath = path.join(__dirname, "_electron_mock.cjs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "electron") return electronMockPath;
  return origResolve.call(this, request, ...args);
};
const { handlers, userDataDir } = require(electronMockPath);

const ROOT = path.resolve(__dirname, "..");
const SMOKE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "orun-smoke-"));

let pass = 0;
let fail = 0;
const pending = [];

function test(name, fn) {
  try {
    fn();
    console.log("  ok  " + name);
    pass++;
  } catch (err) {
    console.error("  FAIL " + name + "\n      " + (err && err.stack ? err.stack.split("\n").slice(0, 3).join("\n      ") : err));
    fail++;
  }
}

function testAsync(name, fn) {
  const p = (async () => {
    try {
      await fn();
      console.log("  ok  " + name);
      pass++;
    } catch (err) {
      console.error("  FAIL " + name + "\n      " + (err && err.stack ? err.stack.split("\n").slice(0, 3).join("\n      ") : err));
      fail++;
    }
  })();
  pending.push(p);
}

const section = (t) => console.log("\n== " + t + " ==");

const FAKE_FINDING = {
  id: "smoke-1",
  source: "clamav",
  severity: "high",
  title: "EICAR test file",
  description: "Arquivo de teste de antivírus detectado.",
  filePath: "C:\\temp\\eicar.com",
};

const FAKE_VULN = {
  id: "v-1",
  severity: "medium",
  category: "firewall",
  title: "Firewall desligado no perfil Público",
  description: "Conexões de entrada não são filtradas.",
  remediation: "Ligue o firewall no perfil Público.",
};

// ============================ cyber-ai.cjs ============================
section("cyber-ai.cjs");

const { CyberAi } = require("../electron/cyber-ai.cjs");

test("config defaults (ollama/localhost/llama3.2)", () => {
  const ai = new CyberAi(SMOKE_DIR);
  assert.strictEqual(ai.config.provider, "ollama");
  assert.strictEqual(ai.config.baseUrl, "http://localhost:11434");
  assert.strictEqual(ai.config.model, "llama3.2");
  assert.strictEqual(typeof ai.config.apiKey, "string");
});

test("saveConfig faz merge e persiste no disco", () => {
  const ai = new CyberAi(SMOKE_DIR);
  const saved = ai.saveConfig({ provider: "openai-compatible", apiKey: "" });
  assert.strictEqual(saved.provider, "openai-compatible");
  assert.strictEqual(saved.model, "llama3.2"); // preserva default
  assert.ok(fs.existsSync(path.join(SMOKE_DIR, "ai-config.json")));
  const reloaded = new CyberAi(SMOKE_DIR);
  assert.strictEqual(reloaded.config.provider, "openai-compatible");
});

testAsync("explainFinding cai no fallback determinístico sem provider", async () => {
  const ai = new CyberAi(SMOKE_DIR); // provider openai-compatible sem apiKey → falha sem rede
  const r = await ai.explainFinding(FAKE_FINDING);
  assert.strictEqual(r.isFallback, true);
  assert.strictEqual(r.findingId, "smoke-1");
  assert.ok(r.explanation.length > 0, "explicação não pode ser vazia");
  assert.ok(r.explanation.includes("EICAR test file"));
});

testAsync("explainFinding usa cache (não re-executa)", async () => {
  const ai = new CyberAi(SMOKE_DIR);
  const a = await ai.explainFinding(FAKE_FINDING);
  const b = await ai.explainFinding(FAKE_FINDING);
  assert.strictEqual(a, b);
});

testAsync("summarizeFindings vazio → texto fixo", async () => {
  const ai = new CyberAi(SMOKE_DIR);
  const r = await ai.summarizeFindings([]);
  assert.ok(r.length > 0);
});

testAsync("summarizeFindings com itens → resumo não vazio (fallback)", async () => {
  const ai = new CyberAi(SMOKE_DIR);
  const r = await ai.summarizeFindings([FAKE_FINDING]);
  assert.ok(r.length > 0);
});

testAsync("analyzeVulnerabilities vazio → texto fixo", async () => {
  const ai = new CyberAi(SMOKE_DIR);
  const r = await ai.analyzeVulnerabilities([]);
  assert.ok(r.includes("Nenhuma vulnerabilidade"));
});

testAsync("analyzeVulnerabilities com itens → parecer com remediação (fallback)", async () => {
  const ai = new CyberAi(SMOKE_DIR);
  const r = await ai.analyzeVulnerabilities([FAKE_VULN]);
  assert.ok(r.includes("Firewall desligado"));
  assert.ok(r.includes("Ligue o firewall"));
});

testAsync("analyzeApps vazio → texto fixo", async () => {
  const ai = new CyberAi(SMOKE_DIR);
  const r = await ai.analyzeApps([]);
  assert.ok(r.length > 0);
});

testAsync("testConnection falha com mensagem clara sem apiKey", async () => {
  const ai = new CyberAi(SMOKE_DIR);
  const r = await ai.testConnection();
  assert.strictEqual(r.ok, false);
  assert.ok(r.message.length > 0);
  assert.ok(r.provider === "openai-compatible");
});

// ============================ windows-apps.cjs ============================
section("windows-apps.cjs");

const apps = require("../electron/windows-apps.cjs");

testAsync("resolveAppExecutable encontra .exe no InstallLocation", async () => {
  const dir = fs.mkdtempSync(path.join(SMOKE_DIR, "apploc-"));
  fs.writeFileSync(path.join(dir, "MyApp.exe"), "x");
  fs.writeFileSync(path.join(dir, "unins000.exe"), "x");
  const app = { installLocation: dir, displayName: "MyApp" };
  const resolved = await apps.resolveAppExecutable(app, []);
  assert.strictEqual(resolved, path.join(dir, "MyApp.exe"));
});

testAsync("resolveAppExecutable usa atalho do Start Menu como fallback", async () => {
  const dir = fs.mkdtempSync(path.join(SMOKE_DIR, "appsh-"));
  const exe = path.join(dir, "CoolApp.exe");
  fs.writeFileSync(exe, "x");
  const app = { installLocation: "", displayName: "CoolApp" };
  const resolved = await apps.resolveAppExecutable(app, [{ name: "CoolApp", target: exe }]);
  assert.strictEqual(resolved, exe);
});

test("appLastUsed lê mtime/atime e estima dias desde o último uso", () => {
  const dir = fs.mkdtempSync(path.join(SMOKE_DIR, "usage-"));
  const exe = path.join(dir, "App.exe");
  fs.writeFileSync(exe, "x");
  const now = Date.now();
  fs.utimesSync(exe, new Date(now - 1000 * 60 * 60 * 24 * 120), new Date(now - 1000 * 60 * 60 * 24 * 120));
  const u = apps.appLastUsed(exe);
  assert.strictEqual(u.exePath, exe);
  assert.ok(u.lastUsedDaysAgo >= 119 && u.lastUsedDaysAgo <= 121, `esperado ~120 dias, veio ${u.lastUsedDaysAgo}`);
});

test("appLastUsed em arquivo inexistente → nulls seguros", () => {
  const u = apps.appLastUsed(path.join(SMOKE_DIR, "nao-existe.exe"));
  assert.strictEqual(u.lastUsedDaysAgo, null);
  assert.strictEqual(u.sizeBytes, 0);
});

testAsync("listFixedDrives roda PowerShell real e retorna array", async () => {
  const drives = await apps.listFixedDrives();
  assert.ok(Array.isArray(drives));
  if (drives.length > 0) assert.match(drives[0], /^[A-Z]:$/);
});

// ============================ shield.cjs + optimizer.cjs ============================
section("shield.cjs + optimizer.cjs (mocks do Electron, motores reais)");

const { ShieldIpcChannel, AiIpcChannel, OptimizerIpcChannel } = require("../electron/ipc-channels.cjs");
const shieldMod = require("../electron/shield.cjs");
const optimizerMod = require("../electron/optimizer.cjs");

const fakeWindow = { webContents: { send: () => {} } };

test("initializeShield registra todos os canais Shield (request/response)", () => {
  shieldMod.initializeShield(fakeWindow, { cyber: new CyberAi(SMOKE_DIR) });
  const registered = new Set(handlers.keys());
  for (const ch of Object.values(ShieldIpcChannel)) {
    if (ch.startsWith("shield:event:")) continue; // eventos são push via webContents.send, não handle
    assert.ok(registered.has(ch), `canal Shield ausente: ${ch}`);
  }
});

test("initializeShield registra todos os canais Ai", () => {
  const registered = new Set(handlers.keys());
  for (const ch of Object.values(AiIpcChannel)) {
    assert.ok(registered.has(ch), `canal Ai ausente: ${ch}`);
  }
});

test("initializeOptimizer registra todos os canais Optimizer", () => {
  optimizerMod.initializeOptimizer("shield-quarantine");
  const registered = new Set(handlers.keys());
  for (const ch of Object.values(OptimizerIpcChannel)) {
    assert.ok(registered.has(ch), `canal Optimizer ausente: ${ch}`);
  }
});

test("shutdownShield existe e é idempotente", async () => {
  await shieldMod.shutdownShield();
  await shieldMod.shutdownShield();
});

test("scanPc e scanVulnerabilities são funções exportadas", () => {
  assert.strictEqual(typeof shieldMod.scanPc, "function");
  assert.strictEqual(typeof shieldMod.scanVulnerabilities, "function");
});

// ---- contratos IPC: invoca handlers-chave e valida o shape ----
section("contratos IPC (invocação direta de handlers)");

const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);

testAsync("ai:get-config retorna objeto completo", async () => {
  const cfg = await invoke(AiIpcChannel.GET_CONFIG);
  assert.ok(cfg && typeof cfg === "object");
  assert.ok(typeof cfg.provider === "string");
  assert.ok(typeof cfg.model === "string");
  assert.ok(typeof cfg.baseUrl === "string");
  assert.ok(typeof cfg.apiKey === "string");
});

testAsync("ai:save-config retorna config mesclada", async () => {
  const cfg = await invoke(AiIpcChannel.SAVE_CONFIG, { model: "teste-model" });
  assert.strictEqual(cfg.model, "teste-model");
});

testAsync("ai:status retorna shape esperado", async () => {
  const s = await invoke(AiIpcChannel.STATUS);
  assert.ok(typeof s.configuredProvider === "string");
  assert.ok(typeof s.model === "string");
  assert.ok(typeof s.ollamaAvailable === "boolean");
  assert.ok(typeof s.ready === "boolean");
});

testAsync("ai:explain-finding sempre devolve explicação (fallback ok)", async () => {
  const r = await invoke(AiIpcChannel.EXPLAIN_FINDING, FAKE_FINDING);
  assert.ok(r.explanation.length > 0);
  assert.strictEqual(typeof r.isFallback, "boolean");
});

testAsync("shield:check-clamav-availability retorna shape", async () => {
  const r = await invoke(ShieldIpcChannel.CHECK_CLAMAV_AVAILABILITY);
  assert.ok(typeof r.available === "boolean");
});

test("ai:test-connection é registrado", () => {
  assert.ok(handlers.has(AiIpcChannel.TEST_CONNECTION), "TEST_CONNECTION não registrado");
});

// ============================ main.cjs (app) ============================
section("main.cjs (registro dos canais de app)");

const mainMod = require("../electron/main.cjs");

test("app:get-info é registrado (nova aba Configurações)", () => {
  const { AppIpcChannel } = require("../electron/ipc-channels.cjs");
  assert.ok(handlers.has(AppIpcChannel.GET_APP_INFO), "GET_APP_INFO não registrado");
});

testAsync("app:get-info retorna nome/versão/plataforma", async () => {
  const { AppIpcChannel } = require("../electron/ipc-channels.cjs");
  const info = await invoke(AppIpcChannel.GET_APP_INFO);
  assert.ok(info.name && typeof info.name === "string");
  assert.ok(typeof info.version === "string");
  assert.ok(typeof info.platform === "string");
  assert.strictEqual(info.platform, process.platform);
});

testAsync("app:pick-directory retorna null quando o diálogo cancela", async () => {
  const { AppIpcChannel } = require("../electron/ipc-channels.cjs");
  const picked = await invoke(AppIpcChannel.PICK_DIRECTORY, "");
  assert.strictEqual(picked, null);
});

// ---- limpeza ----
Promise.all(pending).then(() => {
  fs.rmSync(SMOKE_DIR, { recursive: true, force: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });

  console.log(`\n${pass} passaram, ${fail} falharam`);
  process.exit(fail > 0 ? 1 : 0);
});
