import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import fetch from "node-fetch";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";

const VT_BASE_URL = "https://www.virustotal.com/api/v3";
/** Upload direto só é permitido até 32MB; acima disso é preciso pedir uma upload_url dedicada. */
const DIRECT_UPLOAD_LIMIT_BYTES = 32 * 1024 * 1024;

export interface VirusTotalConfig {
  apiKey: string;
  /** Limite mínimo de engines positivas para considerar como ameaça confirmada (evita falso positivo isolado). */
  minPositivesToFlag?: number;
}

interface VTAnalysisStats {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
  timeout: number;
}

/**
 * Cliente para a VirusTotal API v3. Usado como segunda opinião: consulta
 * o hash de um arquivo contra 70+ engines antes de decidir se algo
 * suspeito (ex: sinalizado pelo Sentinel) é de fato malicioso.
 *
 * Requer uma API key gratuita ou paga (https://www.virustotal.com/gui/join-us).
 * O tier gratuito tem rate limit de ~4 req/min — o client já trata 429.
 */
export class VirusTotalClient extends TypedEmitter<ShieldEventMap> {
  private readonly apiKey: string;
  private readonly minPositivesToFlag: number;

  constructor(config: VirusTotalConfig) {
    super();
    this.apiKey = config.apiKey;
    this.minPositivesToFlag = config.minPositivesToFlag ?? 2;
  }

  /** Calcula o SHA-256 de um arquivo local. */
  async hashFile(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Consulta um hash já conhecido pela VT (não sobe o arquivo).
   * Retorna null se o hash nunca foi visto pela VirusTotal.
   */
  async lookupHash(sha256: string): Promise<ThreatFinding | null> {
    const res = await this.request(`/files/${sha256}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`VirusTotal respondeu ${res.status} ao consultar hash`);

    const body = (await res.json()) as {
      data: { attributes: { last_analysis_stats: VTAnalysisStats; meaningful_name?: string } };
    };
    const stats = body.data.attributes.last_analysis_stats;
    return this.evaluateStats(stats, sha256, body.data.attributes.meaningful_name);
  }

  /**
   * Fluxo completo: hashea o arquivo local, consulta o hash e, só se a VT
   * nunca viu esse arquivo, faz upload para análise (mais lento, minutos).
   */
  async scanFile(filePath: string): Promise<ThreatFinding | null> {
    const sha256 = await this.hashFile(filePath);
    const known = await this.lookupHash(sha256);
    if (known) return known;

    const analysisId = await this.uploadFile(filePath);
    return this.pollAnalysis(analysisId, filePath, sha256);
  }

  private async uploadFile(filePath: string): Promise<string> {
    const { size } = await stat(filePath);
    const buffer = await readFile(filePath);

    let uploadUrl = `${VT_BASE_URL}/files`;
    if (size > DIRECT_UPLOAD_LIMIT_BYTES) {
      const res = await this.request("/files/upload_url");
      const body = (await res.json()) as { data: string };
      uploadUrl = body.data;
    }

    const form = new FormData();
    form.append("file", new Blob([buffer]), filePath.split(/[/\\]/).pop() ?? "sample");

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "x-apikey": this.apiKey },
      // node-fetch aceita FormData/Blob em runtime; tipagem do pacote diverge do lib.dom.
      body: form as any,
    });
    if (!res.ok) throw new Error(`Falha no upload para VirusTotal: ${res.status}`);

    const body = (await res.json()) as { data: { id: string } };
    return body.data.id;
  }

  private async pollAnalysis(
    analysisId: string,
    filePath: string,
    sha256: string,
    attempts = 10,
    intervalMs = 15_000
  ): Promise<ThreatFinding | null> {
    for (let i = 0; i < attempts; i++) {
      const res = await this.request(`/analyses/${analysisId}`);
      const body = (await res.json()) as {
        data: { attributes: { status: string; stats: VTAnalysisStats } };
      };

      if (body.data.attributes.status === "completed") {
        const finding = this.evaluateStats(body.data.attributes.stats, sha256);
        if (finding) finding.filePath = filePath;
        return finding;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    // Análise não terminou a tempo — não bloqueia o fluxo, apenas não confirma.
    return null;
  }

  private evaluateStats(stats: VTAnalysisStats, sha256: string, name?: string): ThreatFinding | null {
    if (stats.malicious < this.minPositivesToFlag) return null;

    const total = stats.malicious + stats.suspicious + stats.undetected + stats.harmless;
    const finding: ThreatFinding = {
      id: randomUUID(),
      source: "virustotal",
      severity: stats.malicious >= 10 ? "critical" : stats.malicious >= 5 ? "high" : "medium",
      title: `Arquivo sinalizado por ${stats.malicious}/${total} engines`,
      description: `VirusTotal: ${stats.malicious} engines de segurança marcaram ${
        name ?? sha256
      } como malicioso, ${stats.suspicious} como suspeito.`,
      sha256,
      detectedAt: new Date().toISOString(),
      raw: stats,
    };
    return finding;
  }

  private async request(path: string): Promise<Response> {
    const res = await fetch(`${VT_BASE_URL}${path}`, {
      headers: { "x-apikey": this.apiKey },
    });
    if (res.status === 429) {
      // Rate limit do tier gratuito — espera e tenta uma vez mais.
      await new Promise((r) => setTimeout(r, 60_000));
      return this.request(path);
    }
    return res as unknown as Response;
  }
}
