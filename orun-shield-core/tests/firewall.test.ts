import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, platform: vi.fn() };
});

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { FirewallManager } from "../src/firewall/FirewallManager.js";

function mockSpawnOnce(stdout: string, exitCode: number) {
  (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    // Agenda o "fim do processo" só depois que esta chamada de spawn() de
    // verdade aconteceu — assim os listeners (.on('close', ...)) já estão
    // anexados quando o microtask roda. Agendar isso antes (fora do
    // mockImplementationOnce) faz o evento disparar antes do listener
    // existir em cenários com múltiplas chamadas sequenciais de spawn().
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(stdout));
      child.emit("close", exitCode);
    });
    return child;
  });
}

describe("FirewallManager (Linux)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("linux");
  });

  it("blockIP adiciona a regra na chain OUTPUT (direção 'out')", async () => {
    mockSpawnOnce("", 0);
    const fw = new FirewallManager();
    await fw.blockIP("45.33.12.9", "orun-shield-block-45.33.12.9");

    const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("iptables");
    expect(call[1]).toContain("OUTPUT");
    expect(call[1]).toContain("DROP");
    expect(call[1]).toContain("45.33.12.9");
  });

  it("removeRule encontra e apaga regra que está na chain OUTPUT (bug corrigido: antes só tentava INPUT)", async () => {
    // Saída simulada do `iptables -L -n --line-numbers` com a regra na chain OUTPUT, não na INPUT.
    const iptablesListOutput = [
      "Chain INPUT (policy ACCEPT)",
      "num  target     prot opt source               destination",
      "",
      "Chain FORWARD (policy ACCEPT)",
      "num  target     prot opt source               destination",
      "",
      "Chain OUTPUT (policy ACCEPT)",
      "num  target     prot opt source               destination",
      "1    DROP       all  --  0.0.0.0/0            45.33.12.9           /* orun-shield-block-45.33.12.9 */",
    ].join("\n");

    mockSpawnOnce(iptablesListOutput, 0); // resposta do -L
    mockSpawnOnce("", 0); // resposta do -D

    const fw = new FirewallManager();
    await fw.removeRule("orun-shield-block-45.33.12.9");

    const deleteCall = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(deleteCall[0]).toBe("iptables");
    expect(deleteCall[1]).toEqual(["-D", "OUTPUT", "1"]);
  });

  it("removeRule não faz nada (sem erro) quando a regra não existe em nenhuma chain", async () => {
    mockSpawnOnce("Chain INPUT (policy ACCEPT)\nnum  target     prot opt source               destination", 0);

    const fw = new FirewallManager();
    await expect(fw.removeRule("regra-inexistente")).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(1); // só o -L, nenhum -D foi tentado
  });

  it("removeRule apaga múltiplas ocorrências em chains diferentes, da última linha pra primeira", async () => {
    const iptablesListOutput = [
      "Chain INPUT (policy ACCEPT)",
      "num  target     prot opt source               destination",
      "1    DROP       all  --  1.2.3.4              0.0.0.0/0            /* mesma-regra */",
      "2    DROP       all  --  5.6.7.8              0.0.0.0/0            /* mesma-regra */",
      "",
      "Chain OUTPUT (policy ACCEPT)",
      "num  target     prot opt source               destination",
      "1    DROP       all  --  0.0.0.0/0            1.2.3.4              /* mesma-regra */",
    ].join("\n");

    mockSpawnOnce(iptablesListOutput, 0);
    mockSpawnOnce("", 0);
    mockSpawnOnce("", 0);
    mockSpawnOnce("", 0);

    const fw = new FirewallManager();
    await fw.removeRule("mesma-regra");

    const deleteCalls = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls.slice(1);
    expect(deleteCalls).toHaveLength(3);
    // INPUT linha 2 deve ser removida antes da linha 1 (ordem decrescente dentro da mesma chain).
    expect(deleteCalls.map((c) => c[1])).toEqual(
      expect.arrayContaining([
        ["-D", "INPUT", "2"],
        ["-D", "INPUT", "1"],
        ["-D", "OUTPUT", "1"],
      ])
    );
  });

  it("addRule com protocolo específico e porta monta os argumentos corretos", async () => {
    mockSpawnOnce("", 0);
    const fw = new FirewallManager();
    await fw.addRule({ name: "block-port", direction: "in", protocol: "tcp", localPort: 4444, action: "block" });

    const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toEqual(["-A", "INPUT", "-p", "tcp", "--dport", "4444", "-m", "comment", "--comment", "block-port", "-j", "DROP"]);
  });
});

describe("FirewallManager (Windows)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("win32");
  });

  it("blockIP usa netsh com os parâmetros corretos", async () => {
    mockSpawnOnce("", 0);
    const fw = new FirewallManager();
    await fw.blockIP("45.33.12.9");

    const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("netsh");
    expect(call[1]).toEqual(
      expect.arrayContaining(["advfirewall", "firewall", "add", "rule", "action=block", "remoteip=45.33.12.9"])
    );
  });

  it("removeRule usa netsh delete rule diretamente (sem parsing de output)", async () => {
    mockSpawnOnce("", 0);
    const fw = new FirewallManager();
    await fw.removeRule("minha-regra");

    const call = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("netsh");
    expect(call[1]).toEqual(["advfirewall", "firewall", "delete", "rule", "name=minha-regra"]);
  });
});

describe("FirewallManager (macOS)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("darwin");
  });

  it("lança erro explícito informando que PF ainda não está implementado", async () => {
    const fw = new FirewallManager();
    await expect(fw.addRule({ name: "x", direction: "out", protocol: "any", action: "block" })).rejects.toThrow(
      /PF/i
    );
  });
});
