// electron/shield.cjs — Orun Shield (motor) — app standalone
// Adaptação CJS da cola `orun-shield-integration` (TS). Instancia o
// ShieldCore do `@orun/shield-core` (vendored) e expõe handlers IPC
// request/response + eventos push para o renderer.

const { ipcMain, app } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("node:crypto");
const { ShieldCore } = require("@orun/shield-core");
const { ShieldIpcChannel, AiIpcChannel } = require("./ipc-channels.cjs");
const { listFixedDrives, execPowerShell } = require("./windows-apps.cjs");
const { CyberAi } = require("./cyber-ai.cjs");
const { getUpdateCheckResult } = require("./optimizer.cjs");

let shield = null;
let cyber = null;
let mainWindowRef = null;

function resolveRulesDir() {
  const candidates = [
    path.join(app.getAppPath(), "rules"),
    path.join(path.dirname(__dirname), "rules"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch { /* ignore */ }
  }
  return candidates[0];
}

// Resolve binário + banco do ClamAV em ordem de prioridade:
//   1) embutido no instalador (extraResources -> process.resourcesPath/clamav)
//   2) instalação do sistema (C:\Program Files\ClamAV, configurável via CLAMAV_DIR)
// Banco: usa o da pasta embutida/sistema se existir; senão %LOCALAPPDATA%\ClamAV\database
// (writable — permite freshclam atualizar assinaturas sem admin).
function resolveClamAVPaths() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "clamav"));
  }
  candidates.push(process.env.CLAMAV_DIR || "C:\\Program Files\\ClamAV");
  for (const dir of candidates) {
    try {
      const bin = path.join(dir, "clamscan.exe");
      if (fs.existsSync(bin)) {
        const dbCandidates = [
          path.join(dir, "database"),
          path.join(app.getPath("userData"), "clamav-database"),
          path.join(app.getPath("home"), "AppData", "Local", "ClamAV", "database"),
        ];
        const databasePath =
          dbCandidates.find((d) => fs.existsSync(path.join(d, "daily.cvd"))) ?? dbCandidates[1];
        return { binaryPath: bin, databasePath };
      }
    } catch { /* ignore */ }
  }
  return { binaryPath: "clamscan", databasePath: undefined };
}

// ---------------------------------------------------------------------------
// Validação de inputs vindos do renderer (IPC). Nunca confiar no conteúdo do
// renderer: cada valor é validado/tipado antes de chegar a spawn/regras.
// ---------------------------------------------------------------------------

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || value.includes("\0")) {
    throw new Error(`${label} inválido.`);
  }
  return value;
}

function assertAbsolutePath(value, label = "Caminho") {
  const v = assertString(value, label).replace(/^"|"$/g, "");
  if (!/^[a-zA-Z]:[\\/]|^\\\\/.test(v)) {
    throw new Error(`${label} deve ser absoluto (ex: C:\\pasta\\arquivo).`);
  }
  return v;
}

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function assertIp(value) {
  const v = assertString(value, "Endereço IP").trim();
  if (!IPV4_RE.test(v)) throw new Error("Endereço IP inválido.");
  return v;
}

// ---------------------------------------------------------------------------
// ClamAV: banco de assinaturas + atualização (freshclam).
// ---------------------------------------------------------------------------

/** Idade do banco de assinaturas pelo mtime dos .cvd/.cld mais recentes. */
function readClamavDatabaseInfo() {
  const { databasePath } = resolveClamAVPaths();
  if (!databasePath) return { databasePath: null, databaseAgeDays: null, databaseUpdatedAt: null };
  const names = ["daily.cvd", "daily.cld", "main.cvd", "main.cld", "bytecode.cvd"];
  let newest = null;
  for (const n of names) {
    try {
      const st = fs.statSync(path.join(databasePath, n));
      if (st.isFile() && (newest === null || st.mtimeMs > newest.mtimeMs)) newest = st;
    } catch { /* arquivo não existe ainda */ }
  }
  return {
    databasePath,
    databaseAgeDays: newest ? Math.max(0, Math.floor((Date.now() - newest.mtimeMs) / 86_400_000)) : null,
    databaseUpdatedAt: newest ? new Date(newest.mtimeMs).toISOString() : null,
  };
}

function resolveFreshclamBinary() {
  const dirs = [];
  if (process.resourcesPath) dirs.push(path.join(process.resourcesPath, "clamav"));
  dirs.push(process.env.CLAMAV_DIR || "C:\\Program Files\\ClamAV");
  for (const dir of dirs) {
    try {
      const bin = path.join(dir, "freshclam.exe");
      if (fs.existsSync(bin)) return bin;
    } catch { /* ignore */ }
  }
  return "freshclam";
}

