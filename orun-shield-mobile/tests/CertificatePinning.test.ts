import { describe, it, expect, vi } from "vitest";
import { CertificatePinningManager, buildOrunPinningConfig } from "../src/network/CertificatePinning.js";

describe("CertificatePinningManager", () => {
  it("inicializa com sucesso quando a lib nativa responde normalmente", async () => {
    const fakeInit = vi.fn().mockResolvedValue(undefined);
    const manager = new CertificatePinningManager(fakeInit);

    const result = await manager.initialize({
      "xxxxx.supabase.co": { includeSubdomains: true, publicKeyHashes: ["hash1==", "hash2=="] },
    });

    expect(result.initialized).toBe(true);
    expect(fakeInit).toHaveBeenCalledTimes(1);
    expect(manager.isInitialized()).toBe(true);
  });

  it("retorna erro tratado (sem lançar exceção) quando a lib nativa falha", async () => {
    const fakeInit = vi.fn().mockRejectedValue(new Error("Native module not linked"));
    const manager = new CertificatePinningManager(fakeInit);

    const result = await manager.initialize({ "example.com": { publicKeyHashes: ["h=="] } });

    expect(result.initialized).toBe(false);
    expect(result.error).toContain("Native module not linked");
    expect(manager.isInitialized()).toBe(false);
  });

  it("não chama a lib nativa de novo se já inicializado (idempotente)", async () => {
    const fakeInit = vi.fn().mockResolvedValue(undefined);
    const manager = new CertificatePinningManager(fakeInit);

    await manager.initialize({ "example.com": { publicKeyHashes: ["h=="] } });
    await manager.initialize({ "example.com": { publicKeyHashes: ["h=="] } });

    expect(fakeInit).toHaveBeenCalledTimes(1);
  });

  it("isAvailable() reflete false no Expo Go (sem módulo nativo)", async () => {
    const manager = new CertificatePinningManager(undefined, () => false);
    expect(await manager.isAvailable()).toBe(false);
  });

  it("isAvailable() reflete true num dev/production build com o módulo linkado", async () => {
    const manager = new CertificatePinningManager(undefined, () => true);
    expect(await manager.isAvailable()).toBe(true);
  });

  it("aceita expirationDate por domínio na config", async () => {
    const fakeInit = vi.fn().mockResolvedValue(undefined);
    const manager = new CertificatePinningManager(fakeInit);

    await manager.initialize({
      "xxxxx.supabase.co": {
        includeSubdomains: true,
        publicKeyHashes: ["hash1==", "hash2=="],
        expirationDate: "2027-01-01",
      },
    });

    expect(fakeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        "xxxxx.supabase.co": expect.objectContaining({ expirationDate: "2027-01-01" }),
      })
    );
  });
});

describe("buildOrunPinningConfig", () => {
  it("monta a config no formato esperado pela lib com subdomínios incluídos", () => {
    const config = buildOrunPinningConfig({
      supabaseProjectHost: "xxxxx.supabase.co",
      supabasePublicKeyHashes: ["hashA==", "hashB=="],
    });

    expect(config["xxxxx.supabase.co"]).toEqual({
      includeSubdomains: true,
      publicKeyHashes: ["hashA==", "hashB=="],
    });
  });
});
