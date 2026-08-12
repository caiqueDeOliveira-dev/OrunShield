import { SafeBrowsingClient } from "./SafeBrowsingClient.js";
import type { LinkCheckResult } from "../types.js";

export interface LinkGuardConfig {
  safeBrowsingApiKey: string;
  /** Tempo que um resultado fica em cache antes de checar de novo, em ms. */
  cacheTtlMs?: number;
}

interface CacheEntry {
  result: LinkCheckResult;
  expiresAt: number;
}

/**
 * Ponto único de integração com WebViews do app (Hampton mobile, OrunTV
 * mobile). Uso típico: interceptar `onShouldStartLoadWithRequest` da
 * WebView e chamar `shouldBlock(url)` antes de deixar navegar.
 */
export class LinkGuard {
  private readonly client: SafeBrowsingClient;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: LinkGuardConfig) {
    this.client = new SafeBrowsingClient({ apiKey: config.safeBrowsingApiKey });
    this.cacheTtlMs = config.cacheTtlMs ?? 30 * 60 * 1000; // 30 min por padrão
  }

  async check(url: string): Promise<LinkCheckResult> {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, source: "cache" };
    }

    const result = await this.client.checkUrl(url);
    // Não guarda "unknown" em cache — é resultado de falha, vale tentar de novo na próxima.
    if (result.verdict !== "unknown") {
      this.cache.set(url, { result, expiresAt: Date.now() + this.cacheTtlMs });
    }
    return result;
  }

  /**
   * Atalho para uso direto em `onShouldStartLoadWithRequest` de uma
   * `react-native-webview`. Retorna `true` = deixa navegar, `false` = bloqueia.
   * Em caso de falha da API ("unknown"), a decisão é permissiva por padrão
   * (não travar a navegação por indisponibilidade de terceiro) — mas isso
   * é configurável via `blockOnUnknown`.
   */
  async shouldAllowNavigation(url: string, options: { blockOnUnknown?: boolean } = {}): Promise<boolean> {
    const result = await this.check(url);
    if (result.verdict === "malicious") return false;
    if (result.verdict === "unknown") return !options.blockOnUnknown;
    return true;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
