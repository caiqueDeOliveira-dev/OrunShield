import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShieldCore } from "../src/orchestrator/ShieldCore.js";

describe("ShieldCore — validação de config estendida (ransomwareHeuristic)", () => {
  it("lança erro quando quarantineDir está dentro de um watchPath do ransomwareHeuristic", () => {
    expect(
      () =>
        new ShieldCore({
          quarantine: { quarantineDir: "/home/user/Documents/quarantine" },
          sentinel: { ransomwareHeuristic: { watchPaths: ["/home/user/Documents"] } },
        })
    ).toThrow(/ransomwareHeuristic/);
  });

  it("NÃO lança erro quando as pastas são irmãs, sem aninhamento", () => {
    expect(
      () =>
        new ShieldCore({
          quarantine: { quarantineDir: "/home/user/OrunQuarantine" },
          sentinel: { ransomwareHeuristic: { watchPaths: ["/home/user/Documents"] } },
        })
    ).not.toThrow();
  });
});

describe("ShieldCore — integração de ponta a ponta com os novos módulos", () => {
  it("analyzeFile() delega corretamente pro FileAnalyzer e retorna resultado real", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "orun-shieldcore-analyze-"));
    try {
      const target = join(workDir, "teste.txt");
      await writeFile(target, "conteúdo de teste");

      const shield = new ShieldCore({});
      const result = await shield.analyzeFile(target);

      expect(result.fileName).toBe("teste.txt");
      expect(result.sha256).toHaveLength(64);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("getProcessTree() delega corretamente pro ProcessMonitor", async () => {
    const shield = new ShieldCore({});
    const tree = await shield.getProcessTree();
    // Neste ambiente real, deve haver pelo menos algum processo rodando.
    expect(Array.isArray(tree)).toBe(true);
  });

  it("ransomwareHeuristicMonitor é instanciado quando configurado, e ausente quando não", () => {
    const withConfig = new ShieldCore({ sentinel: { ransomwareHeuristic: { watchPaths: ["/tmp"] } } });
    expect(withConfig.ransomwareHeuristicMonitor).toBeDefined();

    const withoutConfig = new ShieldCore({});
    expect(withoutConfig.ransomwareHeuristicMonitor).toBeUndefined();
  });

  it("startMonitoring()/stopMonitoring() incluem o ransomwareHeuristicMonitor sem lançar exceção", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "orun-shieldcore-ransomware-"));
    try {
      const shield = new ShieldCore({ sentinel: { ransomwareHeuristic: { watchPaths: [workDir] } } });
      expect(() => shield.startMonitoring()).not.toThrow();
      await expect(shield.stopMonitoring()).resolves.toBeUndefined();
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
