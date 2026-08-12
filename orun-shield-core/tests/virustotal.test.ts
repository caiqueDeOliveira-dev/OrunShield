import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node-fetch", () => ({ default: vi.fn() }));
import fetch from "node-fetch";
import { VirusTotalClient } from "../src/virustotal/VirusTotalClient.js";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("VirusTotalClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna null quando hash nunca foi visto (404)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({}, 404));
    const client = new VirusTotalClient({ apiKey: "fake-key" });

    const result = await client.lookupHash("a".repeat(64));
    expect(result).toBeNull();
  });

  it("retorna null quando poucas engines marcam como malicioso (abaixo do threshold)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        data: {
          attributes: {
            last_analysis_stats: { malicious: 1, suspicious: 0, undetected: 68, harmless: 1, timeout: 0 },
          },
        },
      })
    );
    const client = new VirusTotalClient({ apiKey: "fake-key", minPositivesToFlag: 2 });

    const result = await client.lookupHash("b".repeat(64));
    expect(result).toBeNull();
  });

  it("retorna finding quando engines suficientes marcam como malicioso", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        data: {
          attributes: {
            last_analysis_stats: { malicious: 15, suspicious: 3, undetected: 52, harmless: 0, timeout: 0 },
            meaningful_name: "invoice.pdf.exe",
          },
        },
      })
    );
    const client = new VirusTotalClient({ apiKey: "fake-key" });

    const result = await client.lookupHash("c".repeat(64));
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("critical");
    expect(result?.source).toBe("virustotal");
    expect(result?.title).toContain("15/70");
  });

  it("classifica severidade high para malicious entre 5 e 9", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        data: {
          attributes: {
            last_analysis_stats: { malicious: 6, suspicious: 0, undetected: 64, harmless: 0, timeout: 0 },
          },
        },
      })
    );
    const client = new VirusTotalClient({ apiKey: "fake-key" });
    const result = await client.lookupHash("d".repeat(64));
    expect(result?.severity).toBe("high");
  });
});
