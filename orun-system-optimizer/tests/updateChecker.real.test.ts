import { describe, it, expect } from "vitest";
import { UpdateChecker } from "../src/updates/UpdateChecker.js";

/**
 * Este arquivo NÃO mocka node:child_process — roda o gerenciador de pacotes
 * NATIVO do SO atual de verdade (apt no Linux, winget no Windows, brew no
 * macOS). Serve como confirmação de que o parser real (não só os testes com
 * dados sintéticos em updateChecker.test.ts) consegue processar a saída
 * genuína do gerenciador do ambiente.
 *
 * Em CI, se o binário não estiver disponível, o teste é pulado
 * automaticamente em vez de falhar (ver checkAvailable dentro do próprio teste).
 */
const nativeManager = process.platform === "win32" ? "winget" : process.platform === "darwin" ? "brew" : "apt";

describe("UpdateChecker — integração real contra o gerenciador de pacotes nativo deste ambiente (sem mock)", () => {
  it("roda o gerenciador nativo de verdade e faz parsing do resultado real", async () => {
    const checker = new UpdateChecker();
    const available = await checker.checkAvailable(nativeManager);
    if (!available) {
      console.warn(`${nativeManager} não disponível neste ambiente — pulando teste de integração real.`);
      return;
    }

    const result =
      nativeManager === "apt" ? await checker.checkApt() : nativeManager === "brew" ? await checker.checkBrew() : await checker.checkWinget();

    expect(result.source).toBe(nativeManager);
    expect(Array.isArray(result.outdated)).toBe(true);
    if (result.outdated.length > 0) {
      const first = result.outdated[0]!;
      expect(first.id.length).toBeGreaterThan(0);
      expect(first.currentVersion.length).toBeGreaterThan(0);
      expect(first.availableVersion.length).toBeGreaterThan(0);
      expect(first.source).toBe(nativeManager);
      expect(first.currentVersion).not.toBe(first.availableVersion);
    }
  });

  it("checkAvailable() detecta corretamente a presença do gerenciador nativo deste ambiente", async () => {
    const checker = new UpdateChecker();
    expect(await checker.checkAvailable(nativeManager)).toBe(true);
  });

  it("checkAvailable() retorna false para um gerenciador de OUTRO SO (não deveria existir aqui)", async () => {
    const checker = new UpdateChecker();
    const foreign = nativeManager === "apt" ? "winget" : "apt";
    expect(await checker.checkAvailable(foreign)).toBe(false);
  });
});
