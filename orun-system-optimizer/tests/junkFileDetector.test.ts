import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JunkFileDetector } from "../src/disk/JunkFileDetector.js";

describe("JunkFileDetector (filesystem real)", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "orun-optimizer-junk-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("identifica arquivos temporários por extensão", async () => {
    await writeFile(join(workDir, "sessao.tmp"), "x".repeat(100));
    await writeFile(join(workDir, "importante.docx"), "x".repeat(100));

    const detector = new JunkFileDetector();
    const result = await detector.scan(workDir);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ category: "temp-file" });
    expect(result.candidates[0]?.path).toContain("sessao.tmp");
  });

  it("classifica .log separadamente como log-file, não temp-file genérico", async () => {
    await writeFile(join(workDir, "app.log"), "x".repeat(50));
    const detector = new JunkFileDetector();
    const result = await detector.scan(workDir);

    expect(result.candidates[0]?.category).toBe("log-file");
  });

  it("identifica arquivos de metadados do SO (Thumbs.db, .DS_Store)", async () => {
    await writeFile(join(workDir, "Thumbs.db"), "x".repeat(10));
    await writeFile(join(workDir, ".DS_Store"), "x".repeat(10));

    const detector = new JunkFileDetector();
    const result = await detector.scan(workDir);

    expect(result.candidates.filter((c) => c.category === "os-junk")).toHaveLength(2);
  });

  it("classifica uma pasta inteira chamada 'Cache' como candidato único, sem descer nos arquivos de dentro", async () => {
    await mkdir(join(workDir, "Cache"));
    await writeFile(join(workDir, "Cache", "entry1"), "x".repeat(100));
    await writeFile(join(workDir, "Cache", "entry2"), "x".repeat(200));

    const detector = new JunkFileDetector();
    const result = await detector.scan(workDir);

    const cacheCandidates = result.candidates.filter((c) => c.category === "cache");
    expect(cacheCandidates).toHaveLength(1);
    expect(cacheCandidates[0]?.sizeBytes).toBe(300); // soma dos arquivos de dentro
  });

  it("identifica pastas vazias (inclusive as que ficaram vazias depois de processar os filhos)", async () => {
    await mkdir(join(workDir, "vazia"));
    const detector = new JunkFileDetector();
    const result = await detector.scan(workDir);

    expect(result.candidates.some((c) => c.category === "empty-folder" && c.path.endsWith("vazia"))).toBe(true);
  });

  it("não examina pastas na lista de exclusão (ex: node_modules, .git)", async () => {
    await mkdir(join(workDir, "node_modules"));
    await writeFile(join(workDir, "node_modules", "algo.tmp"), "x".repeat(100));

    const detector = new JunkFileDetector();
    const result = await detector.scan(workDir);

    expect(result.candidates).toHaveLength(0);
  });

  it("identifica instalador antigo em Downloads só quando isDownloadsFolder=true E passou do threshold de idade", async () => {
    const installerPath = join(workDir, "setup.exe");
    await writeFile(installerPath, "x".repeat(100));
    // Simula um arquivo com 200 dias desde a última modificação.
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await utimes(installerPath, oldDate, oldDate);

    const withoutFlag = await new JunkFileDetector().scan(workDir, false);
    expect(withoutFlag.candidates.filter((c) => c.category === "old-installer")).toHaveLength(0);

    const withFlag = await new JunkFileDetector({ oldDownloadsThresholdDays: 90 }).scan(workDir, true);
    expect(withFlag.candidates.filter((c) => c.category === "old-installer")).toHaveLength(1);
  });

  it("NÃO marca instalador recente em Downloads como antigo", async () => {
    await writeFile(join(workDir, "setup-novo.exe"), "x".repeat(100)); // mtime = agora

    const detector = new JunkFileDetector({ oldDownloadsThresholdDays: 90 });
    const result = await detector.scan(workDir, true);

    expect(result.candidates.filter((c) => c.category === "old-installer")).toHaveLength(0);
  });

  it("totalReclaimableBytes soma corretamente todos os candidatos", async () => {
    await writeFile(join(workDir, "a.tmp"), "x".repeat(100));
    await writeFile(join(workDir, "b.log"), "x".repeat(50));

    const detector = new JunkFileDetector();
    const result = await detector.scan(workDir);

    expect(result.totalReclaimableBytes).toBe(150);
  });

  it("não confunde um arquivo legítimo com extensão parecida (.temporario.docx não deve ser pego por .tmp)", async () => {
    await writeFile(join(workDir, "relatorio.temporario.docx"), "x".repeat(100));

    const detector = new JunkFileDetector();
    const result = await detector.scan(workDir);

    expect(result.candidates).toHaveLength(0);
  });
});
