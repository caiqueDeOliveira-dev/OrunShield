import si from "systeminformation";
import { randomUUID } from "node:crypto";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";

export interface ProcessMonitorConfig {
  /** Intervalo entre snapshots de processos, em ms. */
  pollIntervalMs?: number;
  /** % de CPU sustentada que dispara alerta (processo desconhecido consumindo muito). */
  cpuThresholdPercent?: number;
  /** Nomes de processos considerados confiáveis, nunca alertados mesmo com uso alto (ex: builds, compilers). */
  allowlist?: string[];
  /** Nomes/padrões associados a ferramentas de ataque conhecidas (mimikatz, psexec etc). */
  knownMaliciousNames?: string[];
}

export interface ProcessTreeNode {
  pid: number;
  parentPid: number;
  name: string;
  cpu: number;
  memPercent: number;
  command: string;
  children: ProcessTreeNode[];
}

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
export class ProcessMonitor extends TypedEmitter<ShieldEventMap> {
  private readonly pollIntervalMs: number;
  private readonly cpuThreshold: number;
  private readonly allowlist: Set<string>;
  private readonly maliciousNames: string[];
  private timer: NodeJS.Timeout | null = null;
  private sustainedCpuTracker = new Map<number, number>(); // pid -> contagem de polls consecutivos acima do limiar

  constructor(config: ProcessMonitorConfig = {}) {
    super();
    this.pollIntervalMs = config.pollIntervalMs ?? 5_000;
    this.cpuThreshold = config.cpuThresholdPercent ?? 70;
    this.allowlist = new Set((config.allowlist ?? []).map((n) => n.toLowerCase()));
    this.maliciousNames = [...DEFAULT_MALICIOUS_NAMES, ...(config.knownMaliciousNames ?? [])];
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  stop(): void {
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
  async getProcessTree(): Promise<ProcessTreeNode[]> {
    const { list } = await si.processes();
    const nodeByPid = new Map<number, ProcessTreeNode>();

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

    const roots: ProcessTreeNode[] = [];
    for (const node of nodeByPid.values()) {
      const parent = nodeByPid.get(node.parentPid);
      if (parent && parent.pid !== node.pid) {
        parent.children.push(node);
      } else {
        // Sem pai conhecido na lista atual (processo raiz do SO, ou pai já encerrado) — vira raiz da árvore.
        roots.push(node);
      }
    }

    return roots;
  }

  private async pollOnce(): Promise<void> {
    try {
      const { list } = await si.processes();
      const seenPids = new Set<number>();

      for (const proc of list) {
        seenPids.add(proc.pid);
        this.checkKnownMalicious(proc);
        this.checkSuspiciousPath(proc);
        this.checkSustainedCpu(proc);
      }

      // Limpa contadores de processos que já terminaram.
      for (const pid of this.sustainedCpuTracker.keys()) {
        if (!seenPids.has(pid)) this.sustainedCpuTracker.delete(pid);
      }
    } catch (err) {
      this.emit("error", {
        source: "sentinel-process",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private checkKnownMalicious(proc: si.Systeminformation.ProcessesProcessData): void {
    const name = proc.name.toLowerCase();
    const matched = this.maliciousNames.find((known) => name.includes(known));
    if (!matched) return;

    this.alert({
      severity: "critical",
      title: `Ferramenta de ataque conhecida detectada: ${proc.name}`,
      description: `O processo "${proc.name}" (PID ${proc.pid}) corresponde a uma ferramenta comumente usada em ataques (padrão: "${matched}"). Comando: ${proc.command}`,
      processName: proc.name,
      pid: proc.pid,
    });
  }

  private checkSuspiciousPath(proc: si.Systeminformation.ProcessesProcessData): void {
    const path = (proc.path ?? "").toLowerCase();
    const isTemp = /[\\/](temp|tmp)[\\/]/.test(path) || path.startsWith("/tmp");
    if (!isTemp) return;
    if (this.allowlist.has(proc.name.toLowerCase())) return;

    this.alert({
      severity: "medium",
      title: `Processo executando de pasta temporária: ${proc.name}`,
      description: `"${proc.name}" (PID ${proc.pid}) está rodando a partir de ${proc.path}, um padrão comum de malware que se auto-extrai em pastas temporárias.`,
      processName: proc.name,
      pid: proc.pid,
    });
  }

  private checkSustainedCpu(proc: si.Systeminformation.ProcessesProcessData): void {
    if (proc.cpu < this.cpuThreshold) {
      this.sustainedCpuTracker.delete(proc.pid);
      return;
    }
    if (this.allowlist.has(proc.name.toLowerCase())) return;

    const count = (this.sustainedCpuTracker.get(proc.pid) ?? 0) + 1;
    this.sustainedCpuTracker.set(proc.pid, count);

    // Só alerta depois de 3 polls consecutivos acima do limiar (evita ruído de picos normais).
    if (count === 3) {
      this.alert({
        severity: "low",
        title: `Uso de CPU sustentado incomum: ${proc.name}`,
        description: `"${proc.name}" (PID ${proc.pid}) está consumindo ${proc.cpu.toFixed(
          1
        )}% de CPU de forma sustentada. Pode ser legítimo — vale checar se é esperado.`,
        processName: proc.name,
        pid: proc.pid,
      });
    }
  }

  private alert(partial: Omit<ThreatFinding, "id" | "source" | "detectedAt">): void {
    const finding: ThreatFinding = {
      id: randomUUID(),
      source: "sentinel-process",
      detectedAt: new Date().toISOString(),
      ...partial,
    };
    this.emit("sentinel:process-alert", finding);
    this.emit("threat:detected", finding);
  }
}
