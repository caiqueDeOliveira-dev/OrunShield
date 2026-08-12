import * as Crypto from "expo-crypto";
import { VirusTotalClient } from "@orun/shield-core";
import type { FileHashCheckResult, LinkVerdict } from "../types.js";

export interface DownloadScannerConfig {
  virusTotalApiKey: string;
}

/**
 * Verifica arquivos que o próprio app Orun recebe (anexos no Hampton
 * mobile, downloads pontuais) antes de abri-los. Usa `expo-crypto` para
 * hashear localmente (sem subir o conteúdo do arquivo, só o hash) e o
 * `VirusTotalClient` já existente no `@orun/shield-core` — reaproveitado
 * aqui, mesma lógica do desktop, sem duplicar código.
 *
 * Diferente do desktop, aqui NÃO fazemos upload de arquivo desconhecido
 * pra análise (o fluxo `scanFile` completo do desktop) — só consultamos
 * hash. Upload de arquivo do usuário sem confirmação explícita não é
 * apropriado no contexto mobile; se quiser habilitar, pedir consentimento
 * explícito antes.
 */
export class DownloadScanner {
  private readonly vtClient: VirusTotalClient;

  constructor(config: DownloadScannerConfig) {
    this.vtClient = new VirusTotalClient({ apiKey: config.virusTotalApiKey });
  }

  /** Recebe o conteúdo do arquivo já lido (ex: via expo-file-system) como base64 ou Uint8Array. */
  async checkFile(fileName: string, content: string | Uint8Array): Promise<FileHashCheckResult> {
    const sha256 = await this.hashContent(content);
    const checkedAt = new Date().toISOString();

    try {
      const finding = await this.vtClient.lookupHash(sha256);
      if (!finding) {
        return { fileName, sha256, verdict: "unknown" as LinkVerdict, checkedAt };
      }
      const raw = finding.raw as { malicious: number; suspicious: number; undetected: number; harmless: number } | undefined;
      const total = raw ? raw.malicious + raw.suspicious + raw.undetected + raw.harmless : undefined;
      return {
        fileName,
        sha256,
        verdict: "malicious" as LinkVerdict,
        positives: raw?.malicious,
        totalEngines: total,
        checkedAt,
      };
    } catch {
      return { fileName, sha256, verdict: "unknown" as LinkVerdict, checkedAt };
    }
  }

  private async hashContent(content: string | Uint8Array): Promise<string> {
    if (typeof content === "string") {
      return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, content, {
        encoding: Crypto.CryptoEncoding.HEX,
      });
    }
    // Uint8Array (binário lido via expo-file-system em modo bytes).
    const binaryString = Array.from(content)
      .map((byte) => String.fromCharCode(byte))
      .join("");
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, binaryString, {
      encoding: Crypto.CryptoEncoding.HEX,
    });
  }
}
