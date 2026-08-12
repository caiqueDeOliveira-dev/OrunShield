import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("systeminformation", () => ({
  default: { processes: vi.fn() },
}));
import si from "systeminformation";
import { ProcessMonitor } from "../src/sentinel/ProcessMonitor.js";

function fakeProcess(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pid: 1234,
    name: "chrome.exe",
    cpu: 5,
    path: "C:\\Program Files\\Chrome\\chrome.exe",
    command: "chrome.exe --profile",
    ...overrides,
  };
}

describe("ProcessMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("alerta quando detecta processo com nome de ferramenta de ataque conhecida", async () => {
    (si.processes as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [fakeProcess({ name: "mimikatz.exe", path: "C:\\Users\\test\\mimikatz.exe" })],
    });

    const monitor = new ProcessMonitor({ pollIntervalMs: 1000 });
    const handler = vi.fn();
    monitor.on("sentinel:process-alert", handler);

    monitor.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0]).toMatchObject({ severity: "critical" });
    monitor.stop();
  });

  it("alerta sobre processo rodando em pasta temporária", async () => {
    (si.processes as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [fakeProcess({ name: "svc_update.exe", path: "C:\\Users\\test\\AppData\\Local\\Temp\\svc_update.exe" })],
    });

    const monitor = new ProcessMonitor({ pollIntervalMs: 1000 });
    const handler = vi.fn();
    monitor.on("sentinel:process-alert", handler);

    monitor.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(handler).toHaveBeenCalled();
    monitor.stop();
  });

  it("não alerta sobre processo allowlisted mesmo com CPU alto", async () => {
    (si.processes as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [fakeProcess({ name: "node.exe", cpu: 95 })],
    });

    const monitor = new ProcessMonitor({ pollIntervalMs: 1000, allowlist: ["node.exe"] });
    const handler = vi.fn();
    monitor.on("sentinel:process-alert", handler);

    monitor.start();
    await vi.advanceTimersByTimeAsync(4000);

    expect(handler).not.toHaveBeenCalled();
    monitor.stop();
  });

  it("só alerta sobre CPU sustentado após 3 polls consecutivos acima do limiar", async () => {
    (si.processes as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [fakeProcess({ name: "unknown_miner.exe", cpu: 90 })],
    });

    const monitor = new ProcessMonitor({ pollIntervalMs: 1000, cpuThresholdPercent: 70 });
    const handler = vi.fn();
    monitor.on("sentinel:process-alert", handler);

    monitor.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).toHaveBeenCalledTimes(1);
    monitor.stop();
  });
});
