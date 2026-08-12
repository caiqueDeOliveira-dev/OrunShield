import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BinaryVerifier } from "../src/integrity/BinaryVerifier.js";

describe("BinaryVerifier (filesystem real)", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "orun-shield-integrity-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("gera manifesto com hash correto para arquivos com extensão monitorada", async () => {
    await writeFile(join(workDir, "app.exe"), "conteúdo do binário v1");
    await writeFile(join(workDir, "readme.txt"), "isso não deve entrar no manifesto"); // extensão não monitorada

    const verifier = new BinaryVerifier();
    const manifest = await verifier.generateManifest(workDir);

    expect(Object.keys(manifest.entries)).toEqual(["app.exe"]);
    expect(manifest.entries["app.exe"]).toHaveLength(64); // SHA-256 em hex
  });

  it("percorre subpastas recursivamente, ignorando node_modules e pastas ocultas", async () => {
    await mkdir(join(workDir, "resources"), { recursive: true });
    await mkdir(join(workDir, "node_modules", "alguma-lib"), { recursive: true });
    await mkdir(join(workDir, ".git"), { recursive: true });

    await writeFile(join(workDir, "resources", "core.dll"), "dll content");
    await writeFile(join(workDir, "node_modules", "alguma-lib", "native.node"), "não deve entrar");
    await writeFile(join(workDir, ".git", "algum.dll"), "não deve entrar");

    const verifier = new BinaryVerifier();
    const manifest = await verifier.generateManifest(workDir, [".dll", ".node"]);

    expect(Object.keys(manifest.entries)).toEqual(["resources/core.dll"]);
  });

  it("verify() não reporta nada quando nada mudou", async () => {
    await writeFile(join(workDir, "app.exe"), "conteúdo estável");
    const verifier = new BinaryVerifier();
    const manifest = await verifier.generateManifest(workDir);

    const findings = await verifier.verify(workDir, manifest);
    expect(findings).toHaveLength(0);
  });

  it("verify() detecta arquivo modificado (hash diferente) como critical", async () => {
    await writeFile(join(workDir, "app.exe"), "conteúdo original");
    const verifier = new BinaryVerifier();
    const manifest = await verifier.generateManifest(workDir);

    await writeFile(join(workDir, "app.exe"), "conteúdo ADULTERADO");
    const findings = await verifier.verify(workDir, manifest);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "critical", filePath: "app.exe" });
    expect(findings[0]?.title).toContain("modificado");
  });

  it("verify() detecta arquivo crítico ausente como critical", async () => {
    await writeFile(join(workDir, "app.exe"), "conteúdo original");
    const verifier = new BinaryVerifier();
    const manifest = await verifier.generateManifest(workDir);

    await rm(join(workDir, "app.exe"));
    const findings = await verifier.verify(workDir, manifest);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "critical" });
    expect(findings[0]?.title).toContain("ausente");
  });

  it("verify() sinaliza arquivo novo não previsto no manifesto como medium", async () => {
    await writeFile(join(workDir, "app.exe"), "conteúdo original");
    const verifier = new BinaryVerifier();
    const manifest = await verifier.generateManifest(workDir);

    await writeFile(join(workDir, "injetado.exe"), "arquivo suspeito adicionado depois");
    const findings = await verifier.verify(workDir, manifest);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "medium", filePath: "injetado.exe" });
  });

  it("save/loadManifest fazem round-trip correto via arquivo real", async () => {
    await writeFile(join(workDir, "app.exe"), "x");
    const verifier = new BinaryVerifier();
    const manifest = await verifier.generateManifest(workDir);

    const manifestPath = join(workDir, "manifest.json");
    await verifier.saveManifest(manifest, manifestPath);
    const loaded = await verifier.loadManifest(manifestPath);

    expect(loaded).toEqual(manifest);
  });
});
