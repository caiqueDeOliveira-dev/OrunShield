import { randomUUID, createHash } from "node:crypto";
import { mkdir, rename, chmod, unlink, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";

export interface QuarantineManagerConfig {
  /** Pasta onde os arquivos isolados ficam guardados. Deve estar fora de qualquer pasta monitorada/sincronizada. */
  quarantineDir: string;
}

export interface QuarantineEntry {
  id: string;
  originalPath: string;
  quarantinedPath: string;
  sha256AtQuarantine: string;
  finding: ThreatFinding;
  quarantinedAt: string;
}

export interface QuarantineActionResult {
  success: boolean;
  entry?: QuarantineEntry;
  error?: string;
}

/**
 * Isola arquivos identificados como ameaça — a diferença entre um sistema
 * que só "avisa" e um antivírus de verdade. O arquivo NUNCA é apagado
 * automaticamente: é movido para uma pasta isolada, com permissões
 * revogadas (não pode ser executado nem lido por outros processos), e
 * fica lá até o usuário decidir restaurar ou apagar permanentemente.
 *
 * Isso é intencional: falsos positivos acontecem (mesmo com ClamAV/VT),
 * e apagar automaticamente um arquivo legítimo do usuário seria pior do
 * que deixar uma ameaça real momentaneamente isolada esperando decisão.
 */
export class QuarantineManager extends TypedEmitter<ShieldEventMap> {
  private readonly quarantineDir: string;
  private readonly metadataDir: string;

  constructor(config: QuarantineManagerConfig) {
    super();
    this.quarantineDir = config.quarantineDir;
    this.metadataDir = join(config.quarantineDir, ".metadata");
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.quarantineDir, { recursive: true });
    await mkdir(this.metadataDir, { recursive: true });
  }

  /**
   * Move o arquivo referenciado pelo finding para a quarentena.
   * Falha graciosamente (não lança exceção) se o arquivo já não existir
   * mais, se o finding não tiver `filePath`, ou se a operação de mover
   * falhar por permissão — quem chama decide o que fazer com `success: false`.
   */
  async quarantine(finding: ThreatFinding): Promise<QuarantineActionResult> {
    if (!finding.filePath) {
      return { success: false, error: "Finding não tem filePath associado — nada para colocar em quarentena." };
    }

    await this.ensureReady();

    try {
      const originalPath = finding.filePath;
      const originalStat = await stat(originalPath).catch(() => null);
      if (!originalStat) {
        return { success: false, error: `Arquivo não encontrado (pode já ter sido movido/apagado): ${originalPath}` };
      }

      const sha256 = createHash("sha256").update(await readFile(originalPath)).digest("hex");
      const id = randomUUID();
      const quarantinedPath = join(this.quarantineDir, id);

      await rename(originalPath, quarantinedPath);
      // Remove todas as permissões de execução/escrita — só leitura pro dono, e mesmo assim só pra restauração.
      // No Windows o chmod não é POSIX: 0o400 seta o atributo READONLY, que impediria modificação de teste E o
      // unlink do permanentlyDelete (deixaria o arquivo órfão). Então no Windows a proteção fica por conta da
      // ACL da pasta de quarentena, não do atributo do arquivo.
      if (process.platform !== "win32") {
        await chmod(quarantinedPath, 0o400).catch(() => {
          // Falha de chmod é best-effort (ex: filesystem sem suporte a permissões).
        });
      }

      const entry: QuarantineEntry = {
        id,
        originalPath,
        quarantinedPath,
        sha256AtQuarantine: sha256,
        finding,
        quarantinedAt: new Date().toISOString(),
      };
      await writeFile(this.metadataPath(id), JSON.stringify(entry, null, 2), "utf-8");

      return { success: true, entry };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("error", { source: "orchestrator", message: `Falha ao colocar em quarentena: ${message}` });
      return { success: false, error: message };
    }
  }

  async list(): Promise<QuarantineEntry[]> {
    await this.ensureReady();
    const files = await readdir(this.metadataDir);
    const entries: QuarantineEntry[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await readFile(join(this.metadataDir, file), "utf-8");
      entries.push(JSON.parse(raw) as QuarantineEntry);
    }
    return entries.sort((a, b) => b.quarantinedAt.localeCompare(a.quarantinedAt));
  }

  /**
   * Devolve o arquivo pro local original — usar só quando o usuário tem
   * certeza de que foi falso positivo. Verifica a integridade do hash
   * antes de restaurar (garante que o arquivo em quarentena não foi
   * adulterado enquanto estava lá).
   */
  async restore(id: string): Promise<QuarantineActionResult> {
    const entry = await this.getEntry(id);
    if (!entry) return { success: false, error: `Entrada de quarentena não encontrada: ${id}` };

    try {
      const currentHash = createHash("sha256").update(await readFile(entry.quarantinedPath)).digest("hex");
      if (currentHash !== entry.sha256AtQuarantine) {
        return {
          success: false,
          error: "Integridade do arquivo em quarentena não bate com o hash original — restauração bloqueada por segurança.",
        };
      }

      await mkdir(dirname(entry.originalPath), { recursive: true });
      await chmod(entry.quarantinedPath, 0o644).catch(() => {});
      await rename(entry.quarantinedPath, entry.originalPath);
      await unlink(this.metadataPath(id));

      return { success: true, entry };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /** Apaga definitivamente o arquivo em quarentena e seus metadados. Ação irreversível. */
  async permanentlyDelete(id: string): Promise<QuarantineActionResult> {
    const entry = await this.getEntry(id);
    if (!entry) return { success: false, error: `Entrada de quarentena não encontrada: ${id}` };

    try {
      // Limpa READONLY (atributo setado por chmod em Windows, se o arquivo tiver vindo de versão anterior) —
      // sem isso o unlink falha com EPERM e o arquivo fica órfão.
      await chmod(entry.quarantinedPath, 0o644).catch(() => {});
      await unlink(entry.quarantinedPath).catch(() => {
        // Já pode ter sido removido manualmente — não bloqueia a limpeza dos metadados.
      });
      await unlink(this.metadataPath(id));
      return { success: true, entry };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  private async getEntry(id: string): Promise<QuarantineEntry | null> {
    try {
      const raw = await readFile(this.metadataPath(id), "utf-8");
      return JSON.parse(raw) as QuarantineEntry;
    } catch {
      return null;
    }
  }

  private metadataPath(id: string): string {
    return join(this.metadataDir, `${id}.json`);
  }
}
