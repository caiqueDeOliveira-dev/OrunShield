import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";

export interface YaraConfig {
  /** Caminho do binário `yara` (https://virustotal.github.io/yara/). */
  binaryPath?: string;
  /** Pasta contendo os arquivos .yar/.yara com as regras do Orun. */
  rulesDir: string;
}

/**
 * Wrapper sobre o binário `yara`. Diferente do ClamAV (assinaturas prontas)
 * e da VirusTotal (terceiros), aqui as regras são escritas pelo próprio
 * time do Orun — é o único ponto da detecção 100% autoral, para padrões
 * específicos que vocês identificarem (ex: comportamento de malware visto
 * em incidentes reais, ou heurísticas para os próprios formatos do Orun).
 *
 * Pré-requisito do host: `yara` instalado (`apt install yara` /
 * `brew install yara` / build oficial no Windows).
 */
export class YaraEngine extends TypedEmitter<ShieldEventMap> {
  private readonly binaryPath: string;
  private readonly rulesDir: string;

  constructor(config: YaraConfig) {
    super();
    this.binaryPath = config.binaryPath ?? "yara";
    this.rulesDir = config.rulesDir;
  }

  async listRuleFiles(): Promise<string[]> {
    const entries = await readdir(this.rulesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && (e.name.endsWith(".yar") || e.name.endsWith(".yara")))
      .map((e) => join(this.rulesDir, e.name));
  }

  async scan(targetPath: string, recursive = true): Promise<ThreatFinding[]> {
    this.emit("scan:started", { target: targetPath, engine: "yara" });
    const ruleFiles = await this.listRuleFiles();
    if (ruleFiles.length === 0) {
      return [];
    }

    const findings: ThreatFinding[] = [];
    for (const ruleFile of ruleFiles) {
      const args = ["-w"]; // -w: suprime warnings de compilação de regra
      if (recursive) args.push("-r");
      args.push(ruleFile, targetPath);

      const output = await this.run(args);
      findings.push(...this.parseOutput(output));
    }

    for (const finding of findings) this.emit("threat:detected", finding);
    return findings;
  }

  /** Formato de saída do yara: `RuleName /caminho/arquivo` por linha. */
  private parseOutput(output: string): ThreatFinding[] {
    return output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [ruleName, ...pathParts] = line.split(/\s+/);
        const filePath = pathParts.join(" ");
        return {
          id: randomUUID(),
          source: "yara" as const,
          severity: "medium" as const,
          title: `Regra YARA "${ruleName}" disparada`,
          description: `O arquivo ${filePath} corresponde ao padrão definido na regra customizada "${ruleName}".`,
          filePath,
          ruleName,
          detectedAt: new Date().toISOString(),
        };
      });
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => (stdout += c.toString()));
      child.stderr.on("data", (c) => (stderr += c.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        // yara retorna 0 mesmo sem matches; só falha em erro de sintaxe/arquivo.
        if (code === 0) resolve(stdout);
        else reject(new Error(`yara finalizou com código ${code}: ${stderr}`));
      });
    });
  }
}
