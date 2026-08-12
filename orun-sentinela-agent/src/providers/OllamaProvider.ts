import type { AiProvider, ChatMessage } from "./AiProvider.js";

/**
 * Provider para Ollama rodando local (http://localhost:11434 por padrão).
 * Preferido quando disponível: sem custo, sem dados saindo da máquina —
 * relevante especialmente para conteúdo de segurança (findings podem
 * conter caminhos de arquivo, IPs internos etc que o usuário pode preferir
 * não mandar pra nuvem).
 */
export class OllamaProvider implements AiProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: { baseUrl?: string; model: string }) {
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    this.model = config.model;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });

    if (!res.ok) {
      throw new Error(`Ollama respondeu ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as { message?: { content?: string } };
    if (!body.message?.content) {
      throw new Error("Ollama retornou resposta sem conteúdo.");
    }
    return body.message.content;
  }

  /** Verifica se o daemon Ollama está acessível e se o modelo configurado existe localmente. */
  async checkAvailability(): Promise<{ available: boolean; modelInstalled?: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return { available: false };
      const body = (await res.json()) as { models?: { name: string }[] };
      const modelInstalled = body.models?.some((m) => m.name.startsWith(this.model)) ?? false;
      return { available: true, modelInstalled };
    } catch {
      return { available: false };
    }
  }
}
