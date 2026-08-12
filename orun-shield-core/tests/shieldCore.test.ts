import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShieldCore } from "../src/orchestrator/ShieldCore.js";

describe("ShieldCore — forwarding de eventos entre submódulos", () => {
  it("repassa 'error' emitido pelo QuarantineManager pro nível do ShieldCore", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "orun-shieldcore-test-"));
    try {
      const shield = new ShieldCore({ quarantine: { quarantineDir: join(workDir, "quarantine") } });
      const errorHandler = vi.fn();
      shield.on("error", errorHandler);

      // Finding sem filePath força o QuarantineManager a caminho de erro tratado
      // (retorna success:false, não emite 'error' nesse caso específico — usamos
      // um cenário que emite 'error' de verdade: falha real na operação de fs).
      // Aqui simulamos indiretamente via um path que não existe, que já é
      // tratado como success:false sem emitir 'error' (ver QuarantineManager).
      // Para cobrir o forwarding de fato, verificamos que o listener 'error'
      // do ShieldCore está de fato conectado ao QuarantineManager como fonte.
      expect(shield.quarantineManager).toBeDefined();

      // Verificação direta de wiring: emitir um evento sintético no manager
      // interno e confirmar que o ShieldCore repassa.
      (shield.quarantineManager as unknown as { emit: (e: string, p: unknown) => void }).emit("error", {
        source: "orchestrator",
        message: "erro sintético de teste",
      });

      expect(errorHandler).toHaveBeenCalledWith({ source: "orchestrator", message: "erro sintético de teste" });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("repassa 'integrity:violation' emitido pelo BinaryVerifier pro nível do ShieldCore", async () => {
    const shield = new ShieldCore({});
    const violationHandler = vi.fn();
    shield.on("integrity:violation", violationHandler);

    (shield.binaryVerifier as unknown as { emit: (e: string, p: unknown) => void }).emit("integrity:violation", {
      id: "x",
      source: "integrity",
      severity: "critical",
      title: "teste",
      description: "teste",
      detectedAt: new Date().toISOString(),
    });

    expect(violationHandler).toHaveBeenCalledTimes(1);
  });

  it("repassa 'firewall:rule-changed' emitido pelo FirewallManager pro nível do ShieldCore", async () => {
    const shield = new ShieldCore({});
    const ruleChangedHandler = vi.fn();
    shield.on("firewall:rule-changed", ruleChangedHandler);

    (shield.firewall as unknown as { emit: (e: string, p: unknown) => void }).emit("firewall:rule-changed", {
      action: "add",
      rule: "teste-regra",
    });

    expect(ruleChangedHandler).toHaveBeenCalledWith({ action: "add", rule: "teste-regra" });
  });

  it("quarantineFinding() lança erro claro quando quarantine não foi configurado", async () => {
    const shield = new ShieldCore({}); // sem `quarantine` na config
    await expect(
      shield.quarantineFinding({
        id: "x",
        source: "clamav",
        severity: "critical",
        title: "t",
        description: "d",
        detectedAt: new Date().toISOString(),
      })
    ).rejects.toThrow(/QuarantineManager não configurado/);
  });

  it("quarantineFinding() funciona de ponta a ponta via ShieldCore (não só via QuarantineManager direto)", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "orun-shieldcore-test-"));
    try {
      const targetFile = join(workDir, "malware.exe");
      await writeFile(targetFile, "conteúdo malicioso");

      const shield = new ShieldCore({ quarantine: { quarantineDir: join(workDir, "quarantine") } });
      const result = await shield.quarantineFinding({
        id: "x",
        source: "clamav",
        severity: "critical",
        title: "t",
        description: "d",
        filePath: targetFile,
        detectedAt: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
      const list = await shield.quarantineManager!.list();
      expect(list).toHaveLength(1);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("getFindingsLog() acumula findings emitidos pelos submódulos ao longo do tempo", async () => {
    const shield = new ShieldCore({});
    expect(shield.getFindingsLog()).toHaveLength(0);

    (shield.binaryVerifier as unknown as { emit: (e: string, p: unknown) => void }).emit("threat:detected", {
      id: "f1",
      source: "integrity",
      severity: "high",
      title: "t",
      description: "d",
      detectedAt: new Date().toISOString(),
    });

    expect(shield.getFindingsLog()).toHaveLength(1);
  });
});

describe("ShieldCore — validação de configuração (falha rápido em vez de comportamento incorreto silencioso)", () => {
  it("lança erro claro quando quarantineDir está DENTRO de um watchPath do fileIntegrity", () => {
    expect(
      () =>
        new ShieldCore({
          quarantine: { quarantineDir: "/home/user/AppData/Startup/quarantine" },
          sentinel: { fileIntegrity: { watchPaths: ["/home/user/AppData/Startup"] } },
        })
    ).toThrow(/quarantineDir.*está dentro/s);
  });

  it("lança erro claro quando quarantineDir é EXATAMENTE igual a um watchPath", () => {
    expect(
      () =>
        new ShieldCore({
          quarantine: { quarantineDir: "/home/user/AppData/Startup" },
          sentinel: { fileIntegrity: { watchPaths: ["/home/user/AppData/Startup"] } },
        })
    ).toThrow();
  });

  it("lança erro quando o watchPath está DENTRO da quarantineDir (caso invertido)", () => {
    expect(
      () =>
        new ShieldCore({
          quarantine: { quarantineDir: "/home/user/security" },
          sentinel: { fileIntegrity: { watchPaths: ["/home/user/security/startup-watch"] } },
        })
    ).toThrow();
  });

  it("NÃO lança erro quando quarantineDir e watchPaths estão em pastas irmãs, sem aninhamento", () => {
    expect(
      () =>
        new ShieldCore({
          quarantine: { quarantineDir: "/home/user/AppData/OrunQuarantine" },
          sentinel: { fileIntegrity: { watchPaths: ["/home/user/AppData/Startup"] } },
        })
    ).not.toThrow();
  });

  it("NÃO confunde pastas com prefixo de nome parecido mas que não são realmente aninhadas (ex: /Startup vs /StartupBackup)", () => {
    expect(
      () =>
        new ShieldCore({
          quarantine: { quarantineDir: "/home/user/AppData/StartupBackup" },
          sentinel: { fileIntegrity: { watchPaths: ["/home/user/AppData/Startup"] } },
        })
    ).not.toThrow();
  });

  it("NÃO lança erro quando só um dos dois (quarantine ou fileIntegrity) está configurado", () => {
    expect(() => new ShieldCore({ quarantine: { quarantineDir: "/tmp/quarantine" } })).not.toThrow();
    expect(
      () => new ShieldCore({ sentinel: { fileIntegrity: { watchPaths: ["/tmp/watch"] } } })
    ).not.toThrow();
  });
});
