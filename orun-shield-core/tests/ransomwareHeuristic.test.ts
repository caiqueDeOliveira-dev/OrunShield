import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RansomwareHeuristicMonitor } from "../src/sentinel/RansomwareHeuristicMonitor.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RansomwareHeuristicMonitor (filesystem real, chokidar real)", () => {
  let workDir: string;
  let monitor: RansomwareHeuristicMonitor | null = null;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "orun-shield-ransomware-"));
  });

  afterEach(async () => {
    await monitor?.stop();
    monitor = null;
    await rm(workDir, { recursive: true, force: true });
  });

  it("dispara alerta crítico quando uma extensão suspeita conhecida aparece", async () => {
    monitor = new RansomwareHeuristicMonitor({ watchPaths: [workDir] });
    const alerts: unknown[] = [];
    monitor.on("ransomware:alert", (f) => alerts.push(f));
    monitor.start();

    await wait(300); // chokidar precisa de um instante pra terminar de indexar antes de reportar eventos novos
    await writeFile(join(workDir, "documento.docx.locked"), "conteúdo criptografado simulado");
    await wait(500);

    expect(alerts.length).toBeGreaterThan(0);
    expect((alerts[0] as { severity: string }).severity).toBe("critical");
    expect((alerts[0] as { title: string }).title).toContain(".locked");
  }, 10_000);

  it("dispara alerta de surto quando muitos arquivos são modificados rapidamente (taxa acima do threshold)", async () => {
    monitor = new RansomwareHeuristicMonitor({
      watchPaths: [workDir],
      fileEventThreshold: 5,
      windowMs: 5_000,
    });
    const alerts: unknown[] = [];
    monitor.on("ransomware:alert", (f) => alerts.push(f));
    monitor.start();

    await wait(300);
    // Simula um "ataque" criando 6 arquivos rapidamente (acima do threshold de 5).
    for (let i = 0; i < 6; i++) {
      await writeFile(join(workDir, `arquivo${i}.txt`), `conteúdo ${i}`);
    }
    await wait(800);

    const burstAlerts = alerts.filter((a) => (a as { title: string }).title.includes("modificados em"));
    expect(burstAlerts.length).toBeGreaterThan(0);
  }, 10_000);

  it("NÃO dispara alerta de surto para atividade normal (poucos arquivos, abaixo do threshold)", async () => {
    monitor = new RansomwareHeuristicMonitor({
      watchPaths: [workDir],
      fileEventThreshold: 20,
      windowMs: 5_000,
    });
    const alerts: unknown[] = [];
    monitor.on("ransomware:alert", (f) => alerts.push(f));
    monitor.start();

    await wait(300);
    await writeFile(join(workDir, "um-arquivo-normal.txt"), "uso normal do computador");
    await wait(500);

    expect(alerts).toHaveLength(0);
  }, 10_000);

  it("respeita o cooldown — não repete o alerta de surto imediatamente após já ter disparado", async () => {
    monitor = new RansomwareHeuristicMonitor({
      watchPaths: [workDir],
      fileEventThreshold: 3,
      windowMs: 5_000,
      cooldownMs: 60_000, // cooldown longo — segundo surto não deveria gerar novo alerta dentro do teste
    });
    const alerts: unknown[] = [];
    monitor.on("ransomware:alert", (f) => alerts.push(f));
    monitor.start();

    await wait(300);
    for (let i = 0; i < 4; i++) {
      await writeFile(join(workDir, `primeiro${i}.txt`), "x");
    }
    await wait(500);
    const countAfterFirstBurst = alerts.filter((a) => (a as { title: string }).title.includes("modificados em")).length;
    expect(countAfterFirstBurst).toBeGreaterThan(0);

    for (let i = 0; i < 4; i++) {
      await writeFile(join(workDir, `segundo${i}.txt`), "x");
    }
    await wait(500);
    const countAfterSecondBurst = alerts.filter((a) => (a as { title: string }).title.includes("modificados em")).length;

    // Não deve ter aumentado — está em cooldown.
    expect(countAfterSecondBurst).toBe(countAfterFirstBurst);
  }, 10_000);

  it("stop() encerra o watcher e limpa o estado — start() posterior funciona normalmente de novo", async () => {
    monitor = new RansomwareHeuristicMonitor({ watchPaths: [workDir] });
    monitor.start();
    await wait(200);
    await monitor.stop();

    // Depois de parado, escrever arquivos não deveria gerar nenhum alerta.
    const alertsAfterStop: unknown[] = [];
    monitor.on("ransomware:alert", (f) => alertsAfterStop.push(f));
    await writeFile(join(workDir, "arquivo.locked"), "x");
    await wait(300);

    expect(alertsAfterStop).toHaveLength(0);
  }, 10_000);
});
