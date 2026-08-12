import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, readdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { JunkCandidate, PendingDeletionEntry, CleanupActionResult } from "../types.js";

export interface CleanupManagerConfig {
  /** Pasta de espera — arquivos ficam aqui antes de serem apagados de verdade. */
  holdingDir: string;
  /** Dias que um item fica na área de espera antes de ficar elegível pra purga automática (se o app rodar isso periodicamente). Purga nunca é automática por padrão — só marca elegibilidade. */
  holdingPeriodDays?: number;
}

/**
 * Remove arquivos/pastas identificados como junk (ou escolhidos manualmente
 * pelo usuário na tela de "uso de disco") — mas nunca apaga direto.
 * Move pra uma pasta de espera primeiro, com metadados, exatamente como o
 * `QuarantineManager` do Shield faz com ameaças — a diferença é que aqui o
 * motivo é "usuário não quer mais isso", não "isso é perigoso".
 *
 * Isso importa especialmente pro caso de uso descrito: "deletar o que não
 * quero mais depois de ver onde o espaço está sendo usado" — dar ao
 * usuário uma segunda chance antes de apagar de verdade evita que um clique
 * errado apague algo importante sem volta.
 */
export class CleanupManager {
  private readonly holdingDir: string;
  private readonly metadataDir: string;
  private readonly holdingPeriodDays: number;

  constructor(config: CleanupManagerConfig) {
    this.holdingDir = config.holdingDir;
    this.metadataDir = join(config.holdingDir, ".metadata");
    this.holdingPeriodDays = config.holdingPeriodDays ?? 7;
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.holdingDir, { recursive: true });
    await mkdir(this.metadataDir, { recursive: true });
  }

  /** Move um candidato (vindo do `JunkFileDetector` ou escolhido manualmente na UI) pra área de espera. */
  async moveToHolding(candidate: JunkCandidate | { path: string; sizeBytes: number }): Promise<CleanupActionResult> {
    await this.ensureReady();

    try {
      const originalStat = await stat(candidate.path).catch(() => null);
      if (!originalStat) {
        return { success: false, error: `Caminho não encontrado (pode já ter sido movido/apagado): ${candidate.path}` };
      }

      const id = randomUUID();
      const holdingPath = join(this.holdingDir, id);
      await rename(candidate.path, holdingPath);

      const now = new Date();
      const eligibleAt = new Date(now.getTime() + this.holdingPeriodDays * 24 * 60 * 60 * 1000);

      const entry: PendingDeletionEntry = {
        id,
        originalPath: candidate.path,
        holdingPath,
        category: "category" in candidate ? candidate.category : "manual",
        sizeBytes: candidate.sizeBytes,
        movedAt: now.toISOString(),
        eligibleForPurgeAt: eligibleAt.toISOString(),
      };
      await writeFile(this.metadataPath(id), JSON.stringify(entry, null, 2), "utf-8");

      return { success: true, entry };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Move vários candidatos de uma vez — falhas individuais não interrompem o restante do lote. */
  async moveManyToHolding(
    candidates: (JunkCandidate | { path: string; sizeBytes: number })[]
  ): Promise<CleanupActionResult[]> {
    const results: CleanupActionResult[] = [];
    for (const candidate of candidates) {
      results.push(await this.moveToHolding(candidate));
    }
    return results;
  }

  async list(): Promise<PendingDeletionEntry[]> {
    await this.ensureReady();
    const files = await readdir(this.metadataDir);
    const entries: PendingDeletionEntry[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await readFile(join(this.metadataDir, file), "utf-8");
      entries.push(JSON.parse(raw) as PendingDeletionEntry);
    }
    return entries.sort((a, b) => b.movedAt.localeCompare(a.movedAt));
  }

  /** Devolve o item pro local original — usar se o usuário mudar de ideia antes da purga definitiva. */
  async restore(id: string): Promise<CleanupActionResult> {
    const entry = await this.getEntry(id);
    if (!entry) return { success: false, error: `Item não encontrado na área de espera: ${id}` };

    try {
      await mkdir(dirname(entry.originalPath), { recursive: true });
      await rename(entry.holdingPath, entry.originalPath);
      await unlink(this.metadataPath(id));
      return { success: true, entry };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Apaga definitivamente — ação irreversível. Usar só depois que o usuário confirmar de vez, ou automaticamente após `eligibleForPurgeAt` se o app tiver essa rotina configurada. */
  async permanentlyDelete(id: string): Promise<CleanupActionResult> {
    const entry = await this.getEntry(id);
    if (!entry) return { success: false, error: `Item não encontrado na área de espera: ${id}` };

    try {
      await rm(entry.holdingPath, { recursive: true, force: true });
      await unlink(this.metadataPath(id));
      return { success: true, entry };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Purga tudo que já passou do prazo de espera (`eligibleForPurgeAt`).
   * NUNCA é chamado automaticamente pelo pacote — precisa ser explicitamente
   * agendado pelo app (ex: um cron diário), pra que apagar de verdade seja
   * sempre uma decisão consciente de quem integra o pacote, não um
   * comportamento oculto rodando sozinho.
   */
  async purgeEligible(): Promise<CleanupActionResult[]> {
    const entries = await this.list();
    const now = Date.now();
    const eligible = entries.filter((e) => new Date(e.eligibleForPurgeAt).getTime() <= now);

    const results: CleanupActionResult[] = [];
    for (const entry of eligible) {
      results.push(await this.permanentlyDelete(entry.id));
    }
    return results;
  }

  private async getEntry(id: string): Promise<PendingDeletionEntry | null> {
    try {
      const raw = await readFile(this.metadataPath(id), "utf-8");
      return JSON.parse(raw) as PendingDeletionEntry;
    } catch {
      return null;
    }
  }

  private metadataPath(id: string): string {
    return join(this.metadataDir, `${id}.json`);
  }
}
