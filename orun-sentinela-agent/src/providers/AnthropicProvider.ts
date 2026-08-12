import type { AiProvider, ChatMessage } from "./AiProvider.js";

/**
 * Provider para a API da Anthropic. A API key NUNCA deve estar no
 * renderer/client-side — segue o mesmo princípio já usado para o
 * service_role do Supabase: fica só no main process do Electron.
 */
export class AnthropicProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: { apiKey: string; model: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    // A API da Anthropic separa o system prompt do array de mensagens.
    const systemMessage = messages.find((m) => m.role === "system");
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500, // respostas do Sentinela são curtas por design (persona pede no máx. 5 frases)
        system: systemMessage?.content,
        messages: conversation,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API respondeu ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = body.content.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("Resposta da Anthropic API sem bloco de texto.");
    return text;
  }
}