/**
 * Atualiza as assinaturas via freshclam usando um datadir gravável
 * (userData/clamav-database) — o mesmo que o clamscan usa quando não há
 * banco embutido. Mais robusto que o updateDefinitions() do core no Windows.
 */
async function refreshClamavDefinitions() {
  if (!shield?.clamav) return { updated: false, log: "ClamAV não configurado neste ShieldCore." };
  const databasePath = path.join(app.getPath("userData"), "clamav-database");
  try { fs.mkdirSync(databasePath, { recursive: true }); } catch { /* best effort */ }
  const { spawn } = require("node:child_process");
  return new Promise((resolve) => {
    let out = "";
    let done = false;
    const finish = (updated, log) => { if (!done) { done = true; resolve({ updated, log }); } };
    let child;
    try {
      child = spawn(resolveFreshclamBinary(), ["--datadir", databasePath, "--no-warnings"], {
        windowsHide: true,
        timeout: 10 * 60_000,
      });
    } catch (err) {
      return finish(false, err instanceof Error ? err.message : String(err));
    }
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("error", (err) => finish(false, err.message));
    child.on("close", (code) => finish(code === 0, out.trim()));
  });
}

let clamavUpdateTimer = null;

/** Auto-update: correção inicial (banco velho) + varredura diária. */
function scheduleClamavUpdates() {
  setTimeout(async () => {
    try {
      const info = readClamavDatabaseInfo();
      if (info.databaseAgeDays === null || info.databaseAgeDays > 7) {
        console.log("[shield] Banco de assinaturas ClamAV antigo, atualizando em segundo plano...");
        const res = await refreshClamavDefinitions();
        console.log("[shield] freshclam:", res.updated ? "ok" : `falhou — ${res.log}`);
      }
    } catch (err) {
      console.warn("[shield] Falha no auto-update inicial:", err);
    }
  }, 15_000);

  clamavUpdateTimer = setInterval(() => {
    refreshClamavDefinitions()
      .then((res) => console.log("[shield] Auto-update de definições:", res.updated ? "ok" : res.log))
      .catch((err) => console.warn("[shield] Auto-update falhou:", err));
  }, 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Firewall: bloqueio real de IP via regra persistente do Windows.
// ---------------------------------------------------------------------------

/** Cria regra de bloqueio (entrada + saída) para um IPv4 via netsh advfirewall. */
async function blockIpReal(ip) {
  const clean = assertIp(ip);
  const ruleName = `Orun Shield: Block ${clean}`;
  await execPowerShell(`netsh advfirewall firewall add rule name="${ruleName}" dir=out action=block remoteip=${clean} profile=any`);
  await execPowerShell(`netsh advfirewall firewall add rule name="${ruleName}" dir=in action=block remoteip=${clean} profile=any`);
}

function initializeShield(mainWindow, opts = {}) {
  if (shield) return shield;
  const userDataDir = app.getPath("userData");
  const rulesDir = resolveRulesDir();
  const clamav = resolveClamAVPaths();
  mainWindowRef = mainWindow;
  cyber = opts.cyber ?? new CyberAi(userDataDir);
  shield = new ShieldCore({
    clamav: { useDaemon: false, ...clamav },
    virustotal: process.env.ORUN_VT_API_KEY ? { apiKey: process.env.ORUN_VT_API_KEY } : undefined,
    yara: { rulesDir },
    sentinel: {
      process: {
        cpuThresholdPercent: 75,
        allowlist: ["electron.exe", "node.exe", "orun shield.exe", "orun shield"],
      },
      network: {
        allowlistHosts: [],
      },
      fileIntegrity: {
        watchPaths: process.platform === "win32"
          ? [path.join(app.getPath("home"), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup")]
          : [],
      },
      ransomwareHeuristic: {
        watchPaths: [app.getPath("documents"), app.getPath("desktop"), app.getPath("pictures")],
        fileEventThreshold: 20,
        windowMs: 10_000,
      },
    },
    autoBlockCriticalNetworkThreats: false,
    quarantine: { quarantineDir: path.join(userDataDir, "shield-quarantine") },
    autoQuarantineCriticalFileThreats: false,
  });

  shield.on("threat:detected", (finding) => {
    try { mainWindow.webContents.send(ShieldIpcChannel.THREAT_DETECTED, finding); } catch { /* janela destruída */ }
  });
  shield.on("scan:started", (payload) => {
    try { mainWindow.webContents.send(ShieldIpcChannel.SCAN_STARTED, payload); } catch { /* janela destruída */ }
  });
  shield.on("scan:finished", (result) => {
    try { mainWindow.webContents.send(ShieldIpcChannel.SCAN_FINISHED, result); } catch { /* janela destruída */ }
  });
  shield.on("error", (payload) => {
    try { mainWindow.webContents.send(ShieldIpcChannel.SHIELD_ERROR, payload); } catch { /* janela destruída */ }
  });

  registerIpcHandlers();
  registerAiHandlers();
  scheduleClamavUpdates();
  console.log("[shield] Orun Shield inicializado");
  return shield;
}

/** Scan completo do PC: todas as unidades fixas, ClamAV + YARA por unidade, com progresso. */
async function scanPc() {
  const drives = await listFixedDrives();
  const startedAt = new Date().toISOString();
  const allFindings = [];
  const results = [];
  let totalFilesScanned = 0;
  const send = (payload) => {
    try { mainWindowRef.webContents.send(ShieldIpcChannel.SCAN_PC_PROGRESS, payload); } catch { /* janela destruída */ }
  };

  if (drives.length === 0) {
    return { startedAt, finishedAt: startedAt, drives: [], totalFilesScanned: 0, findings: [] };
  }

  for (let i = 0; i < drives.length; i++) {
    const drive = drives[i];
    const target = `${drive}\\`;
    send({ drive, index: i, total: drives.length, status: "scanning" });
    try {
      // fullScan pode demorar muito numa unidade inteira (ClamAV); os eventos
      // de progresso mantêm a UI informada enquanto roda.
      const res = await shield.fullScan(target, true);
      const findings = [...(res.clamav?.findings ?? []), ...(res.yara ?? [])];
      results.push({ drive, target, filesScanned: res.clamav?.filesScanned ?? 0, findingsCount: findings.length, error: null });
      allFindings.push(...findings);
      totalFilesScanned += res.clamav?.filesScanned ?? 0;
    } catch (err) {
      results.push({
        drive,
        target,
        filesScanned: 0,
        findingsCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    send({ drive, index: i, total: drives.length, status: "done" });
  }

  return { startedAt, finishedAt: new Date().toISOString(), drives: results, totalFilesScanned, findings: allFindings };
}

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

/** Lê o estado dos perfis do firewall via netsh (português ou inglês). */
async function getFirewallProfiles() {
  try {
    const out = await execPowerShell("netsh advfirewall show allprofiles state");
    const profiles = [];
    let current = null;
    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trim();
      const pt = line.match(/^Perfil\s+(?:do\s+)?([^\s:]+)\s+Configura/i);
      const en = line.match(/^([^\s:]+)\s+Profile Settings/i);
      if (pt) { current = pt[1]; continue; }
      if (en) { current = en[1]; continue; }
      const state = line.match(/^(?:Estado|State)\s+(Ligado|Desligado|ON|OFF)\b/i);
      if (state && current) {
        const raw = state[1].toLowerCase();
        profiles.push({ profile: current, enabled: raw === "ligado" || raw === "on" });
        current = null;
      }
    }
    return profiles;
  } catch {
    return [];
  }
}

/**
 * Scan de vulnerabilidades do PC: defensas do Windows (Defender), firewall
 * e pacotes desatualizados (via winget do Optimizer). Cada item vira uma
 * entrada consumível pelo painel de IA do Sentinela.
 */
async function scanVulnerabilities() {
  const items = [];
  const [defender, firewall, updates] = await Promise.all([
    shield.getDefenderStatus().catch(() => null),
    getFirewallProfiles(),
    getUpdateCheckResult().catch(() => null),
  ]);

  // --- Windows Defender ---
  if (!defender) {
    items.push({
      id: crypto.randomUUID(),
      severity: "info",
      category: "defender",
      title: "Não foi possível consultar o Windows Defender",
      description: "O comando de status do Defender falhou (privilégios ou módulo indisponível).",
      remediation: "Abra o Windows Security manualmente e confira se a proteção está ativa.",
    });
  } else if (!defender.available) {
    items.push({
      id: crypto.randomUUID(),
      severity: "info",
      category: "defender",
      title: "Windows Defender indisponível",
      description: "O Defender não é o antivírus primário desta máquina (ou está com o serviço inativo).",
      remediation: "Nenhuma ação necessária se outro antivírus estiver assumindo a proteção.",
    });
  } else {
    if (!defender.realTimeProtectionEnabled) {
      items.push({
        id: crypto.randomUUID(),
        severity: "critical",
        category: "defender",
        title: "Proteção em tempo real desligada",
        description: "O Windows Defender está com a proteção em tempo real desativada — malware pode entrar sem ser visto.",
        remediation: "Ligue a proteção em tempo real em Segurança do Windows → Proteção contra vírus e ameaças.",
      });
    }
    if (!defender.antivirusEnabled) {
      items.push({
        id: crypto.randomUUID(),
        severity: "high",
        category: "defender",
        title: "Antivírus do Defender desativado",
        description: "A proteção antivírus do Defender está desligada.",
        remediation: "Ative a proteção antivírus no Windows Security.",
      });
    }
    const age = defender.signatureAgeDays;
    if (typeof age === "number" && age > 14) {
      items.push({
        id: crypto.randomUUID(),
        severity: "high",
        category: "defender",
        title: `Assinaturas do Defender muito antigas (${age} dias)`,
        description: "Assinaturas desatualizadas deixam o antivírus cego a ameaças recentes.",
        remediation: "Atualize as assinaturas (botão no painel do Defender ou em Segurança do Windows).",
      });
    } else if (typeof age === "number" && age > 7) {
      items.push({
        id: crypto.randomUUID(),
        severity: "medium",
        category: "defender",
        title: `Assinaturas do Defender com ${age} dias`,
        description: "As assinaturas estão envelhecendo — ideal atualizar semanalmente.",
        remediation: "Atualize as assinaturas do Defender.",
      });
    }
  }

  // --- Firewall ---
  if (firewall.length === 0) {
    items.push({
      id: crypto.randomUUID(),
      severity: "low",
      category: "firewall",
      title: "Não foi possível ler o estado do firewall",
      description: "O comando netsh não retornou perfis legíveis.",
      remediation: "Confira o Firewall do Windows em Segurança do Windows → Firewall e proteção de rede.",
    });
  }
  for (const p of firewall) {
    if (!p.enabled) {
      items.push({
        id: crypto.randomUUID(),
        severity: "high",
        category: "firewall",
        title: `Firewall desligado no perfil ${p.profile}`,
        description: "Com o firewall desligado, conexões de entrada não são filtradas.",
        remediation: `Ligue o firewall no perfil ${p.profile} (Segurança do Windows → Firewall e proteção de rede).`,
      });
    }
  }

  // --- Pacotes desatualizados (winget via Optimizer) ---
  const outdated = updates?.outdated ?? [];
  for (const pkg of outdated.slice(0, 25)) {
    items.push({
      id: crypto.randomUUID(),
      severity: "medium",
      category: "update",
      title: `${pkg.displayName} desatualizado`,
      description: `${pkg.currentVersion} → ${pkg.availableVersion} (via ${pkg.source})`,
      remediation: `Atualize "${pkg.displayName}" na aba Atualizações do Otimizador.`,
    });
  }
  if (outdated.length > 25) {
    items.push({
      id: crypto.randomUUID(),
      severity: "medium",
      category: "update",
      title: `${outdated.length - 25} pacotes adicionais desatualizados`,
      description: `Há mais atualizações pendentes além das listadas (${outdated.length} no total).`,
      remediation: "Verifique a aba Atualizações do Otimizador para o restante.",
    });
  }

  const sorted = [...items].sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
  const count = (s) => sorted.filter((i) => i.severity === s).length;

  return {
    scannedAt: new Date().toISOString(),
    items: sorted,
    summary: {
      total: sorted.length,
      critical: count("critical"),
      high: count("high"),
      medium: count("medium"),
      low: count("low"),
      info: count("info"),
    },
  };
}

function registerIpcHandlers() {
  ipcMain.handle(ShieldIpcChannel.START_MONITORING, () => {
    shield.startMonitoring();
  });

  ipcMain.handle(ShieldIpcChannel.STOP_MONITORING, async () => {
    await shield.stopMonitoring();
  });

  ipcMain.handle(ShieldIpcChannel.FULL_SCAN, async (_event, req) => {
    const targetPath = assertAbsolutePath(req?.targetPath, "Caminho do scan");
    return shield.fullScan(targetPath, req.recursive !== false);
  });

  ipcMain.handle(ShieldIpcChannel.GET_FINDINGS_LOG, () => {
    return shield.getFindingsLog();
  });

  ipcMain.handle(ShieldIpcChannel.CHECK_CLAMAV_AVAILABILITY, async () => {
    if (!shield.clamav) return { available: false, ...readClamavDatabaseInfo() };
    const base = await shield.clamav.checkAvailability();
    return { ...base, ...readClamavDatabaseInfo() };
  });

  ipcMain.handle(ShieldIpcChannel.UPDATE_DEFINITIONS, async () => {
    if (!shield.clamav) return { updated: false, log: "ClamAV não configurado neste ShieldCore." };
    return refreshClamavDefinitions();
  });

  ipcMain.handle(ShieldIpcChannel.BLOCK_IP, async (_event, ip) => {
    await blockIpReal(ip);
    if (shield.firewall?.blockIP) {
      try { await shield.firewall.blockIP(ip); } catch { /* best effort — regra persistente já criada */ }
    }
  });

  ipcMain.handle(ShieldIpcChannel.QUARANTINE_FINDING, async (_event, finding) => {
    return shield.quarantineFinding(finding);
  });

  ipcMain.handle(ShieldIpcChannel.LIST_QUARANTINE, async () => {
    if (!shield.quarantineManager) return [];
    return shield.quarantineManager.list();
  });

  ipcMain.handle(ShieldIpcChannel.RESTORE_QUARANTINE, async (_event, id) => {
    if (!shield.quarantineManager) return { success: false, error: "Quarentena não configurada." };
    return shield.quarantineManager.restore(id);
  });

  ipcMain.handle(ShieldIpcChannel.DELETE_QUARANTINE, async (_event, id) => {
    if (!shield.quarantineManager) return { success: false, error: "Quarentena não configurada." };
    return shield.quarantineManager.permanentlyDelete(id);
  });

  ipcMain.handle(ShieldIpcChannel.ANALYZE_FILE, async (_event, filePath) => {
    return shield.analyzeFile(assertAbsolutePath(filePath, "Arquivo"));
  });

  ipcMain.handle(ShieldIpcChannel.GET_PROCESS_TREE, async () => {
    return shield.getProcessTree();
  });

  ipcMain.handle(ShieldIpcChannel.GET_DEFENDER_STATUS, async () => {
    return shield.getDefenderStatus();
  });

  ipcMain.handle(ShieldIpcChannel.SYNC_DEFENDER_THREATS, async () => {
    return shield.syncDefenderThreats();
  });

  ipcMain.handle(ShieldIpcChannel.DEFENDER_QUICK_SCAN, async () => {
    try {
      await shield.defender.startQuickScan();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(ShieldIpcChannel.DEFENDER_UPDATE_SIGNATURES, async () => {
    return shield.defender.updateSignatures();
  });

  ipcMain.handle(ShieldIpcChannel.SCAN_PC, async () => {
    return scanPc();
  });

  ipcMain.handle(ShieldIpcChannel.SCAN_VULNERABILITIES, async () => {
    return scanVulnerabilities();
  });
}

function registerAiHandlers() {
  ipcMain.handle(AiIpcChannel.STATUS, async () => cyber.getStatus());
  ipcMain.handle(AiIpcChannel.GET_CONFIG, async () => ({ ...cyber.config }));
  ipcMain.handle(AiIpcChannel.SAVE_CONFIG, async (_event, partial) => cyber.saveConfig(partial));
  ipcMain.handle(AiIpcChannel.TEST_CONNECTION, async () => cyber.testConnection());
  ipcMain.handle(AiIpcChannel.EXPLAIN_FINDING, async (_event, finding) => cyber.explainFinding(finding));
  ipcMain.handle(AiIpcChannel.SUMMARIZE_FINDINGS, async (_event, findings) => cyber.summarizeFindings(findings));
  ipcMain.handle(AiIpcChannel.ANALYZE_VULNERABILITIES, async (_event, items) => cyber.analyzeVulnerabilities(items));
  ipcMain.handle(AiIpcChannel.ANALYZE_APPS, async (_event, recommendations) => cyber.analyzeApps(recommendations));
}

async function shutdownShield() {
  if (clamavUpdateTimer) {
    clearInterval(clamavUpdateTimer);
    clamavUpdateTimer = null;
  }
  if (shield) {
    try { await shield.stopMonitoring(); } catch { /* best effort */ }
    shield = null;
  }
}

module.exports = {
  initializeShield,
  shutdownShield,
  scanPc,
  scanVulnerabilities,
  refreshClamavDefinitions,
  ShieldIpcChannel,
  AiIpcChannel,
};
