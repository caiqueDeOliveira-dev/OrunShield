import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock de child_process.spawn para testar o parsing sem depender do binário clamav real instalado no CI.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { ClamAVScanner } from "../src/clamav/ClamAVScanner.js";

function mockSpawn(stdout: string, exitCode: number) {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(child);

  queueMicrotask(() => {
    child.stdout.emit("data", Buffer.from(stdout));
    child.emit("close", exitCode);
  });

  return child;
}

describe("ClamAVScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna resultado vazio quando nenhum arquivo é infectado", async () => {
    mockSpawn("Scanned files: 120\n", 0);
    const scanner = new ClamAVScanner();
    const result = await scanner.scan("/home/user/downloads");

    expect(result.findings).toHaveLength(0);
    expect(result.filesScanned).toBe(120);
    expect(result.engine).toBe("clamav");
  });

  it("faz parsing correto de arquivos infectados (exit code 1)", async () => {
    const output = [
      "/home/user/downloads/malware.exe: Win.Trojan.Generic-12345 FOUND",
      "/home/user/downloads/adware.dll: PUA.Win.Adware.Toolbar FOUND",
      "Scanned files: 50",
    ].join("\n");
    mockSpawn(output, 1);

    const scanner = new ClamAVScanner();
    const result = await scanner.scan("/home/user/downloads");

    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toMatchObject({
      source: "clamav",
      severity: "high",
      filePath: "/home/user/downloads/malware.exe",
    });
    expect(result.findings[1]).toMatchObject({
      severity: "low",
      filePath: "/home/user/downloads/adware.dll",
    });
  });

  it("emite evento threat:detected para cada achado", async () => {
    mockSpawn("/tmp/evil.bin: Trojan.Ransom.Locky FOUND\n", 1);
    const scanner = new ClamAVScanner();
    const handler = vi.fn();
    scanner.on("threat:detected", handler);

    await scanner.scan("/tmp");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ severity: "critical" });
  });

  it("classifica severidade critical para assinaturas de ransomware", async () => {
    mockSpawn("/tmp/x.exe: Win.Ransom.Crypt-99 FOUND\n", 1);
    const scanner = new ClamAVScanner();
    const result = await scanner.scan("/tmp");
    expect(result.findings[0]?.severity).toBe("critical");
  });

  it("propaga erro real de execução (ex: binário não encontrado) sem tratar como detecção", async () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(child);
    queueMicrotask(() => child.emit("error", new Error("ENOENT")));

    const scanner = new ClamAVScanner();
    await expect(scanner.scan("/tmp")).rejects.toThrow("ENOENT");
  });
});
