"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShieldCore = void 0;
const node_path_1 = require("node:path");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
const ClamAVScanner_js_1 = require("../clamav/ClamAVScanner.js");
const VirusTotalClient_js_1 = require("../virustotal/VirusTotalClient.js");
const YaraEngine_js_1 = require("../yara/YaraEngine.js");
const ProcessMonitor_js_1 = require("../sentinel/ProcessMonitor.js");
const NetworkMonitor_js_1 = require("../sentinel/NetworkMonitor.js");
const FileIntegrityMonitor_js_1 = require("../sentinel/FileIntegrityMonitor.js");
const RansomwareHeuristicMonitor_js_1 = require("../sentinel/RansomwareHeuristicMonitor.js");
const FileAnalyzer_js_1 = require("../analyzer/FileAnalyzer.js");
const DefenderBridge_js_1 = require("../defender/DefenderBridge.js");
const FirewallManager_js_1 = require("../firewall/FirewallManager.js");
const BinaryVerifier_js_1 = require("../integrity/BinaryVerifier.js");
const QuarantineManager_js_1 = require("../quarantine/QuarantineManager.js");
/**
 * Ponto único de entrada do Orun Shield. Instancia e conecta todos os
 * subsistemas (detecção por assinatura, comportamental, firewall,
 * integridade) e re-emite tudo como um fluxo único de eventos —
 * é isso que o dashboard React (design system) deve consumir.
 */
