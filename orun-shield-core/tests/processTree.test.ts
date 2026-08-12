import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("systeminformation", () => ({
  default: { processes: vi.fn() },
}));
import si from "systeminformation";
import { ProcessMonitor } from "../src/sentinel/ProcessMonitor.js";

function fakeProcess(overrides: Record<string, unknown> = {}) {
  return {
    pid: 1,
    parentPid: 0,
    name: "proc",
    cpu: 0,
    mem: 0,
    command: "proc",
    path: "",
    ...overrides,
  };
}

describe("ProcessMonitor.getProcessTree()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("monta corretamente uma árvore de 3 níveis (avô → pai → filho)", async () => {
    (si.processes as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        fakeProcess({ pid: 1, parentPid: 0, name: "init" }),
        fakeProcess({ pid: 100, parentPid: 1, name: "explorer.exe" }),
        fakeProcess({ pid: 200, parentPid: 100, name: "chrome.exe" }),
      ],
    });

    const monitor = new ProcessMonitor();
    const tree = await monitor.getProcessTree();

    const init = tree.find((n) => n.pid === 1);
    expect(init).toBeDefined();
    expect(init?.children).toHaveLength(1);
    expect(init?.children[0]?.name).toBe("explorer.exe");
    expect(init?.children[0]?.children[0]?.name).toBe("chrome.exe");
  });

  it("processo sem pai conhecido na lista atual vira raiz (não quebra a árvore)", async () => {
    (si.processes as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        fakeProcess({ pid: 500, parentPid: 9999, name: "orfao.exe" }), // 9999 não existe na lista
      ],
    });

    const monitor = new ProcessMonitor();
    const tree = await monitor.getProcessTree();

    expect(tree.some((n) => n.name === "orfao.exe")).toBe(true);
  });

  it("processo que aponta pra si mesmo como pai (auto-referência) não causa loop infinito", async () => {
    (si.processes as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [fakeProcess({ pid: 42, parentPid: 42, name: "estranho.exe" })],
    });

    const monitor = new ProcessMonitor();
    const tree = await monitor.getProcessTree();

    // Deve virar raiz (proteção contra auto-referência), não ficar em loop nem duplicado.
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(0);
  });

  it("útil pra investigar um alerta: acha o caminho completo até a raiz de um processo suspeito", async () => {
    (si.processes as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        fakeProcess({ pid: 1, parentPid: 0, name: "explorer.exe" }),
        fakeProcess({ pid: 2, parentPid: 1, name: "powershell.exe" }),
        fakeProcess({ pid: 3, parentPid: 2, name: "cmd.exe" }),
        fakeProcess({ pid: 4, parentPid: 3, name: "suspicious.exe" }),
      ],
    });

    const monitor = new ProcessMonitor();
    const tree = await monitor.getProcessTree();

    const explorer = tree.find((n) => n.name === "explorer.exe")!;
    const powershell = explorer.children[0]!;
    const cmd = powershell.children[0]!;
    const suspicious = cmd.children[0]!;

    expect(powershell.name).toBe("powershell.exe");
    expect(cmd.name).toBe("cmd.exe");
    expect(suspicious.name).toBe("suspicious.exe");
  });
});
