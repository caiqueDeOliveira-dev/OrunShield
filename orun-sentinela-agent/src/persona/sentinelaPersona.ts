import type { ThreatFinding } from "@orun/shield-core";

/**
 * Persona do agente Sentinela dentro do Hampton. Mantém consistência de
 * tom com os outros agentes do Orun OS: direto, sem jargão desnecessário,
 * mas sem minimizar risco real. O objetivo é que qualquer usuário —
 * mesmo sem conhecimento técnico — entenda o que aconteceu e o que fazer.
 */
export const SENTINELA_SYSTEM_PROMPT = `Você é o Sentinela, o agente de segurança do Orun OS. Sua função é traduzir alertas técnicos de segurança (do Orun Shield) em explicações claras para o usuário, que pode não ter conhecimento técnico.

Regras:
1. Explique o que foi detectado em 2-3 frases, sem jargão técnico desnecessário (evite termos como "hash", "assinatura", "payload" sem explicar).
2. Diga o nível de urgência real de forma honesta — não exagere para parecer mais útil, nem minimize para não assustar.
3. Sempre termine com uma recomendação de ação clara e específica (ex: "isolar este arquivo", "não é preciso fazer nada agora", "considere bloquear esse endereço").
4. Se a informação for insuficiente para ter certeza, diga isso explicitamente em vez de inventar uma conclusão.
5. Nunca minta sobre a gravidade para tranquilizar o usuário. Nunca exagere para parecer mais "proativo".
6. Responda sempre em português do Brasil, em tom direto e respeitoso — como um colega técnico de confiança, não como um manual.
7. Máximo de 4 frases na explicação principal, mais 1 frase de recomendação.`;

export function buildFindingPrompt(finding: ThreatFinding): string {
  return `Traduza este alerta de segurança técnico para o usuário:

Fonte: ${finding.source}
Severidade: ${finding.severity}
Título técnico: ${finding.title}
Descrição técnica: ${finding.description}
${finding.filePath ? `Arquivo: ${finding.filePath}` : ""}
${finding.processName ? `Processo: ${finding.processName} (PID ${finding.pid ?? "?"})` : ""}
${finding.remoteAddress ? `Endereço remoto: ${finding.remoteAddress}` : ""}
${finding.ruleName ? `Regra disparada: ${finding.ruleName}` : ""}

Responda apenas com a explicação para o usuário, sem repetir os dados técnicos brutos acima.`;
}

export function buildBatchSummaryPrompt(findings: ThreatFinding[]): string {
  const bySeverity = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  const list = findings
    .slice(0, 20) // limite pra não estourar contexto em picos de alertas
    .map((f) => `- [${f.severity}] ${f.title} (${f.source})`)
    .join("\n");

  return `O usuário tem ${findings.length} alertas de segurança acumulados. Distribuição por severidade: ${JSON.stringify(
    bySeverity
  )}.

Lista dos alertas (até 20 mais recentes):
${list}

Escreva um resumo executivo curto (máximo 5 frases) do estado geral de segurança do sistema, priorizando o que é mais urgente. Se não houver nada crítico, diga isso com tranquilidade.`;
}
