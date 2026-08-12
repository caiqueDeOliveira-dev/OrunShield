import { describe, it, expect, vi, beforeEach } from "vitest";

const globalFetch = vi.fn();
vi.stubGlobal("fetch", globalFetch);

import { LinkGuard } from "../src/linkSafety/LinkGuard.js";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe("LinkGuard", () => {
  beforeEach(() => {
    globalFetch.mockReset();
  });

  it("permite navegação para URL segura", async () => {
    globalFetch.mockResolvedValue(jsonResponse({}));
    const guard = new LinkGuard({ safeBrowsingApiKey: "fake" });
    expect(await guard.shouldAllowNavigation("https://example.com")).toBe(true);
  });

  it("bloqueia navegação para URL maliciosa", async () => {
    globalFetch.mockResolvedValue(
      jsonResponse({ matches: [{ threatType: "MALWARE", platformType: "ANY_PLATFORM", threat: { url: "https://bad.example" } }] })
    );
    const guard = new LinkGuard({ safeBrowsingApiKey: "fake" });
    expect(await guard.shouldAllowNavigation("https://bad.example")).toBe(false);
  });

  it("por padrão permite navegação quando o resultado é 'unknown' (API fora do ar)", async () => {
    globalFetch.mockRejectedValue(new Error("timeout"));
    const guard = new LinkGuard({ safeBrowsingApiKey: "fake" });
    expect(await guard.shouldAllowNavigation("https://example.com")).toBe(true);
  });

  it("respeita blockOnUnknown quando configurado", async () => {
    globalFetch.mockRejectedValue(new Error("timeout"));
    const guard = new LinkGuard({ safeBrowsingApiKey: "fake" });
    expect(await guard.shouldAllowNavigation("https://example.com", { blockOnUnknown: true })).toBe(false);
  });

  it("usa cache na segunda chamada para a mesma URL (não chama fetch de novo)", async () => {
    globalFetch.mockResolvedValue(jsonResponse({}));
    const guard = new LinkGuard({ safeBrowsingApiKey: "fake" });

    await guard.check("https://example.com");
    await guard.check("https://example.com");

    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it("não guarda em cache resultado 'unknown' (permite retry na próxima chamada)", async () => {
    globalFetch.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(jsonResponse({}));
    const guard = new LinkGuard({ safeBrowsingApiKey: "fake" });

    const first = await guard.check("https://example.com");
    const second = await guard.check("https://example.com");

    expect(first.verdict).toBe("unknown");
    expect(second.verdict).toBe("safe");
    expect(globalFetch).toHaveBeenCalledTimes(2);
  });
});
