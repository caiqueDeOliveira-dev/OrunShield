"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefenderBridge = void 0;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_os_1 = require("node:os");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
/**
 * Orquestra o Windows Defender via os cmdlets PowerShell oficiais do
 * módulo Defender (`Get-MpComputerStatus`, `Get-MpThreatDetection`,
 * `Get-MpThreat`, `Start-MpScan`, `Update-MpSignature`, `Set-MpPreference`)
 * — a interface de gerenciamento pública e documentada da própria
 * Microsoft, não engenharia reversa de nada.
 *
 * A ideia central: o Defender já tem o que o Orun Shield não pode ter
 * sozinho (driver de kernel assinado, bloqueio antes da execução,
 * proteção contra o malware desativar o antivírus). Em vez de competir,
 * o Shield vira uma camada de orquestração/UX/IA por cima — o Defender
 * faz a detecção pesada em tempo real, o Shield traduz isso pro mesmo
 * fluxo de eventos que ClamAV/YARA/Sentinela já usam, e o Sentinela
 * (agente de IA) explica pro usuário em linguagem natural.
 *
 * IMPORTANTE: só funciona no Windows, com o módulo Defender PowerShell
 * presente (vem por padrão no Windows 10/11, a menos que outro antivírus
 * tenha assumido o lugar do Defender como AV primário — nesse caso os
 * cmdlets ficam indisponíveis, e `checkAvailability()` retorna `false`).
 */
