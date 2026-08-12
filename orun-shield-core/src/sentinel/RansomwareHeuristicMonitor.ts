import chokidar, { type FSWatcher } from "chokidar";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";

export interface RansomwareHeuristicConfig {
  /** Pastas a vigiar (tipicamente Documentos, Área de Trabalho, Imagens — onde ransomware costuma atacar primeiro). */
  watchPaths: string[];
  /** Quantos eventos de modificação/criação de arquivo, na janela de tempo abaixo, disparam o alerta. */
  fileEventThreshold?: number;
  /** Janela de tempo (ms) em que o threshold é avaliado. */
  windowMs?: number;
  /** Extensões classicamente associadas a ransomware conhecido — não é lista exaustiva, ransomware novo usa extensões novas. */
  suspiciousExtensions?: string[];
  /** Tempo mínimo (ms) entre alertas consecutivos, pra não inundar a UI de alertas repetidos do mesmo ataque em andamento. */
  cooldownMs?: number;
}

const DEFAULT_SUSPICIOUS_EXTENSIONS = [
  ".locked",
  ".encrypted",
  ".crypt",
  ".enc",
  ".locky",
  ".cerber",
  ".zepto",
  ".wcry",
  ".wncry",
  ".cryptolocker",
];

/**
 * IMPORTANTE — o que isto É e o que NÃO É:
 *
 * Isto NÃO é proteção em tempo real de verdade (isso exigiria um driver de
 * kernel/minifilter interceptando escritas ANTES delas acontecerem — fora
 * do alcance de uma aplicação em user-space). Isto é DETECÇÃO REATIVA: o
 * ransomware já começou a criptografar quando o alerta dispara. Ainda
 * assim, tem valor real — ransomware tipicamente criptografa milhares de
 * arquivos em poucos segundos/minutos, então detectar no início de um
 * ataque em massa (em vez de só no fim) pode dar tempo de desconectar a
 * máquina da rede, matar o processo, ou pelo menos preservar os arquivos
 * ainda não atingidos.
 *
 * Duas heurísticas, sem depender de assinatura prévia:
 *  1. Taxa de eventos de arquivo anormalmente alta numa janela curta
 *     (ex: 20+ arquivos modificados em 10 segundos é muito acima do
 *     padrão de uso normal de um usuário).
 *  2. Aparecimento de extensões classicamente associadas a ransomware
 *     conhecido (lista não-exaustiva — ransomware novo inventa extensão nova).
 */
export class RansomwareHeuristicMonitor extends TypedEmitter<ShieldEventMap> {
  private watcher: FSWatcher | null = null;
  private readonly watchPaths: string[];
  private readonly fileEventThreshold: number;
  private readonly windowMs: number;
  private readonly suspiciousExtensions: Set<string>;
  private readonly cooldownMs: number;

  private recentEventTimestamps: number[] = [];
  private lastBurstAlertAt = 0;

  constructor(config: RansomwareHeuristicConfig) {
    super();
    this.watchPaths = config.watchPaths;
    this.fileEventThreshold = config.fileEventThreshold ?? 20;
    this.windowMs = config.windowMs ?? 10_000;
    this.suspiciousExtensions = new Set(config.suspiciousExtensions ?? DEFAULT_SUSPICIOUS_EXTENSIONS);
    this.cooldownMs = config.cooldownMs ?? 60_000;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.watchPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on("add", (path) => this.handleFileEvent(path));
    this.watcher.on("change", (path) => this.handleFileEvent(path));
    this.watcher.on("error", (err) => {
      this.emit("error", { source: "sentinel-fs", message: err instanceof Error ? err.message : String(err) });
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.recentEventTimestamps = [];
  }

  private handleFileEvent(path: string): void {
    this.checkSuspiciousExtension(path);
    this.trackBurstRate(path);
  }

  private checkSuspiciousExtension(path: string): void {
    const ext = extname(path).toLowerCase();
    if (!this.suspiciousExtensions.has(ext)) return;

    this.alert({
      severity: "critical",
      title: `Extensão associada a ransomware detectada: ${ext}`,
      description: `O arquivo ${path} apareceu com a extensão "${ext}", classicamente associada a famílias de ransomware conhecidas. Isso sozinho já merece investigação imediata.`,
      filePath: path,
    });
  }

  private trackBurstRate(path: string): void {
    const now = Date.now();
    this.recentEventTimestamps.push(now);
    // Remove eventos fora da janela de tempo — mantém só o que é relevante pro cálculo de taxa.
    this.recentEventTimestamps = this.recentEventTimestamps.filter((t) => now - t <= this.windowMs);

    if (this.recentEventTimestamps.length < this.fileEventThreshold) return;
    if (now - this.lastBurstAlertAt < this.cooldownMs) return; // já alertou recentemente sobre o mesmo surto

    this.lastBurstAlertAt = now;
    const count = this.recentEventTimestamps.length;

    this.alert({
      severity: "critical",
      title: `Possível ransomware: ${count} arquivos modificados em ${Math.round(this.windowMs / 1000)}s`,
      description: `Foram detectadas ${count} modificações/criações de arquivo nas pastas monitoradas em menos de ${Math.round(
        this.windowMs / 1000
      )} segundos — muito acima do padrão de uso manual. Compatível com criptografia em massa por ransomware. Último arquivo: ${path}. Recomenda-se desconectar da rede e investigar imediatamente.`,
      filePath: path,
    });
  }

  private alert(partial: Omit<ThreatFinding, "id" | "source" | "detectedAt">): void {
    const finding: ThreatFinding = {
      id: randomUUID(),
      source: "ransomware-heuristic",
      detectedAt: new Date().toISOString(),
      ...partial,
    };
    this.emit("ransomware:alert", finding);
    this.emit("threat:detected", finding);
  }
}
