import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QuarantineManager } from "../src/quarantine/QuarantineManager.js";
import type { ThreatFinding } from "../src/types.js";

function makeFinding(filePath: string, overrides: Partial<ThreatFinding> = {}): ThreatFinding {
  return {
    id: "finding-1",
    source: "clamav",
    severity: "critical",
    title: "Malware detectado",
    description: "teste",
    filePath,
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("QuarantineManager (filesystem real)", () => {
  let workDir: string;
  let quarantineDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "orun-shield-test-"));
    quarantineDir = join(workDir, "quarantine");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("move o arquivo pra quarentena e o remove do local original", async () => {
    const targetPath = join(workDir, "malware.exe");
    await writeFile(targetPath, "conteúdo malicioso de teste");

    const manager = new QuarantineManager({ quarantineDir });
    const result = await manager.quarantine(makeFinding(targetPath));

    expect(result.success).toBe(true);
    expect(result.entry?.originalPath).toBe(targetPath);

    await expect(readFile(targetPath)).rejects.toThrow();
    const quarantinedContent = await readFile(result.entry!.quarantinedPath, "utf-8");
    expect(quarantinedContent).toBe("conteúdo malicioso de teste");
  });

  it("retorna success:false sem lançar exceção quando o arquivo não existe", async () => {
    const manager = new QuarantineManager({ quarantineDir });
    const result = await manager.quarantine(makeFinding(join(workDir, "nao-existe.exe")));

    expect(result.success).toBe(false);
    expect(result.error).toContain("não encontrado");
  });

  it("retorna success:false quando o finding não tem filePath", async () => {
    const manager = new QuarantineManager({ quarantineDir });
    const result = await manager.quarantine(makeFinding(undefined as unknown as string, { filePath: undefined }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("filePath");
  });

  it("list() retorna as entradas colocadas em quarentena", async () => {
    const targetPath = join(workDir, "malware.exe");
    await writeFile(targetPath, "x");
    const manager = new QuarantineManager({ quarantineDir });
    await manager.quarantine(makeFinding(targetPath));

    const entries = await manager.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.originalPath).toBe(targetPath);
  });

  it("restore() devolve o arquivo pro local original quando o hash bate", async () => {
    const targetPath = join(workDir, "subdir", "malware.exe");
    await mkdir(join(workDir, "subdir"), { recursive: true });
    await writeFile(targetPath, "conteúdo original");

    const manager = new QuarantineManager({ quarantineDir });
    const quarantineResult = await manager.quarantine(makeFinding(targetPath));
    const restoreResult = await manager.restore(quarantineResult.entry!.id);

    expect(restoreResult.success).toBe(true);
    const restoredContent = await readFile(targetPath, "utf-8");
    expect(restoredContent).toBe("conteúdo original");

    // Metadados devem ter sido limpos após restauração.
    const entries = await manager.list();
    expect(entries).toHaveLength(0);
  });

  it("restore() bloqueia se o arquivo em quarentena foi adulterado (hash não bate)", async () => {
    const targetPath = join(workDir, "malware.exe");
    await writeFile(targetPath, "conteúdo original");

    const manager = new QuarantineManager({ quarantineDir });
    const quarantineResult = await manager.quarantine(makeFinding(targetPath));

    // Simula adulteração do arquivo em quarentena.
    await writeFile(quarantineResult.entry!.quarantinedPath, "conteúdo adulterado");

    const restoreResult = await manager.restore(quarantineResult.entry!.id);
    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain("Integridade");
  });

  it("permanentlyDelete() remove o arquivo e os metadados definitivamente", async () => {
    const targetPath = join(workDir, "malware.exe");
    await writeFile(targetPath, "x");

    const manager = new QuarantineManager({ quarantineDir });
    const quarantineResult = await manager.quarantine(makeFinding(targetPath));
    const deleteResult = await manager.permanentlyDelete(quarantineResult.entry!.id);

    expect(deleteResult.success).toBe(true);
    await expect(readFile(quarantineResult.entry!.quarantinedPath)).rejects.toThrow();
    expect(await manager.list()).toHaveLength(0);
  });

  it("restore()/permanentlyDelete() retornam erro tratado para id inexistente", async () => {
    const manager = new QuarantineManager({ quarantineDir });
    const restoreResult = await manager.restore("id-que-nao-existe");
    const deleteResult = await manager.permanentlyDelete("id-que-nao-existe");

    expect(restoreResult.success).toBe(false);
    expect(deleteResult.success).toBe(false);
  });
});
