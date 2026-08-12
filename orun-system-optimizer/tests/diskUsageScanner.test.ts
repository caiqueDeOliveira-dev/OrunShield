import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiskUsageScanner } from "../src/disk/DiskUsageScanner.js";

describe("DiskUsageScanner (filesystem real)", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "orun-optimizer-disk-"));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it("calcula o tamanho total corretamente somando arquivos em subpastas", async () => {
    await writeFile(join(workDir, "a.txt"), "x".repeat(100));
    await mkdir(join(workDir, "sub"));
    await writeFile(join(workDir, "sub", "b.txt"), "x".repeat(200));

    const scanner = new DiskUsageScanner();
    const result = await scanner.scan(workDir);

    expect(result.totalSizeBytes).toBe(300);
    expect(result.filesScanned).toBe(2);
  });

  it("ordena os filhos do maior pro menor em cada nível da árvore", async () => {
    await writeFile(join(workDir, "pequeno.txt"), "x".repeat(10));
    await writeFile(join(workDir, "grande.txt"), "x".repeat(1000));
    await writeFile(join(workDir, "medio.txt"), "x".repeat(100));

    const scanner = new DiskUsageScanner();
    const result = await scanner.scan(workDir);

    const names = result.tree.children?.map((c) => c.name);
    expect(names).toEqual(["grande.txt", "medio.txt", "pequeno.txt"]);
  });

  it("topconsumers inclui o maior arquivo real da árvore, mesmo dentro de subpastas", async () => {
    await mkdir(join(workDir, "sub1"));
    await mkdir(join(workDir, "sub2"));
    await writeFile(join(workDir, "sub1", "outro.bin"), "x".repeat(1));
    await writeFile(join(workDir, "sub1", "enorme.bin"), "x".repeat(5000));
    await writeFile(join(workDir, "sub2", "pequeno.bin"), "x".repeat(10));

    const scanner = new DiskUsageScanner({ topN: 10 });
    const result = await scanner.scan(workDir);

    // Nota: pastas TAMBÉM entram em topconsumers (uma pasta gigante é uma
    // informação relevante de "onde está o espaço"), então não assumimos
    // que o primeiro item é necessariamente o arquivo — só que o arquivo
    // certo aparece na lista com o tamanho certo.
    const foundFile = result.topconsumers.find((n) => n.name === "enorme.bin");
    expect(foundFile?.sizeBytes).toBe(5000);
    expect(foundFile?.type).toBe("file");
  });

  it("pula pastas na lista de skipDirNames (ex: node_modules)", async () => {
    await mkdir(join(workDir, "node_modules"));
    await writeFile(join(workDir, "node_modules", "lib.js"), "x".repeat(9999));
    await writeFile(join(workDir, "app.js"), "x".repeat(50));

    const scanner = new DiskUsageScanner();
    const result = await scanner.scan(workDir);

    expect(result.totalSizeBytes).toBe(50);
    expect(result.filesScanned).toBe(1);
  });

  it("continua o scan e reporta em `errors` quando encontra um link quebrado (ENOENT real, independente de privilégio)", async () => {
    // chmod 000 não bloqueia leitura quando o processo roda como root (comum
    // em ambientes de CI/Docker) — um symlink quebrado gera um erro real de
    // stat (ENOENT) independentemente de quem está rodando o teste.
    const { symlink } = await import("node:fs/promises");
    await writeFile(join(workDir, "publico.txt"), "x".repeat(50));
    try {
      await symlink(join(workDir, "nao-existe-de-verdade.txt"), join(workDir, "link-quebrado.txt"));
    } catch (err) {
      // Windows sem "Modo Desenvolvedor"/admin não permite criar symlink
      // (EPERM) — nesse caso o teste é pulado, não falha.
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        console.warn("Criar symlink não é permitido neste Windows (sem Modo Desenvolvedor/admin) — pulando.");
        return;
      }
      throw err;
    }

    const scanner = new DiskUsageScanner();
    const result = await scanner.scan(workDir);

    // O scan não deve abortar por causa do link quebrado.
    expect(result.totalSizeBytes).toBeGreaterThanOrEqual(50);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.path).toContain("link-quebrado.txt");
  });
});
