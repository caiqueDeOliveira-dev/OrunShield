import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap } from "../types.js";
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
export declare class FileIntegrityMonitor extends TypedEmitter<ShieldEventMap> {
    private watcher;
    private readonly watchPaths;
    private readonly ignorePatterns;
    constructor(config: FileIntegrityMonitorConfig);
    start(): void;
    stop(): Promise<void>;
    private alert;
}
