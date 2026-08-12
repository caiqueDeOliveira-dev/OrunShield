import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { DiskUsageNode, DiskUsageScanResult } from "../types.js";

export interface DiskUsageScannerConfig {
  /** Pastas a pular completamente (nome exato, não caminho completo) — evita gastar tempo em node_modules, .git, etc. */
  skipDirNames?: string[];
  /** Quantos itens retornar em `topConsumers`. */
  topN?: number;
}

const DEFAULT_SKIP_DIRS = ["node_modules", ".git", "$RECYCLE.BIN", "System Volume Information"];

/**
 * Percorre uma árvore de diretórios e calcula o tamanho de cada
 * arquivo/pasta, de forma resiliente a erros de permissão (não aborta o
 * scan inteiro por causa de uma pasta protegida do sistema — só pula e
 * registra o erro pra reportar depois).
 */
export class DiskUsageScanner {
  private readonly skipDirNames: Set<string>;
  private readonly topN: number;

  constructor(config: DiskUsageScannerConfig = {}) {
    this.skipDirNames = new Set([...DEFAULT_SKIP_DIRS, ...(config.skipDirNames ?? [])]);
    this.topN = config.topN ?? 20;
  }

  async scan(rootPath: string): Promise<DiskUsageScanResult> {
    const errors: { path: string; message: string }[] = [];
    let filesScanned = 0;

    const countFile = () => {
      filesScanned += 1;
    };

    const tree = await this.walk(rootPath, errors, countFile);
    const allNodes = this.flatten(tree);
    const topconsumers = allNodes
      .filter((n) => n.path !== rootPath) // não faz sentido listar a própria raiz como "consumidora"
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, this.topN);

    return {
      rootPath,
      totalSizeBytes: tree.sizeBytes,
      tree,
      topconsumers,
      scannedAt: new Date().toISOString(),
      filesScanned,
      errors,
    };
  }

  private async walk(
    path: string,
    errors: { path: string; message: string }[],
    countFile: () => void
  ): Promise<DiskUsageNode> {
    let stats;
    try {
      stats = await stat(path);
    } catch (err) {
      errors.push({ path, message: err instanceof Error ? err.message : String(err) });
      return { path, name: basename(path), type: "file", sizeBytes: 0 };
    }

    if (!stats.isDirectory()) {
      countFile();
      return { path, name: basename(path), type: "file", sizeBytes: stats.size };
    }

    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (err) {
      errors.push({ path, message: err instanceof Error ? err.message : String(err) });
      return { path, name: basename(path), type: "directory", sizeBytes: 0, children: [] };
    }

    const children: DiskUsageNode[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && this.skipDirNames.has(entry.name)) continue;
      const childPath = join(path, entry.name);
      children.push(await this.walk(childPath, errors, countFile));
    }

    children.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const sizeBytes = children.reduce((sum, c) => sum + c.sizeBytes, 0);

    return { path, name: basename(path), type: "directory", sizeBytes, children };
  }

  private flatten(node: DiskUsageNode): DiskUsageNode[] {
    const result: DiskUsageNode[] = [node];
    for (const child of node.children ?? []) {
      result.push(...this.flatten(child));
    }
    return result;
  }
}
