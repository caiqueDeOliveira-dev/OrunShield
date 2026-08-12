import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, platform: vi.fn() };
});

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { DefenderBridge } from "../src/defender/DefenderBridge.js";

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

describe("DefenderBridge — platform gating (nunca tenta rodar fora do Windows)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("linux");
  });

  it("checkAvailability() retorna false no Linux sem sequer tentar chamar powershell", async () => {
    const bridge = new DefenderBridge();
    const available = await bridge.checkAvailability();

    expect(available).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("getStatus() retorna available:false no Linux sem tentar rodar comando", async () => {
    const bridge = new DefenderBridge();
    const status = await bridge.getStatus();

    expect(status.available).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("syncThreats() retorna array vazio no Linux, sem erro", async () => {
    const bridge = new DefenderBridge();
    const findings = await bridge.syncThreats();

    expect(findings).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("DefenderBridge — parsing (Windows simulado, powershell mockado)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("win32");
  });

  it("getStatus() faz parsing correto da saída JSON do Get-MpComputerStatus", async () => {
    const output = JSON.stringify({
      AntivirusEnabled: true,
      RealTimeProtectionEnabled: true,
      AntispywareEnabled: true,
      AntivirusSignatureVersion: "1.403.2.0",
      AntivirusSignatureAge: 1,
      FullScanAge: 5,
      QuickScanAge: 0,
    });
    mockSpawnOnce(output, 0);

    const bridge = new DefenderBridge();
    const status = await bridge.getStatus();

    expect(status).toMatchObject({
      available: true,
      antivirusEnabled: true,
      realTimeProtectionEnabled: true,
      signatureAgeDays: 1,
    });
  });

  it("checkAvailability() retorna false quando o powershell falha (Defender substituído por outro AV)", async () => {
    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit("close", 1));
      return child;
    });

    const bridge = new DefenderBridge();
    expect(await bridge.checkAvailability()).toBe(false);
  });

  it("syncThreats() faz parsing correto de uma detecção real (formato documentado do Get-MpThreatDetection)", async () => {
    const output = JSON.stringify([
      {
        ThreatID: 2147519003,
        ProcessName: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        InitialDetectionTime: "2024-04-30T07:04:06.000Z",
        ThreatStatusID: 3,
        Resources: ["file:_C:\\Users\\user\\Downloads\\artifact_x64.exe"],
        ThreatName: "Trojan:Win32/Wacatac.B!ml",
        SeverityID: 5,
        CategoryID: 8,
      },
    ]);
    mockSpawnOnce(output, 0);

    const bridge = new DefenderBridge();
    const findings = await bridge.syncThreats();

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      source: "windows-defender",
      severity: "critical",
      filePath: "C:\\Users\\user\\Downloads\\artifact_x64.exe",
      processName: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    });
    expect(findings[0]?.title).toContain("Wacatac");
  });

  it("mapeia corretamente as severidades verificadas (SeverityID 0-5)", async () => {
    const makeDetection = (severityId: number) =>
      JSON.stringify([
        {
          ThreatID: severityId + 1000,
          ThreatName: `Teste${severityId}`,
          SeverityID: severityId,
          InitialDetectionTime: "2024-01-01T00:00:00.000Z",
        },
      ]);

    const expectations: [number, string][] = [
      [5, "critical"],
      [4, "high"],
      [2, "medium"],
      [1, "low"],
      [0, "info"],
    ];

    for (const [severityId, expectedSeverity] of expectations) {
      mockSpawnOnce(makeDetection(severityId), 0);
      const bridge = new DefenderBridge();
      const findings = await bridge.syncThreats();
      expect(findings[0]?.severity).toBe(expectedSeverity);
    }
  });

  it("syncThreats() deduplica — chamar duas vezes com a mesma detecção não emite o finding de novo", async () => {
    const output = JSON.stringify([
      {
        ThreatID: 999,
        ThreatName: "MesmaAmeaca",
        SeverityID: 5,
        InitialDetectionTime: "2024-01-01T00:00:00.000Z",
      },
    ]);
    mockSpawnOnce(output, 0);
    mockSpawnOnce(output, 0);

    const bridge = new DefenderBridge();
    const first = await bridge.syncThreats();
    const second = await bridge.syncThreats();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("syncThreats() lida com resposta vazia (nenhuma detecção) sem lançar exceção", async () => {
    mockSpawnOnce("", 0);
    const bridge = new DefenderBridge();
    const findings = await bridge.syncThreats();
    expect(findings).toEqual([]);
  });

  it("ensureRealTimeProtectionEnabled() só ativa, roda o comando esperado", async () => {
    mockSpawnOnce("", 0);
    const bridge = new DefenderBridge();
    const result = await bridge.ensureRealTimeProtectionEnabled();

    expect(result.success).toBe(true);
    const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].join(" ")).toContain("Set-MpPreference -DisableRealtimeMonitoring $false");
  });

  it("updateSignatures() retorna erro tratado (sem lançar exceção) quando o comando falha", async () => {
    (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from("Access denied"));
        child.emit("close", 1);
      });
      return child;
    });

    const bridge = new DefenderBridge();
    const result = await bridge.updateSignatures();

    expect(result.updated).toBe(false);
    expect(result.error).toContain("Access denied");
  });
});
