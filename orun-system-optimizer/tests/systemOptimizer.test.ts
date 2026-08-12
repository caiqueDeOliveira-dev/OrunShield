import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SystemOptimizer } from "../src/orchestrator/SystemOptimizer.js";

describe("SystemOptimizer — proteção automática contra a própria pasta de espera", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "orun-optimizer-orchestrator-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("scanDisk() NÃO conta a pasta de espera quando ela está DENTRO da árvore escaneada", async () => {
    // Cenário real do bug: holdingDir dentro da própria pasta que o usuário escaneia
    // (equivalente a userData ficar dentro da home no Linux).
    const holdingDir = join(workDir, "optimizer-holding");
    const optimizer = new SystemOptimizer({ cleanup: { holdingDir } });

    await writeFile(join(workDir, "documento.txt"), "x".repeat(100));

    // Move algo pra área de espera primeiro, pra ela realmente existir com conteúdo.
    const targetToHold = join(workDir, "lixo.tmp");
    await writeFile(targetToHold, "x".repeat(5000)); // arquivo GRANDE — se contado, dominaria o resultado
    await optimizer.cleanupManager.moveToHolding({ path: targetToHold, sizeBytes: 5000 });

    const result = await optimizer.scanDisk(workDir);

    // Sem a proteção, o total incluiria os 5000 bytes movidos pra dentro da
    // pasta de espera + os metadados .json. Com a proteção, só os 100 bytes
    // do documento legítimo devem contar.
    expect(result.totalSizeBytes).toBe(100);
    expect(result.tree.children?.some((c) => c.name === "optimizer-holding")).toBe(false);
  });

  it("scanJunk() NÃO desce dentro da pasta de espera e não reclassifica itens já isolados", async () => {
    const holdingDir = join(workDir, "optimizer-holding");
    const optimizer = new SystemOptimizer({ cleanup: { holdingDir } });

    const tempFile = join(workDir, "cache-antigo.tmp");
    await writeFile(tempFile, "x".repeat(100));
    await optimizer.cleanupManager.moveToHolding({
      path: tempFile,
      category: "temp-file",
      sizeBytes: 100,
      reason: "teste",
      ageDays: 0,
    });

    // Um novo scan de junk na mesma pasta não deveria encontrar o arquivo
    // já isolado (que fisicamente agora mora dentro de optimizer-holding)
    // como se fosse um novo candidato.
    const result = await optimizer.scanJunk(workDir);
    expect(result.candidates.some((c) => c.path.includes("optimizer-holding"))).toBe(false);
  });

  it("extraExcludeDirNames permite excluir também a pasta de quarentena do Shield, se os dois pacotes convivem no mesmo app", async () => {
    const holdingDir = join(workDir, "optimizer-holding");
    await mkdir(join(workDir, "shield-quarantine"), { recursive: true });
    await writeFile(join(workDir, "shield-quarantine", "malware-isolado.exe"), "x".repeat(9999));
    await writeFile(join(workDir, "arquivo-normal.txt"), "x".repeat(50));

    const optimizer = new SystemOptimizer({
      cleanup: { holdingDir },
      extraExcludeDirNames: ["shield-quarantine"],
    });

    const result = await optimizer.scanDisk(workDir);
    expect(result.totalSizeBytes).toBe(50); // não conta o malware isolado do Shield
  });

  it("sem extraExcludeDirNames, uma pasta de OUTRO sistema (ex: shield-quarantine) NÃO é excluída automaticamente — só a própria", async () => {
    const holdingDir = join(workDir, "optimizer-holding");
    await mkdir(join(workDir, "shield-quarantine"), { recursive: true });
    await writeFile(join(workDir, "shield-quarantine", "arquivo.exe"), "x".repeat(500));

    const optimizer = new SystemOptimizer({ cleanup: { holdingDir } }); // sem extraExcludeDirNames

    const result = await optimizer.scanDisk(workDir);
    expect(result.totalSizeBytes).toBe(500); // conta normalmente, pois não foi pedido pra excluir
  });

  it("checkUpdates()/detectPackageManager() funcionam através do orquestrador (delegação correta)", async () => {
    const optimizer = new SystemOptimizer({ cleanup: { holdingDir: join(workDir, "optimizer-holding") } });
    const kind = await optimizer.detectPackageManager();
    // O gerenciador detectado deve ser o nativo do SO atual (apt no Linux,
    // winget no Windows, brew no macOS) — e nunca vazio.
    const expected = process.platform === "win32" ? "winget" : process.platform === "darwin" ? "brew" : "apt";
    expect(kind).toBe(expected);
  });
});
