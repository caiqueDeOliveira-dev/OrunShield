import { readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import type { JunkCandidate, JunkScanResult, JunkCategory } from "../types.js";

export interface JunkFileDetectorConfig {
  /** Extensões tratadas como arquivo temporário/descartável. */
  tempExtensions?: string[];
  /** Nomes de pasta tratados como cache (comparação exata do nome, não caminho completo). */
  cacheDirNames?: string[];
  /** A partir de quantos dias sem modificação um arquivo em Downloads é considerado "antigo". */
  oldDownloadsThresholdDays?: number;
  /** Pastas a nunca examinar (evita falsos positivos em código-fonte, etc). */
  excludeDirNames?: string[];
}

const DEFAULT_TEMP_EXTENSIONS = [".tmp", ".temp", ".bak", ".old", ".dmp", ".log"];
const DEFAULT_CACHE_DIR_NAMES = ["cache", "Cache", "CachedData", ".cache", "__pycache__"];
const OS_JUNK_FILENAMES = ["Thumbs.db", ".DS_Store", "desktop.ini", "ehthumbs.db"];
const INSTALLER_EXTENSIONS = [".exe", ".msi", ".dmg", ".pkg", ".deb", ".appimage"];
const DEFAULT_EXCLUDE_DIRS = ["node_modules", ".git", "src", "dist"]; // não examina código-fonte por padrão

/**
 * Identifica candidatos a limpeza — NUNCA apaga nada sozinho, só classifica
 * e explica o motivo. A decisão de apagar é sempre do usuário (via
 * `CleanupManager`, que move pra uma área de espera antes de qualquer
 * exclusão permanente).
 */
export class JunkFileDetector {
  private readonly tempExtensions: Set<string>;
  private readonly cacheDirNames: Set<string>;
  private readonly oldDownloadsThresholdDays: number;
  private readonly excludeDirNames: Set<string>;

  constructor(config: JunkFileDetectorConfig = {}) {
    this.tempExtensions = new Set(config.tempExtensions ?? DEFAULT_TEMP_EXTENSIONS);
    this.cacheDirNames = new Set(config.cacheDirNames ?? DEFAULT_CACHE_DIR_NAMES);
    this.oldDownloadsThresholdDays = config.oldDownloadsThresholdDays ?? 90;
    this.excludeDirNames = new Set([...DEFAULT_EXCLUDE_DIRS, ...(config.excludeDirNames ?? [])]);
  }

  /**
   * @param rootPath pasta a examinar (tipicamente %TEMP%, pasta de Downloads, ou a home do usuário)
   * @param isDownloadsFolder se true, aplica a heurística de "instalador antigo em Downloads" — não faz sentido rodar essa heurística em qualquer pasta, só onde instaladores tendem a se acumular.
   */
  async scan(rootPath: string, isDownloadsFolder = false): Promise<JunkScanResult> {
    const candidates: JunkCandidate[] = [];
    await this.walk(rootPath, candidates, isDownloadsFolder);

    return {
      rootPath,
      candidates,
      totalReclaimableBytes: candidates.reduce((sum, c) => sum + c.sizeBytes, 0),
      scannedAt: new Date().toISOString(),
    };
  }

  private async walk(path: string, candidates: JunkCandidate[], isDownloadsFolder: boolean): Promise<void> {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return; // pasta protegida/inacessível — pula silenciosamente, não é um erro fatal pra um scan de limpeza
    }

    for (const entry of entries) {
      const fullPath = join(path, entry.name);

      if (entry.isDirectory()) {
        if (this.excludeDirNames.has(entry.name)) continue;

        if (this.cacheDirNames.has(entry.name)) {
          const size = await this.dirSize(fullPath);
          candidates.push({
            path: fullPath,
            category: "cache",
            sizeBytes: size,
            reason: `Pasta de cache ("${entry.name}") — geralmente reconstruída automaticamente pelo programa que a criou.`,
            ageDays: 0,
          });
          continue; // não desce dentro de uma pasta de cache já classificada inteira
        }

        await this.walk(fullPath, candidates, isDownloadsFolder);

        // Depois de processar os filhos, checa se a pasta ficou vazia — candidato a remoção.
        const remainingEntries = await readdir(fullPath).catch(() => null);
        if (remainingEntries && remainingEntries.length === 0) {
          candidates.push({
            path: fullPath,
            category: "empty-folder",
            sizeBytes: 0,
            reason: "Pasta vazia.",
            ageDays: 0,
          });
        }
        continue;
      }

      const stats = await stat(fullPath).catch(() => null);
      if (!stats) continue;
      const ageDays = Math.floor((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24));

      const classification = this.classifyFile(entry.name, ageDays, isDownloadsFolder);
      if (classification) {
        candidates.push({
          path: fullPath,
          category: classification.category,
          sizeBytes: stats.size,
          reason: classification.reason,
          ageDays,
        });
      }
    }
  }

  private classifyFile(
    fileName: string,
    ageDays: number,
    isDownloadsFolder: boolean
  ): { category: JunkCategory; reason: string } | null {
    if (OS_JUNK_FILENAMES.includes(fileName)) {
      return {
        category: "os-junk",
        reason: `Arquivo de metadados do sistema operacional ("${fileName}"), não tem uso fora da pasta onde está.`,
      };
    }

    const ext = extname(fileName).toLowerCase();
    if (this.tempExtensions.has(ext)) {
      return {
        category: ext === ".log" ? "log-file" : "temp-file",
        reason: `Extensão "${ext}" geralmente indica arquivo temporário ou de log.`,
      };
    }

    if (isDownloadsFolder && INSTALLER_EXTENSIONS.includes(ext) && ageDays > this.oldDownloadsThresholdDays) {
      return {
        category: "old-installer",
        reason: `Instalador (${ext}) parado em Downloads há ${ageDays} dias — provavelmente já foi usado e pode ser removido.`,
      };
    }

    return null;
  }

  private async dirSize(path: string): Promise<number> {
    let total = 0;
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const fullPath = join(path, entry.name);
      if (entry.isDirectory()) {
        total += await this.dirSize(fullPath);
      } else {
        const s = await stat(fullPath).catch(() => null);
        if (s) total += s.size;
      }
    }
    return total;
  }
}

/** Utilidade isolada pra quem só precisa checar o nome de um arquivo (ex: UI mostrando ícone diferente por categoria). */
export function isKnownOsJunkFileName(fileName: string): boolean {
  return OS_JUNK_FILENAMES.includes(basename(fileName));
}
