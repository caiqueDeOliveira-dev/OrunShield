import type { AiProvider, ChatMessage } from "./AiProvider.js";

/**
 * Provider genérico para qualquer API compatível com o formato
 * `/chat/completions` da OpenAI — cobre OpenAI, OpenRouter, Groq e
 * GitHub Models com o mesmo código, só trocando baseUrl/model/apiKey.
 *
 * Exemplos de baseUrl:
 *  - OpenAI: https://api.openai.com/v1
 *  - OpenRouter: https://openrouter.ai/api/v1
 *  - Groq: https://api.groq.com/openai/v1
 *  - GitHub Models: https://models.inference.ai.azure.com
 */
export class OpenAiCompatibleProvider implements AiProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: { baseUrl: string; apiKey: string; model: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, max_tokens: 500 }),
    });

    if (!res.ok) {
      throw new Error(`${this.baseUrl} respondeu ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("Resposta sem conteúdo no formato esperado (choices[0].message.content).");
    return text;
  }
}
