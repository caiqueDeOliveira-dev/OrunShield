import type { LinkCheckResult, LinkVerdict } from "../types.js";

const SAFE_BROWSING_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find";

export interface SafeBrowsingConfig {
  apiKey: string;
  /** Identifica o app nas requisições — exigido pela API do Google. */
  clientId?: string;
  clientVersion?: string;
}

interface ThreatMatch {
  threatType: string;
  platformType: string;
  threat: { url: string };
}

/**
 * Cliente para a Google Safe Browsing API v4 (lookup API — gratuita até
 * um volume generoso de requisições, https://developers.google.com/safe-browsing).
 * É a peça que realmente funciona 100% dentro das restrições do iOS/Android:
 * não precisa de acesso privilegiado, só faz uma chamada de rede antes de
 * abrir um link em WebView.
 */
export class SafeBrowsingClient {
  private readonly apiKey: string;
  private readonly clientId: string;
  private readonly clientVersion: string;

  constructor(config: SafeBrowsingConfig) {
    this.apiKey = config.apiKey;
    this.clientId = config.clientId ?? "orun-shield-mobile";
    this.clientVersion = config.clientVersion ?? "0.1.0";
  }

  async checkUrl(url: string): Promise<LinkCheckResult> {
    try {
      const res = await fetch(`${SAFE_BROWSING_URL}?key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: this.clientId, clientVersion: this.clientVersion },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING", // phishing
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Safe Browsing respondeu ${res.status}`);
      }

      const body = (await res.json()) as { matches?: ThreatMatch[] };
      const matches = body.matches ?? [];

      return {
        url,
        verdict: matches.length > 0 ? "malicious" : "safe",
        threatTypes: matches.map((m) => m.threatType),
        checkedAt: new Date().toISOString(),
        source: "google-safe-browsing",
      };
    } catch {
      // Falha de rede/API não deve bloquear o usuário de navegar — mas também
      // não deve mentir dizendo "safe". "unknown" deixa a decisão explícita pro app.
      return {
        url,
        verdict: "unknown" as LinkVerdict,
        threatTypes: [],
        checkedAt: new Date().toISOString(),
        source: "error-fallback",
      };
    }
  }

  /** Checa múltiplas URLs numa única chamada (a API suporta batch nativamente). */
  async checkUrls(urls: string[]): Promise<LinkCheckResult[]> {
    if (urls.length === 0) return [];
    try {
      const res = await fetch(`${SAFE_BROWSING_URL}?key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: this.clientId, clientVersion: this.clientVersion },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: urls.map((url) => ({ url })),
          },
        }),
      });

      if (!res.ok) throw new Error(`Safe Browsing respondeu ${res.status}`);

      const body = (await res.json()) as { matches?: ThreatMatch[] };
      const matchesByUrl = new Map<string, ThreatMatch[]>();
      for (const match of body.matches ?? []) {
        const list = matchesByUrl.get(match.threat.url) ?? [];
        list.push(match);
        matchesByUrl.set(match.threat.url, list);
      }

      const checkedAt = new Date().toISOString();
      return urls.map((url) => {
        const matches = matchesByUrl.get(url) ?? [];
        return {
          url,
          verdict: matches.length > 0 ? ("malicious" as LinkVerdict) : ("safe" as LinkVerdict),
          threatTypes: matches.map((m) => m.threatType),
          checkedAt,
          source: "google-safe-browsing" as const,
        };
      });
    } catch {
      const checkedAt = new Date().toISOString();
      return urls.map((url) => ({
        url,
        verdict: "unknown" as LinkVerdict,
        threatTypes: [],
        checkedAt,
        source: "error-fallback" as const,
      }));
    }
  }
}
