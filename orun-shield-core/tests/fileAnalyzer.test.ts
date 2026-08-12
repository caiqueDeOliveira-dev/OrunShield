import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { FileAnalyzer } from "../src/analyzer/FileAnalyzer.js";

describe("FileAnalyzer (filesystem real)", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "orun-shield-analyzer-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("calcula entropia 0 para um arquivo de um único byte repetido (sem nenhuma aleatoriedade)", async () => {
    const target = join(workDir, "repetitivo.txt");
    await writeFile(target, "a".repeat(10_000));

    const analyzer = new FileAnalyzer();
    const result = await analyzer.analyze(target);

    expect(result.entropy).toBeCloseTo(0, 5);
    expect(result.entropyInterpretation).toContain("Baixa");
  });

  it("calcula entropia próxima de 8 (máxima) para dados verdadeiramente aleatórios", async () => {
    const target = join(workDir, "aleatorio.bin");
    // Bytes criptograficamente aleatórios têm distribuição uniforme — entropia deve ficar bem perto do máximo teórico (8 bits/byte).
    await writeFile(target, randomBytes(100_000));

    const analyzer = new FileAnalyzer();
    const result = await analyzer.analyze(target);

    expect(result.entropy).toBeGreaterThan(7.9);
    expect(result.entropyInterpretation).toContain("Alta");
  });

  it("calcula corretamente o hash SHA-256 conhecido de um conteúdo fixo", async () => {
    const target = join(workDir, "conhecido.txt");
    await writeFile(target, "orun shield test"); // hash SHA-256 verificável independentemente

    const analyzer = new FileAnalyzer();
    const result = await analyzer.analyze(target);

    // sha256("orun shield test") calculado via node:crypto de forma independente do FileAnalyzer, pra não testar a lib contra ela mesma.
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update("orun shield test").digest("hex");
    expect(result.sha256).toBe(expected);
  });

  it("hash é sempre do arquivo inteiro, mesmo quando maxBytesToAnalyze limita a amostra de entropia/strings", async () => {
    const target = join(workDir, "grande.bin");
    const content = Buffer.concat([Buffer.from("INICIO"), randomBytes(1000), Buffer.from("FIM_DO_ARQUIVO_MARCADOR")]);
    await writeFile(target, content);

    // maxBytesToAnalyze menor que o arquivo inteiro — a amostra de entropia não vê o "FIM_DO_ARQUIVO_MARCADOR".
    const analyzer = new FileAnalyzer({ maxBytesToAnalyze: 10 });
    const result = await analyzer.analyze(target);

    expect(result.bytesAnalyzed).toBe(10);
    expect(result.sizeBytes).toBe(content.length);

    const { createHash } = await import("node:crypto");
    const expectedFullHash = createHash("sha256").update(content).digest("hex");
    expect(result.sha256).toBe(expectedFullHash); // hash bate com o arquivo INTEIRO, não só a amostra
  });

  it("extrai strings imprimíveis de um binário com texto embutido em meio a bytes não-imprimíveis", async () => {
    const target = join(workDir, "com-strings.bin");
    const content = Buffer.concat([
      Buffer.from([0x00, 0x01, 0x02]),
      Buffer.from("SENHA_SECRETA_EXTRAIDA"),
      Buffer.from([0xff, 0xfe]),
      Buffer.from("outra-string-aqui"),
    ]);
    await writeFile(target, content);

    const analyzer = new FileAnalyzer();
    const result = await analyzer.analyze(target);

    expect(result.extractedStrings).toContain("SENHA_SECRETA_EXTRAIDA");
    expect(result.extractedStrings).toContain("outra-string-aqui");
  });

  it("respeita minStringLength — não retorna sequências curtas demais", async () => {
    const target = join(workDir, "strings-curtas.bin");
    await writeFile(target, Buffer.concat([Buffer.from("ab"), Buffer.from([0x00]), Buffer.from("umastringlonga")]));

    const analyzer = new FileAnalyzer({ minStringLength: 5 });
    const result = await analyzer.analyze(target);

    expect(result.extractedStrings).not.toContain("ab");
    expect(result.extractedStrings).toContain("umastringlonga");
  });

  it("identifica indicador suspeito quando entropia alta aparece num .exe", async () => {
    const target = join(workDir, "suspeito.exe");
    await writeFile(target, randomBytes(50_000)); // alta entropia forçada

    const analyzer = new FileAnalyzer();
    const result = await analyzer.analyze(target);

    expect(result.suspiciousIndicators.some((i) => i.includes("Entropia alta"))).toBe(true);
  });

  it("NÃO sinaliza entropia alta como suspeita em um .zip (esperado ser alta ali)", async () => {
    const target = join(workDir, "arquivo.zip");
    await writeFile(target, randomBytes(50_000));

    const analyzer = new FileAnalyzer();
    const result = await analyzer.analyze(target);

    expect(result.suspiciousIndicators.some((i) => i.includes("Entropia alta"))).toBe(false);
  });

  it("identifica padrão de string suspeita (PowerShell -EncodedCommand)", async () => {
    const target = join(workDir, "script-suspeito.bin");
    await writeFile(target, "powershell.exe -EncodedCommand JABzAGgAZQBsAGwA");

    const analyzer = new FileAnalyzer();
    const result = await analyzer.analyze(target);

    expect(result.suspiciousIndicators.some((i) => i.toLowerCase().includes("powershell"))).toBe(true);
  });

  it("retorna lista de indicadores vazia para um arquivo de texto comum, sem padrões suspeitos", async () => {
    const target = join(workDir, "documento-normal.txt");
    await writeFile(target, "Este é um documento de texto perfeitamente normal, sem nada suspeito.");

    const analyzer = new FileAnalyzer();
    const result = await analyzer.analyze(target);

    expect(result.suspiciousIndicators).toHaveLength(0);
  });
});
