import chokidar, { type FSWatcher } from "chokidar";
import { randomUUID } from "node:crypto";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";

export interface FileIntegrityMonitorConfig {
  /** Pastas críticas a vigiar: startup, pasta de instalação do Orun, etc. */
  watchPaths: string[];
  /** Padrões de arquivo a ignorar (logs, caches, arquivos temporários da própria aplicação). */
  ignorePatterns?: string[];
}

/**
 * Vigia pastas críticas em tempo real (startup, diretório de instalação do
 * Orun, configs sensíveis) e alerta sobre criação/modificação inesperada
 * de arquivos — padrão clássico de persistência de malware.
 *
 * Usa chokidar (mesma lib usada por VSCode, webpack etc para file watching
 * cross-platform confiável).
 */
export class FileIntegrityMonitor extends TypedEmitter<ShieldEventMap> {
  private watcher: FSWatcher | null = null;
  private readonly watchPaths: string[];
  private readonly ignorePatterns: string[];

  constructor(config: FileIntegrityMonitorConfig) {
    super();
    this.watchPaths = config.watchPaths;
    this.ignorePatterns = config.ignorePatterns ?? [];
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.watchPaths, {
      ignored: this.ignorePatterns,
      ignoreInitial: true, // não alerta sobre arquivos já existentes ao iniciar
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher.on("add", (path) => this.alert("criado", path));
    this.watcher.on("change", (path) => this.alert("modificado", path));
    this.watcher.on("error", (err) => {
      this.emit("error", {
        source: "sentinel-fs",
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private alert(action: "criado" | "modificado", filePath: string): void {
    const finding: ThreatFinding = {
      id: randomUUID(),
      source: "sentinel-fs",
      severity: "medium",
      title: `Arquivo ${action} em pasta crítica`,
      description: `O arquivo ${filePath} foi ${action} em uma pasta monitorada como crítica (ex: startup, instalação do Orun). Se não foi você, investigue.`,
      filePath,
      detectedAt: new Date().toISOString(),
    };
    this.emit("sentinel:fs-alert", finding);
    this.emit("threat:detected", finding);
  }
}
