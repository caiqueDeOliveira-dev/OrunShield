import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CleanupManager } from "../src/cleanup/CleanupManager.js";

describe("CleanupManager (filesystem real)", () => {
  let workDir: string;
  let holdingDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "orun-optimizer-cleanup-"));
    holdingDir = join(workDir, "holding");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("move um candidato pra área de espera e some do local original", async () => {
    const target = join(workDir, "lixo.tmp");
    await writeFile(target, "conteúdo de teste");

    const manager = new CleanupManager({ holdingDir });
    const result = await manager.moveToHolding({ path: target, sizeBytes: 17 });

    expect(result.success).toBe(true);
    await expect(readFile(target)).rejects.toThrow();
    const heldContent = await readFile(result.entry!.holdingPath, "utf-8");
    expect(heldContent).toBe("conteúdo de teste");
  });

  it("restore() devolve o arquivo pro local original e remove da lista", async () => {
    const target = join(workDir, "sub", "lixo.tmp");
    await mkdir(join(workDir, "sub"), { recursive: true });
    await writeFile(target, "original");

    const manager = new CleanupManager({ holdingDir });
    const moveResult = await manager.moveToHolding({ path: target, sizeBytes: 8 });
    const restoreResult = await manager.restore(moveResult.entry!.id);

    expect(restoreResult.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("original");
    expect(await manager.list()).toHaveLength(0);
  });

  it("permanentlyDelete() remove definitivamente, inclusive pastas inteiras (recursive)", async () => {
    const target = join(workDir, "pasta-lixo");
    await mkdir(target);
    await writeFile(join(target, "arquivo-dentro.txt"), "x");

    const manager = new CleanupManager({ holdingDir });
    const moveResult = await manager.moveToHolding({ path: target, sizeBytes: 1 });
    const deleteResult = await manager.permanentlyDelete(moveResult.entry!.id);

    expect(deleteResult.success).toBe(true);
    expect(await manager.list()).toHaveLength(0);
  });

  it("moveManyToHolding continua o lote mesmo se um item falhar (ex: caminho que não existe)", async () => {
    const okTarget = join(workDir, "existe.tmp");
    await writeFile(okTarget, "x");

    const manager = new CleanupManager({ holdingDir });
    const results = await manager.moveManyToHolding([
      { path: okTarget, sizeBytes: 1 },
      { path: join(workDir, "nao-existe.tmp"), sizeBytes: 1 },
    ]);

    expect(results[0]?.success).toBe(true);
    expect(results[1]?.success).toBe(false);
  });

  it("purgeEligible() só apaga itens que já passaram do holdingPeriodDays, não os recentes", async () => {
    const target = join(workDir, "recente.tmp");
    await writeFile(target, "x");

    // holdingPeriodDays bem alto -> item recém-movido NÃO deve ser elegível ainda.
    const manager = new CleanupManager({ holdingDir, holdingPeriodDays: 30 });
    await manager.moveToHolding({ path: target, sizeBytes: 1 });

    const purged = await manager.purgeEligible();
    expect(purged).toHaveLength(0);
    expect(await manager.list()).toHaveLength(1);
  });

  it("purgeEligible() apaga itens cujo prazo já passou", async () => {
    const target = join(workDir, "antigo.tmp");
    await writeFile(target, "x");

    vi.useFakeTimers();
    try {
      const manager = new CleanupManager({ holdingDir, holdingPeriodDays: 1 });
      await manager.moveToHolding({ path: target, sizeBytes: 1 });

      // Avança o relógio 2 dias — o item deveria estar elegível pra purga agora.
      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);

      const purged = await manager.purgeEligible();
      expect(purged).toHaveLength(1);
      expect(purged[0]?.success).toBe(true);
      expect(await manager.list()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("restore()/permanentlyDelete() retornam erro tratado para id inexistente, sem lançar exceção", async () => {
    const manager = new CleanupManager({ holdingDir });
    const restoreResult = await manager.restore("id-fantasma");
    const deleteResult = await manager.permanentlyDelete("id-fantasma");

    expect(restoreResult.success).toBe(false);
    expect(deleteResult.success).toBe(false);
  });

  it("preserva a categoria do JunkCandidate original ao mover pra espera", async () => {
    const target = join(workDir, "cache-antigo");
    await writeFile(target, "x");

    const manager = new CleanupManager({ holdingDir });
    const result = await manager.moveToHolding({
      path: target,
      category: "cache",
      sizeBytes: 1,
      reason: "teste",
      ageDays: 5,
    });

    expect(result.entry?.category).toBe("cache");
  });

  it("usa categoria 'manual' quando o candidato não veio do JunkFileDetector (ex: usuário escolheu na UI)", async () => {
    const target = join(workDir, "escolhido-manualmente.zip");
    await writeFile(target, "x");

    const manager = new CleanupManager({ holdingDir });
    const result = await manager.moveToHolding({ path: target, sizeBytes: 1 });

    expect(result.entry?.category).toBe("manual");
  });
});
