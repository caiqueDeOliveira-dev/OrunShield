import { describe, it, expect, vi, beforeEach } from "vitest";
import { SafeBrowsingClient } from "../src/linkSafety/SafeBrowsingClient.js";

const globalFetch = vi.fn();
vi.stubGlobal("fetch", globalFetch);

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("SafeBrowsingClient", () => {
  beforeEach(() => {
    globalFetch.mockReset();
  });

  it("retorna 'safe' quando não há matches", async () => {
    globalFetch.mockResolvedValue(jsonResponse({}));
    const client = new SafeBrowsingClient({ apiKey: "fake" });
    const result = await client.checkUrl("https://example.com");
    expect(result.verdict).toBe("safe");
    expect(result.threatTypes).toHaveLength(0);
  });

  it("retorna 'malicious' quando a API encontra matches", async () => {
    globalFetch.mockResolvedValue(
      jsonResponse({
        matches: [{ threatType: "SOCIAL_ENGINEERING", platformType: "ANY_PLATFORM", threat: { url: "https://phish.example" } }],
      })
    );
    const client = new SafeBrowsingClient({ apiKey: "fake" });
    const result = await client.checkUrl("https://phish.example");
    expect(result.verdict).toBe("malicious");
    expect(result.threatTypes).toContain("SOCIAL_ENGINEERING");
  });

  it("retorna 'unknown' em caso de falha de rede/API, sem lançar exceção", async () => {
    globalFetch.mockRejectedValue(new Error("network down"));
    const client = new SafeBrowsingClient({ apiKey: "fake" });
    const result = await client.checkUrl("https://example.com");
    expect(result.verdict).toBe("unknown");
    expect(result.source).toBe("error-fallback");
  });

  it("checkUrls faz correspondência correta por URL em batch", async () => {
    globalFetch.mockResolvedValue(
      jsonResponse({
        matches: [{ threatType: "MALWARE", platformType: "ANY_PLATFORM", threat: { url: "https://bad.example" } }],
      })
    );
    const client = new SafeBrowsingClient({ apiKey: "fake" });
    const results = await client.checkUrls(["https://good.example", "https://bad.example"]);

    expect(results.find((r) => r.url === "https://good.example")?.verdict).toBe("safe");
    expect(results.find((r) => r.url === "https://bad.example")?.verdict).toBe("malicious");
  });
});
