// electron/windows-apps.cjs — inventário de apps instalados no Windows
// Lê o registry de Uninstall (HKLM 64/32 + HKCU), resolve o executável
// principal via atalhos do Start Menu (COM) e estima o último uso pelo
// mtime/atime do binário. Tudo via PowerShell (mesmo padrão do DefenderBridge).
// É Windows-only; fora do win32 as funções retornam arrays vazios/seguro.

const { spawn } = require("node:child_process");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const IS_WIN = os.platform() === "win32";

function execPowerShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`PowerShell finalizou com código ${code}: ${stderr || stdout}`));
    });
  });
}

/** Retorna as letras das unidades fixas (DriveType 3), ex: ["C:", "D:"]. */
async function listFixedDrives() {
  if (!IS_WIN) return [];
  try {
    const out = await execPowerShell(
      "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object -ExpandProperty DeviceID | ConvertTo-Json"
    );
    const parsed = JSON.parse(out);
    return (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []).map((d) => String(d));
  } catch {
    return [];
  }
}

function parsePowershellJson(output) {
  const trimmed = (output || "").trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

/**
 * Lista os apps instalados a partir dos chaves de Uninstall do registry.
 * Exclui componentes de sistema e atualizações do Windows (KB*).
 */
async function listInstalledApps() {
  if (!IS_WIN) return [];
  const script = `
$roots = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$apps = @()
foreach ($r in $roots) {
  Get-ItemProperty $r -ErrorAction SilentlyContinue | Where-Object {
    $_.DisplayName -and -not $_.SystemComponent
  } | ForEach-Object {
    $apps += [PSCustomObject]@{
      displayName = $_.DisplayName
      publisher   = $_.Publisher
      version     = $_.DisplayVersion
      sizeBytes   = if ($_.EstimatedSize) { $_.EstimatedSize * 1024 } else { 0 }
      installDate = $_.InstallDate
      installLocation = $_.InstallLocation
      quietUninstallString = $_.QuietUninstallString
      uninstallString     = $_.UninstallString
      registryPath = $_.PSPath
    }
  }
}
$apps | ConvertTo-Json -Depth 4
`;
  try {
    const parsed = parsePowershellJson(await execPowerShell(script));
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return list
      .filter((a) => a.displayName && !/^KB\d+/.test(a.displayName))
      .map((a) => ({
        displayName: String(a.displayName).trim(),
        publisher: a.publisher ? String(a.publisher) : "",
        version: a.version ? String(a.version) : "",
        sizeBytes: Number(a.sizeBytes) || 0,
        installDate: a.installDate ? String(a.installDate) : "",
        installLocation: a.installLocation ? String(a.installLocation) : "",
        quietUninstallString: a.quietUninstallString ? String(a.quietUninstallString) : "",
        uninstallString: a.uninstallString ? String(a.uninstallString) : "",
        registryPath: a.registryPath ? String(a.registryPath) : "",
      }));
  } catch {
    return [];
  }
}

/** Atalhos do Start Menu resolvidos para o caminho do executável. */
async function listStartMenuShortcuts() {
  if (!IS_WIN) return [];
  const script = `
$dirs = @(
  "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
  "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"
)
$shell = New-Object -ComObject WScript.Shell
$out = @()
foreach ($d in $dirs) {
  Get-ChildItem $d -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $t = $shell.CreateShortcut($_.FullName).TargetPath
      if ($t) { $out += [PSCustomObject]@{ name = $_.BaseName; target = $t } }
    } catch { }
  }
}
$out | ConvertTo-Json -Depth 3
`;
  try {
    const parsed = parsePowershellJson(await execPowerShell(script));
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return list
      .filter((s) => s && s.target)
      .map((s) => ({ name: String(s.name), target: String(s.target) }));
  } catch {
    return [];
  }
}

/** Procura o .exe principal de um app: InstallLocation > atalho > nada. */
async function resolveAppExecutable(app, shortcuts) {
  const candidates = [];
  if (app.installLocation) {
    const exe = findExeInDir(app.installLocation);
    if (exe) candidates.push(exe);
  }
  if (shortcuts && shortcuts.length > 0) {
    const target = matchShortcutTarget(app, shortcuts);
    if (target) candidates.push(target);
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0] || null;
}

function findExeInDir(dir) {
  try {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const exe = entries.find((e) => e.isFile() && /\.exe$/i.test(e.name) && !/uninstall|setup|vcruntime/i.test(e.name));
    if (exe) return path.join(dir, exe.name);
    const subdir = entries.find((e) => e.isDirectory());
    return subdir ? findExeInDir(path.join(dir, subdir.name)) : null;
  } catch {
    return null;
  }
}

function matchShortcutTarget(app, shortcuts) {
  const name = app.displayName.toLowerCase();
  const byName = shortcuts.filter((s) => s.name.toLowerCase() === name);
  if (byName.length > 0) return byName[0].target;
  const token = app.displayName.split(/\s+/)[0].toLowerCase();
  const byToken = shortcuts.find((s) => s.name.toLowerCase().startsWith(token));
  return byToken ? byToken.target : null;
}

/** Estima o último uso do app pelo mtime/atime do executável (aproximação documentada). */
function appLastUsed(exePath) {
  try {
    const st = fs.statSync(exePath);
    const maxMs = Math.max(st.mtimeMs, st.atimeMs);
    return {
      exePath,
      sizeBytes: st.size,
      lastUsedAt: new Date(maxMs).toISOString(),
      lastUsedDaysAgo: Math.max(0, Math.floor((Date.now() - maxMs) / (1000 * 60 * 60 * 24))),
    };
  } catch {
    return { exePath, sizeBytes: 0, lastUsedAt: null, lastUsedDaysAgo: null };
  }
}

/**
 * Recomenda apps que não fazem sentido manter no PC.
 * Heurística transparente (sem IA): instalação antiga + exe sem uso recente + tamanho.
 * Retorna apps ordenados por relevância da recomendação.
 */
async function recommendUnusedApps(options = {}) {
  const unusedThresholdDays = options.unusedThresholdDays ?? 90;
  const minSizeBytes = options.minSizeBytes ?? 256 * 1024 * 1024; // 256 MB
  const [apps, shortcuts] = await Promise.all([listInstalledApps(), listStartMenuShortcuts()]);

  const withUsage = await Promise.all(
    apps.map(async (app) => {
      const exePath = await resolveAppExecutable(app, shortcuts);
      const usage = exePath ? appLastUsed(exePath) : { exePath: null, sizeBytes: 0, lastUsedAt: null, lastUsedDaysAgo: null };
      const installedDaysAgo = parseInstallDateDaysAgo(app.installDate);
      return { app, usage, installedDaysAgo };
    })
  );

  const scored = withUsage
    .map(({ app, usage, installedDaysAgo }) => {
      const reasons = [];
      const unused = usage.lastUsedDaysAgo !== null && usage.lastUsedDaysAgo >= unusedThresholdDays;
      const neverTracked = usage.lastUsedDaysAgo === null;
      const oldInstall = installedDaysAgo !== null && installedDaysAgo >= 180;
      const big = usage.sizeBytes > minSizeBytes || app.sizeBytes > minSizeBytes;

      if (unused) reasons.push(`Sem uso nos últimos ${usage.lastUsedDaysAgo} dias`);
      if (neverTracked && oldInstall) reasons.push("Nunca executado recentemente, instalado há muito tempo");
      if (oldInstall && unused) reasons.push(`Instalado há ${installedDaysAgo} dias`);
      if (big) reasons.push("Ocupa espaço considerável");

      const score = (unused || (neverTracked && oldInstall) ? 2 : 0) + (oldInstall ? 1 : 0) + (big ? 1 : 0);
      return { app, usage, installedDaysAgo, reasons, score };
    })
    .filter((s) => s.score >= 2 && s.reasons.length > 0)
    .sort((a, b) => b.score - a.score || (b.usage.sizeBytes || b.app.sizeBytes) - (a.usage.sizeBytes || a.app.sizeBytes));

  return {
    generatedAt: new Date().toISOString(),
    thresholdDays: unusedThresholdDays,
    totalInstalled: apps.length,
    recommendations: scored.map(({ app, usage, installedDaysAgo, reasons, score }) => ({
      app,
      exePath: usage.exePath,
      sizeBytes: usage.sizeBytes || app.sizeBytes,
      lastUsedDaysAgo: usage.lastUsedDaysAgo,
      installedDaysAgo,
      reasons,
      score,
    })),
  };
}

function parseInstallDateDaysAgo(installDate) {
  if (!installDate) return null;
  let d = null;
  if (/^\d{8}$/.test(installDate)) {
    d = new Date(`${installDate.slice(0, 4)}-${installDate.slice(4, 6)}-${installDate.slice(6, 8)}`);
  } else {
    d = new Date(installDate);
  }
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Desinstala um app. Prefere `winget uninstall` (seguro, resolve deps);
 * fallback para o QuietUninstallString/UninstallString do registry (spawn,
 * sem esperar — desinstaladores gráficos são interativos).
 */
async function uninstallApp(app, options = {}) {
  if (!IS_WIN) return { success: false, error: "Desinstalação suportada apenas no Windows." };

  const winId = options.wingetId;
  if (winId) {
    try {
      await execPowerShell(`winget uninstall --id '${sanitizeWingetId(winId)}' --accept-source-agreements --silent`);
      return { success: true, method: "winget" };
    } catch (err) {
      // cai no fallback do registry
    }
  } else {
    try {
      const id = await findWingetId(app);
      if (id) {
        await execPowerShell(`winget uninstall --id '${sanitizeWingetId(id)}' --accept-source-agreements --silent`);
        return { success: true, method: "winget" };
      }
    } catch { /* fallback */ }
  }

  const cmd = app.quietUninstallString || app.uninstallString;
  if (!cmd) return { success: false, error: `Nenhum comando de desinstalação encontrado para "${app.displayName}".` };

  try {
    const safe = sanitizeForCmd(cmd);
    await execPowerShell(`Start-Process -FilePath cmd.exe -ArgumentList '/c', "${safe}" -WindowStyle Hidden`);
    return { success: true, method: "uninstall-string" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function findWingetId(app) {
  try {
    const out = await execPowerShell(`winget list --name '${sanitize(app.displayName)}' --accept-source-agreements --exact`);
    const lines = out.split("\n").map((l) => l.trim()).filter((l) => l && !/^Name|^---+|^[\w\s]*$/.test(l));
    for (const line of lines) {
      const cols = line.split(/\s{2,}/);
      if (cols.length >= 2 && cols[1].includes(".")) return cols[1];
    }
  } catch { /* ignore */ }
  return null;
}

function sanitize(value) {
  return String(value).replace(/'/g, "''").replace(/\0/g, "");
}

/** wingetId vem do renderer — restrito a caracteres de um ID de pacote. */
function sanitizeWingetId(value) {
  return String(value).replace(/[^A-Za-z0-9._+\-/ ]/g, "");
}

function sanitizeForCmd(value) {
  return String(value).replace(/"/g, '""').replace(/\0/g, "");
}

module.exports = {
  listFixedDrives,
  listInstalledApps,
  listStartMenuShortcuts,
  resolveAppExecutable,
  appLastUsed,
  recommendUnusedApps,
  uninstallApp,
  findWingetId,
  execPowerShell,
};