class ShieldCore extends TypedEmitter_js_1.TypedEmitter {
    clamav;
    virustotal;
    yara;
    processMonitor;
    networkMonitor;
    fileIntegrityMonitor;
    ransomwareHeuristicMonitor;
    fileAnalyzer;
    defender;
    firewall;
    binaryVerifier;
    quarantineManager;
    findingsLog = [];
    autoBlock;
    autoQuarantine;
    constructor(config = {}) {
        super();
        this.autoBlock = config.autoBlockCriticalNetworkThreats ?? false;
        this.autoQuarantine = config.autoQuarantineCriticalFileThreats ?? false;
        this.validateConfig(config);
        if (config.clamav)
            this.clamav = new ClamAVScanner_js_1.ClamAVScanner(config.clamav);
        if (config.virustotal)
            this.virustotal = new VirusTotalClient_js_1.VirusTotalClient(config.virustotal);
        if (config.yara)
            this.yara = new YaraEngine_js_1.YaraEngine(config.yara);
        this.processMonitor = new ProcessMonitor_js_1.ProcessMonitor(config.sentinel?.process);
        this.networkMonitor = new NetworkMonitor_js_1.NetworkMonitor(config.sentinel?.network);
        if (config.sentinel?.fileIntegrity) {
            this.fileIntegrityMonitor = new FileIntegrityMonitor_js_1.FileIntegrityMonitor(config.sentinel.fileIntegrity);
        }
        if (config.sentinel?.ransomwareHeuristic) {
            this.ransomwareHeuristicMonitor = new RansomwareHeuristicMonitor_js_1.RansomwareHeuristicMonitor(config.sentinel.ransomwareHeuristic);
        }
        this.fileAnalyzer = new FileAnalyzer_js_1.FileAnalyzer(config.fileAnalyzer);
        // Instanciado sempre (mesmo padrão do FirewallManager) — o próprio DefenderBridge
        // checa `platform() === "win32"` internamente antes de tentar qualquer comando,
        // então é seguro ter isso disponível mesmo em builds Linux/macOS do Orun OS.
        this.defender = new DefenderBridge_js_1.DefenderBridge(config.windowsDefender);
        this.firewall = new FirewallManager_js_1.FirewallManager();
        this.binaryVerifier = new BinaryVerifier_js_1.BinaryVerifier();
        if (config.quarantine)
            this.quarantineManager = new QuarantineManager_js_1.QuarantineManager(config.quarantine);
        this.wireSubmodules();
    }
    /**
     * Falha rápido (no boot, não em produção) em combinações de config que
     * pareceriam funcionar mas gerariam comportamento incorreto silencioso.
     *
     * Caso real evitado aqui: se `quarantine.quarantineDir` estiver dentro de
     * (ou for igual a) uma das pastas vigiadas pelo `FileIntegrityMonitor`,
     * o ato de colocar um arquivo em quarentena — que MOVE o arquivo pra
     * dentro dessa pasta — dispara o próprio monitor de integridade, gerando
     * um alerta falso de "arquivo criado em pasta crítica" sobre a ação de
     * isolar a ameaça. Isso não gera erro nenhum, só um comportamento
     * confuso e incorreto em produção — por isso vale barrar na config.
     */
    validateConfig(config) {
        const quarantineDir = config.quarantine?.quarantineDir;
        if (!quarantineDir)
            return;
        const watchPathSources = [
            { label: "fileIntegrity", paths: config.sentinel?.fileIntegrity?.watchPaths ?? [] },
            { label: "ransomwareHeuristic", paths: config.sentinel?.ransomwareHeuristic?.watchPaths ?? [] },
        ];
        for (const { label, paths } of watchPathSources) {
            for (const watchPath of paths) {
                if (this.isPathNestedOrEqual(quarantineDir, watchPath)) {
                    throw new Error(`Configuração inválida do ShieldCore: quarantine.quarantineDir ("${quarantineDir}") está dentro de (ou é igual a) um watchPath do ${label} ("${watchPath}"). ` +
                        `Isso faria o ${label} disparar um alerta falso toda vez que um arquivo fosse colocado em quarentena (a própria ação de mover arquivos pra lá conta como atividade de arquivo). ` +
                        "Escolha uma pasta de quarentena fora de qualquer pasta vigiada.");
                }
            }
        }
    }
    /** Compara dois caminhos resolvidos verificando se `child` está dentro de `parent` (ou é o mesmo diretório), respeitando fronteira de separador. */
    isPathNestedOrEqual(child, parent) {
        const resolvedChild = (0, node_path_1.resolve)(child);
        const resolvedParent = (0, node_path_1.resolve)(parent);
        if (resolvedChild === resolvedParent)
            return true;
        return resolvedChild.startsWith(resolvedParent + node_path_1.sep) || resolvedParent.startsWith(resolvedChild + node_path_1.sep);
    }
    /** Liga o monitoramento contínuo (Sentinela). Scans sob demanda (ClamAV/YARA/VT) são chamados separadamente. */
    startMonitoring() {
        this.processMonitor.start();
        this.networkMonitor.start();
        this.fileIntegrityMonitor?.start();
        this.ransomwareHeuristicMonitor?.start();
    }
    async stopMonitoring() {
        this.processMonitor.stop();
        this.networkMonitor.stop();
        await this.fileIntegrityMonitor?.stop();
        await this.ransomwareHeuristicMonitor?.stop();
    }
    /** Scan completo sob demanda: ClamAV + YARA em sequência (VT é usado à parte, para arquivos pontuais). */
    async fullScan(targetPath, recursive = true) {
        const results = {};
        if (this.clamav) {
            results.clamav = await this.clamav.scan(targetPath, recursive);
        }
        if (this.yara) {
            results.yara = await this.yara.scan(targetPath, recursive);
        }
        return results;
    }
    /** Histórico de findings desde que o ShieldCore foi instanciado (em memória — persistência fica a cargo do app, ex: via Supabase sync). */
    getFindingsLog() {
        return this.findingsLog;
    }
    /** Atalho de alto nível: coloca o arquivo de um finding em quarentena, se o QuarantineManager estiver configurado. */
    async quarantineFinding(finding) {
        if (!this.quarantineManager) {
            throw new Error("QuarantineManager não configurado neste ShieldCore (passe `quarantine` na config).");
        }
        return this.quarantineManager.quarantine(finding);
    }
    /** Análise estática sob demanda de um arquivo (hash, entropia, strings, indicadores) — o "clicar direito → Analisar arquivo". */
    analyzeFile(filePath) {
        return this.fileAnalyzer.analyze(filePath);
    }
    /** Snapshot da árvore de processos (pai → filhos) — útil pra investigar de onde um processo suspeito veio. */
    getProcessTree() {
        return this.processMonitor.getProcessTree();
    }
    /**
     * Busca detecções recentes do Windows Defender e as injeta no mesmo
     * feed de eventos do Shield (ThreatFinding, `threat:detected`). Fora
     * do Windows, `defender.syncThreats()` retorna array vazio sem erro —
     * seguro chamar isso incondicionalmente em qualquer plataforma.
     */
    syncDefenderThreats() {
        return this.defender.syncThreats();
    }
    /** Status atual do Defender (proteção em tempo real ligada, idade das assinaturas, etc). */
    getDefenderStatus() {
        return this.defender.getStatus();
    }
    wireSubmodules() {
        const modules = [
            this.clamav,
            this.virustotal,
            this.yara,
            this.processMonitor,
            this.networkMonitor,
            this.fileIntegrityMonitor,
            this.ransomwareHeuristicMonitor,
            this.binaryVerifier,
            this.quarantineManager,
            this.firewall,
            this.defender,
        ].filter(Boolean);
        for (const mod of modules) {
            mod.on("threat:detected", (finding) => this.handleThreat(finding));
            mod.on("scan:started", (payload) => this.emit("scan:started", payload));
            mod.on("scan:finished", (payload) => this.emit("scan:finished", payload));
            mod.on("error", (payload) => this.emit("error", payload));
        }
        this.processMonitor.on("sentinel:process-alert", (f) => this.emit("sentinel:process-alert", f));
        this.networkMonitor.on("sentinel:network-alert", (f) => this.emit("sentinel:network-alert", f));
        this.fileIntegrityMonitor?.on("sentinel:fs-alert", (f) => this.emit("sentinel:fs-alert", f));
        this.ransomwareHeuristicMonitor?.on("ransomware:alert", (f) => this.emit("ransomware:alert", f));
        this.binaryVerifier.on("integrity:violation", (f) => this.emit("integrity:violation", f));
        this.firewall.on("firewall:rule-changed", (payload) => this.emit("firewall:rule-changed", payload));
    }
    handleThreat(finding) {
        this.findingsLog.push(finding);
        this.emit("threat:detected", finding);
        if (this.autoBlock &&
            finding.severity === "critical" &&
            finding.source === "sentinel-network" &&
            finding.remoteAddress) {
            const ip = finding.remoteAddress.split(":")[0];
            if (ip) {
                void this.firewall.blockIP(ip).catch((err) => {
                    this.emit("error", { source: "orchestrator", message: `Falha ao auto-bloquear ${ip}: ${err}` });
                });
            }
        }
        if (this.autoQuarantine &&
            this.quarantineManager &&
            finding.severity === "critical" &&
            finding.filePath &&
            (finding.source === "clamav" || finding.source === "yara" || finding.source === "virustotal")) {
            void this.quarantineManager.quarantine(finding).catch((err) => {
                this.emit("error", { source: "orchestrator", message: `Falha ao auto-quarentenar ${finding.filePath}: ${err}` });
            });
        }
    }
}
exports.ShieldCore = ShieldCore;
