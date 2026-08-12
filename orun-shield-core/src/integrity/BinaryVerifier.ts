import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";

interface Manifest {
  generatedAt: string;
  entries: Record<string, string>; // caminho relativo -> sha256
}

/**
 * Protege o próprio Orun OS/Hampton: gera um manifesto de hashes SHA-256
 * dos binários/arquivos críticos da instalação e verifica no boot (ou
 * sob demanda) se algo foi alterado — detecta tanto malware que injeta
 * código nos próprios binários do Orun quanto builds corrompidos/adulterados.
 *
 * Fluxo recomendado:
 *  1. No pipeline de build/release (CI), gerar o manifesto com `generateManifest`
 *     e assiná-lo/publicá-lo junto do instalador.
 *  2. No app rodando, chamar `verify` no startup e comparar contra o manifesto
 *     baixado (não o gerado localmente — senão um binário adulterado poderia
 *     gerar seu próprio manifesto "válido").
 */
export class BinaryVerifier extends TypedEmitter<ShieldEventMap> {
  async generateManifest(rootDir: string, extensions = [".exe", ".dll", ".node", ".asar"]): Promise<Manifest> {
    const entries: Record<string, string> = {};
    await this.walk(rootDir, rootDir, extensions, entries);
    return { generatedAt: new Date().toISOString(), entries };
  }

  async saveManifest(manifest: Manifest, outputPath: string): Promise<void> {
    await writeFile(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  async loadManifest(manifestPath: string): Promise<Manifest> {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as Manifest;
  }

  /**
   * Compara o estado atual do diretório contra um manifesto de referência
   * (idealmente baixado de uma fonte confiável, não gerado localmente).
   */
  async verify(rootDir: string, referenceManifest: Manifest): Promise<ThreatFinding[]> {
    const findings: ThreatFinding[] = [];
    const currentEntries: Record<string, string> = {};
    const extensions = Array.from(
      new Set(Object.keys(referenceManifest.entries).map((p) => p.slice(p.lastIndexOf("."))))
    );
    await this.walk(rootDir, rootDir, extensions, currentEntries);

    for (const [relPath, expectedHash] of Object.entries(referenceManifest.entries)) {
      const actualHash = currentEntries[relPath];
      if (!actualHash) {
        findings.push(this.toFinding("critical", `Arquivo crítico ausente: ${relPath}`, relPath));
        continue;
      }
      if (actualHash !== expectedHash) {
        findings.push(
          this.toFinding(
            "critical",
            `Arquivo crítico modificado: ${relPath}. Hash esperado ${expectedHash.slice(
              0,
              12
            )}..., encontrado ${actualHash.slice(0, 12)}...`,
            relPath
          )
        );
      }
    }

    // Arquivos novos não previstos no manifesto também merecem atenção (menos crítico).
    for (const relPath of Object.keys(currentEntries)) {
      if (!(relPath in referenceManifest.entries)) {
        findings.push(this.toFinding("medium", `Arquivo não previsto no manifesto: ${relPath}`, relPath));
      }
    }

    for (const finding of findings) {
      this.emit("integrity:violation", finding);
      this.emit("threat:detected", finding);
    }
    return findings;
  }

  private toFinding(severity: ThreatFinding["severity"], title: string, filePath: string): ThreatFinding {
    return {
      id: randomUUID(),
      source: "integrity",
      severity,
      title,
      description: title,
      filePath,
      detectedAt: new Date().toISOString(),
    };
  }

  private async walk(
    root: string,
    dir: string,
    extensions: string[],
    out: Record<string, string>
  ): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        await this.walk(root, fullPath, extensions, out);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        const buffer = await readFile(fullPath);
        const hash = createHash("sha256").update(buffer).digest("hex");
        const relPath = fullPath.slice(root.length + 1).replace(/\\/g, "/");
        out[relPath] = hash;
      }
    }
  }
}
