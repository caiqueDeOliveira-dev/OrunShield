import { z } from "zod";

export const AiProviderKindSchema = z.enum(["ollama", "anthropic", "openai-compatible"]);
export type AiProviderKind = z.infer<typeof AiProviderKindSchema>;

/**
 * "openai-compatible" cobre OpenAI, OpenRouter, Groq e GitHub Models — todos
 * expõem o mesmo formato `/chat/completions`, só muda base URL e modelo.
 * Isso evita ter 4 adaptadores quase idênticos.
 */
export interface AiProviderConfig {
  kind: AiProviderKind;
  baseUrl?: string; // obrigatório para ollama e openai-compatible; ignorado para anthropic (usa SDK)
  apiKey?: string; // não usado no ollama local
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Contrato mínimo que qualquer provider precisa cumprir para o Sentinela funcionar. */
export interface AiProvider {
  complete(messages: ChatMessage[]): Promise<string>;
}
