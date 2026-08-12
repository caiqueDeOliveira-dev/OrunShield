// electron/cyber-ai.cjs — IA de cyber security do Orun Shield (Sentinela)
// Adaptação CJS do `@orun/sentinela-agent` (ESM). Providers plugáveis:
//   1) Ollama local  (http://localhost:11434)
//   2) OpenAI-compatível (OpenRouter/Groq/OpenAI/etc — /v1/chat/completions)
//   3) Anthropic     (Messages API)
// Sempre há fallback determinístico (sem IA) se nenhum provider responder —
// segurança não pode ficar sem explicação só porque o Ollama caiu.
// Usa fetch global (Node 20 no Electron 31) — zero dependências externas.

const fs = require("node:fs");
const path = require("node:path");

const SENTINELA_SYSTEM_PROMPT = `Você é o Sentinela, o agente de segurança do Orun Shield. Sua função é traduzir alertas técnicos de segurança em explicações claras para o usuário, que pode não ter conhecimento técnico.

Regras:
1. Explique o que foi detectado em 2-3 frases, sem jargão técnico desnecessário (evite termos como "hash", "assinatura", "payload" sem explicar).
2. Diga o nível de urgência real de forma honesta — não exagere para parecer mais útil, nem minimize para não assustar.
3. Sempre termine com uma recomendação de ação clara e específica (ex: "isolar este arquivo", "não é preciso fazer nada agora", "considere bloquear esse endereço").
4. Se a informação for insuficiente para ter certeza, diga isso explicitamente em vez de inventar uma conclusão.
5. Nunca minta sobre a gravidade para tranquilizar o usuário. Nunca exagere para parecer mais "proativo".
6. Responda sempre em português do Brasil, em tom direto e respeitoso — como um colega técnico de confiança, não como um manual.
7. Máximo de 4 frases na explicação principal, mais 1 frase de recomendação.`;

const VULNERABILITY_SYSTEM_PROMPT = `Você é o Sentinela, o agente de segurança do Orun Shield. Sua função é transformar o resultado de um scan de vulnerabilidades do PC (defesas desligadas, apps desatualizados, configurações arriscadas) em um parecer claro para o usuário leigo.

Regras:
1. Ordene o que é mais urgente primeiro.
2. Para cada problema: o que é, o risco real em 1 frase e a correção em 1 frase.
3. Se não houver problemas, diga isso com tranquilidade.
4. Responda sempre em português do Brasil, direto e sem exagerar nem minimizar.
5. Máximo 5 frases para o resumo geral, mais 1 frase por item.`;

const APPS_SYSTEM_PROMPT = `Você é o Sentinela, assistente de otimização do Orun Shield. O sistema recomendou remover alguns apps por falta de uso. Você deve revisar a lista e dar um veredicto claro para o usuário leigo.

Regras:
1. Para cada app: diga se a recomendação faz sentido (ex: "pode remover com segurança") ou se há motivo para manter (ex: depende de algum outro software, é recente, publisher de sistema).
2. Nunca ordene desinstalar — apenas oriente. A decisão final é sempre do usuário.
3. Responda em português do Brasil, curto e direto.
4. Máximo 5 frases.`;