class DefenderBridge extends TypedEmitter_js_1.TypedEmitter {
    powershellPath;
    seenDetectionIds = new Set(); // evita re-emitir o mesmo achado do Defender toda vez que syncThreats() roda
    constructor(config = {}) {
        super();
        this.powershellPath = config.powershellPath ?? "powershell.exe";
    }
    /** Sempre `false` fora do Windows — não tenta nem rodar o comando. */
    async checkAvailability() {
        if ((0, node_os_1.platform)() !== "win32")
            return false;
        try {
            await this.runJson("Get-MpComputerStatus | Select-Object AMServiceEnabled | ConvertTo-Json");
            return true;
        }
        catch {
            return false;
        }
    }
    async getStatus() {
        if ((0, node_os_1.platform)() !== "win32")
            return { available: false };
        try {
            const raw = await this.runJson("Get-MpComputerStatus | ConvertTo-Json");
            return {
                available: true,
                antivirusEnabled: raw.AntivirusEnabled,
                realTimeProtectionEnabled: raw.RealTimeProtectionEnabled,
                antispywareEnabled: raw.AntispywareEnabled,
                signatureVersion: raw.AntivirusSignatureVersion,
                signatureAgeDays: raw.AntivirusSignatureAge,
                fullScanAgeDays: raw.FullScanAge,
                quickScanAgeDays: raw.QuickScanAge,
            };
        }
        catch {
            return { available: false };
        }
    }
    /**
     * Dispara um scan rápido do Defender. `Start-MpScan` é síncrono — a
     * Promise só resolve quando o scan termina. Scan rápido costuma levar
     * poucos minutos; não impomos timeout artificial aqui, mas quem chama
     * deve ter isso em mente (não é uma operação instantânea).
     */
    async startQuickScan() {
        await this.runCommand("Start-MpScan -ScanType QuickScan");
    }
    /** Scan completo — pode levar de dezenas de minutos a horas, dependendo do disco. Mesma observação de `startQuickScan`. */
    async startFullScan() {
        await this.runCommand("Start-MpScan -ScanType FullScan");
    }
    async updateSignatures() {
        try {
            await this.runCommand("Update-MpSignature");
            return { updated: true };
        }
        catch (err) {
            return { updated: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /**
     * Só ATIVA a proteção em tempo real — nunca desativa. Requer
     * privilégios de administrador (mesmo princípio do `FirewallManager`:
     * este módulo não eleva privilégio sozinho, o app precisa solicitar
     * isso antes de chamar).
     */
    async ensureRealTimeProtectionEnabled() {
        try {
            await this.runCommand("Set-MpPreference -DisableRealtimeMonitoring $false");
            return { success: true };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /**
     * Busca detecções recentes do Defender e as traduz pro formato
     * `ThreatFinding` unificado do Shield — assim, uma ameaça pega pelo
     * Defender aparece no MESMO feed que ClamAV/YARA/Sentinela alimentam,
     * e pode ser explicada pelo `SentinelaAgent` do mesmo jeito.
     *
     * Deduplica internamente: chamar isso repetidamente (ex: polling
     * periódico) não gera o mesmo finding de novo.
     */
    async syncThreats() {
        if ((0, node_os_1.platform)() !== "win32")
            return [];
        let detections;
        try {
            detections = await this.fetchThreatDetections();
        }
        catch (err) {
            this.emit("error", { source: "windows-defender", message: err instanceof Error ? err.message : String(err) });
            return [];
        }
        const findings = [];
        for (const detection of detections) {
            const stableId = this.buildStableId(detection);
            if (this.seenDetectionIds.has(stableId))
                continue;
            this.seenDetectionIds.add(stableId);
            const finding = this.toThreatFinding(detection);
            findings.push(finding);
            this.emit("threat:detected", finding);
        }
        return findings;
    }
    async fetchThreatDetections() {
        // Um único comando busca detecções + o catálogo de ameaças correspondente e já
        // faz o join no lado do PowerShell — evita N chamadas de processo separadas.
        const script = `
$detections = Get-MpThreatDetection | Select-Object ThreatID, ProcessName, InitialDetectionTime, ThreatStatusID, Resources
$threats = Get-MpThreat | Select-Object ThreatID, ThreatName, SeverityID, CategoryID
$joined = $detections | ForEach-Object {
  $d = $_
  $t = $threats | Where-Object { $_.ThreatID -eq $d.ThreatID } | Select-Object -First 1
  [PSCustomObject]@{
    ThreatID = $d.ThreatID
    ProcessName = $d.ProcessName
    InitialDetectionTime = $d.InitialDetectionTime
    ThreatStatusID = $d.ThreatStatusID
    Resources = $d.Resources
    ThreatName = $t.ThreatName
    SeverityID = $t.SeverityID
    CategoryID = $t.CategoryID
  }
}
$joined | ConvertTo-Json -Depth 5`.trim();
        const result = await this.runJsonRaw(script);
        if (result === null)
            return [];
        // PowerShell serializa um único objeto como objeto solto (não array) quando só há
        // uma detecção — normaliza pra sempre retornar array, sem depender de `as` cego.
        if (Array.isArray(result))
            return result;
        return [result];
    }
    toThreatFinding(detection) {
        const resources = Array.isArray(detection.Resources)
            ? detection.Resources
            : detection.Resources
                ? [detection.Resources]
                : [];
        // Formato real confirmado do Defender: "file:_C:\caminho\arquivo.exe" (underscore, não barra) —
        // ex: `Resources : {file:_C:\artifact_x64.exe}` em saídas reais do Get-MpThreatDetection.
        const filePath = resources.find((r) => typeof r === "string" && r.startsWith("file:_"))?.replace(/^file:_/, "");
        return {
            id: (0, node_crypto_1.randomUUID)(),
            source: "windows-defender",
            severity: this.mapSeverity(detection.SeverityID),
            title: `Windows Defender: ${detection.ThreatName ?? "Ameaça detectada"}`,
            description: `O Windows Defender detectou "${detection.ThreatName ?? "ameaça desconhecida"}" ${detection.ProcessName ? `no processo ${detection.ProcessName}` : ""}. Detecção original do Defender — o Orun Shield está só traduzindo e centralizando esse achado.`,
            filePath,
            processName: detection.ProcessName,
            detectedAt: detection.InitialDetectionTime ? new Date(detection.InitialDetectionTime).toISOString() : new Date().toISOString(),
            raw: detection,
        };
    }
    /**
     * Mapeamento verificado contra a escala real documentada do Defender
     * (SeverityID 0-5, 5 = mais grave; valor 3 raramente aparece em dados
     * reais de produção, tratado aqui de forma conservadora).
     */
    mapSeverity(severityId) {
        switch (severityId) {
            case 5:
                return "critical";
            case 4:
                return "high";
            case 3:
            case 2:
                return "medium";
            case 1:
                return "low";
            default:
                return "info";
        }
    }
    buildStableId(detection) {
        return (0, node_crypto_1.createHash)("sha256")
            .update(`${detection.ThreatID}:${detection.ProcessName ?? ""}:${detection.InitialDetectionTime ?? ""}`)
            .digest("hex");
    }
    async runCommand(command) {
        return this.exec(command);
    }
    async runJson(command) {
        const output = await this.exec(command);
        return JSON.parse(output);
    }
    /** Como `runJson`, mas retorna `null` em vez de lançar quando a saída está vazia (ex: nenhuma detecção encontrada). */
    async runJsonRaw(command) {
        const output = await this.exec(command);
        if (!output.trim())
            return null;
        return JSON.parse(output);
    }
    exec(command) {
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(this.powershellPath, ["-NoProfile", "-NonInteractive", "-Command", command]);
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (c) => (stdout += c.toString()));
            child.stderr.on("data", (c) => (stderr += c.toString()));
            child.on("error", reject);
            child.on("close", (code) => {
                if (code === 0)
                    resolve(stdout);
                else
                    reject(new Error(`PowerShell finalizou com código ${code}: ${stderr || stdout}`));
            });
        });
    }
}
exports.DefenderBridge = DefenderBridge;
