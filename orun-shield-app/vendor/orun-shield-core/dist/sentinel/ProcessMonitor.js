"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessMonitor = void 0;
const systeminformation_1 = __importDefault(require("systeminformation"));
const node_crypto_1 = require("node:crypto");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
const DEFAULT_MALICIOUS_NAMES = [
    "mimikatz",
    "psexec",
    "procdump", // legítimo em uso de dev, mas comum em dumping de credenciais
    "lazagne",
];
/**
 * Monitora processos em execução e alerta sobre:
 *  1. Processos com nome associado a ferramentas de ataque conhecidas
 *  2. Processos desconhecidos consumindo CPU de forma sustentada
 *  3. Processos rodando a partir de pastas temporárias/incomuns (%TEMP%, /tmp)
 *
 * Isso é o diferencial comportamental do Shield: não depende de assinatura
 * prévia, pega comportamento suspeito em tempo real.
 */
class ProcessMonitor extends TypedEmitter_js_1.TypedEmitter {
    pollIntervalMs;
    cpuThreshold;
    allowlist;
    maliciousNames;
    timer = null;
    sustainedCpuTracker = new Map(); // pid -> contagem de polls consecutivos acima do limiar
    constructor(config = {}) {
        super();
        this.pollIntervalMs = config.pollIntervalMs ?? 5_000;
        this.cpuThreshold = config.cpuThresholdPercent ?? 70;
        this.allowlist = new Set((config.allowlist ?? []).map((n) => n.toLowerCase()));
        this.maliciousNames = [...DEFAULT_MALICIOUS_NAMES, ...(config.knownMaliciousNames ?? [])];
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.pollOnce();
        }, this.pollIntervalMs);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    /**
     * Monta a árvore de processos (pai → filhos) sob demanda — o mesmo tipo
     * de visão que o Process Explorer/Process Hacker mostram. Útil pra
     * investigar um alerta: "esse processo suspeito foi criado por quem?".
     * Não é polling contínuo — cada chamada é um snapshot novo.
     */
    async getProcessTree() {
        const { list } = await systeminformation_1.default.processes();
        const nodeByPid = new Map();
        for (const proc of list) {
            nodeByPid.set(proc.pid, {
                pid: proc.pid,
                parentPid: proc.parentPid,
                name: proc.name,
                cpu: proc.cpu,
                memPercent: proc.mem,
                command: proc.command,
                children: [],
            });
        }
        const roots = [];
        for (const node of nodeByPid.values()) {
            const parent = nodeByPid.get(node.parentPid);
            if (parent && parent.pid !== node.pid) {
                parent.children.push(node);
            }
            else {
                // Sem pai conhecido na lista atual (processo raiz do SO, ou pai já encerrado) — vira raiz da árvore.
                roots.push(node);
            }
        }
        return roots;
    }
    async pollOnce() {
        try {
            const { list } = await systeminformation_1.default.processes();
            const seenPids = new Set();
            for (const proc of list) {
                seenPids.add(proc.pid);
                this.checkKnownMalicious(proc);
                this.checkSuspiciousPath(proc);
                this.checkSustainedCpu(proc);
            }
            // Limpa contadores de processos que já terminaram.
            for (const pid of this.sustainedCpuTracker.keys()) {
                if (!seenPids.has(pid))
                    this.sustainedCpuTracker.delete(pid);
            }
        }
        catch (err) {
            this.emit("error", {
                source: "sentinel-process",
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }
    checkKnownMalicious(proc) {
        const name = proc.name.toLowerCase();
        const matched = this.maliciousNames.find((known) => name.includes(known));
        if (!matched)
            return;
        this.alert({
            severity: "critical",
            title: `Ferramenta de ataque conhecida detectada: ${proc.name}`,
            description: `O processo "${proc.name}" (PID ${proc.pid}) corresponde a uma ferramenta comumente usada em ataques (padrão: "${matched}"). Comando: ${proc.command}`,
            processName: proc.name,
            pid: proc.pid,
        });
    }
    checkSuspiciousPath(proc) {
        const path = (proc.path ?? "").toLowerCase();
        const isTemp = /[\\/](temp|tmp)[\\/]/.test(path) || path.startsWith("/tmp");
        if (!isTemp)
            return;
        if (this.allowlist.has(proc.name.toLowerCase()))
            return;
        this.alert({
            severity: "medium",
            title: `Processo executando de pasta temporária: ${proc.name}`,
            description: `"${proc.name}" (PID ${proc.pid}) está rodando a partir de ${proc.path}, um padrão comum de malware que se auto-extrai em pastas temporárias.`,
            processName: proc.name,
            pid: proc.pid,
        });
    }
    checkSustainedCpu(proc) {
        if (proc.cpu < this.cpuThreshold) {
            this.sustainedCpuTracker.delete(proc.pid);
            return;
        }
        if (this.allowlist.has(proc.name.toLowerCase()))
            return;
        const count = (this.sustainedCpuTracker.get(proc.pid) ?? 0) + 1;
        this.sustainedCpuTracker.set(proc.pid, count);
        // Só alerta depois de 3 polls consecutivos acima do limiar (evita ruído de picos normais).
        if (count === 3) {
            this.alert({
                severity: "low",
                title: `Uso de CPU sustentado incomum: ${proc.name}`,
                description: `"${proc.name}" (PID ${proc.pid}) está consumindo ${proc.cpu.toFixed(1)}% de CPU de forma sustentada. Pode ser legítimo — vale checar se é esperado.`,
                processName: proc.name,
                pid: proc.pid,
            });
        }
    }
    alert(partial) {
        const finding = {
            id: (0, node_crypto_1.randomUUID)(),
            source: "sentinel-process",
            detectedAt: new Date().toISOString(),
            ...partial,
        };
        this.emit("sentinel:process-alert", finding);
        this.emit("threat:detected", finding);
    }
}
exports.ProcessMonitor = ProcessMonitor;
