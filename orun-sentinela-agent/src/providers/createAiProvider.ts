import type { AiProvider, AiProviderConfig } from "./AiProvider.js";
import { OllamaProvider } from "./OllamaProvider.js";
import { AnthropicProvider } from "./AnthropicProvider.js";
import { OpenAiCompatibleProvider } from "./OpenAiCompatibleProvider.js";

export function createAiProvider(config: AiProviderConfig): AiProvider {
  switch (config.kind) {
    case "ollama":
      return new OllamaProvider({ baseUrl: config.baseUrl, model: config.model });
    case "anthropic":
      if (!config.apiKey) throw new Error("Provider 'anthropic' requer apiKey.");
      return new AnthropicProvider({ apiKey: config.apiKey, model: config.model });
    case "openai-compatible":
      if (!config.apiKey || !config.baseUrl) {
        throw new Error("Provider 'openai-compatible' requer apiKey e baseUrl.");
      }
      return new OpenAiCompatibleProvider({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model });
    default: {
      const exhaustiveCheck: never = config.kind;
      throw new Error(`Provider desconhecido: ${exhaustiveCheck}`);
    }
  }
}
