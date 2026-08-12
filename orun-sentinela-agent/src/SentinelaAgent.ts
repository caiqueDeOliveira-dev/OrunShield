import type { ThreatFinding } from "@orun/shield-core";
import type { AiProvider, AiProviderConfig } from "./providers/AiProvider.js";
import { createAiProvider } from "./providers/createAiProvider.js";
import { SENTINELA_SYSTEM_PROMPT, buildFindingPrompt, buildBatchSummaryPrompt } from "./persona/sentinelaPersona.js";

export interface SentinelaExplanation {
  findingId: string;
  explanation: string;
  generatedAt: string;
  /** true se a chamada de IA falhou e o texto abaixo é o fallback determinístico (sem IA). */
  isFallback: boolean;
}

export interface SentinelaAgentConfig {
  provider: AiProviderConfig;
  /** Cache em memória evita re-gerar explicação pro mesmo finding (ex: se a UI re-renderiza). */
  enableCache?: boolean;
}

/**
 * Agente do Hampton responsável por traduzir os `ThreatFinding` técnicos
 * do Orun Shield em explicações que qualquer usuário entende.
 *
 * Sempre tem um fallback determinístico (sem IA) para os casos em que o
 * provider está indisponível — segurança não pode ficar sem explicação
 * nenhuma só porque o Ollama caiu ou a API key expirou.
 */
export class SentinelaAgent {
  private readonly provider: AiProvider;
  private readonly cache = new Map<string, SentinelaExplanation>();
  private readonly cacheEnabled: boolean;

  constructor(config: SentinelaAgentConfig) {
    this.provider = createAiProvider(config.provider);
    this.cacheEnabled = config.enableCache ?? true;
  }

  async explainFinding(finding: ThreatFinding): Promise<SentinelaExplanation> {
    if (this.cacheEnabled && this.cache.has(finding.id)) {
      return this.cache.get(finding.id)!;
    }

    let explanation: SentinelaExplanation;
    try {
      const text = await this.provider.complete([
        { role: "system", content: SENTINELA_SYSTEM_PROMPT },
        { role: "user", content: buildFindingPrompt(finding) },
      ]);
      explanation = {
        findingId: finding.id,
        explanation: text.trim(),
        generatedAt: new Date().toISOString(),
        isFallback: false,
      };
    } catch {
      // Provider indisponível (Ollama caiu, API key inválida, rede fora) — nunca deixa o usuário sem explicação.
      explanation = {
        findingId: finding.id,
        explanation: this.fallbackExplanation(finding),
        generatedAt: new Date().toISOString(),
        isFallback: true,
      };
    }

    if (this.cacheEnabled) this.cache.set(finding.id, explanation);
    return explanation;
  }

  /** Resumo executivo de múltiplos findings acumulados — útil pro dashboard mostrar de cara. */
  async summarizeBatch(findings: ThreatFinding[]): Promise<string> {
    if (findings.length === 0) {
      return "Nenhum alerta de segurança no momento. Está tudo tranquilo.";
    }
    try {
      return (
        await this.provider.complete([
          { role: "system", content: SENTINELA_SYSTEM_PROMPT },
          { role: "user", content: buildBatchSummaryPrompt(findings) },
        ])
      ).trim();
    } catch {
      return this.fallbackBatchSummary(findings);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  /** Explicação determinística baseada em templates simples por severidade/fonte — sem depender de IA. */
  private fallbackExplanation(finding: ThreatFinding): string {
    const actionBySeverity: Record<ThreatFinding["severity"], string> = {
      critical: "Recomendo isolar ou remover isso agora e revisar o sistema com atenção.",
      high: "Vale investigar em breve — não é urgência de minuto, mas não deve ser ignorado.",
      medium: "Dá pra dar uma olhada quando puder; não é uma emergência.",
      low: "Provavelmente é normal, mas fica registrado caso o padrão se repita.",
      info: "Apenas informativo, nenhuma ação necessária.",
    };

    return `${finding.title}. ${finding.description} ${actionBySeverity[finding.severity]} (Explicação gerada sem IA — provider indisponível no momento.)`;
  }

  private fallbackBatchSummary(findings: ThreatFinding[]): string {
    const critical = findings.filter((f) => f.severity === "critical").length;
    const high = findings.filter((f) => f.severity === "high").length;

    if (critical > 0) {
      return `Você tem ${critical} alerta(s) crítico(s) entre os ${findings.length} alertas acumulados. Recomendo revisar esses primeiro. (Resumo gerado sem IA — provider indisponível.)`;
    }
    if (high > 0) {
      return `Nenhum alerta crítico, mas ${high} de alta severidade merecem atenção entre os ${findings.length} acumulados. (Resumo gerado sem IA — provider indisponível.)`;
    }
    return `${findings.length} alertas acumulados, nenhum crítico ou de alta severidade. Situação sob controle. (Resumo gerado sem IA — provider indisponível.)`;
  }
}
