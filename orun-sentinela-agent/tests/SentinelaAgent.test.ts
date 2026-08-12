import { describe, it, expect, vi, beforeEach } from "vitest";
import { SentinelaAgent } from "../src/SentinelaAgent.js";
import * as factory from "../src/providers/createAiProvider.js";
import type { ThreatFinding } from "@orun/shield-core";

function makeFinding(overrides: Partial<ThreatFinding> = {}): ThreatFinding {
  return {
    id: "finding-1",
    source: "clamav",
    severity: "high",
    title: "Malware detectado: Win.Trojan.Generic",
    description: "ClamAV identificou a assinatura no arquivo malware.exe.",
    filePath: "/home/user/Downloads/malware.exe",
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("SentinelaAgent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("retorna explicação da IA quando o provider responde normalmente", async () => {
    vi.spyOn(factory, "createAiProvider").mockReturnValue({
      complete: vi.fn().mockResolvedValue("Encontramos um arquivo perigoso no seu Downloads. Recomendo apagar."),
    });

    const agent = new SentinelaAgent({ provider: { kind: "ollama", model: "llama3" } });
    const result = await agent.explainFinding(makeFinding());

    expect(result.isFallback).toBe(false);
    expect(result.explanation).toContain("arquivo perigoso");
  });

  it("cai para o fallback determinístico quando o provider falha", async () => {
    vi.spyOn(factory, "createAiProvider").mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error("Ollama offline")),
    });

    const agent = new SentinelaAgent({ provider: { kind: "ollama", model: "llama3" } });
    const result = await agent.explainFinding(makeFinding({ severity: "critical" }));

    expect(result.isFallback).toBe(true);
    expect(result.explanation).toContain("isolar ou remover"); // texto do template critical
  });

  it("nunca lança exceção para o chamador, mesmo com provider quebrado", async () => {
    vi.spyOn(factory, "createAiProvider").mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const agent = new SentinelaAgent({ provider: { kind: "anthropic", model: "x", apiKey: "y" } });
    await expect(agent.explainFinding(makeFinding())).resolves.toBeDefined();
  });

  it("usa cache e não chama a IA duas vezes para o mesmo finding", async () => {
    const completeMock = vi.fn().mockResolvedValue("explicação");
    vi.spyOn(factory, "createAiProvider").mockReturnValue({ complete: completeMock });

    const agent = new SentinelaAgent({ provider: { kind: "ollama", model: "llama3" }, enableCache: true });
    const finding = makeFinding();
    await agent.explainFinding(finding);
    await agent.explainFinding(finding);

    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("summarizeBatch retorna mensagem tranquila quando não há findings", async () => {
    vi.spyOn(factory, "createAiProvider").mockReturnValue({ complete: vi.fn() });
    const agent = new SentinelaAgent({ provider: { kind: "ollama", model: "llama3" } });

    const summary = await agent.summarizeBatch([]);
    expect(summary).toContain("Nenhum alerta");
  });

  it("summarizeBatch cai para fallback priorizando críticos quando IA falha", async () => {
    vi.spyOn(factory, "createAiProvider").mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error("falhou")),
    });
    const agent = new SentinelaAgent({ provider: { kind: "ollama", model: "llama3" } });

    const summary = await agent.summarizeBatch([
      makeFinding({ severity: "critical" }),
      makeFinding({ id: "2", severity: "low" }),
    ]);
    expect(summary).toContain("1 alerta(s) crítico(s)");
  });
});
