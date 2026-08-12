import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ScanResult, ShieldEventMap, ThreatFinding } from "../types.js";

export interface ClamAVConfig {
  /** Caminho do binário. Usa `clamdscan` se o daemon estiver rodando (muito mais rápido em scans repetidos). */
  binaryPath?: string;
  /** Usa clamd (daemon) em vez do clamscan standalone. Requer clamd rodando. */
  useDaemon?: boolean;
  /** Caminho customizado da base de definições (freshclam). */
  databasePath?: string;
}

interface ParsedLine {
  filePath: string;
  signature: string;
}

/**
 * Wrapper sobre o ClamAV. Não reimplementa detecção — orquestra o binário
 * já testado em produção há décadas e traduz a saída para o formato
 * unificado do Shield (ThreatFinding).
 *
 * Pré-requisito do host: `clamav` instalado (`apt install clamav clamav-daemon`
 * no Linux, ou build oficial no Windows/macOS) e `freshclam` rodando
 * periodicamente para manter as assinaturas atualizadas.
 */
export class ClamAVScanner extends TypedEmitter<ShieldEventMap> {
  private readonly binaryPath: string;
  private readonly useDaemon: boolean;
  private readonly databasePath?: string;

  constructor(config: ClamAVConfig = {}) {
    super();
    this.useDaemon = config.useDaemon ?? false;
    this.binaryPath = config.binaryPath ?? (this.useDaemon ? "clamdscan" : "clamscan");
    this.databasePath = config.databasePath;
  }

  /** Verifica se o binário está disponível e retorna a versão instalada. */
  async checkAvailability(): Promise<{ available: boolean; version?: string }> {
    try {
      const output = await this.run(["--version"]);
      return { available: true, version: output.trim() };
    } catch {
      return { available: false };
    }
  }

  /** Dispara a atualização de assinaturas via freshclam. */
  async updateDefinitions(): Promise<{ updated: boolean; log: string }> {
    try {
      const log = await this.run(["--stdout"], "freshclam");
      return { updated: true, log };
    } catch (err) {
      return { updated: false, log: err instanceof Error ? err.message : String(err) };
    }
  }

  async scan(targetPath: string, recursive = true): Promise<ScanResult> {
    const startedAt = new Date().toISOString();
    this.emit("scan:started", { target: targetPath, engine: "clamav" });

    const args = this.buildScanArgs(targetPath, recursive);
    let rawOutput: string;
    try {
      rawOutput = await this.run(args);
    } catch (err) {
      // ClamAV retorna exit code 1 quando encontra vírus — não é erro de execução.
      rawOutput = err instanceof ClamAVProcessError ? err.stdout : "";
      if (!(err instanceof ClamAVProcessError)) {
        this.emit("error", { source: "clamav", message: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    }

    const findings = this.parseOutput(rawOutput);
    for (const finding of findings) {
      this.emit("threat:detected", finding);
    }

    const filesScannedMatch = rawOutput.match(/Scanned files:\s*(\d+)/i);
    const result: ScanResult = {
      target: targetPath,
      filesScanned: filesScannedMatch ? Number(filesScannedMatch[1]) : 0,
      findings,
      startedAt,
      finishedAt: new Date().toISOString(),
      engine: "clamav",
    };

    this.emit("scan:finished", result);
    return result;
  }

  private buildScanArgs(targetPath: string, recursive: boolean): string[] {
    const args: string[] = [];
    if (recursive) args.push("-r");
    args.push("--no-summary"); // parseamos linha a linha; summary completo vem via flag separada se precisar
    args.push("--infected"); // só reporta arquivos infectados, reduz ruído
    if (this.databasePath && !this.useDaemon) {
      args.push("-d", this.databasePath);
    }
    args.push(targetPath);
    return args;
  }

  /** Formato de linha do ClamAV: `/caminho/arquivo: Signature.Name FOUND` */
  private parseOutput(output: string): ThreatFinding[] {
    const lines = output
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith("FOUND"));

    const parsed: ParsedLine[] = lines.map((line) => {
      const match = line.match(/^(.*):\s(.*)\sFOUND$/);
      return {
        filePath: match?.[1]?.trim() ?? "unknown",
        signature: match?.[2]?.trim() ?? "unknown-signature",
      };
    });

    return parsed.map((p) => this.toThreatFinding(p));
  }

  private toThreatFinding(p: ParsedLine): ThreatFinding {
    return {
      id: randomUUID(),
      source: "clamav",
      severity: this.inferSeverity(p.signature),
      title: `Malware detectado: ${p.signature}`,
      description: `ClamAV identificou a assinatura "${p.signature}" no arquivo ${p.filePath}.`,
      filePath: p.filePath,
      detectedAt: new Date().toISOString(),
      raw: p,
    };
  }

  /** Heurística simples de severidade baseada em prefixos comuns das assinaturas ClamAV. */
  private inferSeverity(signature: string): ThreatFinding["severity"] {
    const sig = signature.toLowerCase();
    if (sig.includes("ransom") || sig.includes("trojan.crypt")) return "critical";
    if (sig.includes("trojan") || sig.includes("backdoor") || sig.includes("rootkit")) return "high";
    if (sig.includes("adware") || sig.includes("pua")) return "low";
    return "medium";
  }

  private run(args: string[], binaryOverride?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const bin = binaryOverride ?? this.binaryPath;
      const child = spawn(bin, args);
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else if (code === 1) {
          // Exit code 1 do clamscan = vírus encontrado, não é falha de execução.
          reject(new ClamAVProcessError(stdout, stderr, code));
        } else {
          const combined = stderr || stdout;
          if (/No supported database files found/i.test(combined)) {
            reject(
              new Error(
                `ClamAV não tem base de assinaturas instalada em /var/lib/clamav. Rode "freshclam" (ou updateDefinitions()) antes do primeiro scan. Detalhe original: ${combined.trim()}`
              )
            );
            return;
          }
          reject(new Error(`ClamAV finalizou com código ${code}: ${combined}`));
        }
      });
    });
  }
}

class ClamAVProcessError extends Error {
  constructor(
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly code: number
  ) {
    super(`ClamAV encontrou ameaças (exit code ${code})`);
    this.name = "ClamAVProcessError";
  }
}