function buildFindingPrompt(finding) {
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

function buildBatchSummaryPrompt(findings) {
  const bySeverity = {};
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  const list = findings
    .slice(0, 20)
    .map((f) => `- [${f.severity}] ${f.title} (${f.source})`)
    .join("\n");
  return `O usuário tem ${findings.length} alertas de segurança acumulados. Distribuição por severidade: ${JSON.stringify(bySeverity)}.

Lista dos alertas (até 20 mais recentes):
${list}

Escreva um resumo executivo curto (máximo 5 frases) do estado geral de segurança do sistema, priorizando o que é mais urgente. Se não houver nada crítico, diga isso com tranquilidade.`;
}

function buildVulnerabilitiesPrompt(items) {
  const list = items
    .slice(0, 30)
    .map((v) => `- [${v.severity}] ${v.title}: ${v.description} (correção: ${v.remediation})`)
    .join("\n");
  return `Resultado do scan de vulnerabilidades do PC:

${list || "- Nenhuma vulnerabilidade encontrada."}

Escreva um parecer claro e ordenado por urgência.`;
}

function buildAppsPrompt(recommendations) {
  const list = recommendations
    .slice(0, 30)
    .map(
      (r) =>
        `- ${r.app.displayName} (${r.app.publisher || "publisher desconhecido"}, ${formatMB(r.sizeBytes)}). Motivos: ${r.reasons.join("; ")}`
    )
    .join("\n");
  return `O sistema recomendou remover estes apps por falta de uso:

${list || "- Nenhuma recomendação no momento."}

Dê seu veredicto.`;
}

function formatMB(bytes) {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

class CyberAi {
  constructor(userDataDir) {
    this.configPath = path.join(userDataDir, "ai-config.json");
    this.config = this.loadConfig();
    this.cache = new Map();
    this.ollamaCache = { checkedAt: 0, available: false };
  }

  loadConfig() {
    const defaults = {
      provider: "ollama", // "ollama" | "openai-compatible" | "anthropic"
      baseUrl: "http://localhost:11434",
      apiKey: "",
      model: "llama3.2",
    };
    try {
      if (fs.existsSync(this.configPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
        return { ...defaults, ...parsed };
      }
    } catch { /* config inválida -> usa defaults */ }
    return defaults;
  }

  saveConfig(partial) {
    this.config = { ...this.config, ...partial };
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
    this.cache.clear();
    return this.config;
  }

  async getStatus() {
    const ollamaAvailable = await this.checkOllama();
    return {
      configuredProvider: this.config.provider,
      model: this.config.model,
      ollamaAvailable,
      ready: this.config.provider === "ollama" ? ollamaAvailable : Boolean(this.config.apiKey),
    };
  }

  async checkOllama() {
    const now = Date.now();
    if (now - this.ollamaCache.checkedAt < 30_000) return this.ollamaCache.available;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch("http://localhost:11434/api/tags", { signal: ctrl.signal });
      clearTimeout(timer);
      this.ollamaCache = { checkedAt: now, available: res.ok };
      return res.ok;
    } catch {
      this.ollamaCache = { checkedAt: now, available: false };
      return false;
    }
  }

  async complete(messages, options = {}) {
    const cfg = { ...this.config, ...options };
    if (cfg.provider === "ollama") {
      return this.completeOllama(messages, cfg);
    }
    if (cfg.provider === "anthropic") {
      return this.completeAnthropic(messages, cfg);
    }
    return this.completeOpenAiCompatible(messages, cfg);
  }

  async completeOllama(messages, cfg) {
    if (!(await this.checkOllama())) throw new Error("Ollama indisponível em localhost:11434.");
    const baseUrl = cfg.baseUrl || "http://localhost:11434";
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.message?.content ?? data?.response ?? "";
    if (!text.trim()) throw new Error("Ollama retornou resposta vazia.");
    return text.trim();
  }

  async completeOpenAiCompatible(messages, cfg) {
    if (!cfg.apiKey) throw new Error("Provider openai-compatible requer apiKey.");
    const baseUrl = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages }),
    });
    if (!res.ok) throw new Error(`Provider HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("Provider retornou resposta vazia.");
    return text.trim();
  }

  async completeAnthropic(messages, cfg) {
    if (!cfg.apiKey) throw new Error("Provider anthropic requer apiKey.");
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const nonSystem = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: cfg.model || "claude-3-5-sonnet-latest", max_tokens: 1024, system, messages: nonSystem }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") ?? "";
    if (!text.trim()) throw new Error("Anthropic retornou resposta vazia.");
    return text.trim();
  }

  async explainFinding(finding) {
    const key = `finding:${finding.id}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let result;
    try {
      const text = await this.complete([
        { role: "system", content: SENTINELA_SYSTEM_PROMPT },
        { role: "user", content: buildFindingPrompt(finding) },
      ]);
      result = { findingId: finding.id, explanation: text, generatedAt: new Date().toISOString(), isFallback: false };
    } catch {
      result = { findingId: finding.id, explanation: fallbackExplanation(finding), generatedAt: new Date().toISOString(), isFallback: true };
    }
    this.cache.set(key, result);
    return result;
  }

  async summarizeFindings(findings) {
    if (findings.length === 0) return "Nenhum alerta de segurança no momento. Está tudo tranquilo.";
    try {
      return await this.complete([
        { role: "system", content: SENTINELA_SYSTEM_PROMPT },
        { role: "user", content: buildBatchSummaryPrompt(findings) },
      ]);
    } catch {
      return fallbackBatchSummary(findings);
    }
  }

  async analyzeVulnerabilities(items) {
    if (items.length === 0) return "Nenhuma vulnerabilidade encontrada. Defesas ativas e sem atualizações pendentes críticas.";
    try {
      return await this.complete([
        { role: "system", content: VULNERABILITY_SYSTEM_PROMPT },
        { role: "user", content: buildVulnerabilitiesPrompt(items) },
      ]);
    } catch {
      return fallbackVulnerabilities(items);
    }
  }

  async analyzeApps(recommendations) {
    if (recommendations.length === 0) return "Nenhum app foi recomendado para remoção. Seu PC está bem cuidado.";
    try {
      return await this.complete([
        { role: "system", content: APPS_SYSTEM_PROMPT },
        { role: "user", content: buildAppsPrompt(recommendations) },
      ]);
    } catch {
      return fallbackApps(recommendations);
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

function fallbackExplanation(finding) {
  const actionBySeverity = {
    critical: "Recomendo isolar ou remover isso agora e revisar o sistema com atenção.",
    high: "Vale investigar em breve — não é urgência de minuto, mas não deve ser ignorado.",
    medium: "Dá pra dar uma olhada quando puder; não é uma emergência.",
    low: "Provavelmente é normal, mas fica registrado caso o padrão se repita.",
    info: "Apenas informativo, nenhuma ação necessária.",
  };
  return `${finding.title}. ${finding.description} ${actionBySeverity[finding.severity] ?? actionBySeverity.info} (Explicação gerada sem IA — provider indisponível no momento.)`;
}

function fallbackBatchSummary(findings) {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  if (critical > 0) return `Você tem ${critical} alerta(s) crítico(s) entre os ${findings.length} alertas acumulados. Recomendo revisar esses primeiro. (Resumo gerado sem IA — provider indisponível.)`;
  if (high > 0) return `Nenhum alerta crítico, mas ${high} de alta severidade merecem atenção entre os ${findings.length} acumulados. (Resumo gerado sem IA — provider indisponível.)`;
  return `${findings.length} alertas acumulados, nenhum crítico ou de alta severidade. Situação sob controle. (Resumo gerado sem IA — provider indisponível.)`;
}

function fallbackVulnerabilities(items) {
  const critical = items.filter((v) => v.severity === "critical").length;
  const high = items.filter((v) => v.severity === "high").length;
  const lines = items.slice(0, 8).map((v) => `- ${v.title}: ${v.remediation}`);
  const header = critical + high > 0
    ? `${critical + high} problema(s) importante(s) encontrado(s). Priorize:`
    : `${items.length} ajuste(s) recomendado(s).`;
  return `${header}\n${lines.join("\n")}\n(Análise gerada sem IA — provider indisponível no momento.)`;
}

function fallbackApps(recommendations) {
  const lines = recommendations.slice(0, 8).map((r) => `- ${r.app.displayName}: ${r.reasons.join("; ")}`);
  return `Recomendo avaliar a remoção destes apps (verifique se você ainda usa algum deles):\n${lines.join("\n")}\n(Análise gerada sem IA — provider indisponível no momento.)`;
}

module.exports = { CyberAi };
