import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "node:child_process";
import { UpdateChecker } from "../src/updates/UpdateChecker.js";

function mockSpawnOnce(stdout: string, exitCode: number) {
  (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(stdout));
      child.emit("close", exitCode);
    });
    return child;
  });
}

describe("UpdateChecker.parseAptOutput (via checkApt, com apt mockado)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("faz parsing correto de linhas padrão do apt list --upgradable", async () => {
    const output = [
      "Listing...",
      "curl/noble-updates,noble-security 8.5.0-2ubuntu10.11 amd64 [upgradable from: 8.5.0-2ubuntu10.8]",
      "dpkg/noble-updates 1.22.6ubuntu6.6 amd64 [upgradable from: 1.22.6ubuntu6.5]",
    ].join("\n");
    mockSpawnOnce(output, 0);

    const checker = new UpdateChecker();
    const result = await checker.checkApt();

    expect(result.source).toBe("apt");
    expect(result.outdated).toHaveLength(2);
    expect(result.outdated[0]).toMatchObject({
      id: "curl",
      currentVersion: "8.5.0-2ubuntu10.8",
      availableVersion: "8.5.0-2ubuntu10.11",
    });
  });

  it("ignora a linha 'Listing...' e linhas vazias sem quebrar o parsing", async () => {
    mockSpawnOnce("Listing...\n\ncurl/noble 1.0 amd64 [upgradable from: 0.9]\n", 0);
    const checker = new UpdateChecker();
    const result = await checker.checkApt();
    expect(result.outdated).toHaveLength(1);
  });

  it("retorna lista vazia quando não há nada upgradable", async () => {
    mockSpawnOnce("Listing...\n", 0);
    const checker = new UpdateChecker();
    const result = await checker.checkApt();
    expect(result.outdated).toHaveLength(0);
  });

  it("não quebra quando o comando falha (binário ausente) — retorna lista vazia em vez de lançar exceção", async () => {
    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit("error", new Error("ENOENT")));
      return child;
    });

    const checker = new UpdateChecker();
    const result = await checker.checkApt();
    expect(result.outdated).toEqual([]);
  });
});

describe("UpdateChecker.parseBrewOutput (via checkBrew, com brew mockado)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("faz parsing correto do JSON v2 do brew outdated (formulae e casks)", async () => {
    const output = JSON.stringify({
      formulae: [{ name: "node", installed_versions: ["20.1.0"], current_version: "22.0.0" }],
      casks: [{ name: ["visual-studio-code"], installed_versions: "1.80", current_version: "1.90" }],
    });
    mockSpawnOnce(output, 0);

    const checker = new UpdateChecker();
    const result = await checker.checkBrew();

    expect(result.outdated).toHaveLength(2);
    expect(result.outdated.find((p) => p.id === "node")).toMatchObject({
      currentVersion: "20.1.0",
      availableVersion: "22.0.0",
    });
    expect(result.outdated.find((p) => p.id === "visual-studio-code")).toMatchObject({
      currentVersion: "1.80",
      availableVersion: "1.90",
    });
  });

  it("retorna lista vazia (sem lançar exceção) se o JSON vier corrompido", async () => {
    mockSpawnOnce("isso não é json válido {{{", 0);
    const checker = new UpdateChecker();
    const result = await checker.checkBrew();
    expect(result.outdated).toEqual([]);
  });
});

describe("UpdateChecker.parseWingetOutput (via checkWinget, com winget mockado)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("faz parsing de uma tabela típica do winget upgrade", async () => {
    const output = [
      "Name             Id                 Version   Available  Source",
      "-----------------------------------------------------------------",
      "Google Chrome    Google.Chrome      120.0.0   121.0.0    winget",
      "7-Zip            7zip.7zip          22.00     23.01      winget",
      "2 upgrades available.",
    ].join("\n");
    mockSpawnOnce(output, 0);

    const checker = new UpdateChecker();
    const result = await checker.checkWinget();

    expect(result.outdated).toHaveLength(2);
    expect(result.outdated[0]).toMatchObject({
      id: "Google.Chrome",
      currentVersion: "120.0.0",
      availableVersion: "121.0.0",
    });
  });

  it("retorna lista vazia quando não acha o cabeçalho esperado (formato inesperado/localizado)", async () => {
    mockSpawnOnce("Nenhuma atualização disponível no idioma configurado.", 0);
    const checker = new UpdateChecker();
    const result = await checker.checkWinget();
    expect(result.outdated).toEqual([]);
  });
});


